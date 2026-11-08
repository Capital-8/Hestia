import type { PluginManifest } from './manifest.ts';
import { Peer, type Transport } from './transport.ts';
import type { Message, ProtocolError } from './protocol.ts';
import type { CameraMode, MaterialId, SceneCamera, SceneSnapshot, ViewMaterialOverride } from './scene.ts';
import { applyDelta } from './sceneSync.ts';
import { authProof, randomNonce, timingSafeEqual } from './auth.ts';
import { API_VERSION, PROTOCOL_VERSION, formatVersion } from './version.ts';

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
  /** Token de pareamento: com ele o plugin fala 1.1 e autentica; sem ele, fala só 1.0 (sem auth). */
  token?: string;
  /** Token errado na resposta (teste de falha). */
  proofToken?: string;
  /** Responde `auth.ok` com ESTA prova (repetição de uma prova capturada em outra conexão). */
  replayProof?: string;
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
  private camRev = 0;
  private nonce = '';
  authenticated = false;
  /** Última prova enviada em `auth.ok` (para testes de repetição). */
  lastProof: string | null = null;

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
    this.nonce = randomNonce();
    const auth = this.opts.token !== undefined;
    this.peer.send({
      t: 'hello',
      protocol: this.opts.protocol ?? (auth ? { min: formatVersion(PROTOCOL_VERSION), max: formatVersion(PROTOCOL_VERSION) } : { min: '1.0', max: '1.0' }),
      manifest: this.opts.manifest ?? TEST_RENDERER_MANIFEST,
      ...(this.opts.resume ? { resume: this.opts.resume } : {}),
      ...(auth ? { auth: { nonce: this.nonce } } : {}),
    });
  }

  private async onAuth(nH: string, proof: string): Promise<void> {
    const token = this.opts.token!;
    const expected = await authProof(token, 'host', this.nonce, nH);
    if (!timingSafeEqual(proof, expected)) {
      this.errors.push({ code: 'auth_failed', message: 'host não provou o token', fatal: true });
      this.peer.sendError({ code: 'auth_failed', message: 'host não provou o token', fatal: true });
      this.peer.close('auth_failed');
      return;
    }
    this.authenticated = true;
    this.lastProof = this.opts.replayProof ?? (await authProof(this.opts.proofToken ?? token, 'plugin', this.nonce, nH));
    this.peer.send({ t: 'auth.ok', proof: this.lastProof });
  }

  private onMessage(m: Message): void {
    switch (m.t) {
      case 'auth': void this.onAuth(m.nonce, m.proof); break;
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
