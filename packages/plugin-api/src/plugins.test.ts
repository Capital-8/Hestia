import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_VERSION, PluginHost, TEST_RENDERER_MANIFEST, TestPlugin, createMemoryPair, decode, findImagePayload, negotiateProtocol, validateEndpoint, validateManifest,
  type Capability, type HostPorts, type PluginEntry, type SceneCamera, type SceneContent, type SceneEntity, type ViewMaterialOverride,
} from './index.ts';

const cam = (x: number): SceneCamera => ({ projection: 'perspective', target: { x: 0, y: 0, z: 0 }, position: { x, y: -10, z: 8 }, up: { x: 0, y: 0, z: 1 }, fovY: 0.8, orthoHeight: 20, near: 0.1, far: 1000 });
const wall = (id: string, hash = 'h1'): SceneEntity => ({ id, kind: 'wall', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], visible: true, mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], groups: [{ start: 0, count: 3, materialId: 'mat1' }], hash } });

/** Portas em memória: o "editor" falso. */
function fakePorts() {
  const content: SceneContent = { projectName: 'P', entities: [wall('w1')], materials: [{ id: 'mat1', name: 'Tijolo', color: '#aa5533', gloss: 0.1, opacity: 1 }], textures: [] };
  let camera: SceneCamera | null = cam(10);
  const sub = { scene: new Set<() => void>(), camera: new Set<() => void>(), ov: new Set<() => void>() };
  const ov: Record<string, Record<string, ViewMaterialOverride>> = {};
  const writes: SceneCamera[] = [];
  const ports: HostPorts = {
    scene: { projectId: () => 'proj_1', read: () => structuredClone(content), subscribe: (cb) => { sub.scene.add(cb); return () => sub.scene.delete(cb); } },
    camera: { read: () => camera, write: (c) => { writes.push(c); camera = c; sub.camera.forEach((f) => f()); return true; }, subscribe: (cb) => { sub.camera.add(cb); return () => sub.camera.delete(cb); } },
    overrides: {
      read: (p) => structuredClone(ov[p] ?? {}),
      set: (p, m, o) => { if (!content.materials.some((x) => x.id === m)) throw new Error('Material de origem inexistente'); (ov[p] ??= {})[m] = o; sub.ov.forEach((f) => f()); },
      clear: (p, m) => { delete ov[p]?.[m]; sub.ov.forEach((f) => f()); },
      subscribe: (cb) => { sub.ov.add(cb); return () => sub.ov.delete(cb); },
    },
  };
  return {
    ports, content, writes, ov,
    changeScene: () => sub.scene.forEach((f) => f()),
    userMovesCamera: (c: SceneCamera) => { camera = c; sub.camera.forEach((f) => f()); },
  };
}

const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) { await vi.advanceTimersByTimeAsync(1); } };

const ENTRY: PluginEntry = { key: 'renderer', label: 'Renderizador', endpoint: { host: '127.0.0.1', port: 47800 }, enabled: false, grants: [], suggested: ['scene.read'], expectedKind: 'renderer', builtin: true };
const ALL: Capability[] = ['scene.read', 'camera.read', 'events.subscribe', 'camera.write', 'overrides.write'];

function setup(opts: { plugin?: ConstructorParameters<typeof TestPlugin>[1]; refuse?: boolean } = {}) {
  const f = fakePorts();
  const mem = new Map<string, string>();
  const plugins: TestPlugin[] = [];
  const host = new PluginHost({
    ports: f.ports,
    store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) },
    builtins: [{ ...ENTRY }],
    heartbeatMs: 1000,
    backoffMs: [100, 200],
    connect: async () => {
      if (opts.refuse) throw new Error('recusado');
      const [a, b] = createMemoryPair();
      const p = new TestPlugin(b, { heartbeatMs: 1000, ...opts.plugin });
      plugins.push(p);
      p.hello();
      return a;
    },
  });
  return { f, host, plugins, mem, last: () => plugins[plugins.length - 1]! };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('manifesto e versões', () => {
  it('valida e rejeita capacidade desconhecida, id ruim e API incompatível', () => {
    expect(validateManifest(TEST_RENDERER_MANIFEST).ok).toBe(true);
    const r = validateManifest({ ...TEST_RENDERER_MANIFEST, capabilities: ['document.write'], id: 'X', hestiaApi: '2.0' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['unknown_capability', 'bad_field', 'api_incompatible']));
    expect(API_VERSION.major).toBe(1);
  });
  it('negocia protocolo e só aceita endereço de loopback', () => {
    expect(negotiateProtocol({ min: { major: 1, minor: 0 }, max: { major: 1, minor: 5 } }).ok).toBe(true);
    expect(negotiateProtocol({ min: { major: 2, minor: 0 }, max: { major: 2, minor: 1 } }).ok).toBe(false);
    expect(validateEndpoint({ host: '127.0.0.1', port: 47800 })).not.toBeNull();
    expect(validateEndpoint({ host: '192.168.0.2', port: 47800 })).toBeNull();
    expect(validateEndpoint({ host: 'localhost', port: 80 })).toBeNull();
  });
  it('recusa imagem como meio de sincronização', () => {
    expect(findImagePayload({ a: { png: 'x' } })).toBe('$.a.png');
    expect(decode(JSON.stringify({ t: 'scene.delta', delta: { x: 'data:image/png;base64,AAA' } })).ok).toBe(false);
    expect(decode('{"t":"scene.snapshot","seq":1,"snapshot":{"revision":1,"projectId":"p","entities":[],"materials":[]}}').ok).toBe(true);
  });
});

describe('conexão e estados', () => {
  it('sem processo → ausente; habilitar conecta, negocia e envia o snapshot', async () => {
    const s = setup({ refuse: true });
    expect(s.host.get('renderer')?.state).toBe('absent');
    s.host.enable('renderer', ALL);
    await flush();
    expect(s.host.get('renderer')?.state).toBe('absent');
    expect(s.host.get('renderer')?.error?.code).toBe('unreachable');
  });

  it('conecta, mostra versão do plugin e entrega o snapshot completo', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    const v = s.host.get('renderer')!;
    expect(v.state).toBe('connected');
    expect(v.manifest?.version).toBe('0.0.1');
    expect(v.granted).toEqual(ALL);
    const snap = s.last().snapshot!;
    expect(snap.projectId).toBe('proj_1');
    expect(snap.units).toEqual({ length: 'm', angle: 'rad' });
    expect(snap.axes.up).toBe('z');
    expect(snap.entities.map((e) => e.id)).toEqual(['w1']);
    expect(snap.materials[0]!.id).toBe('mat1');
  });

  it('versão de protocolo incompatível → incompatível, sem reconexão automática', async () => {
    const s = setup({ plugin: { protocol: { min: '2.0', max: '2.3' } } });
    s.host.enable('renderer', ALL);
    await flush();
    const v = s.host.get('renderer')!;
    expect(v.state).toBe('incompatible');
    expect(v.error?.code).toBe('unsupported_version');
    await vi.advanceTimersByTimeAsync(60000);
    expect(s.plugins.length).toBe(1);
  });

  it('API do manifesto incompatível e tipo errado → incompatível com mensagem', async () => {
    const a = setup({ plugin: { manifest: { ...TEST_RENDERER_MANIFEST, hestiaApi: '9.0' } } });
    a.host.enable('renderer', ALL);
    await flush();
    expect(a.host.get('renderer')!.state).toBe('incompatible');
    expect(a.host.get('renderer')!.error?.message).toMatch(/incompatível/);
    const b = setup({ plugin: { manifest: { ...TEST_RENDERER_MANIFEST, kind: 'exporter' } } });
    b.host.enable('renderer', ALL);
    await flush();
    expect(b.host.get('renderer')!.state).toBe('incompatible');
  });

  it('queda → reconexão automática e retomada pela revisão; desabilitar para tudo', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    const first = s.last();
    first.peer.close('queda');
    await flush();
    expect(['reconnecting', 'disconnected']).toContain(s.host.get('renderer')!.state);
    await vi.advanceTimersByTimeAsync(300);
    await flush();
    expect(s.plugins.length).toBe(2);
    expect(s.host.get('renderer')!.state).toBe('connected');
    s.host.disable('renderer');
    await flush();
    expect(s.host.get('renderer')!.state).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(60000);
    expect(s.plugins.length).toBe(2);
  });

  it('heartbeat: silêncio derruba a conexão com mensagem clara', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    (s.last().peer as unknown as { tr: { mute: boolean } }).tr.mute = true;
    await vi.advanceTimersByTimeAsync(3000);
    expect(s.host.get('renderer')!.error?.code).toBe('heartbeat_timeout');
  });
});

describe('cena incremental', () => {
  it('criar, alterar e remover objetos e materiais chegam como deltas; sem mudança, nada é enviado', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    const p = s.last();
    s.f.content.entities.push(wall('w2'));
    s.f.content.entities[0] = wall('w1', 'h2');
    s.f.content.materials[0] = { ...s.f.content.materials[0]!, color: '#00ff00' };
    s.f.content.materials.push({ id: 'mat2', name: 'Vidro', color: '#99ccff', gloss: 0.9, opacity: 0.3 });
    s.f.changeScene();
    await flush();
    expect(p.deltas).toBe(1);
    expect(p.snapshot!.entities.map((e) => e.id).sort()).toEqual(['w1', 'w2']);
    expect(p.snapshot!.entities.find((e) => e.id === 'w1')!.mesh!.hash).toBe('h2');
    expect(p.snapshot!.materials.find((m) => m.id === 'mat1')!.color).toBe('#00ff00');
    expect(p.snapshot!.materials.length).toBe(2);
    s.f.changeScene(); // nada mudou
    await flush();
    expect(p.deltas).toBe(1);
    s.f.content.entities.splice(0, 1);
    s.f.content.materials.pop();
    s.f.changeScene();
    await flush();
    expect(p.snapshot!.entities.map((e) => e.id)).toEqual(['w2']);
    expect(p.snapshot!.materials.length).toBe(1);
    expect(p.snapshot!.revision).toBe(3);
  });

  it('scene.resync devolve o snapshot completo', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    const p = s.last();
    p.snapshot = null;
    p.resync();
    await flush();
    expect((p.snapshot as { entities: unknown[] } | null)?.entities.length).toBe(1);
  });

  it('cancel antes da execução cancela a ressincronização', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    const p = s.last();
    p.snapshot = null;
    p.peer.send({ t: 'scene.resync', id: 'x1' });
    p.cancel('x1');
    await flush();
    expect(p.snapshot).toBeNull();
    expect(p.errors.some((e) => e.code === 'cancelled')).toBe(true);
  });
});

describe('câmera', () => {
  it('follow-hestia: a câmera do Hestia segue para o plugin e o plugin não dirige', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    const p = s.last();
    expect(p.cameras.at(-1)!.origin).toBe('hestia');
    const n = p.cameras.length;
    s.f.userMovesCamera(cam(20));
    await flush();
    expect(p.cameras.length).toBe(n + 1);
    p.drive(cam(30));
    await flush();
    expect(s.f.writes.length).toBe(0);
    expect(p.errors.at(-1)!.code).toBe('bad_request');
  });

  it('plugin-drives: aplica a câmera do plugin sem ecoar de volta; câmera do usuário no Hestia ainda segue', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    const p = s.last();
    p.setMode('plugin-drives');
    await flush();
    expect(s.host.get('renderer')!.cameraMode).toBe('plugin-drives');
    const n = p.cameras.length;
    p.drive(cam(40));
    await flush();
    await vi.advanceTimersByTimeAsync(400);
    expect(s.f.writes.map((c) => c.position.x)).toEqual([40]);
    expect(p.cameras.length).toBe(n); // sem eco
    p.drive({ ...cam(41) });
    p.peer.send({ t: 'camera.set', camera: cam(99), cameraRev: 1 }); // atrasada: ignorada
    await flush();
    expect(s.f.writes.map((c) => c.position.x)).toEqual([40, 41]);
    await vi.advanceTimersByTimeAsync(400);
    s.f.userMovesCamera(cam(50));
    await flush();
    expect(p.cameras.at(-1)!.camera.position.x).toBe(50);
  });
});

describe('substituições de visualização e permissões', () => {
  it('grava no espaço do plugin sem tocar no material de origem; material inexistente é recusado', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    const p = s.last();
    const original = structuredClone(s.f.content.materials[0]);
    p.setOverride('mat1', { color: '#112233', params: { rough: 0.4 } });
    await flush();
    expect(s.f.ov[TEST_RENDERER_MANIFEST.id]!.mat1!.color).toBe('#112233');
    expect(p.overrides.mat1!.color).toBe('#112233');
    expect(s.f.content.materials[0]).toEqual(original);
    p.setOverride('nao-existe', { color: '#000000' });
    await flush();
    expect(p.errors.at(-1)!.code).toBe('bad_request');
    p.clearOverride('mat1');
    await flush();
    expect(p.overrides.mat1).toBeUndefined();
  });

  it('acesso negado quando a capacidade não foi concedida (e nada muda)', async () => {
    const s = setup();
    s.host.enable('renderer', ['scene.read', 'camera.read', 'events.subscribe']);
    await flush();
    const p = s.last();
    expect(s.host.get('renderer')!.granted).toEqual(['scene.read', 'camera.read', 'events.subscribe']);
    expect(s.host.get('renderer')!.pending).toEqual(['camera.write', 'overrides.write']);
    p.setOverride('mat1', { color: '#112233' });
    p.setMode('plugin-drives');
    await flush();
    expect(p.errors.filter((e) => e.code === 'permission_denied').length).toBe(2);
    expect(s.f.ov[TEST_RENDERER_MANIFEST.id]).toBeUndefined();
    expect(s.f.writes.length).toBe(0);
    expect(s.host.get('renderer')!.cameraMode).toBe('follow-hestia');
  });

  it('sem scene.read não há snapshot; conceder depois reinicia a sessão e entrega', async () => {
    const s = setup();
    s.host.enable('renderer', []);
    await flush();
    expect(s.last().snapshot).toBeNull();
    s.host.setGrants('renderer', ['scene.read']);
    await flush();
    expect(s.last().snapshot?.entities.length).toBe(1);
  });

  it('persistência: lembra a habilitação, as concessões e o manifesto', async () => {
    const s = setup();
    s.host.enable('renderer', ['scene.read']);
    await flush();
    const saved = JSON.parse(s.mem.get('hestia.plugins.v1')!);
    expect(saved[0].enabled).toBe(true);
    expect(saved[0].grants).toEqual(['scene.read']);
    expect(saved[0].manifest.id).toBe(TEST_RENDERER_MANIFEST.id);
  });
});

describe('mensagens malformadas', () => {
  const dec = (m: unknown): ReturnType<typeof decode> => decode(JSON.stringify(m));
  const okCam = cam(1);
  const casos: Array<[string, unknown]> = [
    ['modo de câmera inexistente', { t: 'camera.mode.set', seq: 1, mode: 'livre' }],
    ['modo ausente', { t: 'camera.mode.set', seq: 1 }],
    ['id não textual', { t: 'scene.resync', seq: 1, id: 5 }],
    ['id gigante', { t: 'scene.resync', seq: 1, id: 'x'.repeat(65) }],
    ['cameraRev negativo', { t: 'camera.set', seq: 1, cameraRev: -1, camera: okCam }],
    ['cameraRev fracionário', { t: 'camera.set', seq: 1, cameraRev: 1.5, camera: okCam }],
    ['câmera com NaN (null)', { t: 'camera.set', seq: 1, cameraRev: 1, camera: { ...okCam, fovY: null } }],
    ['câmera com far menor que near', { t: 'camera.set', seq: 1, cameraRev: 1, camera: { ...okCam, near: 5, far: 1 } }],
    ['override sem materialId', { t: 'overrides.set', seq: 1, override: { color: '#000000' } }],
    ['override com cor ruim', { t: 'overrides.set', seq: 1, materialId: 'm', override: { color: 'vermelho' } }],
    ['override com opacidade 2', { t: 'overrides.set', seq: 1, materialId: 'm', override: { opacity: 2 } }],
    ['override com campo desconhecido', { t: 'overrides.set', seq: 1, materialId: 'm', override: { shader: 'x' } }],
    ['override com param objeto', { t: 'overrides.set', seq: 1, materialId: 'm', override: { params: { a: { b: 1 } } } }],
    ['clear sem materialId', { t: 'overrides.clear', seq: 1 }],
    ['cancel sem target', { t: 'cancel', seq: 1 }],
    ['ack inválido', { t: 'ack', ack: 0 }],
    ['ping sem n', { t: 'ping' }],
    ['hello sem protocolo', { t: 'hello', seq: 1, manifest: {} }],
    ['hello com resume ruim', { t: 'hello', seq: 1, protocol: { min: '1.0', max: '1.0' }, manifest: {}, resume: { sessionId: 's', lastRevision: -3 } }],
    ['delta com revisão não crescente', { t: 'scene.delta', seq: 1, delta: { baseRevision: 3, revision: 3, ops: [] } }],
    ['delta com revisão textual', { t: 'scene.delta', seq: 1, delta: { baseRevision: '3', revision: 4, ops: [] } }],
    ['snapshot sem entidades', { t: 'scene.snapshot', seq: 1, snapshot: { revision: 1, projectId: 'p' } }],
    ['camera.update com origem estranha', { t: 'camera.update', seq: 1, cameraRev: 1, camera: okCam, origin: 'outro' }],
    ['error sem código', { t: 'error', error: { message: 'x', fatal: false } }],
  ];
  it.each(casos)('recusa: %s', (_n, msg) => {
    const r = dec(msg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['bad_request', 'image_payload_forbidden']).toContain(r.error.code);
  });
  it('aceita as mesmas mensagens quando bem formadas', () => {
    expect(dec({ t: 'camera.mode.set', seq: 1, mode: 'plugin-drives' }).ok).toBe(true);
    expect(dec({ t: 'camera.set', seq: 1, cameraRev: 0, camera: okCam }).ok).toBe(true);
    expect(dec({ t: 'overrides.set', seq: 1, materialId: 'm', override: { color: '#aabbcc', opacity: 0.5, params: { a: 1, b: 'x', c: true } } }).ok).toBe(true);
    expect(dec({ t: 'scene.delta', seq: 1, delta: { baseRevision: 1, revision: 2, ops: [] } }).ok).toBe(true);
  });
  it('quadro malformado vindo do plugin não derruba nem altera nada: volta erro não fatal', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    const p = s.last();
    p.peer.send({ t: 'camera.mode.set', mode: 'livre' } as never);
    p.peer.send({ t: 'overrides.set', materialId: 'mat1', override: { opacity: 9 } } as never);
    p.peer.send({ t: 'camera.set', cameraRev: -1, camera: cam(1) } as never);
    await flush();
    expect(p.errors.filter((e) => e.code === 'bad_request').length).toBe(3);
    expect(s.host.get('renderer')!.state).toBe('connected');
    expect(s.host.get('renderer')!.cameraMode).toBe('follow-hestia');
    expect(s.f.ov[TEST_RENDERER_MANIFEST.id]).toBeUndefined();
    expect(s.f.writes.length).toBe(0);
  });
  it('quadro numerado inválido ainda consome o seq: a mensagem válida seguinte NÃO vira out_of_order', async () => {
    const s = setup();
    s.host.enable('renderer', ALL);
    await flush();
    const p = s.last();
    p.peer.send({ t: 'overrides.set', materialId: 'mat1', override: { opacity: 9 } } as never);
    p.peer.send({ t: 'overrides.set', materialId: 'mat1', override: { color: '#445566' } });
    await flush();
    expect(p.errors.some((e) => e.code === 'out_of_order')).toBe(false);
    expect(p.errors.filter((e) => e.code === 'bad_request').length).toBe(1);
    expect(s.f.ov[TEST_RENDERER_MANIFEST.id]!.mat1!.color).toBe('#445566');
    expect(s.host.get('renderer')!.state).toBe('connected');
    expect(p.peer.pendingAcks).toBe(0);
  });
});
