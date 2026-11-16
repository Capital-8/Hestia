import { ALL_CAPABILITIES, isCapability, type Capability } from './permissions.ts';
import { validateManifest, type PluginManifest } from './manifest.ts';
import type { HostPorts } from './hostPorts.ts';
import { HostSession, type RetainedSession, type SessionEvent } from './hostSession.ts';
import type { Transport } from './transport.ts';
import type { CameraMode } from './scene.ts';
import { AuthLockout, type AuthCause, type AuthPolicy } from './pairing.ts';

/**
 * Endereço de um plugin. Só loopback: o Hestia NUNCA inicia processos nem abre caminhos de arquivo vindos de plugin;
 * quem inicia o programa é o usuário, e o Hestia só se conecta a ele (docs/plugins/04-runtime-web.md).
 */
export interface PluginEndpoint { host: '127.0.0.1' | 'localhost' | '::1'; port: number }

export const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1']);

export function validateEndpoint(e: unknown): PluginEndpoint | null {
  if (typeof e !== 'object' || e === null) return null;
  const { host, port } = e as { host?: unknown; port?: unknown };
  if (typeof host !== 'string' || !LOOPBACK_HOSTS.has(host)) return null;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535) return null;
  return { host: host as PluginEndpoint['host'], port };
}

export const endpointUrl = (e: PluginEndpoint): string => `ws://${e.host.includes(':') ? `[${e.host}]` : e.host}:${e.port}`;

/** Abre a conexão. Rejeita quando ninguém atende (processo ausente). */
export type TransportFactory = (e: PluginEndpoint) => Promise<Transport>;

/** Registro persistido: o que o usuário configurou. Sem estado de conexão. */
export interface PluginEntry {
  /** Chave local do registro. */
  key: string;
  label: string;
  endpoint: PluginEndpoint;
  enabled: boolean;
  /** Capacidades concedidas pelo usuário (menor privilégio: vazio até conceder). */
  grants: Capability[];
  /** Capacidades sugeridas na hora de habilitar (só texto da tela; nada é concedido sem o usuário). */
  suggested: Capability[];
  /** Tipo de integração esperado (opcional). */
  expectedKind?: PluginManifest['kind'];
  /** Último manifesto visto. */
  manifest?: PluginManifest;
  builtin?: boolean;
}

/** Estados mostrados ao usuário. */
export type PluginState =
  | 'absent'        // nunca foi visto e ninguém atende no endereço
  | 'disconnected'  // já foi visto (manifesto conhecido), mas está desligado ou fora do ar
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'incompatible'; // respondeu, mas versão/manifesto/tipo não servem

export interface PluginRuntime {
  state: PluginState;
  error?: { code: string; message: string; /** Causa do pareamento por token, quando a falha foi de autenticação. */ cause?: AuthCause };
  /** A sessão ativa foi autenticada por token. Falso e conectado = sem pareamento (só no modo opcional, de desenvolvimento). */
  authenticated?: boolean;
  /** Capacidades concedidas à sessão ativa. */
  granted: Capability[];
  /** Pedidas pelo manifesto e ainda não concedidas. */
  pending: Capability[];
  cameraMode: CameraMode;
  attempt: number;
}

export interface PluginView extends PluginEntry, PluginRuntime {}

export interface KeyValueStore { get(k: string): string | null; set(k: string, v: string): void }

export interface PluginHostOptions {
  ports: HostPorts;
  connect: TransportFactory;
  store: KeyValueStore;
  /** Entradas que já vêm cadastradas (ex.: o renderizador). */
  builtins: PluginEntry[];
  storeKey?: string;
  /**
   * Política do token de pareamento (protocolo 1.1). `required`: plugin sem token ou sem 1.1 fica "incompatível" com a
   * causa. `optional`: só para desenvolvimento (o app a usa apenas em modo de desenvolvimento, com aviso na tela). O padrão
   * da biblioteca é `optional` porque o transporte em memória dos testes não tem processo externo; o app passa `required`.
   */
  tokenPolicy?: AuthPolicy;
  /** Token guardado para o plugin (o cofre fica com o app; o gerenciador não o persiste). */
  getToken?: (key: string) => string | undefined;
  heartbeatMs?: number;
  /** Esperas entre tentativas de reconexão, em ms (a última se repete). */
  backoffMs?: number[];
}

const DEFAULT_BACKOFF = [1000, 2000, 4000, 8000, 15000];

/**
 * Gerenciador de plugins: lista, habilita/desabilita, conecta/desconecta, concede permissões, reconecta com recuo e
 * expõe o estado para a tela. Cada conexão é uma `HostSession`.
 */
export class PluginHost {
  private entries = new Map<string, PluginEntry>();
  private runtime = new Map<string, PluginRuntime>();
  private sessions = new Map<string, HostSession>();
  private retained = new Map<string, RetainedSession>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private epoch = new Map<string, number>();
  private listeners = new Set<() => void>();
  private cache: PluginView[] = [];
  private readonly storeKey: string;
  private readonly backoff: number[];
  /** Bloqueio por falhas seguidas de pareamento, por plugin. */
  private locks = new Map<string, AuthLockout>();

  constructor(private readonly o: PluginHostOptions) {
    this.storeKey = o.storeKey ?? 'hestia.plugins.v1';
    this.backoff = o.backoffMs ?? DEFAULT_BACKOFF;
    for (const b of o.builtins) this.entries.set(b.key, { ...b, builtin: true });
    this.load();
    for (const e of this.entries.values()) this.runtime.set(e.key, this.idle(e));
    this.rebuild();
  }

  // ---- leitura ----
  list(): PluginView[] { return this.cache; }
  subscribe(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  get(key: string): PluginView | undefined { return this.cache.find((p) => p.key === key); }

  // ---- configuração ----
  /** Cadastra um endereço de plugin informado pelo usuário. Devolve a chave, ou null se o endereço não for loopback válido. */
  add(label: string, endpoint: unknown): string | null {
    const ep = validateEndpoint(endpoint);
    if (!ep || label.trim() === '') return null;
    const key = `usr_${Date.now().toString(36)}${this.entries.size.toString(36)}`;
    this.entries.set(key, { key, label: label.trim().slice(0, 60), endpoint: ep, enabled: false, grants: [], suggested: [] });
    this.runtime.set(key, this.idle(this.entries.get(key)!));
    this.save();
    this.rebuild();
    return key;
  }

  remove(key: string): void {
    const e = this.entries.get(key);
    if (!e || e.builtin) return;
    this.disable(key);
    this.entries.delete(key);
    this.runtime.delete(key);
    this.save();
    this.rebuild();
  }

  /** Concede exatamente estas capacidades (as desconhecidas são ignoradas). Reinicia a sessão para valer. */
  setGrants(key: string, grants: readonly string[]): void {
    const e = this.entries.get(key);
    if (!e) return;
    e.grants = ALL_CAPABILITIES.filter((c) => grants.includes(c) && isCapability(c));
    this.save();
    this.updatePending(key);
    if (this.sessions.has(key)) { this.dropSession(key, 'grants'); void this.connect(key); } else this.rebuild();
  }

  enable(key: string, grants?: readonly string[]): void {
    const e = this.entries.get(key);
    if (!e) return;
    if (grants) e.grants = ALL_CAPABILITIES.filter((c) => grants.includes(c));
    e.enabled = true;
    this.save();
    void this.connect(key);
  }

  disable(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    e.enabled = false;
    this.save();
    this.cancelTimer(key);
    this.bump(key);
    this.dropSession(key, 'disabled');
    this.retained.delete(key);
    this.setRuntime(key, { ...this.idle(e), error: undefined });
  }

  /** Encerra a sessão agora e para as tentativas automáticas; a entrada continua habilitada. "Conectar" volta. */
  disconnect(key: string): void {
    const e = this.entries.get(key);
    if (!e) return;
    this.cancelTimer(key);
    this.bump(key);
    this.dropSession(key, 'user');
    this.setRuntime(key, this.idle(e));
  }

  setCameraMode(key: string, mode: CameraMode): void {
    this.sessions.get(key)?.setCameraMode(mode);
  }

  // ---- conexão ----
  /** Conecta agora (também usado pelo botão "Reconectar"). Só para entradas habilitadas. */
  async connect(key: string): Promise<void> {
    const e = this.entries.get(key);
    if (!e || !e.enabled) return;
    this.cancelTimer(key);
    if (this.sessions.has(key)) return;
    const lock = this.lockOf(key).remainingMs();
    if (lock > 0) {
      const prev0 = this.runtime.get(key)!;
      this.setRuntime(key, { ...prev0, state: 'incompatible', error: { code: 'auth_failed', cause: 'locked', message: `Muitas falhas de pareamento seguidas; aguarde ${Math.ceil(lock / 1000)} s.` }, granted: [], pending: [] });
      return;
    }
    const my = this.bump(key);
    const prev = this.runtime.get(key)!;
    this.setRuntime(key, { ...prev, state: prev.state === 'connected' || prev.state === 'reconnecting' ? 'reconnecting' : 'connecting', error: undefined });
    let tr: Transport;
    try {
      tr = await this.o.connect(e.endpoint);
    } catch (err) {
      if (this.epoch.get(key) !== my) return;
      this.failed(key, { code: 'unreachable', message: err instanceof Error && err.message ? err.message : 'Nada responde neste endereço.' });
      return;
    }
    if (this.epoch.get(key) !== my || !e.enabled) { tr.close('superseded'); return; }
    const session = new HostSession(tr, {
      ports: this.o.ports,
      grants: e.grants,
      tokenPolicy: this.o.tokenPolicy ?? 'optional',
      ...(this.o.getToken?.(key) ? { token: this.o.getToken(key)! } : {}),
      ...(e.expectedKind ? { expectedKind: e.expectedKind } : {}),
      ...(this.o.heartbeatMs ? { heartbeatMs: this.o.heartbeatMs } : {}),
      retained: this.retained.get(key) ?? null,
      onRetain: (r) => this.retained.set(key, r),
      onEvent: (ev) => this.onEvent(key, my, ev),
    });
    this.sessions.set(key, session);
  }

  /** O token deste plugin mudou (ou foi apagado): zera o bloqueio e reconecta com o novo. */
  tokenChanged(key: string): void {
    this.locks.delete(key);
    const e = this.entries.get(key);
    if (!e?.enabled) return;
    if (this.sessions.has(key)) this.dropSession(key, 'token');
    this.cancelTimer(key);
    this.setRuntime(key, { ...this.idle(e), error: undefined });
    void this.connect(key);
  }

  /** Ao abrir o app: conecta o que o usuário deixou habilitado. */
  start(): void {
    for (const e of this.entries.values()) if (e.enabled) void this.connect(e.key);
  }

  /** Encerra todas as sessões (fechar o projeto/app). */
  dispose(): void {
    for (const k of this.entries.keys()) { this.cancelTimer(k); this.bump(k); this.dropSession(k, 'dispose'); }
  }

  // ---- interno ----
  private onEvent(key: string, my: number, ev: SessionEvent): void {
    if (this.epoch.get(key) !== my) return;
    const e = this.entries.get(key);
    if (!e) return;
    const prev = this.runtime.get(key)!;
    switch (ev.type) {
      case 'ready':
        e.manifest = ev.manifest;
        this.save();
        if (ev.authenticated) this.locks.delete(key);
        this.setRuntime(key, { ...prev, state: 'connected', error: undefined, authenticated: ev.authenticated, granted: ev.granted, pending: ev.denied, cameraMode: this.sessions.get(key)?.mode ?? 'follow-hestia', attempt: 0 });
        break;
      case 'incompatible':
        if (ev.code === 'auth_failed') this.lockOf(key).fail();
        this.setRuntime(key, { ...prev, state: 'incompatible', error: { code: ev.code, message: ev.message, ...(ev.cause ? { cause: ev.cause } : {}) }, granted: [], pending: [] });
        break;
      case 'camera-mode':
        this.setRuntime(key, { ...prev, cameraMode: ev.mode });
        break;
      case 'denied':
        this.setRuntime(key, { ...prev, error: { code: 'permission_denied', message: ev.message } });
        break;
      case 'closed': {
        this.sessions.delete(key);
        if (prev.state === 'incompatible') break; // a causa já está na tela; sem reconexão automática
        if (!e.enabled) break;
        const wasUp = prev.state === 'connected' || prev.state === 'reconnecting';
        this.failed(key, { code: ev.error?.code ?? 'closed', message: ev.error?.message ?? `Conexão encerrada (${ev.reason}).` }, wasUp);
        break;
      }
      default: break;
    }
  }

  private failed(key: string, error: { code: string; message: string }, wasConnected = false): void {
    const e = this.entries.get(key)!;
    const { authenticated: _a, ...prev } = this.runtime.get(key)!;
    const attempt = prev.attempt + 1;
    // "Ausente" = nunca foi visto; com manifesto conhecido é só "desconectado".
    this.setRuntime(key, { ...prev, state: e.manifest ? (wasConnected ? 'reconnecting' : 'disconnected') : 'absent', error, granted: [], pending: [], attempt });
    const wait = this.backoff[Math.min(attempt - 1, this.backoff.length - 1)] ?? 15000;
    if (e.enabled) this.timers.set(key, setTimeout(() => { this.timers.delete(key); void this.connect(key); }, wait));
  }

  private dropSession(key: string, reason: string): void {
    const s = this.sessions.get(key);
    this.sessions.delete(key);
    s?.disconnect(reason);
  }

  private lockOf(key: string): AuthLockout {
    let l = this.locks.get(key);
    if (!l) { l = new AuthLockout(); this.locks.set(key, l); }
    return l;
  }

  private cancelTimer(key: string): void {
    const t = this.timers.get(key);
    if (t) clearTimeout(t);
    this.timers.delete(key);
  }

  private bump(key: string): number {
    const n = (this.epoch.get(key) ?? 0) + 1;
    this.epoch.set(key, n);
    return n;
  }

  private idle(e: PluginEntry): PluginRuntime {
    return { state: e.manifest ? 'disconnected' : 'absent', granted: [], pending: [], cameraMode: 'follow-hestia', attempt: 0 };
  }

  private updatePending(key: string): void {
    const e = this.entries.get(key);
    const r = this.runtime.get(key);
    if (!e || !r) return;
    this.runtime.set(key, { ...r, pending: (e.manifest?.capabilities ?? []).filter((c) => !e.grants.includes(c)) });
  }

  private setRuntime(key: string, r: PluginRuntime): void {
    this.runtime.set(key, r);
    this.rebuild();
  }

  private rebuild(): void {
    this.cache = [...this.entries.values()].map((e) => ({ ...e, ...this.runtime.get(e.key)! }));
    for (const l of this.listeners) l();
  }

  private save(): void {
    const data = [...this.entries.values()].map((e) => ({ key: e.key, label: e.label, endpoint: e.endpoint, enabled: e.enabled, grants: e.grants, manifest: e.manifest, builtin: !!e.builtin }));
    try { this.o.store.set(this.storeKey, JSON.stringify(data)); } catch { /* armazenamento indisponível: vale só nesta sessão */ }
  }

  private load(): void {
    let raw: unknown;
    try { raw = JSON.parse(this.o.store.get(this.storeKey) ?? 'null'); } catch { return; }
    if (!Array.isArray(raw)) return;
    for (const r of raw as Array<Record<string, unknown>>) {
      const key = typeof r.key === 'string' ? r.key : null;
      const ep = validateEndpoint(r.endpoint);
      if (!key || !ep) continue;
      const grants = Array.isArray(r.grants) ? ALL_CAPABILITIES.filter((c) => (r.grants as unknown[]).includes(c)) : [];
      const base = this.entries.get(key);
      const vm = r.manifest === undefined ? null : validateManifest(r.manifest);
      const manifest = vm && vm.ok ? vm.manifest : undefined;
      if (base) { Object.assign(base, { endpoint: ep, enabled: r.enabled === true, grants, ...(manifest ? { manifest } : {}) }); continue; }
      if (r.builtin === true) continue; // entrada embutida que não existe mais
      this.entries.set(key, { key, label: typeof r.label === 'string' ? r.label.slice(0, 60) : key, endpoint: ep, enabled: r.enabled === true, grants, suggested: [], ...(manifest ? { manifest } : {}) });
    }
  }
}
