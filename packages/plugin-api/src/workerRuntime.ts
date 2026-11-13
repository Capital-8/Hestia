/**
 * Lado de DENTRO do Worker do suplemento de script: sem DOM, sem rede, só o `ctx` com as portas concedidas.
 *
 * Esta função é pura em relação ao ambiente (recebe o `scope` e o carregador de módulo), por isso roda igual no Worker
 * real (`scriptWorker.ts`) e nos testes. Toda chamada ao host é assíncrona (mensagem + resposta); o host é quem confere
 * a permissão, aqui o `ctx` só esconde o que não foi concedido (conforto, não segurança).
 */

/** Mensagens do host para o Worker. */
export type HostToWorker =
  | { t: 'load'; code: string; pluginId: string; grants: string[] }
  | { t: 'call'; id: number; handler: string; args: unknown[] }
  | { t: 'reply'; id: number; ok: boolean; value?: unknown; error?: string };

/** Mensagens do Worker para o host. */
export type WorkerToHost =
  | { t: 'loaded'; ok: boolean; error?: string; exports: string[] }
  | { t: 'result'; id: number; ok: boolean; value?: unknown; error?: string }
  | { t: 'port'; id: number; method: PortMethod; args: unknown[] }
  | { t: 'log'; level: 'info' | 'warn' | 'error'; text: string };

/** Métodos de porta que o script pode pedir ao host. */
export type PortMethod = 'model.read' | 'model.apply' | 'model.newId' | 'data.get' | 'data.set' | 'data.delete';

/** O mínimo do escopo global de um Worker que este código usa. */
export interface WorkerScopeLike {
  postMessage(message: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

export interface WorkerRuntimeOptions {
  /** Carrega o código do suplemento como módulo ES e devolve suas exportações. */
  loadModule: (code: string) => Promise<Record<string, unknown>>;
  /** Remove do escopo o que dá acesso à rede/armazenamento (feito no Worker real; opcional nos testes). */
  harden?: () => void;
}

/** Carrega o módulo por URL de blob (Worker real). */
export async function loadModuleFromBlob(code: string): Promise<Record<string, unknown>> {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    return (await import(/* @vite-ignore */ url)) as Record<string, unknown>;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Nomes globais removidos do Worker: rede, armazenamento e criação de outros Workers. */
const BLOCKED_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches', 'Worker', 'SharedWorker',
  'BroadcastChannel', 'WebTransport', 'RTCPeerConnection', 'localStorage', 'sessionStorage',
];

/** Apaga/neutraliza os globais perigosos do escopo do Worker (melhor esforço; `import()` dinâmico depende da CSP). */
export function hardenWorkerScope(scope: object): void {
  for (const name of BLOCKED_GLOBALS) {
    try {
      Object.defineProperty(scope, name, { value: undefined, configurable: false, writable: false });
    } catch {
      /* já inexistente ou não configurável: nada a fazer */
    }
  }
  try {
    const nav = (scope as { navigator?: object }).navigator;
    if (nav) Object.defineProperty(nav, 'sendBeacon', { value: undefined, configurable: false });
  } catch {
    /* ignora */
  }
}

/** Instala o protocolo no escopo. O `postMessage` original é capturado e o do escopo deixa de funcionar para o script. */
export function installWorkerRuntime(scope: WorkerScopeLike, opts: WorkerRuntimeOptions): void {
  const rawPost = scope.postMessage.bind(scope);
  const post = (m: WorkerToHost): void => rawPost(m);
  let handlers: Record<string, unknown> = {};
  let pluginId = '';
  let grants = new Set<string>();
  let nextPort = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const port = (method: PortMethod, args: unknown[]): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = nextPort++;
      pending.set(id, { resolve, reject });
      post({ t: 'port', id, method, args });
    });
  const logger = (level: 'info' | 'warn' | 'error') => (text: unknown) => post({ t: 'log', level, text: String(text).slice(0, 500) });

  const buildCtx = (): Record<string, unknown> => {
    const ctx: Record<string, unknown> = { pluginId, log: { info: logger('info'), warn: logger('warn'), error: logger('error') } };
    if (grants.has('model.read') || grants.has('model.write')) {
      const model: Record<string, unknown> = {};
      if (grants.has('model.read')) model.read = () => port('model.read', []);
      if (grants.has('model.write')) {
        model.apply = (label: string, commands: unknown[]) => port('model.apply', [label, commands]);
        model.newId = (prefix: string) => port('model.newId', [prefix]);
      }
      ctx.model = model;
    }
    if (grants.has('plugindata.rw')) {
      ctx.data = {
        get: (key: string) => port('data.get', [key]),
        set: (key: string, value: unknown) => port('data.set', [key, value]),
        delete: (key: string) => port('data.delete', [key]),
      };
    }
    return Object.freeze(ctx);
  };

  const onLoad = async (m: Extract<HostToWorker, { t: 'load' }>): Promise<void> => {
    pluginId = m.pluginId;
    grants = new Set(m.grants);
    try {
      handlers = await opts.loadModule(m.code);
      const names = Object.keys(handlers).filter((k) => typeof handlers[k] === 'function');
      post({ t: 'loaded', ok: true, exports: names });
    } catch (e) {
      post({ t: 'loaded', ok: false, error: errText(e), exports: [] });
    }
  };

  const onCall = async (m: Extract<HostToWorker, { t: 'call' }>): Promise<void> => {
    const fn = handlers[m.handler];
    if (typeof fn !== 'function') {
      // `activate` é opcional: o host o chama sempre ao ativar, e a falta dele não é erro.
      if (m.handler === 'activate') {
        post({ t: 'result', id: m.id, ok: true, value: null });
        return;
      }
      post({ t: 'result', id: m.id, ok: false, error: `handler inexistente: ${m.handler}` });
      return;
    }
    try {
      const value = await (fn as (...a: unknown[]) => unknown)(buildCtx(), ...m.args);
      post({ t: 'result', id: m.id, ok: true, value: value === undefined ? null : value });
    } catch (e) {
      post({ t: 'result', id: m.id, ok: false, error: errText(e) });
    }
  };

  const handle = (m: HostToWorker): void => {
    if (m.t === 'load') void onLoad(m);
    else if (m.t === 'call') void onCall(m);
    else if (m.t === 'reply') {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m.value);
      else p.reject(new Error(m.error ?? 'erro do host'));
    }
  };

  opts.harden?.();
  scope.onmessage = (e) => handle(e.data as HostToWorker);
  // O script não deve forjar mensagens ao host: o canal fica só com a função capturada acima.
  try {
    Object.defineProperty(scope, 'postMessage', { value: () => undefined, configurable: false, writable: false });
  } catch {
    /* escopo de teste pode não permitir */
  }
}

function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}
