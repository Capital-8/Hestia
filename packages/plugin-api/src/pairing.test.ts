import { describe, expect, it } from 'vitest';
import {
  AUTH_LOCK_MS, AuthLockout, PluginHost, TestPlugin, authProof, constantTimeEqual, createMemoryPair, decode, negotiateProtocol, normalizeToken, randomNonce, verifyAuthProof,
  type AuthPolicy, type Capability, type HostPorts, type PluginEntry, type SceneContent,
} from './index.ts';

const TOKEN = 'a'.repeat(31) + 'b';
const OUTRO = 'c'.repeat(31) + 'd';
const ALL: Capability[] = ['scene.read', 'camera.read', 'events.subscribe', 'camera.write', 'overrides.write'];
const ENTRY: PluginEntry = { key: 'r', label: 'R', endpoint: { host: '127.0.0.1', port: 47800 }, enabled: false, grants: [], suggested: [], expectedKind: 'renderer', builtin: true };

const ports = (log: string[]): HostPorts => {
  const content: SceneContent = { projectName: 'P', entities: [], materials: [{ id: 'm1', name: 'M', color: '#aa5533', gloss: 0.1, opacity: 1 }], textures: [] };
  return {
    scene: { projectId: () => 'proj_1', read: () => { log.push('scene.read'); return structuredClone(content); }, subscribe: () => () => {} },
    camera: { read: () => null, write: () => { log.push('camera.write'); return true; }, subscribe: () => () => {} },
    overrides: { read: () => ({}), set: () => { log.push('overrides.set'); }, clear: () => {}, subscribe: () => () => {} },
  };
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error('tempo esgotado'); await sleep(5); }
}

function setup(o: { policy: AuthPolicy; hostToken?: string | undefined; plugin?: ConstructorParameters<typeof TestPlugin>[1] }) {
  const log: string[] = [];
  const plugins: TestPlugin[] = [];
  let token = o.hostToken;
  const host = new PluginHost({
    ports: ports(log), store: { get: () => null, set: () => {} }, builtins: [{ ...ENTRY }], heartbeatMs: 1000, backoffMs: [50],
    tokenPolicy: o.policy, getToken: () => token,
    connect: async () => {
      const [a, b] = createMemoryPair();
      const p = new TestPlugin(b, { heartbeatMs: 1000, ...o.plugin });
      plugins.push(p);
      p.hello();
      return a;
    },
  });
  return { host, log, plugins, last: () => plugins[plugins.length - 1]!, setToken: (t: string | undefined) => { token = t; } };
}

describe('provas HMAC e utilitários', () => {
  it('prova certa confere; token, rótulo, nonce ou base64 diferentes não conferem', async () => {
    const [np, nh] = [randomNonce(), randomNonce()];
    const p = await authProof(TOKEN, 'hestia-host', np, nh);
    expect(await verifyAuthProof(TOKEN, 'hestia-host', np, nh, p)).toBe(true);
    expect(await verifyAuthProof(OUTRO, 'hestia-host', np, nh, p)).toBe(false);
    expect(await verifyAuthProof(TOKEN, 'hestia-plugin', np, nh, p)).toBe(false); // a prova do host não serve como a do plugin
    expect(await verifyAuthProof(TOKEN, 'hestia-host', randomNonce(), nh, p)).toBe(false); // repetição com outro desafio
    expect(await verifyAuthProof(TOKEN, 'hestia-host', np, nh, '###')).toBe(false);
    expect(await verifyAuthProof(TOKEN, 'hestia-host', np, nh, '')).toBe(false);
  });
  it('HMAC-SHA256 padrão (RFC 4231, caso 2) e comparação em tempo constante', async () => {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('Jefe'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('what do ya want for nothing?')));
    expect([...mac].map((b) => b.toString(16).padStart(2, '0')).join('')).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2]))).toBe(false);
  });
  it('nonce tem 16 bytes e muda; token exige 32 caracteres sem espaços', () => {
    expect(atob(randomNonce()).length).toBe(16);
    expect(randomNonce()).not.toBe(randomNonce());
    expect(normalizeToken(`  ${TOKEN}\n`)).toBe(TOKEN);
    expect(normalizeToken('curto')).toBeNull();
    expect(normalizeToken(`${TOKEN} ${TOKEN}`)).toBeNull();
  });
  it('três falhas seguidas bloqueiam; o sucesso zera', () => {
    let now = 1000;
    const l = new AuthLockout(() => now);
    l.fail(); l.fail();
    expect(l.remainingMs()).toBe(0);
    l.succeed();
    l.fail(); l.fail();
    expect(l.remainingMs()).toBe(0);
    l.fail();
    expect(l.remainingMs()).toBe(AUTH_LOCK_MS);
    now += AUTH_LOCK_MS + 1;
    expect(l.remainingMs()).toBe(0);
  });
});

describe('negociação 1.1 x 1.0', () => {
  const v = (major: number, minor: number) => ({ major, minor });
  it('host 1.1 com plugin 1.0 negocia 1.0; com token obrigatório (padrão) vira incompatível com a causa', () => {
    expect(negotiateProtocol({ min: v(1, 0), max: v(1, 0) }, v(1, 1), { requireToken: false })).toEqual({ ok: true, version: v(1, 0) });
    const r = negotiateProtocol({ min: v(1, 0), max: v(1, 0) }, v(1, 1));
    expect(r).toMatchObject({ ok: false, reason: 'token_required', negotiated: v(1, 0) });
    expect(negotiateProtocol({ min: v(1, 0), max: v(1, 1) }, v(1, 1))).toEqual({ ok: true, version: v(1, 1) });
    expect(negotiateProtocol({ min: v(1, 1), max: v(1, 1) }, v(1, 0), { requireToken: false })).toMatchObject({ ok: false, reason: 'no_common_version' }); // host 1.0 recusa quem exige 1.1
    expect(negotiateProtocol({ min: v(2, 0), max: v(2, 1) })).toMatchObject({ ok: false, reason: 'no_common_version' });
  });
  it('mensagens novas malformadas são recusadas', () => {
    const bad = (m: unknown) => { const r = decode(JSON.stringify(m)); expect(r.ok).toBe(false); };
    bad({ t: 'auth', seq: 1, proof: 'curta', nonce: 'AAAAAAAAAAAAAAAAAAAAAA==' });
    bad({ t: 'auth', seq: 1, proof: 'x'.repeat(44), nonce: '' });
    bad({ t: 'auth', seq: 1, proof: 5, nonce: 'AAAAAAAAAAAAAAAAAAAAAA==' });
    bad({ t: 'auth.ok', seq: 1 });
    bad({ t: 'auth.ok', seq: 1, proof: 'não base64 !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!' });
    bad({ t: 'hello', seq: 1, protocol: { min: '1.1', max: '1.1' }, manifest: {}, auth: { nonce: 'x' } });
    bad({ t: 'hello', seq: 1, protocol: { min: '1.1', max: '1.1' }, manifest: {}, auth: 'x' });
    expect(decode(JSON.stringify({ t: 'auth', seq: 1, proof: 'A'.repeat(43) + '=', nonce: 'AAAAAAAAAAAAAAAAAAAAAA==' })).ok).toBe(true);
  });
});

describe('pareamento por token (HostSession + PluginHost)', () => {
  it('token certo (obrigatório): autentica, conecta e a cena só chega depois', async () => {
    const s = setup({ policy: 'required', hostToken: TOKEN, plugin: { token: TOKEN } });
    s.host.enable('r', ALL);
    await until(() => s.host.get('r')!.state === 'connected');
    expect(s.host.get('r')!.authenticated).toBe(true);
    await until(() => s.last().snapshot !== null);
    expect(s.last().authed).toBe(true);
    expect(s.last().welcome?.protocol).toBe('1.1');
    expect(s.last().errors).toEqual([]);
    s.host.dispose();
  });

  it('token errado no host: incompatível com a causa, sem cena processada e sem reconexão automática', async () => {
    const s = setup({ policy: 'required', hostToken: OUTRO, plugin: { token: TOKEN } });
    s.host.enable('r', ALL);
    await until(() => s.host.get('r')!.state === 'incompatible');
    const v = s.host.get('r')!;
    expect(v.error).toMatchObject({ code: 'auth_failed', cause: 'wrong_token' });
    expect(s.last().snapshot).toBeNull();
    expect(s.last().welcome).toBeNull();
    expect(s.log).not.toContain('scene.read');
    await sleep(300);
    expect(s.plugins.length).toBe(1); // sem reconexão
    s.host.dispose();
  });

  it('token ausente no host (obrigatório): incompatível, causa "no_token"', async () => {
    const s = setup({ policy: 'required', hostToken: undefined, plugin: { token: TOKEN } });
    s.host.enable('r', ALL);
    await until(() => s.host.get('r')!.state === 'incompatible');
    expect(s.host.get('r')!.error).toMatchObject({ code: 'auth_failed', cause: 'no_token' });
    expect(s.last().snapshot).toBeNull();
    s.host.dispose();
  });

  it('plugin 1.0 (sem auth) com token obrigatório: incompatível com a causa; nada de cena', async () => {
    const s = setup({ policy: 'required', hostToken: TOKEN });
    s.host.enable('r', ALL);
    await until(() => s.host.get('r')!.state === 'incompatible');
    expect(s.host.get('r')!.error).toMatchObject({ code: 'auth_failed', cause: 'plugin_without_auth' });
    expect(s.last().snapshot).toBeNull();
    expect(s.log).toEqual([]);
    s.host.dispose();
  });

  it('plugin 1.0 em modo opcional (desenvolvimento): conecta SEM autenticação e a tela recebe o aviso (authenticated=false)', async () => {
    const s = setup({ policy: 'optional' });
    s.host.enable('r', ALL);
    await until(() => s.host.get('r')!.state === 'connected');
    expect(s.host.get('r')!.authenticated).toBe(false);
    expect(s.last().welcome?.protocol).toBe('1.0');
    s.host.dispose();
  });

  it('modo opcional com token dos dois lados: autentica mesmo assim', async () => {
    const s = setup({ policy: 'optional', hostToken: TOKEN, plugin: { token: TOKEN } });
    s.host.enable('r', ALL);
    await until(() => s.host.get('r')!.state === 'connected');
    expect(s.host.get('r')!.authenticated).toBe(true);
    s.host.dispose();
  });

  it('plugin que exige token e host sem token (modo opcional): o plugin fecha, nada de cena', async () => {
    const s = setup({ policy: 'optional', hostToken: undefined, plugin: { token: TOKEN } });
    s.host.enable('r', ALL);
    await until(() => s.last().closed !== null);
    expect(s.last().errors.some((e) => e.code === 'auth_failed')).toBe(true);
    expect(s.last().snapshot).toBeNull();
    s.host.dispose();
  });

  it('mensagem de cena, câmera ou substituição ANTES da autenticação é recusada e fatal', async () => {
    for (const msg of [{ t: 'scene.resync' }, { t: 'camera.mode.set', mode: 'plugin-drives' }, { t: 'overrides.set', materialId: 'm1', override: { color: '#000000' } }] as const) {
      const log: string[] = [];
      const host = new PluginHost({
        ports: ports(log), store: { get: () => null, set: () => {} }, builtins: [{ ...ENTRY }], heartbeatMs: 1000, tokenPolicy: 'required', getToken: () => TOKEN,
        connect: async () => {
          const [a, b] = createMemoryPair();
          const p = new TestPlugin(b, { heartbeatMs: 1000, token: TOKEN });
          p.hello();
          p.peer.send(msg as never); // fura a fila: sai antes de o pareamento terminar
          return a;
        },
      });
      host.enable('r', ALL);
      await until(() => host.get('r')!.state === 'incompatible');
      expect(host.get('r')!.error?.code).toBe('auth_failed');
      expect(log).toEqual([]);
      host.dispose();
    }
  });

  it('o token nunca trafega: nenhum quadro do fio contém o token', async () => {
    const frames: string[] = [];
    const host = new PluginHost({
      ports: ports([]), store: { get: () => null, set: () => {} }, builtins: [{ ...ENTRY }], heartbeatMs: 1000, tokenPolicy: 'required', getToken: () => TOKEN,
      connect: async () => {
        const [a, b] = createMemoryPair();
        const spy = (t: typeof a): typeof a => ({ send: (f) => { frames.push(f); t.send(f); }, close: (r) => t.close(r), onMessage: (cb) => t.onMessage(cb), onClose: (cb) => t.onClose(cb), get isOpen() { return t.isOpen; } });
        const p = new TestPlugin(spy(b), { heartbeatMs: 1000, token: TOKEN });
        p.hello();
        return spy(a);
      },
    });
    host.enable('r', ALL);
    await until(() => host.get('r')!.state === 'connected');
    expect(frames.some((f) => f.includes('"auth"'))).toBe(true);
    expect(frames.some((f) => f.includes(TOKEN))).toBe(false);
    host.dispose();
  });

  it('três falhas seguidas bloqueiam novas tentativas; trocar o token zera o bloqueio', async () => {
    const s = setup({ policy: 'required', hostToken: OUTRO, plugin: { token: TOKEN } });
    s.host.enable('r', ALL);
    await until(() => s.host.get('r')!.state === 'incompatible');
    for (let i = 0; i < 2; i++) {
      void s.host.connect('r');
      await until(() => s.plugins.length === i + 2);
      await until(() => s.host.get('r')!.state === 'incompatible' && s.host.get('r')!.error?.cause === 'wrong_token');
      await sleep(20);
    }
    expect(s.plugins.length).toBe(3);
    void s.host.connect('r'); // quarta tentativa: bloqueada, o plugin nem é contatado
    await until(() => s.host.get('r')!.error?.cause === 'locked');
    expect(s.plugins.length).toBe(3);
    s.setToken(TOKEN);
    s.host.tokenChanged('r');
    await until(() => s.host.get('r')!.state === 'connected');
    expect(s.host.get('r')!.authenticated).toBe(true);
    s.host.dispose();
  });
});
