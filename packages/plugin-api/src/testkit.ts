import type { PluginManifest } from './manifest.ts';
import { Peer, type Transport } from './transport.ts';
import type { Message, ProtocolError } from './protocol.ts';
import type { CameraMode, MaterialId, SceneCamera, SceneSnapshot, ViewMaterialOverride } from './scene.ts';
import { applyDelta } from './sceneSync.ts';
import { authProof, randomNonce, verifyAuthProof } from './pairing.ts';
import { API_VERSION, AUTH_PROTOCOL_VERSION, formatVersion } from './version.ts';

/** Manifesto de um renderizador de teste que pede só o necessário (sem escrita geral). */
export const TEST_RENDERER_MANIFEST: PluginManifest = {
  id: 'dev.hestia.plugin-teste',
  name: 'Plugin de teste',
  version: '0.0.1',
  hestiaApi: formatVersion(API_VERSION),
  kind: 'renderer',
  capabilities: ['scene.read', 'camera.read', 'events.subscribe', 'camera.write', 'overrides.write'],
};

export interface TestPluginOptions {
  manifest?: PluginManifest;
  protocol?: { min: string; max: string };
  /** Reenvia hello com `resume` (plugin que reconecta). */
  resume?: { sessionId: string; lastRevision: number };
  heartbeatMs?: number;
  /**
   * Token de pareamento (protocolo 1.1). Com ele o plugin fala 1.1, manda `hello.auth`, confere a prova do host e responde
   * `auth.ok`; recusa qualquer mensagem de cena antes disso. Sem ele, é um plugin 1.0 legado.
   */
  token?: string;
}

/**
 * Plugin de teste: implementação de referência, em TypeScript, do LADO DO PLUGIN do protocolo. Serve de modelo para
 * quem escreve um plugin (em qualquer linguagem) e de contraparte nos testes. NÃO é o renderizador.
 */
export class TestPlugin {
  readonly peer: Peer;
  snapshot: SceneSnapshot | null = null;
  welcome: Extract<Message, { t: 'welcome' }> | null = null;
  cameras: Array<{ camera: SceneCamera; origin: string; rev: number }> = [];
  overrides: Record<MaterialId, ViewMaterialOverride> = {};
  errors: ProtocolError[] = [];
  mode: CameraMode = 'follow-hestia';
  closed: string | null = null;
  resyncs = 0;
  deltas = 0;
  /** Pareamento concluído (só faz sentido com `token`). */
  authed = false;
  private camRev = 0;
  private nonceP = '';

  constructor(transport: Transport, readonly opts: TestPluginOptions = {}) {
    this.peer = new Peer(transport, {
      heartbeatMs: opts.heartbeatMs ?? 5000,
      ackTimeoutMs: (opts.heartbeatMs ?? 5000) * 4,
      onMessage: (m) => this.onMessage(m),
      onFatal: (e) => this.errors.push(e),
      onClose: (r) => { this.closed = r; },
    });
  }

  hello(): void {
    // Sem token: plugin 1.0 legado. Com token: só fala 1.1 (um host 1.0 não sabe autenticar e é recusado).
    const v = this.opts.token ? formatVersion(AUTH_PROTOCOL_VERSION) : '1.0';
    if (this.opts.token) this.nonceP = randomNonce();
    this.peer.send({
      t: 'hello',
      protocol: this.opts.protocol ?? { min: v, max: v },
      manifest: this.opts.manifest ?? TEST_RENDERER_MANIFEST,
      ...(this.opts.resume ? { resume: this.opts.resume } : {}),
      ...(this.opts.token ? { auth: { nonce: this.nonceP } } : {}),
    });
  }

  private rejectAuth(message: string): void {
    const error: ProtocolError = { code: 'auth_failed', message, fatal: true };
    this.errors.push(error);
    this.peer.sendError(error);
    this.peer.close('auth_failed');
  }

  private async onAuth(m: Extract<Message, { t: 'auth' }>): Promise<void> {
    const token = this.opts.token!;
    if (!(await verifyAuthProof(token, 'hestia-host', this.nonceP, m.nonce, m.proof))) { this.rejectAuth('o host não provou conhecer o token'); return; }
    this.authed = true;
    this.peer.send({ t: 'auth.ok', proof: await authProof(token, 'hestia-plugin', this.nonceP, m.nonce) });
  }

  private onMessage(m: Message): void {
    if (this.opts.token && !this.authed) {
      if (m.t === 'auth') { void this.onAuth(m); return; }
      if (m.t !== 'error') { this.rejectAuth(`mensagem "${m.t}" antes da autenticação`); return; }
    }
    switch (m.t) {
      case 'welcome': this.welcome = m; this.mode = m.cameraMode; this.peer.setHeartbeat(m.heartbeatMs); this.peer.startHeartbeat(); break;
      case 'scene.snapshot': this.snapshot = m.snapshot; break;
      case 'scene.delta': {
        this.deltas += 1;
        if (!this.snapshot) { this.resync(); break; }
        const r = applyDelta(this.snapshot, m.delta);
        if (r === 'resync') this.resync();
        else this.snapshot = r;
        break;
      }
      case 'camera.update': this.cameras.push({ camera: m.camera, origin: m.origin, rev: m.cameraRev }); break;
      case 'camera.mode': this.mode = m.mode; break;
      case 'overrides.state': this.overrides = m.overrides; break;
      case 'error': this.errors.push(m.error); break;
      default: break;
    }
  }

  // Ações que um plugin real faz.
  resync(): void { this.resyncs += 1; this.peer.send({ t: 'scene.resync', id: `r${this.resyncs}` }); }
  setMode(mode: CameraMode): void { this.peer.send({ t: 'camera.mode.set', mode }); }
  /** Nunca reenvie a câmera recebida com origin "hestia" (isso cria eco); só a que o usuário moveu NO plugin. */
  drive(camera: SceneCamera): void { this.peer.send({ t: 'camera.set', camera, cameraRev: ++this.camRev }); }
  setOverride(materialId: MaterialId, override: ViewMaterialOverride): void { this.peer.send({ t: 'overrides.set', materialId, override }); }
  clearOverride(materialId: MaterialId): void { this.peer.send({ t: 'overrides.clear', materialId }); }
  cancel(target: string): void { this.peer.send({ t: 'cancel', target }); }
  bye(): void { this.peer.send({ t: 'bye', reason: 'plugin' }); this.peer.close('bye'); }
}
