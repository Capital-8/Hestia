import type { PluginManifest } from './manifest.ts';
import { Peer, type Transport } from './transport.ts';
import type { Message, ProtocolError } from './protocol.ts';
import type { CameraMode, MaterialId, SceneCamera, SceneSnapshot, ViewMaterialOverride } from './scene.ts';
import { applyDelta } from './sceneSync.ts';
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
    this.peer.send({
      t: 'hello',
      protocol: this.opts.protocol ?? { min: formatVersion(PROTOCOL_VERSION), max: formatVersion(PROTOCOL_VERSION) },
      manifest: this.opts.manifest ?? TEST_RENDERER_MANIFEST,
      ...(this.opts.resume ? { resume: this.opts.resume } : {}),
    });
  }

  private onMessage(m: Message): void {
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
