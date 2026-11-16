import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRIPT_LIMITS, MAX_SCRIPT_LIMITS, resolveLimits, type ScriptLimits } from './limits.ts';
import { ScriptError, ScriptHost, type ScriptPorts, type WorkerLike } from './scriptHost.ts';
import { installWorkerRuntime, type HostToWorker } from './workerRuntime.ts';

/** Worker em memória: roda o runtime real do Worker no mesmo thread, com o código carregado por `data:`. */
function inMemoryWorker(): WorkerLike & { terminated: boolean } {
  const scope = { postMessage: (_m: unknown) => undefined, onmessage: null as ((e: { data: unknown }) => void) | null };
  const w: WorkerLike & { terminated: boolean } = {
    terminated: false,
    onmessage: null,
    onerror: null,
    postMessage: (m) => {
      if (w.terminated) return;
      setTimeout(() => scope.onmessage?.({ data: m }), 0);
    },
    terminate: () => {
      w.terminated = true;
    },
  };
  scope.postMessage = (m) => {
    if (!w.terminated) setTimeout(() => w.onmessage?.({ data: m }), 0);
  };
  installWorkerRuntime(scope, {
    loadModule: (code) => import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) as Promise<Record<string, unknown>>,
  });
  return w;
}

/** Worker que nunca responde (simula laço infinito: o runtime real não consegue ser interrompido no mesmo thread). */
function hungWorker(): WorkerLike & { terminated: boolean } {
  const w: WorkerLike & { terminated: boolean } = {
    terminated: false,
    onmessage: null,
    onerror: null,
    postMessage: (m) => {
      const msg = m as HostToWorker;
      if (msg.t === 'load') setTimeout(() => w.onmessage?.({ data: { t: 'loaded', ok: true, exports: [] } }), 0);
    },
    terminate: () => {
      w.terminated = true;
    },
  };
  return w;
}

function make(code: string, over: { grants?: string[]; ports?: ScriptPorts; limits?: Partial<ScriptLimits>; worker?: () => WorkerLike; now?: () => number } = {}) {
  const logs: string[] = [];
  const failed = vi.fn();
  const created: WorkerLike[] = [];
  const host = new ScriptHost({
    pluginId: 'dev.exemplo.t',
    code,
    limits: resolveLimits(over.limits),
    grants: over.grants ?? [],
    ports: over.ports ?? {},
    createWorker: () => {
      const w = (over.worker ?? inMemoryWorker)();
      created.push(w);
      return w;
    },
    log: (l, t) => logs.push(`${l}:${t}`),
    onFailed: failed,
    ...(over.now ? { now: over.now } : {}),
  });
  return { host, logs, failed, created };
}

describe('resolveLimits', () => {
  it('usa padrões e limita ao teto', () => {
    expect(resolveLimits()).toEqual(DEFAULT_SCRIPT_LIMITS);
    expect(resolveLimits({ timeoutMs: 999999, memoryMiB: 9999, maxCommandsPerAction: 10 ** 9 })).toEqual(MAX_SCRIPT_LIMITS);
    expect(resolveLimits({ timeoutMs: -5, memoryMiB: Number.NaN }).timeoutMs).toBe(2000);
    expect(resolveLimits({ timeoutMs: 3000 }).timeoutMs).toBe(3000);
  });
});

describe('ScriptHost', () => {
  it('chama handler com ctx e devolve o valor', async () => {
    const { host } = make('export function soma(ctx, a, b) { ctx.log.info("oi"); return a + b; }');
    expect(await host.call('soma', [2, 3])).toBe(5);
  });

  it('esconde e nega portas sem concessão; permite com concessão', async () => {
    const ports: ScriptPorts = { modelRead: () => ({ levels: [{ id: 'n1' }] }), modelApply: (_l, c) => ({ ok: true, applied: c.length }) };
    const code = `export async function ler(ctx) { return ctx.model ? (await ctx.model.read()).levels[0].id : 'sem'; }
      export async function gravar(ctx) { return await ctx.model.apply('x', [{}, {}]); }`;
    const sem = make(code, { ports });
    expect(await sem.host.call('ler')).toBe('sem');
    const com = make(code, { ports, grants: ['model.read', 'model.write'] });
    expect(await com.host.call('ler')).toBe('n1');
    expect(await com.host.call('gravar')).toEqual({ ok: true, applied: 2 });
    // Só leitura concedida: apply nem existe no ctx.
    const ro = make(code, { ports, grants: ['model.read'] });
    await expect(ro.host.call('gravar')).rejects.toMatchObject({ code: 'script_error' });
  });

  it('o host confere a permissão mesmo se o script forjar a mensagem', async () => {
    const modelRead = vi.fn(() => 1);
    const { host, created } = make('export function f() { return 1; }', { ports: { modelRead } });
    await host.call('f');
    const w = created[0]!;
    w.onmessage?.({ data: { t: 'port', id: 99, method: 'model.read', args: [] } });
    await new Promise((r) => setTimeout(r, 5));
    expect(modelRead).not.toHaveBeenCalled();
  });

  it('recusa lote acima de maxCommandsPerAction', async () => {
    const { host } = make('export async function f(ctx) { return await ctx.model.apply("x", new Array(11).fill({})); }', {
      grants: ['model.write'],
      limits: { maxCommandsPerAction: 10 },
      ports: { modelApply: () => ({ ok: true }) },
    });
    await expect(host.call('f')).rejects.toMatchObject({ code: 'script_error' });
  });

  it('exceção do script rejeita com script_error sem derrubar o host', async () => {
    const { host, logs } = make('export function ruim() { throw new Error("boom"); } export function bom() { return "ok"; }');
    await expect(host.call('ruim')).rejects.toMatchObject({ code: 'script_error', message: 'boom' });
    expect(await host.call('bom')).toBe('ok');
    expect(logs.some((l) => l.includes('boom'))).toBe(true);
  });

  it('erro de sintaxe no carregamento vira load_failed', async () => {
    const { host } = make('export function (');
    await expect(host.call('x')).rejects.toBeInstanceOf(ScriptError);
    await expect(host.call('x')).rejects.toMatchObject({ code: 'load_failed' });
  });

  it('timeout encerra o Worker, recria na próxima chamada e conta falha', async () => {
    let first = true;
    const { host, created } = make('export function f() { return 1; }', {
      limits: { timeoutMs: 30 },
      worker: () => {
        if (first) {
          first = false;
          return hungWorker();
        }
        return inMemoryWorker();
      },
    });
    const p = host.call('f');
    // O hung responde "loaded" mas nunca o resultado.
    await expect(p).rejects.toMatchObject({ code: 'timeout' });
    expect((created[0] as unknown as { terminated: boolean }).terminated).toBe(true);
    expect(await host.call('f')).toBe(1);
    expect(created).toHaveLength(2);
  });

  it('tempo atendendo a porta do host não conta no timeout', async () => {
    const slow: ScriptPorts = { modelRead: () => new Promise((r) => setTimeout(() => r('lento'), 120)) };
    const { host } = make('export async function f(ctx) { return await ctx.model.read(); }', { grants: ['model.read'], ports: slow, limits: { timeoutMs: 60 } });
    expect(await host.call('f')).toBe('lento');
  });

  it('mensagem acima da memória encerra o Worker', async () => {
    const { host, created } = make('export function grande() { return "x".repeat(2 * 1024 * 1024); }', { limits: { memoryMiB: 1 } });
    await expect(host.call('grande')).rejects.toMatchObject({ code: 'memory' });
    expect((created[0] as unknown as { terminated: boolean }).terminated).toBe(true);
  });

  it('três falhas em 60000 ms levam a failed e avisam uma vez', async () => {
    let t = 1000;
    const { host, failed } = make('export function ruim() { throw new Error("x"); }', { now: () => t });
    for (let i = 0; i < 3; i += 1) {
      await expect(host.call('ruim')).rejects.toBeInstanceOf(ScriptError);
      t += 1000;
    }
    expect(host.state).toBe('failed');
    expect(failed).toHaveBeenCalledTimes(1);
    await expect(host.call('ruim')).rejects.toMatchObject({ code: 'failed' });
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('falhas espaçadas além da janela não acumulam', async () => {
    let t = 0;
    const { host, failed } = make('export function ruim() { throw new Error("x"); }', { now: () => t });
    for (let i = 0; i < 4; i += 1) {
      await expect(host.call('ruim')).rejects.toBeInstanceOf(ScriptError);
      t += 61000;
    }
    expect(host.state).not.toBe('failed');
    expect(failed).not.toHaveBeenCalled();
  });

  it('stop encerra o Worker e recusa novas chamadas', async () => {
    const { host, created } = make('export function f() { return 1; }');
    await host.call('f');
    host.stop();
    expect((created[0] as unknown as { terminated: boolean }).terminated).toBe(true);
    await expect(host.call('f')).rejects.toMatchObject({ code: 'stopped' });
  });
});
