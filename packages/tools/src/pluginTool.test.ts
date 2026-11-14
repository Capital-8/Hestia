import { describe, expect, it } from 'vitest';
import { P, makeEnv } from './testEnv.ts';
import { PluginTool, type PluginToolBridge, type PluginToolEvent, type PluginToolReply, type PluginToolSpec } from './pluginTool.ts';

/** Ponte de teste: grava os eventos e responde com a função dada (síncrona ou assíncrona). */
function ponte(responder: (ev: PluginToolEvent) => PluginToolReply | Promise<PluginToolReply> = () => ({})) {
  const eventos: PluginToolEvent[] = [];
  const lotes: Array<{ label: string; commands: unknown[] }> = [];
  const bridge: PluginToolBridge = {
    send: async (ev) => { eventos.push(ev); return responder(ev); },
    apply: (label, commands) => { lotes.push({ label, commands }); return { ok: true, applied: commands.length }; },
  };
  return { bridge, eventos, lotes };
}

const spec = (prompts: PluginToolSpec['prompts'], redraw = () => undefined): PluginToolSpec => ({
  id: 'p:t', title: 'T', prompts, messages: { failed: 'FALHOU', nothingToPick: 'NADA' }, redraw,
});
const ponto = (key: string, label = key): PluginToolSpec['prompts'][number] => ({ key, kind: 'point', label });
const linha = (key: string): PluginToolSpec['prompts'][number] => ({ key, kind: 'line', label: key });
const polilinha = (key: string): PluginToolSpec['prompts'][number] => ({ key, kind: 'polyline', label: key });
/** Deixa a fila de eventos (promessas encadeadas) esvaziar. */
const fluxo = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

describe('PluginTool: eventos para o handler', () => {
  it('start, move, point e a conclusão; o ciclo reinicia depois de completo', async () => {
    const { env } = makeEnv();
    const { bridge, eventos } = ponte();
    const t = new PluginTool(env, { ...spec([ponto('a'), ponto('b')]), values: { n: 3 } }, bridge);
    t.start();
    t.move(P(1, 2));
    t.click(P(1, 2));
    t.click(P(4, 6));
    await fluxo();
    expect(eventos.map((e) => e.type)).toEqual(['start', 'move', 'point', 'point']);
    expect(eventos[0]).toMatchObject({ type: 'start', tool: 'p:t', values: { n: 3 }, prompts: [{ key: 'a', kind: 'point' }, { key: 'b', kind: 'point' }] });
    expect(eventos[2]).toMatchObject({ key: 'a', complete: false, point: { x: 1, y: 2 }, collected: { a: { x: 1, y: 2 } } });
    expect(eventos[3]).toMatchObject({ key: 'b', complete: true, point: { x: 4, y: 6 }, collected: { a: { x: 1, y: 2 }, b: { x: 4, y: 6 } } });
    // novo ciclo: o próximo clique volta ao primeiro passo
    t.click(P(0, 0));
    await fluxo();
    expect(eventos.at(-1)).toMatchObject({ key: 'a', complete: false, collected: { a: { x: 0, y: 0 } } });
  });

  it('linha = dois cliques: o primeiro vai incompleto e o segundo traz [a, b]', async () => {
    const { env } = makeEnv();
    const { bridge, eventos } = ponte();
    const t = new PluginTool(env, spec([linha('base')]), bridge);
    t.start();
    t.click(P(0, 0));
    t.click(P(6, 0));
    await fluxo();
    expect(eventos[1]).toMatchObject({ type: 'point', key: 'base', complete: false });
    expect(eventos[2]).toMatchObject({ type: 'point', key: 'base', complete: true, collected: { base: [{ x: 0, y: 0 }, { x: 6, y: 0 }] } });
  });

  it('polilinha: cada clique vai ao handler e o Enter encerra o passo', async () => {
    const { env } = makeEnv();
    const { bridge, eventos } = ponte();
    const t = new PluginTool(env, spec([polilinha('rota')]), bridge);
    t.start();
    t.click(P(0, 0));
    t.click(P(2, 0));
    t.click(P(2, 3));
    t.confirm();
    await fluxo();
    expect(eventos.filter((e) => e.type === 'point')).toHaveLength(4);
    expect(eventos.at(-1)).toMatchObject({ complete: true, collected: { rota: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 3 }] } });
  });

  it('teclas Enter, Tab e Espaço viram eventos `key`', async () => {
    const { env } = makeEnv();
    const { bridge, eventos } = ponte();
    const t = new PluginTool(env, spec([ponto('a')]), bridge);
    t.start();
    t.confirm();
    t.tab();
    t.space();
    await fluxo();
    expect(eventos.slice(1)).toEqual([{ type: 'key', key: 'Enter' }, { type: 'key', key: 'Tab' }, { type: 'key', key: 'Space' }]);
  });

  it('movimentos seguidos se fundem no último enquanto o handler responde', async () => {
    const { env } = makeEnv();
    let liberar: () => void = () => undefined;
    const { bridge, eventos } = ponte((ev) => (ev.type === 'start' ? new Promise<PluginToolReply>((r) => { liberar = () => r({}); }) : {}));
    const t = new PluginTool(env, spec([ponto('a')]), bridge);
    t.start();
    await fluxo(); // o `start` já está com o handler
    for (let i = 1; i <= 5; i++) t.move(P(i, 0));
    liberar();
    await fluxo();
    const moves = eventos.filter((e) => e.type === 'move');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ point: { x: 5, y: 0 } });
  });

  it('o ponto enviado ao handler é o do snap do app (grade ligada arredonda para o passo)', async () => {
    const { env, options } = makeEnv();
    options.snap = { enabled: true, grid: true, axis: false, faces: false, core: false, intersections: false, perpendicular: false, alignment: false, endpoint: false, midpoint: false, cad: false };
    const { bridge, eventos } = ponte();
    const t = new PluginTool(env, spec([ponto('a')]), bridge);
    t.start();
    t.click(P(1.03, 2.04));
    await fluxo();
    const p = eventos.find((e) => e.type === 'point') as unknown as { point: { x: number; y: number } };
    expect(p.point.x).toBeCloseTo(1, 6);
    expect(p.point.y).toBeCloseTo(2, 6);
  });
});

describe('PluginTool: rascunho, lote e cancelamento', () => {
  it('o rascunho vira prévia (linhas, pontos e rótulos) e o redesenho é pedido', async () => {
    const { env } = makeEnv();
    let redesenhos = 0;
    const draft = { lines: [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }], points: [{ x: 2, y: 2 }], labels: [{ at: { x: 0, y: 1 }, text: 'ok' }] };
    const { bridge } = ponte((ev) => (ev.type === 'move' ? { draft } : {}));
    const t = new PluginTool(env, spec([ponto('a')], () => { redesenhos++; }), bridge);
    t.start();
    t.move(P(1, 1));
    await fluxo();
    expect(t.preview()).toEqual([
      { kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, dashed: true }, { kind: 'point', at: { x: 2, y: 2 } }, { kind: 'label', at: { x: 0, y: 1 }, text: 'ok' },
    ]);
    expect(redesenhos).toBeGreaterThan(0);
  });

  it('ao confirmar, o lote vai pela porta de escrita e a prévia some', async () => {
    const { env } = makeEnv();
    const { bridge, lotes } = ponte((ev) => (ev.type === 'point' && ev.complete === true
      ? { commit: { label: 'Gerar', commands: [{ type: 'x' }, { type: 'y' }] } }
      : ev.type === 'move' ? { draft: { lines: [], points: [{ x: 1, y: 1 }], labels: [] } } : {}));
    const t = new PluginTool(env, spec([ponto('a')]), bridge);
    t.start();
    t.move(P(1, 1));
    await fluxo();
    expect(t.preview()).toHaveLength(1);
    t.click(P(1, 1));
    await fluxo();
    expect(lotes).toEqual([{ label: 'Gerar', commands: [{ type: 'x' }, { type: 'y' }] }]);
    expect(t.preview()).toEqual([]);
  });

  it('Esc cancela o passo (o handler é avisado, resposta atrasada é ignorada); o segundo Esc sai', async () => {
    const { env, done } = makeEnv();
    let liberar: () => void = () => undefined;
    const { bridge, eventos, lotes } = ponte((ev) => (ev.type === 'point' ? new Promise<PluginToolReply>((r) => { liberar = () => r({ commit: { label: 'tarde', commands: [{}] }, draft: { lines: [], points: [{ x: 9, y: 9 }], labels: [] } }); }) : {}));
    const t = new PluginTool(env, spec([linha('base')]), bridge);
    t.start();
    t.click(P(0, 0)); // primeiro clique: handler ainda pensando
    await fluxo();
    t.cancel(); // 1º Esc: cancela o passo
    liberar();
    await fluxo();
    expect(eventos.map((e) => e.type)).toEqual(['start', 'point', 'cancel']);
    expect(lotes).toEqual([]);
    expect(t.preview()).toEqual([]);
    expect(done()).toBe(0);
    t.cancel(); // 2º Esc: nada em andamento, sai da ferramenta
    await fluxo();
    expect(done()).toBe(1);
  });

  it('troca de ferramenta (dispose) ainda aplica o lote já confirmado, mas descarta o resto', async () => {
    const { env } = makeEnv();
    let liberar: () => void = () => undefined;
    const { bridge, lotes } = ponte((ev) => (ev.type === 'point' ? new Promise<PluginToolReply>((r) => { liberar = () => r({ commit: { label: 'Gerar', commands: [{}] }, message: 'oi' }); }) : {}));
    const t = new PluginTool(env, spec([ponto('a')]), bridge);
    t.start();
    t.click(P(1, 1));
    await fluxo();
    t.dispose();
    liberar();
    await fluxo();
    expect(lotes).toHaveLength(1);
  });
});

describe('PluginTool: falha do handler', () => {
  it('vira estado failed, avisa e sai da ferramenta sem lançar', async () => {
    const { env, done } = makeEnv();
    const falas: string[] = [];
    env.say = (m) => { falas.push(m); };
    const { bridge, eventos } = ponte((ev) => { if (ev.type === 'point') throw new Error('boom'); return {}; });
    const t = new PluginTool(env, spec([ponto('a')]), bridge);
    t.start();
    t.click(P(1, 1));
    await fluxo();
    expect(t.failed).toBe(true);
    expect(falas.at(-1)).toBe('FALHOU');
    expect(done()).toBe(1);
    // depois de falhar, a ferramenta ignora a entrada
    t.move(P(2, 2));
    t.click(P(2, 2));
    await fluxo();
    expect(eventos.filter((e) => e.type === 'point')).toHaveLength(1);
    expect(t.preview()).toEqual([]);
  });

  it('lote recusado pela porta de escrita mostra o erro e não encerra a ferramenta', async () => {
    const { env, done } = makeEnv();
    const falas: string[] = [];
    env.say = (m) => { falas.push(m); };
    const bridge: PluginToolBridge = { send: async () => ({ commit: { label: 'x', commands: [{}] } }), apply: () => ({ ok: false, error: 'RECUSADO' }) };
    const t = new PluginTool(env, spec([ponto('a')]), bridge);
    t.start();
    await fluxo();
    expect(falas.at(-1)).toBe('RECUSADO');
    expect(done()).toBe(0);
    expect(t.failed).toBe(false);
  });
});
