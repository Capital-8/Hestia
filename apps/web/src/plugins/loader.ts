/**
 * Carregador de suplementos (docs/plugins/08 §7): estados, ativação, desativação e falha isolada.
 *
 * Garantia central: NADA aqui lança para fora. Pacote quebrado, manifesto inválido, script que estoura tempo ou memória
 * viram o estado `failed` (com entrada no log do gerenciador) e o app segue. `loadAll` roda fora do caminho crítico
 * (depois da primeira pintura, via `defer`) e cada suplemento dentro do seu próprio try/catch.
 * As dependências das Fases B (registro/UI) e C (ModelPort, dados) entram por interfaces; os padrões são stubs vazios.
 */
import { resolveLimits, ScriptHost, ScriptError, type ScriptPorts, type WorkerLike } from '@hestia/plugin-api';
import type { InstalledPackage, PackageStore } from './installer.ts';
import type { PluginLog } from './pluginLog.ts';

/** Estados do ciclo de vida (os de conexão do processo externo continuam em `PluginState`, de pluginHost.ts). */
export type SupState = 'installed' | 'needs-grant' | 'active' | 'failed' | 'disabled';

/** Registro de contribuições (Fase B). Devolve a função que as retira. Stub: não registra nada. */
export interface ContributionSink {
  register(pluginId: string, manifest: Record<string, unknown>, grants: readonly string[]): () => void;
}

/** Portas do modelo para o script (Fase C, `appModelPort.ts`). Stub: nenhuma porta. */
export type PortsFactory = (pluginId: string, grants: readonly string[]) => ScriptPorts;

export interface LoaderOptions {
  store: PackageStore;
  log: PluginLog;
  /** Cria o Worker real: `new Worker(new URL('@hestia/plugin-api/src/scriptWorker.ts', import.meta.url), { type: 'module' })`. */
  createWorker: () => WorkerLike;
  contributions?: ContributionSink;
  ports?: PortsFactory;
  /** Agenda trabalho fora do caminho crítico (padrão: `setTimeout` de 0 ms). */
  defer?: (fn: () => void) => void;
  /** Avisa a interface de que um estado mudou. */
  onChange?: (pluginId: string, state: SupState, detail?: string) => void;
}

interface Running {
  host?: ScriptHost;
  unregister?: () => void;
}

const NO_SINK: ContributionSink = { register: () => () => undefined };

export class PluginLoader {
  private readonly states = new Map<string, SupState>();
  private readonly running = new Map<string, Running>();

  constructor(private readonly o: LoaderOptions) {}

  state(id: string): SupState | undefined {
    return this.states.get(id);
  }

  /** Lê os pacotes instalados e ativa os habilitados, DEPOIS da primeira pintura. Nunca lança. */
  loadAll(): Promise<void> {
    const defer = this.o.defer ?? ((fn: () => void) => void setTimeout(fn, 0));
    return new Promise<void>((resolve) => {
      defer(() => {
        void this.loadAllNow().finally(resolve);
      });
    });
  }

  private async loadAllNow(): Promise<void> {
    let all: InstalledPackage[] = [];
    try {
      all = await this.o.store.list();
    } catch (e) {
      this.o.log.append('hestia', 'error', `não foi possível listar suplementos: ${msg(e)}`);
      return;
    }
    for (const pkg of all) {
      const id = pkg?.manifest?.id;
      if (typeof id !== 'string') continue; // registro corrompido: ignora
      try {
        if (!pkg.enabled) this.set(id, 'disabled');
        else await this.activate(id);
      } catch (e) {
        this.fail(id, msg(e));
      }
    }
  }

  /** Ativa um suplemento instalado. Falta de concessão = `needs-grant`; qualquer erro = `failed`. Nunca lança. */
  async activate(id: string): Promise<SupState> {
    try {
      const pkg = await this.o.store.get(id);
      if (!pkg) return this.fail(id, 'pacote não encontrado');
      this.deactivateRuntime(id);
      // Nada concedido (e algo pedido) = `needs-grant`. Concessão PARCIAL ativa só o concedido: o registro esconde as
      // contribuições sem permissão e o host nega as portas não concedidas (spec 08 §3 regra 2 e §7.7).
      const missing = pkg.manifest.capabilities.filter((c) => !pkg.grants.includes(c));
      if (missing.length > 0 && missing.length === pkg.manifest.capabilities.length) {
        this.set(id, 'needs-grant', missing.join(', '));
        return 'needs-grant';
      }
      if (!pkg.enabled) await this.o.store.put(id, { ...pkg, enabled: true });
      const run: Running = {};
      this.running.set(id, run);
      const sink = this.o.contributions ?? NO_SINK;
      run.unregister = sink.register(id, pkg.manifest.raw, pkg.grants);
      if (pkg.manifest.runtime === 'script') await this.startScript(id, pkg, run);
      else if (pkg.manifest.runtime === 'external') {
        // O processo externo é conectado pelo PluginHost (Fase I, com token); aqui só registramos as contribuições.
        this.o.log.append(id, 'info', 'suplemento externo: a conexão é feita pelo host de processo');
      }
      if (this.states.get(id) === 'failed') return 'failed';
      this.set(id, 'active');
      this.o.log.append(id, 'info', `ativado (${pkg.manifest.runtime}, versão ${pkg.manifest.version})`);
      return 'active';
    } catch (e) {
      return this.fail(id, msg(e));
    }
  }

  private async startScript(id: string, pkg: InstalledPackage, run: Running): Promise<void> {
    const entry = pkg.manifest.entry;
    const bytes = entry ? pkg.files[entry] : undefined;
    if (!bytes) throw new Error('arquivo de entrada ausente');
    const code = new TextDecoder().decode(bytes);
    const host = new ScriptHost({
      pluginId: id,
      code,
      limits: resolveLimits(pkg.manifest.limits),
      grants: pkg.grants,
      ports: this.o.ports?.(id, pkg.grants) ?? {},
      createWorker: this.o.createWorker,
      log: (level, text) => this.o.log.append(id, level, text),
      onFailed: (reason) => this.fail(id, reason),
    });
    run.host = host;
    // `activate(ctx)` é opcional no script; se falhar, o suplemento falha e o app segue.
    try {
      await host.call('activate');
    } catch (e) {
      this.fail(id, `activate falhou: ${msg(e)}`);
    }
  }

  /** Desativa: remove contribuições, encerra o Worker; MANTÉM dados e concessões. Nunca lança. */
  async deactivate(id: string): Promise<void> {
    try {
      this.deactivateRuntime(id);
      const pkg = await this.o.store.get(id);
      if (pkg?.enabled) await this.o.store.put(id, { ...pkg, enabled: false });
    } catch (e) {
      this.o.log.append(id, 'error', `erro ao desativar: ${msg(e)}`);
    }
    this.set(id, 'disabled');
  }

  /** Desinstala: remove pacote e concessões. O espaço de dados no projeto permanece (§7.5). Nunca lança. */
  async uninstall(id: string): Promise<void> {
    try {
      this.deactivateRuntime(id);
      await this.o.store.remove(id);
    } catch (e) {
      this.o.log.append(id, 'error', `erro ao desinstalar: ${msg(e)}`);
    }
    this.states.delete(id);
    this.o.onChange?.(id, 'disabled', 'desinstalado');
  }

  /** Registra concessões (substitui) e reativa se estava ativo (mudar concessão reinicia o Worker, §3 regra 3). */
  async setGrants(id: string, grants: string[]): Promise<SupState | undefined> {
    try {
      const pkg = await this.o.store.get(id);
      if (!pkg) return undefined;
      const allowed = grants.filter((g) => pkg.manifest.capabilities.includes(g));
      await this.o.store.put(id, { ...pkg, grants: allowed });
      const was = this.states.get(id);
      if (was === 'active' || was === 'needs-grant') return await this.activate(id);
      return was;
    } catch (e) {
      return this.fail(id, msg(e));
    }
  }

  /** Chama uma função do script ativo. Rejeita com `ScriptError`; falha do script nunca derruba o app. */
  async call(id: string, handler: string, args: unknown[] = []): Promise<unknown> {
    const host = this.running.get(id)?.host;
    if (!host || this.states.get(id) !== 'active') throw new ScriptError('stopped', 'suplemento não está ativo');
    return host.call(handler, args);
  }

  private deactivateRuntime(id: string): void {
    const run = this.running.get(id);
    this.running.delete(id);
    if (!run) return;
    try {
      run.host?.stop();
    } catch {
      /* já parado */
    }
    try {
      run.unregister?.();
    } catch (e) {
      this.o.log.append(id, 'error', `erro ao retirar contribuições: ${msg(e)}`);
    }
  }

  /** `failed`: retira contribuições, encerra o Worker e avisa. Idempotente. */
  private fail(id: string, reason: string): SupState {
    this.deactivateRuntime(id);
    this.o.log.append(id, 'error', `falhou: ${reason}`);
    this.set(id, 'failed', reason);
    return 'failed';
  }

  private set(id: string, state: SupState, detail?: string): void {
    this.states.set(id, state);
    try {
      this.o.onChange?.(id, state, detail);
    } catch (e) {
      this.o.log.append(id, 'warn', `ouvinte de estado falhou: ${msg(e)}`);
    }
  }
}

function msg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 500);
}
