import { ALL_CAPABILITIES, CAPABILITY_REQUIRES, type Capability } from './permissions.ts';
import { validateManifest, type ManifestIssue, type PluginManifest } from './manifest.ts';
import type { HostPorts, SceneContent } from './hostPorts.ts';
import { Peer, type Transport } from './transport.ts';
import { authProof, randomNonce, verifyAuthProof, type AuthCause, type AuthPolicy } from './pairing.ts';
import { REQUIRED_CAPABILITY, isValidCamera, type ErrorCode, type Message, type ProtocolError } from './protocol.ts';
import { SCENE_AXES, SCENE_UNITS, type CameraMode, type SceneCamera, type SceneSnapshot } from './scene.ts';
import { diffScene } from './sceneSync.ts';
import { API_VERSION, PROTOCOL_VERSION, formatVersion, negotiateProtocol, parseVersion, type Version } from './version.ts';

/** Estado retido entre conexões do mesmo plugin, para a retomada (`hello.resume`). */
export interface RetainedSession {
  sessionId: string;
  revision: number;
  content: SceneContent;
}

export type SessionEvent =
  | { type: 'ready'; manifest: PluginManifest; granted: Capability[]; denied: Capability[]; resumed: boolean; /** Pareamento por token concluído (protocolo 1.1). Falso = sem autenticação (só no modo opcional, de desenvolvimento). */ authenticated: boolean }
  | { type: 'incompatible'; code: ErrorCode; message: string; issues?: ManifestIssue[]; /** Causa do pareamento, quando a falha foi de autenticação. */ cause?: AuthCause }
  | { type: 'closed'; reason: string; error?: ProtocolError }
  | { type: 'camera-mode'; mode: CameraMode }
  | { type: 'denied'; message: string; messageType: string }
  | { type: 'overrides-saved'; materialId: string };

export interface HostSessionOptions {
  ports: HostPorts;
  /** Concessões do usuário a este plugin (a sessão cruza com o que o manifesto pede). */
  grants: readonly Capability[];
  /** Se informado, o manifesto precisa ter este tipo de integração. */
  expectedKind?: PluginManifest['kind'];
  /** Política do token de pareamento. `required` (padrão para uso real) recusa plugin sem 1.1 e sem prova; `optional` só em desenvolvimento. */
  tokenPolicy?: AuthPolicy;
  /** Token do plugin (informado pelo usuário). Nunca é enviado: só entra no cálculo das provas. */
  token?: string;
  heartbeatMs?: number;
  ackTimeoutMs?: number;
  handshakeMs?: number;
  /** Tempo em que mudanças da câmera do Hestia, logo depois de aplicar a do plugin, são tratadas como eco. */
  cameraSettleMs?: number;
  retained?: RetainedSession | null;
  onEvent(e: SessionEvent): void;
  /** Guarda o estado para uma retomada futura. */
  onRetain?(r: RetainedSession): void;
}

const DEFAULTS = { heartbeatMs: 5000, handshakeMs: 5000, cameraSettleMs: 250 };

const EPS = 1e-6;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
const v3 = (a: SceneCamera['target'], b: SceneCamera['target']): boolean => near(a.x, b.x) && near(a.y, b.y) && near(a.z, b.z);
/** Mesma câmera (dentro da tolerância)? Base da supressão de eco. */
export function sameCamera(a: SceneCamera, b: SceneCamera): boolean {
  return a.projection === b.projection && v3(a.target, b.target) && v3(a.position, b.position) && v3(a.up, b.up) && near(a.fovY, b.fovY) && near(a.orthoHeight, b.orthoHeight) && near(a.near, b.near) && near(a.far, b.far);
}

let sessionCounter = 0;

/**
 * Sessão do lado do Hestia com UM plugin conectado. Faz o aperto de mãos, confere permissões, publica o snapshot e os
 * deltas, sincroniza a câmera e grava as substituições de visualização. Só conhece as portas (`HostPorts`).
 */
export class HostSession {
  private readonly o: HostSessionOptions & typeof DEFAULTS;
  private readonly peer: Peer;
  private state: 'handshaking' | 'authenticating' | 'ready' | 'closed' = 'handshaking';
  /** Dados do `hello` guardados enquanto o pareamento por token acontece. */
  private pendingHello: { m: Extract<Message, { t: 'hello' }>; version: Version; nonceP: string; nonceH: string } | null = null;
  private authenticated = false;
  private manifest: PluginManifest | null = null;
  private granted = new Set<Capability>();
  private revision = 0;
  private sent: SceneContent | null = null;
  private readonly sessionId = `s${Date.now().toString(36)}${(++sessionCounter).toString(36)}`;
  private cameraMode: CameraMode = 'follow-hestia';
  private hostCamRev = 0;
  private pluginCamRev = 0;
  private lastSentCamera: SceneCamera | null = null;
  private appliedFromPlugin: SceneCamera | null = null;
  private settling = false;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private flushScheduled = false;
  private fatalError: ProtocolError | null = null;
  private readonly cancelled = new Set<string>();
  private readonly unsubs: Array<() => void> = [];

  constructor(transport: Transport, options: HostSessionOptions) {
    this.o = { ...DEFAULTS, ackTimeoutMs: (options.heartbeatMs ?? DEFAULTS.heartbeatMs) * 4, ...options } as HostSessionOptions & typeof DEFAULTS;
    this.peer = new Peer(transport, {
      heartbeatMs: this.o.heartbeatMs,
      ackTimeoutMs: this.o.ackTimeoutMs ?? this.o.heartbeatMs * 4,
      onMessage: (m) => this.onMessage(m),
      onFatal: (e) => { this.fatalError = e; },
      onClose: (r) => this.onClose(r),
    });
    this.handshakeTimer = setTimeout(() => {
      if (this.state === 'handshaking') this.fail('bad_request', 'O plugin não enviou "hello" a tempo.');
    }, this.o.handshakeMs);
  }

  get currentState(): 'handshaking' | 'ready' | 'closed' { return this.state === 'authenticating' ? 'handshaking' : this.state; }
  get pluginManifest(): PluginManifest | null { return this.manifest; }
  get grantedCapabilities(): Capability[] { return ALL_CAPABILITIES.filter((c) => this.granted.has(c)); }
  get mode(): CameraMode { return this.cameraMode; }
  get sceneRevision(): number { return this.revision; }

  /** Encerra a conexão a pedido do usuário (ou do host). */
  disconnect(reason = 'user'): void {
    if (this.state === 'closed') return;
    if (this.peer.isOpen) this.peer.send({ t: 'event.connection', state: 'closing', reason });
    this.peer.close(reason);
  }

  /** O usuário muda o modo da câmera na tela. */
  setCameraMode(mode: CameraMode): void {
    if (this.state !== 'ready' || mode === this.cameraMode) return;
    this.cameraMode = mode;
    this.o.onEvent({ type: 'camera-mode', mode });
    if (this.can('events.subscribe') || this.can('camera.read')) this.peer.send({ t: 'camera.mode', mode });
    if (mode === 'follow-hestia') this.sendCamera(true);
  }

  private can(c: Capability): boolean { return this.granted.has(c); }

  private fail(code: ErrorCode, message: string, detail?: Record<string, unknown>, cause?: AuthCause): void {
    const error: ProtocolError = { code, message, fatal: true, ...(detail ? { detail } : {}) };
    if (this.state === 'handshaking' || this.state === 'authenticating') this.o.onEvent({ type: 'incompatible', code, message, ...(cause ? { cause } : {}) });
    this.peer.sendError(error);
    this.peer.close(code);
  }

  private onMessage(m: Message): void {
    if (this.state === 'closed') return;
    if (m.t === 'bye') { this.peer.close('bye'); return; }
    if (m.t === 'error') {
      // Erros do plugin chegam como informação; só a recusa do pareamento (fatal) muda o estado: o plugin não aceitou nossa prova.
      if (this.state === 'authenticating' && m.error.code === 'auth_failed') this.failAuth('wrong_token', `O plugin recusou o pareamento: ${m.error.message}`);
      return;
    }
    // Antes de o pareamento terminar, nada de cena, câmera ou substituição é processado.
    if (this.state === 'authenticating') {
      if (m.t === 'auth.ok') void this.onAuthOk(m.proof);
      else this.failAuth('wrong_token', `Mensagem "${m.t}" antes da autenticação.`);
      return;
    }
    if (this.state === 'handshaking') {
      if (m.t !== 'hello') { this.fail('not_handshaken', 'Esperava "hello" antes de qualquer outra mensagem.'); return; }
      this.onHello(m);
      return;
    }
    if (m.t === 'hello') { this.peer.sendError({ code: 'bad_request', message: '"hello" repetido.', fatal: false }, m.id); return; }
    const need = REQUIRED_CAPABILITY[m.t];
    if (need && !this.can(need)) {
      this.o.onEvent({ type: 'denied', message: `Capacidade "${need}" não concedida.`, messageType: m.t });
      this.peer.sendError({ code: 'permission_denied', message: `Capacidade "${need}" não concedida a este plugin.`, fatal: false, detail: { capability: need, type: m.t } }, m.id);
      return;
    }
    switch (m.t) {
      case 'scene.resync': this.scheduleResync(m.id); break;
      case 'cancel': this.cancelled.add(m.target); break;
      case 'camera.mode.set': this.cameraMode = m.mode; this.o.onEvent({ type: 'camera-mode', mode: m.mode }); this.peer.send({ t: 'camera.mode', mode: m.mode, ...(m.id ? { re: m.id } : {}) }); if (m.mode === 'follow-hestia') this.sendCamera(true); break;
      case 'camera.set': this.onCameraSet(m.camera, m.cameraRev, m.id); break;
      case 'overrides.set': this.onOverride(() => this.o.ports.overrides.set(this.manifest!.id, m.materialId, m.override), m.materialId, m.id); break;
      case 'overrides.clear': this.onOverride(() => this.o.ports.overrides.clear(this.manifest!.id, m.materialId), m.materialId, m.id); break;
      case 'camera.update': this.peer.sendError({ code: 'bad_request', message: 'Use "camera.set" para dirigir a câmera.', fatal: false }, m.id); break;
      default: this.peer.sendError({ code: 'bad_request', message: `Mensagem "${m.t}" não é aceita do plugin.`, fatal: false }, m.id);
    }
  }

  private onHello(m: Extract<Message, { t: 'hello' }>): void {
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    const min = parseVersion(m.protocol?.min);
    const max = parseVersion(m.protocol?.max);
    if (!min || !max) { this.fail('bad_request', '"protocol" precisa de min e max no formato "major.minor".'); return; }
    const requireToken = (this.o.tokenPolicy ?? 'optional') === 'required';
    const neg = negotiateProtocol({ min, max }, PROTOCOL_VERSION, { requireToken });
    if (!neg.ok && neg.reason === 'token_required') {
      this.failAuth('plugin_without_auth', `O plugin fala o protocolo ${formatVersion(min)}–${formatVersion(max)}, sem pareamento por token (1.1), e o Hestia exige token.`);
      return;
    }
    if (!neg.ok) {
      this.fail('unsupported_version', `O plugin fala o protocolo ${formatVersion(min)}–${formatVersion(max)}; o Hestia fala ${formatVersion(PROTOCOL_VERSION)}.`, { host: formatVersion(PROTOCOL_VERSION), min: formatVersion(min), max: formatVersion(max) });
      return;
    }
    const nonceP = m.auth?.nonce;
    if (requireToken && !nonceP) { this.failAuth('plugin_without_auth', 'O plugin não enviou "auth" no hello; o Hestia exige token de pareamento.'); return; }
    if (nonceP && this.o.token) { this.startAuth(m, neg.version, nonceP); return; }
    if (requireToken) { this.failAuth('no_token', 'Informe o token deste plugin em Ferramentas externas.'); return; }
    this.completeHello(m, neg.version); // modo opcional (desenvolvimento) sem token: segue sem autenticar
  }

  // ---- pareamento por token (1.1) ----
  private failAuth(cause: AuthCause, message: string): void {
    this.fail('auth_failed', message, { cause }, cause);
  }

  private startAuth(m: Extract<Message, { t: 'hello' }>, version: Version, nonceP: string): void {
    this.state = 'authenticating';
    let nonceH: string;
    try { nonceH = randomNonce(); } catch { this.failAuth('no_crypto', 'Este ambiente não tem WebCrypto; o pareamento por token não é possível.'); return; }
    this.pendingHello = { m, version, nonceP, nonceH };
    this.handshakeTimer = setTimeout(() => { if (this.state === 'authenticating') this.failAuth('timeout', 'O plugin não respondeu ao pareamento a tempo.'); }, this.o.handshakeMs);
    authProof(this.o.token!, 'hestia-host', nonceP, nonceH).then(
      (proof) => { if (this.state === 'authenticating') this.peer.send({ t: 'auth', proof, nonce: nonceH }); },
      () => this.failAuth('no_crypto', 'Este ambiente não tem WebCrypto; o pareamento por token não é possível.'),
    );
  }

  private async onAuthOk(proof: string): Promise<void> {
    const p = this.pendingHello;
    if (!p) return;
    this.pendingHello = null;
    let ok = false;
    try { ok = await verifyAuthProof(this.o.token!, 'hestia-plugin', p.nonceP, p.nonceH, proof); } catch { ok = false; }
    if (this.state !== 'authenticating') return;
    if (!ok) { this.failAuth('wrong_token', 'O plugin não provou conhecer o token: confira o token informado.'); return; }
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.authenticated = true;
    this.state = 'handshaking';
    this.completeHello(p.m, p.version);
  }

  /** Segunda metade do aperto de mãos (manifesto, concessões, `welcome`); roda depois do pareamento, quando há. */
  private completeHello(m: Extract<Message, { t: 'hello' }>, version: Version): void {
    const v = validateManifest(m.manifest);
    if (!v.ok) {
      const incompat = v.issues.some((i) => i.code === 'api_incompatible');
      this.o.onEvent({ type: 'incompatible', code: incompat ? 'unsupported_version' : 'bad_manifest', message: incompat ? `API do plugin incompatível com a ${formatVersion(API_VERSION)} do Hestia.` : 'Manifesto inválido.', issues: v.issues });
      this.peer.sendError({ code: incompat ? 'unsupported_version' : 'bad_manifest', message: incompat ? 'API do Hestia incompatível.' : 'Manifesto inválido.', fatal: true, detail: { issues: v.issues } });
      this.peer.close('bad_manifest');
      return;
    }
    this.manifest = v.manifest;
    if (this.o.expectedKind && v.manifest.kind !== this.o.expectedKind) {
      this.fail('bad_manifest', `Esperava um plugin do tipo "${this.o.expectedKind}", recebeu "${v.manifest.kind}".`);
      return;
    }
    // Concessão = pedido ∩ usuário, com as dependências (camera.write sem camera.read não vale).
    const want = new Set(v.manifest.capabilities);
    const g = new Set(this.o.grants.filter((c) => want.has(c)));
    for (const c of [...g]) if (CAPABILITY_REQUIRES[c]?.some((r) => !g.has(r))) g.delete(c);
    this.granted = g;
    const denied = v.manifest.capabilities.filter((c) => !g.has(c));
    const ret = this.o.retained;
    const resumed = !!(m.resume && ret && m.resume.sessionId === ret.sessionId && m.resume.lastRevision === ret.revision);
    this.state = 'ready';
    this.peer.setHeartbeat(this.o.heartbeatMs);
    this.peer.startHeartbeat();
    this.peer.send({ t: 'welcome', protocol: formatVersion(version), api: formatVersion(API_VERSION), sessionId: this.sessionId, granted: this.grantedCapabilities, denied, heartbeatMs: this.o.heartbeatMs, cameraMode: this.cameraMode, resumed });
    this.o.onEvent({ type: 'ready', manifest: v.manifest, granted: this.grantedCapabilities, denied, resumed, authenticated: this.authenticated });
    if (this.can('scene.read')) {
      if (resumed && ret) this.resumeFrom(ret);
      else this.sendSnapshot();
    }
    this.subscribePorts();
    if (this.can('camera.read')) this.sendCamera(true);
    if (this.can('overrides.write') || this.can('scene.read')) this.peer.send({ t: 'overrides.state', overrides: this.o.ports.overrides.read(v.manifest.id) });
  }

  // ---- cena ----
  private snapshotOf(content: SceneContent): SceneSnapshot {
    return {
      projectId: this.o.ports.scene.projectId(),
      projectName: content.projectName,
      revision: this.revision,
      units: SCENE_UNITS,
      axes: SCENE_AXES,
      entities: content.entities,
      materials: content.materials,
      textures: content.textures,
      camera: this.o.ports.camera.read() ?? defaultCamera(),
      overrides: this.o.ports.overrides.read(this.manifest!.id),
    };
  }

  private sendSnapshot(re?: string): void {
    const content = this.o.ports.scene.read();
    this.revision += 1;
    this.sent = content;
    this.peer.send({ t: 'scene.snapshot', snapshot: this.snapshotOf(content), ...(re ? { re } : {}) });
    this.retain();
  }

  private resumeFrom(ret: RetainedSession): void {
    this.revision = ret.revision;
    this.sent = ret.content;
    this.flushDelta();
  }

  private scheduleResync(id?: string): void {
    setTimeout(() => {
      if (this.state !== 'ready') return;
      if (id && this.cancelled.delete(id)) { this.peer.sendError({ code: 'cancelled', message: 'Ressincronização cancelada.', fatal: false }, id); return; }
      this.sendSnapshot(id);
    }, 0);
  }

  private subscribePorts(): void {
    const { scene, camera, overrides } = this.o.ports;
    if (this.can('scene.read') && this.can('events.subscribe')) this.unsubs.push(scene.subscribe(() => this.scheduleFlush()));
    if (this.can('camera.read') && this.can('events.subscribe')) this.unsubs.push(camera.subscribe(() => this.onHestiaCamera()));
    this.unsubs.push(overrides.subscribe(() => { if (this.state === 'ready') this.peer.send({ t: 'overrides.state', overrides: overrides.read(this.manifest!.id) }); }));
  }

  /** Agrupa várias alterações no mesmo turno em um único delta. */
  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => { this.flushScheduled = false; this.flushDelta(); });
  }

  private flushDelta(): void {
    if (this.state !== 'ready' || !this.sent) return;
    const next = this.o.ports.scene.read();
    const ops = diffScene(this.sent, next);
    if (ops.length === 0) return;
    const base = this.revision;
    this.revision += 1;
    this.sent = next;
    this.peer.send({ t: 'scene.delta', delta: { baseRevision: base, revision: this.revision, ops } });
    this.retain();
  }

  private retain(): void {
    if (this.sent) this.o.onRetain?.({ sessionId: this.sessionId, revision: this.revision, content: this.sent });
  }

  // ---- câmera ----
  private sendCamera(force: boolean): void {
    if (this.state !== 'ready' || !this.can('camera.read')) return;
    const c = this.o.ports.camera.read();
    if (!c) return;
    if (!force && this.lastSentCamera && sameCamera(this.lastSentCamera, c)) return;
    this.lastSentCamera = c;
    this.peer.send({ t: 'camera.update', camera: c, cameraRev: ++this.hostCamRev, origin: 'hestia' });
  }

  private onHestiaCamera(): void {
    if (this.state !== 'ready') return;
    const c = this.o.ports.camera.read();
    if (!c) return;
    // Eco da câmera que o próprio plugin acabou de mandar: não devolve.
    if (this.settling) return;
    if (this.appliedFromPlugin && sameCamera(this.appliedFromPlugin, c)) return;
    this.sendCamera(false);
  }

  private onCameraSet(camera: SceneCamera, rev: number, id?: string): void {
    if (this.cameraMode !== 'plugin-drives') {
      this.peer.sendError({ code: 'bad_request', message: 'A câmera está em "follow-hestia"; mude o modo para "plugin-drives" antes de dirigir.', fatal: false, detail: { mode: this.cameraMode } }, id);
      return;
    }
    if (!isValidCamera(camera) || !Number.isInteger(rev)) { this.peer.sendError({ code: 'bad_request', message: 'Câmera inválida.', fatal: false }, id); return; }
    if (rev <= this.pluginCamRev) return; // atrasada ou repetida
    this.pluginCamRev = rev;
    this.appliedFromPlugin = camera;
    this.lastSentCamera = camera;
    this.settling = true;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    const ok = this.o.ports.camera.write(camera);
    this.settleTimer = setTimeout(() => {
      this.settling = false;
      // O Hestia pode ter ajustado (limites da órbita): aceita o valor final sem reenviar.
      const now = this.o.ports.camera.read();
      if (now) this.lastSentCamera = now;
    }, this.o.cameraSettleMs);
    if (!ok) this.peer.sendError({ code: 'bad_request', message: 'Não há vista 3D aberta para receber a câmera.', fatal: false }, id);
  }

  // ---- substituições ----
  private onOverride(run: () => void, materialId: string, id?: string): void {
    try {
      run();
    } catch (e) {
      this.peer.sendError({ code: 'bad_request', message: e instanceof Error ? e.message : 'Substituição recusada.', fatal: false }, id);
      return;
    }
    this.o.onEvent({ type: 'overrides-saved', materialId });
    // O estado confirmado volta pelo assinante das portas; se o porta não notificar, responde direto.
    this.peer.send({ t: 'overrides.state', overrides: this.o.ports.overrides.read(this.manifest!.id), ...(id ? { re: id } : {}) });
  }

  private onClose(reason: string): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    for (const u of this.unsubs.splice(0)) u();
    if (this.settleTimer) clearTimeout(this.settleTimer);
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.pendingHello = null;
    this.o.onEvent({ type: 'closed', reason, ...(this.fatalError ? { error: this.fatalError } : {}) });
  }
}

function defaultCamera(): SceneCamera {
  return { projection: 'perspective', target: { x: 0, y: 0, z: 0 }, position: { x: 10, y: -10, z: 8 }, up: { x: 0, y: 0, z: 1 }, fovY: 0.8, orthoHeight: 20, near: 0.1, far: 1000 };
}
