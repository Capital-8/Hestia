/**
 * Núcleo de integração dos suplementos (ADR 0057, spec 08 §7): junta instalador, carregador, registro de contribuições,
 * portas do modelo (fase C), Worker de script e executor de ações. Sem React e sem acesso global: tudo entra por
 * `SupplementRuntimeOptions`, por isso roda igual no app e nos testes de integração (vitest, sem navegador).
 *
 * Garantias: instalar NÃO executa nem concede nada; só `approve` (decisão do usuário na tela de revisão) grava
 * concessões e ativa; qualquer erro de suplemento vira log/aviso e o app segue.
 */
import {
  CAPABILITY_REQUIRES_V2,
  type ContributionRegistry,
  type PluginText,
  type ModelPort,
  type PluginDataPort,
  type WorkerLike,
} from '@hestia/plugin-api';
import type { ZipEntryData } from '@hestia/io';
import type { PluginInfo } from './appModelPort.ts';
import { Installer, type InstallResult, type PackageStore } from './installer.ts';
import { PluginLoader, type SupState } from './loader.ts';
import { PluginLog } from './pluginLog.ts';
import { setPluginActionExecutor, type PluginActionExecutor } from './registry.ts';
import { registrySink, scriptPortsFactory, validateManifestForInstall } from './supSink.ts';

/** O que o usuário escolheu instalar. */
export type InstallSource = { kind: 'package'; bytes: Uint8Array } | { kind: 'folder'; files: readonly ZipEntryData[] };

/** Linha do gerenciador (cópia imutável do estado de um suplemento instalado). */
export interface SupplementRow {
  id: string;
  name: string;
  version: string;
  runtime: 'declarative' | 'script' | 'external';
  description?: string;
  /** Permissões pedidas pelo manifesto. */
  requested: string[];
  /** Permissões concedidas pelo usuário. */
  grants: string[];
  enabled: boolean;
  source: 'package' | 'folder';
  state: SupState;
  detail?: string;
}

/** Resultado que um handler devolveu para mostrar ao usuário. */
export interface HandlerResult {
  pluginId: string;
  pluginName: string;
  title?: PluginText;
  message: PluginText;
}

/** Avisos para a barra de estado (a interface traduz pelo dicionário). */
export interface SupNotice {
  kind: 'handler-error' | 'failed' | 'unsupported';
  pluginName?: string;
}

export interface SupplementRuntimeOptions {
  store: PackageStore;
  createWorker: () => WorkerLike;
  registry: ContributionRegistry;
  /** Portas da fase C (modelo e dados do suplemento). */
  model: ModelPort;
  data: PluginDataPort;
  log?: PluginLog;
  /** Liga o resolvedor de nome e `dataSchema` das portas (padrão do app: `setPluginInfoResolver`). */
  setInfoResolver?: (fn: (pluginId: string) => PluginInfo) => void;
  /** Agenda `loadAll` fora do caminho crítico (padrão do carregador: `setTimeout` de 0 ms). */
  defer?: (fn: () => void) => void;
  showResult?: (r: HandlerResult) => void;
  notify?: (n: SupNotice) => void;
}

export type ApproveResult = { ok: true; state: SupState } | { ok: false; code: 'unknown' | 'missing_dependency' | 'not_requested' | 'activation_failed'; detail?: string };

const isTxt = (v: unknown): v is PluginText =>
  typeof v === 'string' || (typeof v === 'object' && v !== null && typeof (v as { pt?: unknown }).pt === 'string' && typeof (v as { en?: unknown }).en === 'string');

const clip = (t: PluginText): PluginText => (typeof t === 'string' ? t.slice(0, 4000) : { pt: t.pt.slice(0, 4000), en: t.en.slice(0, 4000) });

/**
 * Convenção do resultado de um handler (spec 08 §6.1): texto, `{ title?, message }` com `PluginText`, ou qualquer JSON
 * (mostrado como texto). `null`/`undefined` = nada a mostrar. O resultado é dado não confiável: só vira texto simples.
 */
export function formatHandlerResult(v: unknown): { title?: PluginText; message: PluginText } | null {
  if (v === null || v === undefined) return null;
  if (isTxt(v)) return { message: clip(v) };
  if (typeof v === 'object' && isTxt((v as { message?: unknown }).message)) {
    const o = v as { title?: unknown; message: PluginText };
    return { ...(isTxt(o.title) ? { title: clip(o.title) } : {}), message: clip(o.message) };
  }
  try {
    return { message: (JSON.stringify(v, null, 2) ?? String(v)).slice(0, 4000) };
  } catch {
    return { message: String(v).slice(0, 4000) };
  }
}

export class SupplementRuntime {
  readonly log: PluginLog;
  readonly loader: PluginLoader;
  readonly installer: Installer;
  private rows: SupplementRow[] = [];
  private readonly subs = new Set<() => void>();
  private readonly infos = new Map<string, PluginInfo>();
  private readonly details = new Map<string, string>();
  private readonly pending = new Set<Promise<unknown>>();

  constructor(private readonly o: SupplementRuntimeOptions) {
    this.log = o.log ?? new PluginLog();
    o.setInfoResolver?.((id) => this.infos.get(id) ?? { name: id, dataSchema: 1, version: '' });
    this.loader = new PluginLoader({
      store: o.store,
      log: this.log,
      createWorker: o.createWorker,
      contributions: registrySink(o.registry, (id, info) => {
        if (info) this.infos.set(id, info);
        else this.infos.delete(id);
      }),
      ports: scriptPortsFactory(o.model, o.data),
      ...(o.defer ? { defer: o.defer } : {}),
      onChange: (id, state, detail) => this.onState(id, state, detail),
    });
    this.installer = new Installer({ store: o.store, validateManifest: validateManifestForInstall });
  }

  // ---- estado observável (useSyncExternalStore da tela) ----

  subscribe = (cb: () => void): (() => void) => {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  };

  /** Foto estável: só muda de referência quando `refresh` roda. */
  snapshot = (): readonly SupplementRow[] => this.rows;

  private emit(): void {
    for (const cb of [...this.subs]) {
      try {
        cb();
      } catch {
        /* um assinante com defeito não derruba os demais */
      }
    }
  }

  /** Relê o armazenamento e republica a lista. Nunca lança. */
  async refresh(): Promise<void> {
    try {
      const all = await this.o.store.list();
      this.rows = all
        .filter((p) => typeof p?.manifest?.id === 'string')
        .map((p): SupplementRow => {
          const m = p.manifest;
          const desc = typeof m.raw.description === 'string' ? m.raw.description.slice(0, 400) : undefined;
          const detail = this.details.get(m.id);
          return {
            id: m.id, name: m.name, version: m.version, runtime: m.runtime, requested: [...m.capabilities], grants: [...p.grants],
            enabled: p.enabled, source: p.source, state: this.loader.state(m.id) ?? (p.enabled ? 'installed' : 'disabled'),
            ...(desc ? { description: desc } : {}), ...(detail ? { detail } : {}),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      this.log.append('hestia', 'error', `não foi possível listar suplementos: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.emit();
  }

  private onState(id: string, state: SupState, detail?: string): void {
    if (detail) this.details.set(id, detail);
    else this.details.delete(id);
    if (state === 'failed') this.o.notify?.({ kind: 'failed', pluginName: this.infos.get(id)?.name ?? id });
    void this.refresh();
  }

  // ---- ciclo de vida ----

  /** Abertura do app: carrega os suplementos habilitados DEPOIS da primeira pintura, cada um com try/catch. */
  async boot(): Promise<void> {
    await this.loader.loadAll();
    await this.refresh();
  }

  /** Instala (valida e guarda). NÃO ativa, NÃO concede e NÃO executa nada. */
  async install(src: InstallSource): Promise<InstallResult> {
    const r = src.kind === 'package' ? await this.installer.installBytes(src.bytes) : await this.installer.installFolder(src.files);
    if (r.ok) this.log.append(r.id, 'info', 'instalado (aguardando revisão de permissões)');
    await this.refresh();
    return r;
  }

  /**
   * Decisão do usuário na tela de revisão: grava as permissões marcadas e ativa. Recusa o que ele não pediu e a
   * concessão sem as permissões exigidas (spec 08 §3 regra 2). Nunca lança.
   */
  async approve(id: string, grants: readonly string[]): Promise<ApproveResult> {
    try {
      const pkg = await this.o.store.get(id);
      if (!pkg) return { ok: false, code: 'unknown' };
      const set = new Set(grants);
      for (const g of set) {
        if (!pkg.manifest.capabilities.includes(g)) return { ok: false, code: 'not_requested', detail: g };
        for (const dep of CAPABILITY_REQUIRES_V2[g as keyof typeof CAPABILITY_REQUIRES_V2] ?? []) {
          if (!set.has(dep)) return { ok: false, code: 'missing_dependency', detail: `${g} -> ${dep}` };
        }
      }
      await this.loader.setGrants(id, [...set]);
      const state = this.loader.state(id) === 'active' ? 'active' : await this.loader.activate(id);
      await this.refresh();
      return state === 'failed' ? { ok: false, code: 'activation_failed', detail: this.details.get(id) } : { ok: true, state };
    } catch (e) {
      return { ok: false, code: 'activation_failed', detail: e instanceof Error ? e.message : String(e) };
    }
  }

  async setEnabled(id: string, on: boolean): Promise<void> {
    if (on) await this.loader.activate(id);
    else await this.loader.deactivate(id);
    await this.refresh();
  }

  async uninstall(id: string): Promise<void> {
    await this.loader.uninstall(id);
    this.details.delete(id);
    await this.refresh();
  }

  // ---- ações (botões, comandos e botões de diálogo) ----

  /** Chama o handler do script. Nunca lança: falha vira aviso e log, e o app segue. */
  async runHandler(pluginId: string, handler: string, values?: Record<string, unknown>): Promise<{ ok: true; value: unknown } | { ok: false; code: string; message: string }> {
    const name = this.infos.get(pluginId)?.name ?? pluginId;
    try {
      const value = await this.loader.call(pluginId, handler, values ? [values] : []);
      const res = formatHandlerResult(value);
      if (res) this.o.showResult?.({ pluginId, pluginName: name, ...res });
      return { ok: true, value };
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'error';
      const message = e instanceof Error ? e.message : String(e);
      this.log.append(pluginId, 'error', `ação "${handler}" falhou: ${message}`);
      this.o.notify?.({ kind: 'handler-error', pluginName: name });
      void this.refresh();
      return { ok: false, code, message };
    }
  }

  /** Executor registrado em `setPluginActionExecutor`: só `handler` roda aqui; as demais ações são das fases E a H. */
  readonly executor: PluginActionExecutor = ({ pluginId, action, values }) => {
    if (action.type !== 'handler') {
      this.o.notify?.({ kind: 'unsupported', pluginName: this.infos.get(pluginId)?.name ?? pluginId });
      return;
    }
    const p = this.runHandler(pluginId, action.ref, values);
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  };

  /** Liga o executor ao registro do app. Devolve a função que desfaz (e restaura o executor anterior). */
  attachExecutor(): () => void {
    const antes = setPluginActionExecutor(this.executor);
    return () => void setPluginActionExecutor(antes);
  }

  /** Espera as ações em andamento terminarem (testes e encerramento). */
  async settled(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }
}
