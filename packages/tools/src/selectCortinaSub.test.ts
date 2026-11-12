import { describe, expect, it } from 'vitest';
import { ProjectStore, type Id, type SubelementoCortina } from '@hestia/model';
import { montarParedeSubelementos, type GradeCortina, type ParedeSubelementos } from '@hestia/engine';
import { projetoComCortina } from '../../engine/src/fixtureCortina.ts';
import { createTool, type PointerInfo, type Tool, type ToolEnv, type ToolOptions } from './index.ts';

/**
 * Cortina `ct1` (6 m x 3 m, base 0): uma linha de grade em U (x = 3) e uma em V (z = 1,5), quatro células. A grade vem de um kernel de mentira, para
 * testar a ferramenta sem o kernel carregado (o kernel real está coberto pelo teste do wasm).
 */
const grade: GradeCortina = {
  linhas: [
    { cortina: 1, eixo: 'u', indice: 1, origem: 0, flags: 0, pos: 3 },
    { cortina: 1, eixo: 'v', indice: 1, origem: 0, flags: 0, pos: 1.5 },
  ],
  celulas: [
    { cortina: 1, i: 0, j: 0, regiao: 0, painel: 1, flags: 0, s0: 0, s1: 3, z0: 0, z1: 1.5 },
    { cortina: 1, i: 0, j: 1, regiao: 1, painel: 1, flags: 0, s0: 0, s1: 3, z0: 1.5, z1: 3 },
    { cortina: 1, i: 1, j: 0, regiao: 2, painel: 1, flags: 0, s0: 3, s1: 6, z0: 0, z1: 1.5 },
    { cortina: 1, i: 1, j: 1, regiao: 3, painel: 1, flags: 0, s0: 3, s1: 6, z0: 1.5, z1: 3 },
  ],
  segmentos: [],
};
const parede: ParedeSubelementos = montarParedeSubelementos(grade, { wallId: 'ct1', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, L: 6, H: 3, zBase: 0, profundidade: 0.1, extras: [] });

function makeEnv(opts: { kernel?: boolean } = {}) {
  const store = new ProjectStore(projetoComCortina());
  let selection: Id[] = [];
  let sub: SubelementoCortina | null = null;
  const env: ToolEnv = {
    project: () => store.project,
    levelId: () => 'lv_0',
    selection: () => selection,
    setSelection: (ids) => {
      selection = ids;
    },
    exec: (c) => store.exec(c),
    transaction: (l, fn) => store.transaction(l, fn),
    metersPerPixel: () => 0.01,
    gridStep: () => 0.1,
    say: () => {},
    done: () => {},
    options: () => ({}) as ToolOptions,
    subelementos: (wallId) => (opts.kernel === false ? null : wallId === 'ct1' ? parede : null),
    subelemento: () => sub,
    setSubelemento: (s) => {
      sub = s;
    },
  };
  return { env, sel: () => selection, sub: () => sub, setSel: (ids: Id[]) => (selection = ids) };
}

const tool = (env: ToolEnv): Tool => {
  const t = createTool('select', env);
  t.start();
  return t;
};
const P = (x: number, y: number): PointerInfo => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });
const clickAt = (t: Tool, x: number, y: number) => {
  t.move(P(x, y));
  t.down!(P(x, y));
  t.up!(P(x, y));
};

describe('Tab na cortina selecionada', () => {
  it('percorre a lista (parede → linhas → células → parede) e Shift+Tab volta a ordem', () => {
    const ctx = makeEnv();
    ctx.setSel(['ct1']);
    const t = tool(ctx.env);
    const itens = parede.itens.map((it) => it.sub);
    t.tab();
    expect(ctx.sub()).toEqual(itens[0]);
    t.tab();
    expect(ctx.sub()).toEqual(itens[1]);
    t.tab(true);
    expect(ctx.sub()).toEqual(itens[0]);
    t.tab(true);
    expect(ctx.sub()).toBeNull();
    t.tab(true);
    expect(ctx.sub()).toEqual(itens[itens.length - 1]);
  });

  it('da última célula, Tab volta à parede (saída do subelemento pelo ciclo)', () => {
    const ctx = makeEnv();
    ctx.setSel(['ct1']);
    const t = tool(ctx.env);
    for (let k = 0; k < parede.itens.length; k++) t.tab();
    expect(ctx.sub()).toEqual(parede.itens[parede.itens.length - 1]!.sub);
    t.tab();
    expect(ctx.sub()).toBeNull();
  });

  it('sem cortina sozinha na seleção, Tab não faz nada', () => {
    const ctx = makeEnv();
    ctx.setSel(['w1']);
    tool(ctx.env).tab();
    expect(ctx.sub()).toBeNull();
    ctx.setSel(['ct1', 'w1']);
    tool(ctx.env).tab();
    expect(ctx.sub()).toBeNull();
  });

  it('sem kernel (lista nula), Tab não percorre nada', () => {
    const ctx = makeEnv({ kernel: false });
    ctx.setSel(['ct1']);
    tool(ctx.env).tab();
    expect(ctx.sub()).toBeNull();
  });
});

describe('clique sobre a cortina já selecionada', () => {
  it('o primeiro clique seleciona a parede inteira', () => {
    const ctx = makeEnv();
    const t = tool(ctx.env);
    clickAt(t, 3.02, 0);
    expect(ctx.sel()).toEqual(['ct1']);
    expect(ctx.sub()).toBeNull();
  });

  it('com a parede já selecionada, o clique na linha escolhe a linha', () => {
    const ctx = makeEnv();
    const t = tool(ctx.env);
    clickAt(t, 3.02, 0);
    clickAt(t, 3.02, 0);
    expect(ctx.sel()).toEqual(['ct1']);
    expect(ctx.sub()).toEqual(parede.itens[0]!.sub);
  });

  it('com a parede já selecionada, o clique numa célula escolhe a célula da fileira do corte (1,2 m)', () => {
    const ctx = makeEnv();
    const t = tool(ctx.env);
    clickAt(t, 3.02, 0);
    clickAt(t, 1, 0);
    expect(ctx.sub()).toEqual(parede.itens[2]!.sub);
  });

  it('clique fora da cortina, com a parede selecionada, limpa o subelemento e troca a seleção', () => {
    const ctx = makeEnv();
    const t = tool(ctx.env);
    clickAt(t, 3.02, 0);
    clickAt(t, 3.02, 0);
    expect(ctx.sub()).not.toBeNull();
    clickAt(t, 20, 20);
    expect(ctx.sub()).toBeNull();
    expect(ctx.sel()).toEqual([]);
  });
});
