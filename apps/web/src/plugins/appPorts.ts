import { newId, pluginProjectUid, pluginViewOverrides, type Id } from '@hestia/model';
import { PluginHost, RENDERER_CAPABILITIES, type CameraPort, type HostPorts, type OverridesPort, type PluginEntry, type ScenePort } from '@hestia/plugin-api';
import { editor } from '../editor/controller.ts';
import { aplicarCamera3DAoVivo, camera3DAtual, lerCena3D, prepararCena3D } from '../editor/vista3dAoVivo.ts';
import { safeGet, safeSet } from '../editor/storage.ts';
import { fromSceneCamera, toSceneCamera } from './cameraConvert.ts';
import { buildSceneContent } from './sceneExport.ts';
import { connectWebSocket } from './wsTransport.ts';

/** Intervalo mínimo entre leituras da cena para os deltas (a extração de malhas é cara). */
const SCENE_THROTTLE_MS = 300;
/** Amostragem da câmera 3D enquanto houver sessão assinante (a órbita não emite eventos). */
const CAMERA_POLL_MS = 80;

const scenePort: ScenePort = {
  projectId() {
    let uid = pluginProjectUid(editor.project);
    if (!uid) {
      uid = newId('prj');
      editor.store.exec({ type: 'ensurePluginProjectUid', uid });
      uid = pluginProjectUid(editor.project) ?? uid;
    }
    return uid;
  },
  read() {
    prepararCena3D();
    return buildSceneContent(editor.project, lerCena3D()?.scene ?? null);
  },
  subscribe(cb) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastVersion = editor.store.version;
    const off = editor.store.subscribe(() => {
      if (editor.store.version === lastVersion || timer) return;
      timer = setTimeout(() => { timer = null; lastVersion = editor.store.version; cb(); }, SCENE_THROTTLE_MS);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  },
};

const cameraPort: CameraPort = {
  read() {
    const c = camera3DAtual();
    return c ? toSceneCamera(c) : null;
  },
  write: (c) => aplicarCamera3DAoVivo(fromSceneCamera(c)),
  subscribe(cb) {
    let last = JSON.stringify(camera3DAtual());
    const id = setInterval(() => {
      const now = JSON.stringify(camera3DAtual());
      if (now !== last) { last = now; cb(); }
    }, CAMERA_POLL_MS);
    return () => clearInterval(id);
  },
};

const overridesPort: OverridesPort = {
  read: (pluginId) => structuredClone(pluginViewOverrides(editor.project, pluginId)),
  set: (pluginId, materialId: Id, override) => editor.store.exec({ type: 'setPluginViewOverride', pluginId, materialId, override }),
  clear: (pluginId, materialId: Id) => editor.store.exec({ type: 'clearPluginViewOverride', pluginId, materialId }),
  subscribe(cb) {
    let ref = editor.project.plugins?.viewOverrides;
    return editor.store.subscribe(() => {
      const now = editor.project.plugins?.viewOverrides;
      if (now !== ref) { ref = now; cb(); }
    });
  },
};

export const hostPorts: HostPorts = { scene: scenePort, camera: cameraPort, overrides: overridesPort };

/** Entrada embutida do renderizador arquitetônico independente: endereço padrão, desabilitado até o usuário habilitar. */
export const RENDERER_ENTRY: PluginEntry = {
  key: 'renderer-local',
  label: 'Renderizador arquitetônico',
  endpoint: { host: '127.0.0.1', port: 47800 },
  enabled: false,
  grants: [],
  suggested: [...RENDERER_CAPABILITIES],
  expectedKind: 'renderer',
  builtin: true,
};

let host: PluginHost | null = null;

/** Gerenciador único do app (criado na primeira vez que a tela ou a abertura do app precisar). */
export function pluginHost(): PluginHost {
  host ??= new PluginHost({
    ports: hostPorts,
    connect: connectWebSocket,
    store: { get: safeGet, set: safeSet },
    builtins: [RENDERER_ENTRY],
  });
  return host;
}
