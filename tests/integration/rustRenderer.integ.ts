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
import { execFileSync, spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, pluginViewOverrides, type SheetView3DCamera, type Wall } from '@hestia/model';
import { PluginHost, RENDERER_CAPABILITIES, authProof, randomNonce, type HostPorts, type PluginEntry } from '@hestia/plugin-api';
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
  errors: Array<{ code: string; message: string }>;
  authenticated: boolean; insecure: boolean; authFailures: number;
  snapshotParts: number; chunkedSnapshots: number; largestFrame: number;
  scene: { projectId: string; revision: number; entities: Record<string, { kind: string; triangles: number; vertices: number; meshHash: string }>; materials: Record<string, { color: string }> };
}

class Renderer {
  proc!: ChildProcessWithoutNullStreams;
  readonly stateFile: string;
  readonly events: Array<Record<string, unknown>> = [];
  /** Saída bruta do processo (stdout + stderr): o teste confere que o token nunca aparece nela. */
  output = '';
  /** O processo já saiu (evento `exit` visto): `kill()` repetido não espera de novo. */
  private exited = false;
  constructor(readonly dir: string, readonly port: number, readonly extra: string[] = []) {
    this.stateFile = path.join(dir, `state-${port}-${Date.now()}.json`);
  }
  async start(): Promise<this> {
    this.proc = spawn(BIN, ['--port', String(this.port), '--state-file', this.stateFile, '--control-stdin', ...this.extra], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.once('exit', () => { this.exited = true; });
    let buf = '';
    this.proc.stdout.on('data', (d: Buffer) => {
      this.output += d.toString();
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { try { this.events.push(JSON.parse(buf.slice(0, i))); } catch { /* linha parcial */ } buf = buf.slice(i + 1); }
    });
    this.proc.stderr.on('data', (d: Buffer) => { this.output += d.toString(); });
    await until('renderizador escutando', () => this.events.find((e) => e.event === 'listening'));
    return this;
  }
  cmd(c: Record<string, unknown>): void { this.proc.stdin.write(`${JSON.stringify(c)}\n`); }
  state(): RState { return JSON.parse(readFileSync(this.stateFile, 'utf8')) as RState; }
  async waitState(what: string, pred: (s: RState) => boolean, ms = 8000): Promise<RState> {
    return until(what, () => { const s = this.state(); return pred(s) ? s : false; }, ms);
  }
  async kill(): Promise<void> {
    if (this.exited || this.proc.exitCode !== null || this.proc.signalCode !== null) return;
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

function makeHost(ports: HostPorts, port: number, opt: { token?: string; insecure?: boolean } = {}): PluginHost {
  const entry: PluginEntry = {
    key: 'renderer-rust', label: 'Renderizador (Rust)', endpoint: { host: '127.0.0.1', port }, enabled: false, grants: [], suggested: [...RENDERER_CAPABILITIES], expectedKind: 'renderer', builtin: true,
  };
  const mem = new Map<string, string>();
  const host = new PluginHost({
    ports, connect: connectWebSocket, store: { get: (k) => mem.get(k) ?? null, set: (k, v) => void mem.set(k, v) },
    builtins: [entry], heartbeatMs: 500, backoffMs: [100, 200, 400],
    // Autenticação obrigatória por padrão; o modo inseguro só entra quando o teste o pede explicitamente.
    insecureAllowUnauthenticated: opt.insecure === true,
  });
  if (opt.token) host.setToken('renderer-rust', opt.token);
  return host;
}

/** Cria o arquivo de token PELO PRÓPRIO binário (`--init-token`) e lê o valor. */
function makeToken(dir: string, name: string): { file: string; token: string } {
  const file = path.join(dir, name);
  const r = spawnSync(BIN, ['--init-token', file], { encoding: 'utf8' });
  expect(r.status).toBe(0);
  const token = readFileSync(file, 'utf8').trim();
  expect(r.stdout + r.stderr).not.toContain(token); // sem --show-token, o token não aparece na saída
  return { file, token };
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
    const r = await new Renderer(tmp, port, ['--insecure-no-auth']).start();
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

  it('sem --token-file e sem --insecure-no-auth o processo Rust nem inicia', () => {
    const r = spawnSync(BIN, ['--port', '0'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/autenticação obrigatória/);
  });

  it('--init-token cria o arquivo, não sobrescreve e só mostra o token com --show-token', () => {
    const { file, token } = makeToken(tmp, 'tok-init.txt');
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const again = spawnSync(BIN, ['--init-token', file], { encoding: 'utf8' });
    expect(again.status).toBe(1);
    expect(readFileSync(file, 'utf8').trim()).toBe(token);
    const shown = spawnSync(BIN, ['--init-token', path.join(tmp, 'tok-show.txt'), '--show-token'], { encoding: 'utf8' });
    expect(shown.stdout).toMatch(/[0-9a-f]{64}/);
  });

  it('modo autenticado aceita cliente sem Origin (não é navegador) mas ainda exige o token; Origin estranha segue recusada', async () => {
    const { file } = makeToken(tmp, 'tok-sec.txt');
    const port = await freePort();
    const r = await new Renderer(tmp, port, ['--token-file', file]).start();
    procs.push(r);
    expect(r.events.find((e) => e.event === 'listening')).toMatchObject({ auth: true });
    expect(await rawUpgrade(port, { Host: `127.0.0.1:${port}` })).toBe(101);
    expect(await rawUpgrade(port, { Host: `127.0.0.1:${port}`, Origin: 'https://pagina-qualquer.example' })).toBe(403);
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
  let mainToken = '';
  let mainTokenFile = '';

  beforeAll(async () => {
    store = new ProjectStore(createEmptyProject('pt'));
    const typeId = store.project.defaults.wallTypeId;
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w_a', typeId, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w_b', typeId, levelId: 'lv_0', a: { x: 5, y: 0 }, b: { x: 5, y: 4 } }) });
    matId = Object.keys(store.project.materials)[0]!;
    matOriginal = structuredClone(store.project.materials[matId]);
    port = await freePort();
    const tk = makeToken(tmp, 'tok-main.txt');
    mainToken = tk.token;
    mainTokenFile = tk.file;
    r = await new Renderer(tmp, port, ['--token-file', tk.file]).start();
    procs.push(r);
    h = makeHestia(store);
    host = makeHost(h.ports, port, { token: tk.token });
    hosts.push(host);
  });

  it('negocia o protocolo e mostra versão do plugin, API e permissões concedidas', async () => {
    host.enable('renderer-rust', RENDERER_CAPABILITIES);
    const v = await until('conectado', () => { const x = host.get('renderer-rust')!; return x.state === 'connected' ? x : false; });
    expect(v.manifest).toMatchObject({ id: PLUGIN_ID, kind: 'renderer', hestiaApi: '1.0', version: '0.1.0' });
    const s = await r.waitState('welcome registrado', (x) => x.sessionId !== null);
    expect(s).toMatchObject({ protocol: '1.2', api: '1.0', resumed: false, cameraMode: 'follow-hestia', authenticated: true, insecure: false, authFailures: 0 });
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
    r = await new Renderer(tmp, port, ['--token-file', mainTokenFile]).start();
    procs.push(r);
    await until('reconectado', () => host.get('renderer-rust')!.state === 'connected', 15000);
    const s = await r.waitState('snapshot no processo novo', (x) => x.snapshots === 1);
    expect(s.pid).not.toBe(oldPid);
    expect(s.resumed).toBe(false); // processo novo: não há o que retomar
    expect(s.authenticated).toBe(true); // o pareamento se repete com nonces novos na reconexão
    expect(r.output).not.toContain(mainToken);
    expect(Object.keys(s.scene.entities)).toEqual(expect.arrayContaining(['w_a', 'w_b']));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Pareamento autenticado (protocolo 1.1) entre processos separados.
// ---------------------------------------------------------------------------------------------------------------

// Mensagens do protocolo lidas do fio: formato livre por tipo, validado pelas asserções.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Msg = Record<string, any>;

/** Cliente WebSocket CRU (um "host" escrito à mão): permite repetir, omitir e adulterar mensagens. */
class RawHost {
  ws: WebSocket;
  readonly got: Array<Msg> = [];
  closed = false;
  private seq = 1;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as Msg;
      this.got.push(m);
      if (typeof m.seq === 'number') this.rawSend({ t: 'ack', ack: m.seq }); // confirma como um peer correto
    };
    this.ws.onclose = () => { this.closed = true; };
  }
  open(): Promise<void> {
    return new Promise((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = () => rej(new Error('sem conexão')); });
  }
  rawSend(m: Record<string, unknown>): string {
    const f = JSON.stringify(m);
    this.ws.send(f);
    return f;
  }
  /** Envia uma mensagem numerada (com seq próprio) e devolve o quadro enviado. */
  send(m: Record<string, unknown>): string { return this.rawSend({ ...m, seq: this.seq++ }); }
  hello = (): Promise<Msg> => until('hello do plugin', () => this.got.find((m) => m.t === 'hello'));
  find = (t: string): Promise<Msg> => until(`mensagem ${t}`, () => this.got.find((m) => m.t === t));
  waitClosed = (): Promise<boolean> => until('conexão fechada', () => this.closed);
  /** Quadro `auth` correto de um host que conhece o token, para um nonce de plugin dado. */
  async authFrame(token: string, nP: string): Promise<{ frame: Record<string, unknown>; nH: string }> {
    const nH = randomNonce();
    return { frame: { t: 'auth', nonce: nH, proof: await authProof(token, 'host', nP, nH) }, nH };
  }
  close(): void { try { this.ws.close(); } catch { /* já fechado */ } }
}

/** Proxy TCP que registra os bytes nos dois sentidos (para provar que o token não trafega). */
function tcpProxy(targetPort: number): Promise<{ port: number; toServer: Buffer[]; toClient: Buffer[]; close(): void }> {
  const toServer: Buffer[] = [];
  const toClient: Buffer[] = [];
  const server = net.createServer((c) => {
    const up = net.connect(targetPort, '127.0.0.1');
    let first = true;
    c.on('data', (d: Buffer) => {
      // O Host do aperto de mãos aponta para o proxy; o renderizador (corretamente) só aceita o endereço dele: reescreve.
      const out = first ? Buffer.from(d.toString('latin1').replace(/^host: .*$/im, `Host: 127.0.0.1:${targetPort}`), 'latin1') : d;
      first = false;
      toServer.push(out);
      up.write(out);
    });
    up.on('data', (d: Buffer) => { toClient.push(d); c.write(d); });
    c.on('close', () => up.destroy());
    up.on('close', () => c.destroy());
    c.on('error', () => up.destroy());
    up.on('error', () => c.destroy());
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as net.AddressInfo).port, toServer, toClient, close: () => server.close() })));
}

/** Texto dos quadros WebSocket do cliente→servidor, já sem a máscara (o cliente mascara; o servidor não). */
function unmaskClientFrames(chunks: Buffer[]): string {
  const all = Buffer.concat(chunks);
  const hs = all.indexOf('\r\n\r\n');
  let i = hs >= 0 ? hs + 4 : 0;
  let out = hs >= 0 ? all.subarray(0, hs).toString('latin1') : '';
  while (i + 2 <= all.length) {
    const masked = (all[i + 1]! & 0x80) !== 0;
    let len = all[i + 1]! & 0x7f;
    let o = i + 2;
    if (len === 126) { len = all.readUInt16BE(o); o += 2; } else if (len === 127) { len = Number(all.readBigUInt64BE(o)); o += 8; }
    const key = masked ? all.subarray(o, o + 4) : null;
    if (masked) o += 4;
    if (o + len > all.length) break;
    const payload = Buffer.from(all.subarray(o, o + len));
    if (key) for (let k = 0; k < payload.length; k++) payload[k] = payload[k]! ^ key[k % 4]!;
    out += payload.toString('latin1');
    i = o + len;
  }
  return out;
}

describe('pareamento autenticado entre processos (protocolo 1.1)', () => {
  let token: string;
  let tokenFile: string;
  let wrongToken: string;

  beforeAll(() => {
    ({ token, file: tokenFile } = makeToken(tmp, 'tok-pair.txt'));
    wrongToken = makeToken(tmp, 'tok-wrong.txt').token;
    expect(wrongToken).not.toBe(token);
  });

  async function pair(rendererArgs: string[], hostOpt: { token?: string; insecure?: boolean }) {
    const port = await freePort();
    const rr = await new Renderer(tmp, port, rendererArgs).start();
    procs.push(rr);
    const h = makeHestia(new ProjectStore(createEmptyProject('pt')));
    const host = makeHost(h.ports, port, hostOpt);
    hosts.push(host);
    host.enable('renderer-rust', RENDERER_CAPABILITIES);
    return { port, rr, host, h };
  }

  it('token correto: Hestia e Rust se autenticam mutuamente, negociam 1.1 e só então a cena chega', async () => {
    const { rr, host } = await pair(['--token-file', tokenFile], { token });
    await until('conectado', () => host.get('renderer-rust')!.state === 'connected');
    const s = await rr.waitState('cena entregue', (x) => x.snapshots === 1);
    expect(s).toMatchObject({ protocol: '1.2', authenticated: true, insecure: false, authFailures: 0 });
    expect(host.get('renderer-rust')!.hasToken).toBe(true);
    expect(rr.output).not.toContain(token);
    host.dispose();
    await rr.kill();
  });

  it('token incorreto no Hestia: o Rust recusa, o Hestia mostra o motivo e NENHUMA cena sai', async () => {
    const { rr, host } = await pair(['--token-file', tokenFile], { token: wrongToken });
    const v = await until('recusado', () => { const x = host.get('renderer-rust')!; return x.state === 'incompatible' ? x : false; });
    expect(v.error?.code).toBe('auth_failed');
    expect(v.error?.message).toMatch(/token/i);
    const s = await rr.waitState('falha registrada', (x) => x.authFailures >= 1);
    expect(s).toMatchObject({ authenticated: false, snapshots: 0, deltas: 0 });
    expect(s.sessionId).toBeNull();
    await sleep(1500); // incompatível não reconecta sozinho
    expect(rr.state().connections).toBe(1);
    expect(rr.output + JSON.stringify(rr.state())).not.toContain(wrongToken);
    expect(rr.output + JSON.stringify(rr.state())).not.toContain(token);
    host.dispose();
    await rr.kill();
  });

  it('sem token no Hestia: auth_required, nada é enviado e o Rust registra a recusa', async () => {
    const { rr, host } = await pair(['--token-file', tokenFile], {});
    const v = await until('recusado', () => { const x = host.get('renderer-rust')!; return x.state === 'incompatible' ? x : false; });
    expect(v.error?.code).toBe('auth_required');
    expect(v.hasToken).toBe(false);
    const s = await rr.waitState('encerrado', (x) => !x.connected && x.connections === 1);
    expect(s).toMatchObject({ authenticated: false, snapshots: 0 });
    host.dispose();
    await rr.kill();
  });

  it('compatibilidade 1.0: Rust sem autenticação (modo de teste) é recusado por padrão e aceito só com o modo inseguro explícito', async () => {
    const a = await pair(['--insecure-no-auth', '--allow-no-origin'], { token });
    const v = await until('recusado', () => { const x = a.host.get('renderer-rust')!; return x.state === 'incompatible' ? x : false; });
    expect(v.error?.code).toBe('auth_required');
    expect(a.rr.state().snapshots).toBe(0);
    a.host.dispose();
    await a.rr.kill();

    const b = await pair(['--insecure-no-auth', '--allow-no-origin'], { insecure: true });
    await until('conectado em 1.0', () => b.host.get('renderer-rust')!.state === 'connected');
    const s = await b.rr.waitState('cena em 1.0', (x) => x.snapshots === 1);
    expect(s).toMatchObject({ protocol: '1.0', insecure: true, authenticated: false });
    b.host.dispose();
    await b.rr.kill();
  });

  it('host que não faz pareamento (estilo 1.0) não passa: welcome ou cena sem auth fecham a conexão', async () => {
    const port = await freePort();
    const rr = await new Renderer(tmp, port, ['--token-file', tokenFile]).start();
    procs.push(rr);
    const legacy = new RawHost(`ws://127.0.0.1:${port}`);
    await legacy.open();
    const hello = await legacy.hello();
    expect(hello.protocol).toEqual({ min: '1.1', max: '1.2' });
    expect(hello.auth.nonce).toHaveLength(24);
    legacy.send({ t: 'welcome', protocol: '1.0', api: '1.0', sessionId: 's', granted: ['scene.read'], denied: [], heartbeatMs: 5000, cameraMode: 'follow-hestia', resumed: false });
    const err = await legacy.find('error');
    expect(err.error).toMatchObject({ code: 'auth_required', fatal: true });
    await legacy.waitClosed();

    const sneaky = new RawHost(`ws://127.0.0.1:${port}`);
    await sneaky.open();
    await sneaky.hello();
    sneaky.send({ t: 'scene.snapshot', snapshot: { revision: 1, projectId: 'x', entities: [], materials: [] } });
    expect((await sneaky.find('error')).error).toMatchObject({ code: 'not_authenticated', fatal: true });
    await sneaky.waitClosed();
    const s = await rr.waitState('nada aceito', (x) => x.connections === 2 && !x.connected);
    expect(s).toMatchObject({ snapshots: 0, authenticated: false });
    expect(s.authFailures).toBeGreaterThanOrEqual(2);
    await rr.kill();
  });

  it('repetição: prova capturada não vale em outra conexão; quadro duplicado é processado uma vez', async () => {
    const port = await freePort();
    const rr = await new Renderer(tmp, port, ['--token-file', tokenFile]).start();
    procs.push(rr);

    // Conexão 1: host legítimo; captura o quadro `auth` e o `auth.ok`.
    const a = new RawHost(`ws://127.0.0.1:${port}`);
    await a.open();
    const nP1 = (await a.hello()).auth.nonce as string;
    const { frame, nH } = await a.authFrame(token, nP1);
    const sentFrame = a.send(frame);
    const ok1 = await a.find('auth.ok');
    expect(ok1.proof).toBe(await authProof(token, 'plugin', nP1, nH));
    await rr.waitState('autenticado', (x) => x.authenticated);
    a.close();
    await rr.waitState('desconectado', (x) => !x.connected);

    // Conexão 2: o atacante repete o quadro capturado. O plugin usa um nonce NOVO, então a prova não confere.
    const b = new RawHost(`ws://127.0.0.1:${port}`);
    await b.open();
    const nP2 = (await b.hello()).auth.nonce as string;
    expect(nP2).not.toBe(nP1);
    b.ws.send(sentFrame);
    expect((await b.find('error')).error).toMatchObject({ code: 'auth_failed', fatal: true });
    await b.waitClosed();
    expect(b.got.some((m) => m.t === 'auth.ok')).toBe(false);
    const afterReplay = await rr.waitState('replay recusado', (x) => x.authFailures === 1 && !x.connected);
    expect(afterReplay.authenticated).toBe(false);

    // Conexão 3: o quadro `auth` correto enviado DUAS vezes (mesmo seq): uma só autenticação, sem erro.
    const c = new RawHost(`ws://127.0.0.1:${port}`);
    await c.open();
    const nP3 = (await c.hello()).auth.nonce as string;
    const good = await c.authFrame(token, nP3);
    const dup = c.send(good.frame);
    c.ws.send(dup);
    c.ws.send(dup);
    await c.find('auth.ok');
    await sleep(400);
    expect(c.got.filter((m) => m.t === 'auth.ok')).toHaveLength(1);
    expect(c.got.some((m) => m.t === 'error')).toBe(false);
    const s = await rr.waitState('autenticou uma vez', (x) => x.authenticated && x.connected);
    // O único erro registrado no processo é a repetição recusada na conexão 2; o quadro duplicado não gerou nenhum.
    expect(s.errors.map((e) => e.code)).toEqual(['auth_failed']);
    expect(s.authFailures).toBe(1);
    c.close();
    await rr.kill();
  });

  it('três falhas seguidas atrasam a próxima tentativa', async () => {
    const port = await freePort();
    const rr = await new Renderer(tmp, port, ['--token-file', tokenFile]).start();
    procs.push(rr);
    for (let i = 0; i < 3; i++) {
      const x = new RawHost(`ws://127.0.0.1:${port}`);
      await x.open();
      const nP = (await x.hello()).auth.nonce as string;
      x.send(await x.authFrame(wrongToken, nP).then((r) => r.frame));
      await x.waitClosed();
    }
    await rr.waitState('3 falhas', (s) => s.authFailures === 3);
    const t0 = Date.now();
    const next = new RawHost(`ws://127.0.0.1:${port}`);
    await next.open();
    await next.hello();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    // Autenticar de verdade zera o contador: o seguinte volta a ser imediato.
    const nP = (await next.hello()).auth.nonce as string;
    next.send((await next.authFrame(token, nP)).frame);
    await next.find('auth.ok');
    next.close();
    await rr.waitState('desconectado', (s) => !s.connected);
    const t1 = Date.now();
    const again = new RawHost(`ws://127.0.0.1:${port}`);
    await again.open();
    await again.hello();
    expect(Date.now() - t1).toBeLessThan(900);
    again.close();
    await rr.kill();
  });

  it('o token não trafega pela conexão real (proxy TCP) nem aparece na saída, no relatório ou na visão do gerenciador', async () => {
    const port = await freePort();
    const rr = await new Renderer(tmp, port, ['--token-file', tokenFile]).start();
    procs.push(rr);
    const proxy = await tcpProxy(port);
    const h = makeHestia(new ProjectStore(createEmptyProject('pt')));
    const host = makeHost(h.ports, proxy.port, { token });
    hosts.push(host);
    host.enable('renderer-rust', RENDERER_CAPABILITIES);
    await until('conectado pelo proxy', () => host.get('renderer-rust')!.state === 'connected');
    await rr.waitState('cena entregue', (x) => x.snapshots === 1);
    h.userMoves({ ...camA, azimuth: 0.9 });
    await rr.waitState('câmera trafegou', (x) => x.cameraUpdates >= 2);

    const toClient = Buffer.concat(proxy.toClient).toString('latin1');
    const toServer = unmaskClientFrames(proxy.toServer);
    expect(toClient.length).toBeGreaterThan(500);
    // Os dois lados trocaram só provas: `auth` (Hestia→Rust, já sem máscara) e `auth.ok` (Rust→Hestia).
    expect(toServer).toContain('"t":"auth"');
    expect(toServer).toContain('"proof"');
    expect(toClient).toContain('"t":"auth.ok"');
    for (const wire of [toClient, toServer]) {
      expect(wire).not.toContain(token);
      expect(wire).not.toContain(Buffer.from(token).toString('base64'));
    }
    expect(rr.output).not.toContain(token);
    expect(JSON.stringify(rr.state())).not.toContain(token);
    expect(JSON.stringify(host.list())).not.toContain(token);
    host.dispose();
    proxy.close();
    await rr.kill();
  });
});

describe('snapshot em partes (protocolo 1.2) entre processos', () => {
  const MIB = 1024 * 1024;

  it('uma cena maior que o quadro de 64 MiB chega ao Rust em partes pequenas, completa e sem estourar o limite', async () => {
    const { file, token } = makeToken(tmp, 'tok-chunk.txt');
    // Cena sintética GRANDE (não é um projeto real): 70 entidades de ~1 MiB de JSON cada, números de precisão cheia.
    let seed = 1;
    const rnd = (): number => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * 100; };
    const entities = Array.from({ length: 70 }, (_, i) => ({
      id: `big_${i}`, kind: 'generic', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], visible: true,
      mesh: { positions: Array.from({ length: 54_000 }, rnd), indices: Array.from({ length: 6_000 }, (_, k) => k % 18_000), groups: [{ start: 0, count: 6_000, materialId: null }], hash: `h${i}` },
    }));
    const content = { projectName: 'grande', entities, materials: [{ id: 'm1', name: 'M', color: '#112233', gloss: 0.1, opacity: 1 }], textures: [] };
    const total = JSON.stringify(content).length;
    expect(total).toBeGreaterThan(64 * MIB); // um scene.snapshot único passaria do teto do protocolo
    const camera = toSceneCamera(camA);
    const ports: HostPorts = {
      scene: { projectId: () => 'prj_grande01', read: () => content, subscribe: () => () => undefined },
      camera: { read: () => camera, write: () => false, subscribe: () => () => undefined },
      overrides: { read: () => ({}), set: () => undefined, clear: () => undefined, subscribe: () => () => undefined },
    };
    const port = await freePort();
    const rr = await new Renderer(tmp, port, ['--token-file', file]).start();
    procs.push(rr);
    const host = makeHost(ports, port, { token });
    hosts.push(host);
    host.enable('renderer-rust', RENDERER_CAPABILITIES);
    await until('conectado', () => host.get('renderer-rust')!.state === 'connected', 20000);
    const s = await rr.waitState('snapshot em partes completo', (x) => x.chunkedSnapshots === 1, 60000);
    expect(s).toMatchObject({ protocol: '1.2', snapshots: 1, resyncs: 0 });
    expect(Object.keys(s.scene.entities)).toHaveLength(70);
    expect(s.scene.entities.big_69!.vertices).toBe(18_000);
    expect(s.scene.materials.m1).toBeTruthy();
    expect(s.snapshotParts).toBeGreaterThanOrEqual(8); // ~70 MiB em partes de ~8 MiB
    expect(s.largestFrame).toBeLessThan(10 * MIB);
    expect(s.largestFrame).toBeLessThan(64 * MIB);
    host.dispose();
    await rr.kill();
  }, 120_000);
});
