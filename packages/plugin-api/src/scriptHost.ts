/**
 * Lado do host de um suplemento de script (docs/plugins/08 §7): cria o Worker, aplica os limites e isola a falha.
 *
 * Regras: (1) cada chamada tem `timeoutMs` (o tempo em que o host atende uma porta NÃO conta); estourou = Worker
 * encerrado e recriado na próxima chamada; (2) memória: o JavaScript não mede a memória de um Worker de forma portável,
 * então o teto vale pelo tamanho das mensagens recebidas (e pelo código); estourou = Worker encerrado; (3) três falhas em
 * 60000 ms = estado `failed` e desativação; (4) NENHUM erro do suplemento vira exceção para fora de `call`: quem chama
 * (o carregador) recebe uma rejeição tipada e o app segue. As portas (`ScriptPorts`) são STUBS entregues pela Fase B/C
 * (registro/ModelPort); o host só confere a permissão e os limites de lote antes de repassar.
 */
import { approxBytes, FAILURE_WINDOW_MS, MAX_BATCH_BYTES, MAX_FAILURES_IN_WINDOW, type ScriptLimits } from './limits.ts';
import type { HostToWorker, PortMethod, WorkerToHost } from './workerRuntime.ts';

const MIB = 1024 * 1024;

/** O mínimo de um Worker que o host usa (`Worker` real ou duplo de teste). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((e: { data: unknown }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

/** Portas que o host oferece ao script. Todas opcionais: a Fase B/C liga as reais; sem porta = `unavailable`. */
export interface ScriptPorts {
  /** `model.read`: cópia imutável do projeto (Fase C, `ModelPort.read`). */
  modelRead?: () => unknown | Promise<unknown>;
  /** `model.write`: aplica um lote como um passo de desfazer (Fase C, `ModelPort.apply`). Devolve `{ ok, ... }`. */
  modelApply?: (label: string, commands: unknown[]) => unknown | Promise<unknown>;
  /** `model.write`: id novo gerado pelo host (Fase C). */
  newId?: (prefix: string) => string;
  /** `plugindata.rw`: espaço de dados do próprio suplemento (Fase C). */
  dataGet?: (key: string) => unknown | Promise<unknown>;
  dataSet?: (key: string, value: unknown) => void | Promise<void>;
  dataDelete?: (key: string) => void | Promise<void>;
}

export type ScriptErrorCode = 'timeout' | 'memory' | 'script_error' | 'load_failed' | 'failed' | 'stopped' | 'worker_error';

/** Erro de chamada ao script. Nunca escapa do carregador. */
export class ScriptError extends Error {
  readonly code: ScriptErrorCode;
  constructor(code: ScriptErrorCode, message: string) {
    super(message);
    this.name = 'ScriptError';
    this.code = code;
  }
}

export type ScriptHostState = 'idle' | 'running' | 'failed' | 'stopped';

export interface ScriptHostOptions {
  pluginId: string;
  /** Código do `entry` (módulo ES). */
  code: string;
  limits: ScriptLimits;
  /** Permissões concedidas (o host confere a cada chamada de porta). */
  grants: readonly string[];
  ports: ScriptPorts;
  createWorker: () => WorkerLike;
  /** Log por suplemento (anel de 500 entradas na Fase D, `pluginLog.ts`). Nunca receber dados do modelo. */
  log: (level: 'info' | 'warn' | 'error', text: string) => void;
  /** Chamado uma vez quando o suplemento passa a `failed`. */
  onFailed: (reason: string) => void;
  /** Relógio em ms (injetável para teste). */
  now?: () => number;
}

/** Permissão exigida por método de porta. */
const PORT_PERMISSION: Record<PortMethod, string> = {
  'model.read': 'model.read',
  'model.apply': 'model.write',
  'model.newId': 'model.write',
  'data.get': 'plugindata.rw',
  'data.set': 'plugindata.rw',
  'data.delete': 'plugindata.rw',
};

interface Active {
  id: number;
  resolve: (v: unknown) => void;
  reject: (e: ScriptError) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
  /** Início do trecho de tempo contado atual (ms) e saldo restante. */
  startedAt: number;
  remaining: number;
  portsInFlight: number;
}

export class ScriptHost {
  private worker: WorkerLike | null = null;
  private loading: Promise<void> | null = null;
  private loadedWaiter: { ok: () => void; fail: (e: ScriptError) => void } | null = null;
  private active: Active | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private failures: number[] = [];
  private nextId = 1;
  private _state: ScriptHostState = 'idle';
  private readonly now: () => number;

  constructor(private readonly o: ScriptHostOptions) {
    this.now = o.now ?? (() => Date.now());
  }

  get state(): ScriptHostState {
    return this._state;
  }

  /** Chama uma função exportada pelo script. Chamadas são serializadas (uma de cada vez). Rejeita com `ScriptError`. */
  call(handler: string, args: unknown[] = []): Promise<unknown> {
    const run = (): Promise<unknown> => this.callNow(handler, args);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Encerra o Worker e recusa novas chamadas (desativar/desinstalar). */
  stop(): void {
    this._state = this._state === 'failed' ? 'failed' : 'stopped';
    this.killWorker(new ScriptError('stopped', 'suplemento desativado'));
  }

  private async callNow(handler: string, args: unknown[]): Promise<unknown> {
    if (this._state === 'failed') throw new ScriptError('failed', 'suplemento em estado falhou');
    if (this._state === 'stopped') throw new ScriptError('stopped', 'suplemento desativado');
    if (approxBytes(args) > this.o.limits.memoryMiB * MIB) throw this.fail(new ScriptError('memory', 'argumentos acima do limite de memória'));
    try {
      await this.ensureLoaded();
    } catch (e) {
      throw this.fail(e instanceof ScriptError ? e : new ScriptError('load_failed', String(e)));
    }
    const w = this.worker;
    if (!w) throw new ScriptError('stopped', 'suplemento desativado');
    this._state = 'running';
    return new Promise<unknown>((resolve, reject) => {
      const id = this.nextId++;
      const act: Active = {
        id,
        resolve,
        reject: (e) => reject(e),
        timer: undefined,
        startedAt: this.now(),
        remaining: this.o.limits.timeoutMs,
        portsInFlight: 0,
      };
      this.active = act;
      this.armTimer(act);
      w.postMessage({ t: 'call', id, handler, args } satisfies HostToWorker);
    }).then(
      (v) => {
        this.active = null;
        if (this._state === 'running') this._state = 'idle';
        return v;
      },
      (e: unknown) => {
        this.active = null;
        throw e instanceof ScriptError && (e.code === 'stopped' || e.code === 'failed') ? e : this.fail(e as ScriptError);
      },
    );
  }

  private armTimer(act: Active): void {
    act.startedAt = this.now();
    act.timer = setTimeout(() => {
      this.killWorker(new ScriptError('timeout', `tempo esgotado (${this.o.limits.timeoutMs} ms)`));
    }, Math.max(1, act.remaining));
  }

  private pauseTimer(act: Active): void {
    if (act.timer === undefined) return;
    clearTimeout(act.timer);
    act.timer = undefined;
    act.remaining -= this.now() - act.startedAt;
  }

  private ensureLoaded(): Promise<void> {
    if (this.worker && this.loading) return this.loading;
    const w = this.o.createWorker();
    this.worker = w;
    w.onmessage = (e) => this.onMessage(w, e.data as WorkerToHost);
    w.onerror = (e) => this.killWorker(new ScriptError('worker_error', `erro no Worker: ${errMsg(e)}`), w);
    this.loading = new Promise<void>((ok, fail) => {
      // O carregamento do módulo também respeita o tempo máximo.
      const t = setTimeout(() => this.killWorker(new ScriptError('timeout', 'tempo esgotado ao carregar o script'), w), this.o.limits.timeoutMs);
      this.loadedWaiter = {
        ok: () => {
          clearTimeout(t);
          ok();
        },
        fail: (e) => {
          clearTimeout(t);
          fail(e);
        },
      };
    });
    this.loading.catch(() => undefined);
    w.postMessage({ t: 'load', code: this.o.code, pluginId: this.o.pluginId, grants: [...this.o.grants] } satisfies HostToWorker);
    return this.loading;
  }

  private onMessage(from: WorkerLike, m: WorkerToHost): void {
    if (from !== this.worker || typeof m !== 'object' || m === null) return;
    if (approxBytes(m) > this.o.limits.memoryMiB * MIB) {
      this.killWorker(new ScriptError('memory', `mensagem acima de ${this.o.limits.memoryMiB} MiB`), from);
      return;
    }
    switch (m.t) {
      case 'loaded': {
        const w = this.loadedWaiter;
        this.loadedWaiter = null;
        if (m.ok) w?.ok();
        else w?.fail(new ScriptError('load_failed', `falha ao carregar o script: ${m.error ?? ''}`));
        return;
      }
      case 'log':
        if (m.level === 'info' || m.level === 'warn' || m.level === 'error') this.o.log(m.level, String(m.text).slice(0, 500));
        return;
      case 'result': {
        const a = this.active;
        if (!a || a.id !== m.id) return;
        if (a.timer !== undefined) clearTimeout(a.timer);
        a.timer = undefined;
        if (m.ok) a.resolve(m.value);
        else a.reject(new ScriptError('script_error', String(m.error ?? 'erro do script').slice(0, 500)));
        return;
      }
      case 'port':
        void this.onPort(from, m);
        return;
      default:
        return;
    }
  }

  /** Atende uma porta: confere permissão e limites, repassa ao stub e responde. O tempo daqui não conta no timeout. */
  private async onPort(from: WorkerLike, m: Extract<WorkerToHost, { t: 'port' }>): Promise<void> {
    const act = this.active;
    if (act) {
      this.pauseTimer(act);
      act.portsInFlight += 1;
    }
    let reply: HostToWorker;
    try {
      reply = { t: 'reply', id: m.id, ok: true, value: await this.runPort(m.method, Array.isArray(m.args) ? m.args : []) };
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      this.o.log('warn', `porta ${String(m.method)} recusada: ${text}`.slice(0, 500));
      reply = { t: 'reply', id: m.id, ok: false, error: text.slice(0, 500) };
    }
    if (act) {
      act.portsInFlight -= 1;
      if (act.portsInFlight === 0 && this.active === act && from === this.worker) this.armTimer(act);
    }
    if (from === this.worker) from.postMessage(reply);
  }

  private async runPort(method: PortMethod, a: unknown[]): Promise<unknown> {
    const need = PORT_PERMISSION[method];
    if (!need) throw new Error('permission_denied: método desconhecido');
    if (!this.o.grants.includes(need)) throw new Error(`permission_denied: ${need}`);
    const p = this.o.ports;
    const unavailable = (): never => {
      throw new Error(`unavailable: ${method}`);
    };
    switch (method) {
      case 'model.read':
        return p.modelRead ? await p.modelRead() : unavailable();
      case 'model.newId':
        return p.newId ? p.newId(String(a[0] ?? 'id').slice(0, 40)) : unavailable();
      case 'model.apply': {
        const commands = a[1];
        if (!Array.isArray(commands)) throw new Error('commands deve ser lista');
        if (commands.length > this.o.limits.maxCommandsPerAction) throw new Error(`lote com mais de ${this.o.limits.maxCommandsPerAction} comandos`);
        if (approxBytes(commands) / 2 > MAX_BATCH_BYTES) throw new Error('lote acima de 8 MiB');
        return p.modelApply ? await p.modelApply(String(a[0] ?? '').slice(0, 200), commands) : unavailable();
      }
      case 'data.get':
        return p.dataGet ? await p.dataGet(String(a[0])) : unavailable();
      case 'data.set':
        return p.dataSet ? await p.dataSet(String(a[0]), a[1]) : unavailable();
      case 'data.delete':
        return p.dataDelete ? await p.dataDelete(String(a[0])) : unavailable();
      default:
        return unavailable();
    }
  }

  /** Encerra o Worker; a chamada em curso (ou o carregamento) rejeita com `err`. Um próximo `call` recria o Worker. */
  private killWorker(err: ScriptError, only?: WorkerLike): void {
    const w = this.worker;
    if (!w || (only && only !== w)) return;
    this.worker = null;
    this.loading = null;
    w.onmessage = null;
    w.onerror = null;
    try {
      w.terminate();
    } catch {
      /* já encerrado */
    }
    const act = this.active;
    if (act) {
      if (act.timer !== undefined) clearTimeout(act.timer);
      act.timer = undefined;
      act.reject(err);
    }
    const lw = this.loadedWaiter;
    this.loadedWaiter = null;
    lw?.fail(err);
  }

  /** Registra a falha; na terceira dentro da janela o suplemento vira `failed`. Devolve o erro para ser lançado. */
  private fail(err: ScriptError): ScriptError {
    const t = this.now();
    this.failures = this.failures.filter((x) => t - x < FAILURE_WINDOW_MS);
    this.failures.push(t);
    this.o.log('error', `${err.code}: ${err.message}`.slice(0, 500));
    if (this._state !== 'failed' && this.failures.length >= MAX_FAILURES_IN_WINDOW) {
      this._state = 'failed';
      this.killWorker(err);
      try {
        this.o.onFailed(`${MAX_FAILURES_IN_WINDOW} falhas em ${FAILURE_WINDOW_MS} ms; última: ${err.message}`);
      } catch {
        /* o aviso não pode derrubar o host */
      }
    } else if (this._state === 'running') {
      this._state = 'idle';
    }
    return err;
  }
}

function errMsg(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message).slice(0, 200);
  return String(e).slice(0, 200);
}
