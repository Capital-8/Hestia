import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESTILO_PLANTA_MASSA, servicoMassa, type LinhaPlantaMassaProjeto } from '@hestia/engine';
import { massaM1, massaM3 } from '@hestia/engine/src/fixtureMassa.ts';
import type { Id } from '@hestia/model';
import { makeEnv, P, tool } from './testEnv.ts';
import type { Tool } from './index.ts';

/**
 * Seleção da massa na planta PELO `SelectTool` (clique e caixa de janela), com M1 e M3 da fixture. Sem kernel o alvo é o contorno da
 * base; com o kernel (aqui simulado) é o anel cortado.
 */
afterEach(() => vi.restoreAllMocks());

const clique = (t: Tool, x: number, y: number): void => {
  t.move(P(x, y));
  t.down!(P(x, y));
  t.up!(P(x, y));
};
const janela = (t: Tool, a: { x: number; y: number }, b: { x: number; y: number }): void => {
  t.move(P(a.x, a.y));
  t.down!(P(a.x, a.y));
  t.drag!(P(b.x, b.y));
  t.up!(P(b.x, b.y));
};

function cena() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addMass', mass: massaM1() });
  // M3 deslocada para x = 30, longe da M1 (retângulo 10 x 6 em torno da origem).
  ctx.store.exec({ type: 'addMass', mass: { ...massaM3(), origem: { x: 30, y: 0 } } });
  return { ...ctx, t: tool('select', ctx.env) };
}

/** Kernel simulado: o anel cortado da M1 é o próprio retângulo; o da M3 é um quadrado de lado 6 (menor que a base em losango). */
function kernelSimulado(): void {
  const anel = (cx: number, cy: number, h: number): Array<{ x: number; y: number }> => [{ x: cx - h, y: cy - h }, { x: cx + h, y: cy - h }, { x: cx + h, y: cy + h }, { x: cx - h, y: cy + h }, { x: cx - h, y: cy - h }];
  const linhas: LinhaPlantaMassaProjeto[] = [
    { massaId: 'm1', copia: 0, estilo: ESTILO_PLANTA_MASSA.cortado, pontos: anel(0, 0, 4) },
    { massaId: 'm3', copia: 0, estilo: ESTILO_PLANTA_MASSA.cortado, pontos: anel(30, 0, 3) },
  ];
  vi.spyOn(servicoMassa(), 'pronto').mockReturnValue(true);
  vi.spyOn(servicoMassa(), 'planta').mockReturnValue(linhas);
}

describe('Selecionar: massa na planta (clique)', () => {
  it('sem kernel, clicar dentro do contorno da base seleciona a M1 e a M3', () => {
    const { t, sel } = cena();
    clique(t, 0, 0);
    expect(sel()).toEqual(['m1']);
    clique(t, 30, 2);
    expect(sel()).toEqual(['m3']);
  });

  it('clicar fora de qualquer massa limpa a seleção', () => {
    const { t, sel } = cena();
    clique(t, 0, 0);
    clique(t, 15, 15);
    expect(sel()).toEqual([]);
  });

  it('com kernel o alvo é o anel cortado: o ponto da base fora do anel não pega; dentro pega', () => {
    kernelSimulado();
    const { t, sel } = cena();
    // (33.5, 0) está a 3,5 m do centro da M3: dentro do losango da base (raio 5,66) e fora do anel cortado (quadrado de lado 6).
    clique(t, 33.5, 0);
    expect(sel()).toEqual([]);
    clique(t, 31, 1);
    expect(sel()).toEqual(['m3']);
  });

  it('Shift soma a massa à seleção e a massa oculta na vista não é alvo', () => {
    const { t, sel, env } = cena();
    clique(t, 0, 0);
    t.move(P(30, 0, { shift: true }));
    t.down!(P(30, 0, { shift: true }));
    t.up!(P(30, 0, { shift: true }));
    expect(sel()).toEqual(['m1', 'm3']);
    const oculto = new Set<Id>(['m1']);
    env.hiddenInView = () => oculto;
    clique(t, 15, 15);
    clique(t, 0, 0);
    expect(sel()).toEqual([]);
  });
});

describe('Selecionar: massa na planta (caixa de janela)', () => {
  it('a janela pega a massa que cabe inteira e deixa a que não cabe', () => {
    const { t, sel } = cena();
    janela(t, { x: -8, y: -8 }, { x: 8, y: 8 });
    expect(sel()).toEqual(['m1']);
    janela(t, { x: -8, y: -8 }, { x: 40, y: 8 });
    expect([...sel()].sort()).toEqual(['m1', 'm3']);
    // Janela estreita demais para a M1 (10 de largura): não pega nada.
    janela(t, { x: -3, y: -8 }, { x: 3, y: 8 });
    expect(sel()).toEqual([]);
  });

  it('com kernel a janela usa o anel cortado: janela justa em volta do anel da M3 a pega, mesmo menor que a base', () => {
    kernelSimulado();
    const { t, sel } = cena();
    janela(t, { x: 26, y: -4 }, { x: 34, y: 4 });
    expect(sel()).toEqual(['m3']);
  });
});
