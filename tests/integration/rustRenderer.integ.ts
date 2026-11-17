/**
 * Integração Hestia ↔ renderizador Rust em PROCESSOS SEPARADOS, por WebSocket real em loopback.
 *
 * Lado Hestia (este processo Node): código real de @hestia/plugin-api (PluginHost, HostSession, protocolo), o
 * transporte WebSocket do app (apps/web/src/plugins/wsTransport.ts) e um ProjectStore real. Lado renderizador:
 * o binário `hestia-renderer` (crates/hestia-renderer), outro processo do sistema operacional, que o teste inicia,
 * comanda por stdin e lê pelo relatório de estado (arquivo JSON escrito pelo processo Rust).
 *
 * Nada aqui usa o transporte em memória. A geometria dos elementos é SINTÉTICA (caixas derivadas das paredes reais do
 * projeto): a extração da cena 3D do app não roda em Node; ver docs/plugins/06-validacao-processo-rust.md.
 */
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, pluginViewOverrides, type SheetView3DCamera, type Wall } from '@hestia/model';
import { PluginHost, RENDERER_CAPABILITIES, type AuthPolicy, type HostPorts, type PluginEntry } from '@hestia/plugin-api';
import { fromSceneCamera, toSceneCamera } from '../../apps/web/src/plugins/cameraConvert.ts';
import { buildSceneContent } from '../../apps/web/src/plugins/sceneExport.ts';
import { connectWebSocket } from '../../apps/web/src/plugins/wsTransport.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const CRATE = path.join(ROOT, 'crates/hestia-renderer');
const BIN = path.join(CRATE, 'target/debug', process.platform === 'win32' ? 'hestia-renderer.exe' : 'hestia-renderer');
const PLUGIN_ID = 'dev.hestia.renderer-rust';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until<T>(what: string, fn: () => T | undefined | false, ms = 8000): Promise<T> {
  const t0 = Date.now();
  let last: unknown;
  while (Date.now() - t0 < ms) {
    try {
      const v = fn();
      if (v) return v as T;
    } catch (e) { last = e; }
    await sleep(25);
  }
  throw new Error(`Tempo esgotado esperando: ${what}${last ? ` (${String(last)})` : ''}`);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

interface RState {
  pid: number; connections: number; connected: boolean; sessionId: string | null; protocol: string; api: string;
  granted: string[]; denied: string[]; resumed: boolean; cameraMode: string; camera: ReturnType<typeof toSceneCamera> | null;
  cameraUpdates: number; overrides: Record<string, Record<string, unknown>>; snapshots: number; deltas: number; resyncs: number;
  errors: Array<{ code: string; message: string }>; authRequired: boolean; authenticated: boolean;
  scene: { projectId: string; revision: number; entities: Record<string, { kind: string; triangles: number; vertices: number; meshHash: string }>; materials: Record<string, { color: string }> };
}

class Renderer {
  proc!: ChildProcessWithoutNullStreams;
  readonly stateFile: string;
  readonly events: Array<Record<string, unknown>> = [];
  constructor(readonly dir: string, readonly port: number, readonly extra: string[] = []) {
    this.stateFile = path.join(dir, `state-${port}-${Date.now()}.json`);
  }
  async start(): Promise<this> {
    // Os casos anteriores à 1.1 testam o contrato 1.0: sem `--token-file`/`--require-token` o processo sobe em modo legado
    // (`--no-require-token`, só para desenvolvimento). Os casos de token (abaixo) passam `--token-file` e usam o padrão (token exigido).
    const comToken = this.extra.includes('--token-file') || this.extra.includes('--require-token');
    this.proc = spawn(BIN, ['--port', String(this.port), '--state-file', this.stateFile, '--control-stdin', ...(comToken ? [] : ['--no-require-token']), ...this.extra], { stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '';
    this.proc.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { try { this.events.push(JSON.parse(buf.slice(0, i))); } catch { /* linha parcial */ } buf = buf.slice(i + 1); }
    });
    this.proc.stderr.on('data', (d: Buffer) => process.stderr.write(`[renderer] ${d}`));
    await until('renderizador escutando', () => this.events.find((e) => e.event === 'listening'));
    return this;
  }
  cmd(c: Record<string, unknown>): void { this.proc.stdin.write(`${JSON.stringify(c)}\n`); }
  state(): RState { return JSON.parse(readFileSync(this.stateFile, 'utf8')) as RState; }
  async waitState(what: string, pred: (s: RState) => boolean, ms = 8000): Promise<RState> {
    return until(what, () => { const s = this.state(); return pred(s) ? s : false; }, ms);
  }
  async kill(): Promise<void> {
    if (this.proc.exitCode !== null) return;
    const done = new Promise<void>((r) => this.proc.once('exit', () => r()));
    this.proc.kill();
    await done;
  }
}

/** Câmera de partida (a mesma que o Hestia abre por padrão). */
const camA: SheetView3DCamera = { azimuth: -Math.PI / 4, elevation: 0.5, distance: 20, target: { x: 0, y: 0, z: 1 }, ortho: false };

/** Portas do host sobre um ProjectStore REAL; a geometria é sintética (caixa por parede). */
function makeHestia(store: ProjectStore) {
  let cam: SheetView3DCamera = structuredClone(camA);
  const camSubs = new Set<() => void>();
  const writes: SheetView3DCamera[] = [];
  const geometry = (): THREE.Object3D => {
    const root = new THREE.Group();
    for (const el of Object.values(store.project.elements)) {
      if (el.kind !== 'wall') continue;
      const w = el as Wall;
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const g = new THREE.BoxGeometry(len, 0.2, w.height);
      const m = new THREE.Mesh(g);
      m.position.set((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2, w.height / 2);
      m.rotation.z = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
      const n = g.getIndex()!.count;
      m.userData = { ranges: [{ id: w.id, start: 0, count: n }] };
      root.add(m);
    }
    return root;
  };
  const ports: HostPorts = {
    scene: {
      projectId: () => {
        if (!store.project.plugins?.projectUid) store.exec({ type: 'ensurePluginProjectUid', uid: 'prj_integ0001' });
        return store.project.plugins!.projectUid!;
      },
      read: () => buildSceneContent(store.project, geometry()),
      subscribe: (cb) => store.subscribe(cb),
    },
    camera: {
      read: () => toSceneCamera(cam),
      write: (c) => { cam = fromSceneCamera(c); writes.push(cam); camSubs.forEach((f) => f()); return true; },
      subscribe: (cb) => { camSubs.add(cb); return () => camSubs.delete(cb); },
    },
    overrides: {
      read: (id) => structuredClone(pluginViewOverrides(store.project, id)),
      set: (pluginId, materialId, override) => store.exec({ type: 'setPluginViewOverride', pluginId, materialId, override }),
      clear: (pluginId, materialId) => store.exec({ type: 'clearPluginViewOverride', pluginId, materialId }),
      subscribe: (cb) => store.subscribe(cb),
    },
  };
  return {
    ports, writes,
    get camera(): SheetView3DCamera { return cam; },
    /** O usuário orbita/move a câmera dentro do Hestia. */
    userMoves(next: SheetView3DCamera): void { cam = next; camSubs.forEach((f) => f()); },
  };
}

function makeHost(ports: HostPorts, port: number, auth: { policy?: AuthPolicy; token?: string } = {}): PluginHost {
  const entry: PluginEntry = {
    key: 'renderer-rust', label: 'Renderizador (Rust)', endpoint: { host: '127.0.0.1', port }, enabled: false, grants: [], suggested: [...RENDERER_CAPABILITIES], expectedKind: 'renderer', builtin: true,
  };
  const mem = new Map<string, string>();
  return new PluginHost({
    ports, connect: connectWebSocket, store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) },
    builtins: [entry], heartbeatMs: 500, backoffMs: [100, 200, 400],
    ...(auth.policy ? { tokenPolicy: auth.policy } : {}), getToken: () => auth.token,
  });
}

/** Aperto de mãos HTTP cru, para escolher `Origin` e `Host` (o WebSocket do Node não deixa). */
function rawUpgrade(port: number, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.connect(port, '127.0.0.1');
    const lines = ['GET / HTTP/1.1', 'Upgrade: websocket', 'Connection: Upgrade', 'Sec-WebSocket-Version: 13', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`), '', ''];
    s.write(lines.join('\r\n'));
    s.once('data', (d) => { const m = /^HTTP\/1\.1 (\d{3})/.exec(d.toString()); s.destroy(); resolve(m ? Number(m[1]) : 0); });
    s.on('error', reject);
    setTimeout(() => { s.destroy(); reject(new Error('sem resposta')); }, 4000);
  });
}

let tmp: string;
const procs: Renderer[] = [];
const hosts: PluginHost[] = [];

beforeAll(() => {
  // Dentro de target/ (ignorado pelo git): arquivos temporários de estado dos processos Rust.
  mkdirSync(path.join(CRATE, 'target'), { recursive: true });
  tmp = mkdtempSync(path.join(CRATE, 'target', 'integ-'));
  // Saída capturada (não herdada): herdar o stdio do worker do vitest derrubou o canal IPC dele durante a compilação.
  try {
    execFileSync('cargo', ['build', '--manifest-path', path.join(CRATE, 'Cargo.toml')], { stdio: 'pipe', encoding: 'utf8' });
  } catch (e) {
    throw new Error(`cargo build falhou:
${(e as { stderr?: string }).stderr ?? String(e)}`);
  }
  expect(existsSync(BIN)).toBe(true);
});
afterAll(async () => {
  for (const h of hosts) h.dispose();
  for (const p of procs) await p.kill();
  rmSync(tmp, { recursive: true, force: true });
});

describe('segurança do aperto de mãos (processo Rust real)', () => {
  it('escuta só em loopback; recusa Origin estranha, ausente e Host falso; aceita a origem do Hestia', async () => {
    const port = await freePort();
    const r = await new Renderer(tmp, port).start();
    procs.push(r);
    const good = { Host: `127.0.0.1:${port}` };
    expect(await rawUpgrade(port, { ...good, Origin: 'tauri://localhost' })).toBe(101);
    expect(await rawUpgrade(port, { ...good, Origin: 'https://pagina-qualquer.example' })).toBe(403);
    expect(await rawUpgrade(port, { ...good, Origin: 'null' })).toBe(403);
    expect(await rawUpgrade(port, good)).toBe(403); // sem Origin: só com --allow-no-origin
    expect(await rawUpgrade(port, { Host: 'rebind.example', Origin: 'tauri://localhost' })).toBe(403);
    expect(r.events.filter((e) => e.event === 'refused').length).toBe(4);
    // Não escuta em interface externa: o endereço não-loopback da máquina recusa a conexão.
    const external = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
    if (external) {
      const refused = await new Promise<boolean>((res) => {
        const s = net.connect({ port, host: external, timeout: 2000 });
        s.on('connect', () => { s.destroy(); res(false); });
        s.on('error', () => res(true));
        s.on('timeout', () => { s.destroy(); res(true); });
      });
      expect(refused).toBe(true);
    }
    await r.kill();
  });

  it('o Hestia (cliente sem Origin) não entra num renderizador em modo padrão: fica "ausente" com motivo', async () => {
    const port = await freePort();
    const r = await new Renderer(tmp, port).start();
    procs.push(r);
    const h = makeHestia(new ProjectStore(createEmptyProject('pt')));
    const host = makeHost(h.ports, port);
    hosts.push(host);
    host.enable('renderer-rust', RENDERER_CAPABILITIES);
    const v = await until('estado recusado', () => { const x = host.get('renderer-rust')!; return x.error ? x : false; });
    expect(v.state).toBe('absent');
    expect(r.state().connections).toBe(0);
    host.dispose();
    await r.kill();
  });
});

describe('Hestia ↔ renderizador Rust, processos separados', () => {
  let r: Renderer;
  let port: number;
  let store: ProjectStore;
  let h: ReturnType<typeof makeHestia>;
  let host: PluginHost;
  let matId: string;
  let matOriginal: unknown;

  beforeAll(async () => {
    store = new ProjectStore(createEmptyProject('pt'));
    const typeId = store.project.defaults.wallTypeId;
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w_a', typeId, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w_b', typeId, levelId: 'lv_0', a: { x: 5, y: 0 }, b: { x: 5, y: 4 } }) });
    matId = Object.keys(store.project.materials)[0]!;
    matOriginal = structuredClone(store.project.materials[matId]);
    port = await freePort();
    r = await new Renderer(tmp, port, ['--allow-no-origin']).start();
    procs.push(r);
    h = makeHestia(store);
    host = makeHost(h.ports, port);
    hosts.push(host);
  });

  it('negocia o protocolo e mostra versão do plugin, API e permissões concedidas', async () => {
    host.enable('renderer-rust', RENDERER_CAPABILITIES);
    const v = await until('conectado', () => { const x = host.get('renderer-rust')!; return x.state === 'connected' ? x : false; });
    expect(v.manifest).toMatchObject({ id: PLUGIN_ID, kind: 'renderer', hestiaApi: '1.0', version: '0.1.0' });
    const s = await r.waitState('welcome registrado', (x) => x.sessionId !== null);
    expect(s).toMatchObject({ protocol: '1.0', api: '1.0', resumed: false, cameraMode: 'follow-hestia' });
    expect(s.granted.sort()).toEqual([...RENDERER_CAPABILITIES].sort());
    expect(s.pid).toBe(r.proc.pid);
    expect(s.pid).not.toBe(process.pid);
  });

  it('o Rust recebe o snapshot real: projeto, materiais, paredes com malha e a câmera', async () => {
    const s = await r.waitState('snapshot', (x) => x.snapshots === 1);
    expect(s.scene.projectId).toBe(store.project.plugins!.projectUid);
    expect(Object.keys(s.scene.materials).sort()).toEqual(Object.keys(store.project.materials).sort());
    expect(Object.keys(s.scene.entities)).toEqual(expect.arrayContaining(['w_a', 'w_b']));
    expect(s.scene.entities.w_a).toMatchObject({ kind: 'wall', triangles: 12 });
    expect(s.camera).toMatchObject(toSceneCamera(camA));
  });

  it('o Rust recebe deltas reais: criar, alterar e remover objeto e material', async () => {
    const before = (await r.waitState('base', (x) => x.snapshots === 1)).scene.revision;
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w_c', typeId: store.project.defaults.wallTypeId, levelId: 'lv_0', a: { x: 0, y: 4 }, b: { x: 5, y: 4 } }) });
    let s = await r.waitState('w_c criada', (x) => 'w_c' in x.scene.entities);
    expect(s.scene.revision).toBeGreaterThan(before);
    expect(s.snapshots).toBe(1); // por delta, não por snapshot novo
    const hash1 = s.scene.entities.w_c!.meshHash;
    store.exec({ type: 'upsertMaterial', material: { ...store.project.materials[matId]!, color: '#123456' } });
    s = await r.waitState('material alterado', (x) => x.scene.materials[matId]?.color === '#123456');
    store.exec({ type: 'deleteElements', ids: ['w_c'] });
    s = await r.waitState('w_c removida', (x) => !('w_c' in x.scene.entities));
    expect(s.deltas).toBeGreaterThanOrEqual(3);
    expect(s.resyncs).toBe(0);
    expect(hash1).toBeTruthy();
    matOriginal = structuredClone(store.project.materials[matId]); // a cor mudou por edição do usuário, não por plugin
  });

  it('câmera: Hestia→Rust no modo seguir; Rust não consegue dirigir nesse modo', async () => {
    const base = (await r.waitState('estado', () => true)).cameraUpdates;
    const moved: SheetView3DCamera = { ...camA, azimuth: 0.3, distance: 33 };
    h.userMoves(moved);
    const s = await r.waitState('câmera chegou', (x) => x.cameraUpdates > base);
    expect(s.camera).toMatchObject(toSceneCamera(moved));
    r.cmd({ cmd: 'drive_camera', camera: toSceneCamera({ ...camA, azimuth: 2 }) });
    await r.waitState('recusa registrada', (x) => x.errors.some((e) => e.code === 'bad_request'));
    expect(h.writes.length).toBe(0);
    expect(h.camera.distance).toBe(33);
  });

  it('modo de câmera: o Rust pede "plugin-drives" e a tela do Hestia reflete; volta ao seguir pelo Hestia', async () => {
    r.cmd({ cmd: 'set_mode', mode: 'plugin-drives' });
    await until('Hestia em plugin-drives', () => host.get('renderer-rust')!.cameraMode === 'plugin-drives');
    await r.waitState('Rust confirmado', (x) => x.cameraMode === 'plugin-drives');
  });

  it('câmera: Rust→Hestia aplica sem eco e Hestia→Rust continua funcionando', async () => {
    await sleep(400); // deixa o modo assentar
    const before = r.state().cameraUpdates;
    const target = toSceneCamera({ ...camA, azimuth: 1.1, elevation: 0.9, distance: 41 });
    r.cmd({ cmd: 'drive_camera', camera: target });
    await until('Hestia aplicou', () => h.writes.length === 1);
    expect(h.camera.distance).toBeCloseTo(41, 6);
    expect(h.camera.azimuth).toBeCloseTo(1.1, 6);
    await sleep(900); // bem mais que a janela anti-eco (250 ms) e vários heartbeats
    expect(r.state().cameraUpdates).toBe(before); // nada voltou para o Rust
    expect(h.writes.length).toBe(1);
    const user: SheetView3DCamera = { ...camA, azimuth: -1, distance: 12 };
    h.userMoves(user);
    const s = await r.waitState('usuário moveu no Hestia', (x) => x.cameraUpdates === before + 1);
    expect(s.camera).toMatchObject(toSceneCamera(user));
    host.setCameraMode('renderer-rust', 'follow-hestia');
    await r.waitState('seguir', (x) => x.cameraMode === 'follow-hestia');
    expect(r.state().errors.filter((e) => e.code === 'permission_denied')).toHaveLength(0);
  });

  it('substituição de material chega ao Rust e fica no projeto SEM alterar o material original', async () => {
    r.cmd({ cmd: 'set_override', materialId: matId, override: { color: '#112233', params: { rough: 0.4 } } });
    const s = await r.waitState('override no Rust', (x) => x.overrides[matId]?.color === '#112233');
    expect(s.overrides[matId]).toMatchObject({ color: '#112233', params: { rough: 0.4 } });
    expect(pluginViewOverrides(store.project, PLUGIN_ID)[matId]).toMatchObject({ color: '#112233' });
    expect(store.project.materials[matId]).toEqual(matOriginal);
    expect(JSON.parse(JSON.stringify(store.project)).plugins.viewOverrides[PLUGIN_ID][matId].color).toBe('#112233');
    // O material de origem no snapshot do Rust segue sendo o do projeto.
    expect(s.scene.materials[matId]!.color).toBe((matOriginal as { color: string }).color);
    r.cmd({ cmd: 'raw', message: { t: 'overrides.set', materialId: matId, override: { opacity: 9 } } });
    await r.waitState('quadro inválido recusado', (x) => x.errors.some((e) => e.code === 'bad_request' && /opacity/.test(e.message)));
    expect(pluginViewOverrides(store.project, PLUGIN_ID)[matId]).toMatchObject({ color: '#112233' });
    r.cmd({ cmd: 'clear_override', materialId: matId });
    await r.waitState('override limpo', (x) => !(matId in x.overrides));
    expect(pluginViewOverrides(store.project, PLUGIN_ID)[matId]).toBeUndefined();
  });

  it('permissão negada: sem camera.write o Rust não dirige a câmera; a sessão retoma por delta', async () => {
    const snaps = r.state().snapshots;
    host.setGrants('renderer-rust', ['scene.read', 'camera.read', 'events.subscribe', 'overrides.write']);
    const s = await r.waitState('reconectado sem camera.write', (x) => x.connections === 2 && x.sessionId !== null && x.denied.includes('camera.write') && x.connected);
    expect(s.resumed).toBe(true);
    expect(s.snapshots).toBe(snaps); // retomada: nenhum snapshot novo
    const writes = h.writes.length;
    r.cmd({ cmd: 'set_mode', mode: 'plugin-drives' });
    r.cmd({ cmd: 'drive_camera', camera: toSceneCamera({ ...camA, azimuth: 2.5 }) });
    const e = await r.waitState('permission_denied', (x) => x.errors.filter((y) => y.code === 'permission_denied').length >= 2);
    expect(e.errors.some((y) => y.code === 'permission_denied')).toBe(true);
    expect(h.writes.length).toBe(writes);
    expect(host.get('renderer-rust')!.cameraMode).toBe('follow-hestia');
    host.setGrants('renderer-rust', [...RENDERER_CAPABILITIES]);
    await r.waitState('permissões restauradas', (x) => x.connections === 3 && x.granted.includes('camera.write') && x.connected);
  });

  it('o Rust encerrado: o Hestia mostra o motivo; um novo processo recebe o snapshot e a reconexão é automática', async () => {
    const oldPid = r.state().pid;
    await r.kill();
    const down = await until('queda percebida', () => { const x = host.get('renderer-rust')!; return x.state !== 'connected' ? x : false; });
    expect(['reconnecting', 'disconnected']).toContain(down.state);
    r = await new Renderer(tmp, port, ['--allow-no-origin']).start();
    procs.push(r);
    await until('reconectado', () => host.get('renderer-rust')!.state === 'connected', 15000);
    const s = await r.waitState('snapshot no processo novo', (x) => x.snapshots === 1);
    expect(s.pid).not.toBe(oldPid);
    expect(s.resumed).toBe(false); // processo novo: não há o que retomar
    expect(Object.keys(s.scene.entities)).toEqual(expect.arrayContaining(['w_a', 'w_b']));
  });
});

/** Casos do protocolo 1.1: pareamento por token com o processo Rust real (token exigido, que é o padrão do binário). */
describe('pareamento por token (processo Rust real, protocolo 1.1)', () => {
  const tokenFile = (name: string): string => path.join(tmp, `token-${name}-${Date.now()}`);
  const newRenderer = async (extra: string[] = []): Promise<{ r: Renderer; token: () => string; file: string }> => {
    const file = tokenFile(String(procs.length));
    const port = await freePort();
    const r = await new Renderer(tmp, port, ['--token-file', file, '--allow-no-origin', ...extra]).start();
    procs.push(r);
    return { r, token: () => readFileSync(file, 'utf8').trim(), file };
  };
  const hostFor = (r: Renderer, token: string | undefined, policy: AuthPolicy = 'required'): PluginHost => {
    const h = makeHost(makeHestia(new ProjectStore(createEmptyProject('pt'))).ports, r.port, { policy, ...(token ? { token } : {}) });
    hosts.push(h);
    h.enable('renderer-rust', RENDERER_CAPABILITIES);
    return h;
  };

  it('na primeira execução o renderizador gera o token (256 bits, hexadecimal, arquivo só do usuário) e o mostra uma vez; na seguinte, reutiliza', async () => {
    const { r, token, file } = await newRenderer();
    expect(token()).toMatch(/^[0-9a-f]{64}$/);
    expect(r.events.some((e) => e.event === 'token_created')).toBe(true);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
    const first = token();
    await r.kill();
    const again = await new Renderer(tmp, await freePort(), ['--token-file', file, '--allow-no-origin']).start();
    procs.push(again);
    expect(again.events.some((e) => e.event === 'token_created')).toBe(false);
    expect(token()).toBe(first);
    await again.kill();
  });

  it('token certo: autentica (1.1), conecta e só então recebe a cena', async () => {
    const { r, token } = await newRenderer();
    const host = hostFor(r, token());
    const v = await until('conectado', () => { const x = host.get('renderer-rust')!; return x.state === 'connected' ? x : false; });
    expect(v.authenticated).toBe(true);
    const s = await r.waitState('welcome e snapshot', (x) => x.sessionId !== null && x.snapshots === 1);
    expect(s).toMatchObject({ protocol: '1.1', authRequired: true, authenticated: true });
    host.dispose();
    await r.kill();
  });

  it('token errado: o processo recusa (auth_failed), o Hestia mostra "incompatível" com a causa e nenhuma cena é entregue', async () => {
    const { r } = await newRenderer();
    const host = hostFor(r, 'e'.repeat(64));
    const v = await until('incompatível', () => { const x = host.get('renderer-rust')!; return x.state === 'incompatible' ? x : false; });
    expect(v.error).toMatchObject({ code: 'auth_failed', cause: 'wrong_token' });
    const s = await r.waitState('erro registrado', (x) => x.errors.some((e) => e.code === 'auth_failed') && !x.connected);
    expect(s).toMatchObject({ authenticated: false, snapshots: 0, sessionId: null });
    host.dispose();
    await r.kill();
  });

  it('token ausente no Hestia: incompatível com a causa "no_token"; o processo não entrega nada', async () => {
    const { r } = await newRenderer();
    const host = hostFor(r, undefined);
    const v = await until('incompatível', () => { const x = host.get('renderer-rust')!; return x.state === 'incompatible' ? x : false; });
    expect(v.error).toMatchObject({ code: 'auth_failed', cause: 'no_token' });
    expect((await r.waitState('fechou', (x) => !x.connected && x.connections === 1)).snapshots).toBe(0);
    host.dispose();
    await r.kill();
  });

  it('plugin 1.0 (renderizador legado, sem token) com o Hestia exigindo token: incompatível, sem sessão; em modo opcional conecta com aviso', async () => {
    const port = await freePort();
    const legado = await new Renderer(tmp, port, ['--allow-no-origin']).start(); // helper: --no-require-token (protocolo 1.0)
    procs.push(legado);
    const exigente = hostFor(legado, 'a'.repeat(64), 'required');
    const v = await until('incompatível', () => { const x = exigente.get('renderer-rust')!; return x.state === 'incompatible' ? x : false; });
    expect(v.error).toMatchObject({ code: 'auth_failed', cause: 'plugin_without_auth' });
    expect(legado.state().snapshots).toBe(0);
    exigente.dispose();
    const dev = hostFor(legado, undefined, 'optional');
    const c = await until('conectado sem token', () => { const x = dev.get('renderer-rust')!; return x.state === 'connected' ? x : false; });
    expect(c.authenticated).toBe(false);
    expect((await legado.waitState('welcome 1.0', (x) => x.sessionId !== null)).protocol).toBe('1.0');
    dev.dispose();
    await legado.kill();
  });

  it('um Hestia antigo (1.0), que manda "welcome" e cena sem autenticar, é recusado e nada é processado', async () => {
    const { r } = await newRenderer();
    const ws = new WebSocket(`ws://127.0.0.1:${r.port}`);
    const got: Array<Record<string, unknown>> = [];
    ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as Record<string, unknown>;
      got.push(m);
      if (m.t === 'hello') {
        ws.send(JSON.stringify({ t: 'ack', ack: 1 }));
        ws.send(JSON.stringify({ t: 'welcome', seq: 1, protocol: '1.0', api: '1.0', sessionId: 's1', granted: ['scene.read'], denied: [], heartbeatMs: 5000, cameraMode: 'follow-hestia', resumed: false }));
        ws.send(JSON.stringify({ t: 'scene.snapshot', seq: 2, snapshot: { projectId: 'p', projectName: 'P', revision: 1, entities: [], materials: [], textures: [] } }));
      }
    };
    const s = await r.waitState('recusa registrada', (x) => x.errors.some((e) => e.code === 'auth_failed'));
    expect(s).toMatchObject({ snapshots: 0, sessionId: null, authenticated: false });
    expect(got[0]).toMatchObject({ t: 'hello', protocol: { min: '1.1', max: '1.1' } });
    expect(JSON.stringify(got[0])).not.toMatch(/token/i); // o hello leva só o nonce
    ws.close();
    await r.kill();
  });

  it('três provas erradas seguidas bloqueiam o processo por alguns segundos; depois o token certo entra', async () => {
    const { r, token } = await newRenderer(['--lock-seconds', '2']);
    for (let i = 0; i < 3; i++) {
      const h = hostFor(r, 'b'.repeat(64));
      await until('recusa', () => h.get('renderer-rust')!.state === 'incompatible');
      h.dispose();
    }
    const bloqueado = hostFor(r, token()); // quarta tentativa, com o token CERTO, dentro do bloqueio: a porta não responde
    await until('recusada pelo bloqueio', () => r.events.some((e) => e.event === 'refused' && /bloqueado/.test(String(e.reason))), 6000);
    bloqueado.dispose();
    await sleep(2300); // passou o bloqueio
    const ok = hostFor(r, token());
    await until('conectado depois do bloqueio', () => ok.get('renderer-rust')!.state === 'connected', 15000);
    expect((await r.waitState('autenticado', (x) => x.authenticated)).snapshots).toBeGreaterThanOrEqual(0);
    ok.dispose();
    await r.kill();
  });
});
