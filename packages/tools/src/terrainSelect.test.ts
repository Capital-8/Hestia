import { afterEach, describe, expect, it, vi } from 'vitest';
import { adicionarFixtureTerreno, servicoTerreno, type CurvaNivelTN, type LinhaPlantaTN } from '@hestia/engine';
import { ProjectStore, createEmptyProject } from '@hestia/model';
import { makeEnv, P, tool } from './testEnv.ts';

const T3 = 'tn_t3';
const borda: LinhaPlantaTN = { terrenoId: T3, fechada: true, pontos: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] };
const curva: CurvaNivelTN = { terrenoId: T3, z: 3, mestra: false, fechada: true, pontos: [{ x: 6, y: 6 }, { x: 14, y: 6 }, { x: 14, y: 14 }, { x: 6, y: 14 }] };

function cena(nome: 'T3' | 'T5' = 'T3') {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  adicionarFixtureTerreno(ctx.store, nome);
  return ctx;
}
const clicar = (t: ReturnType<typeof tool>, x: number, y: number): void => {
  t.down?.(P(x, y));
  t.up?.(P(x, y));
};
const caixa = (t: ReturnType<typeof tool>, a: [number, number], b: [number, number]): void => {
  t.down?.(P(a[0], a[1]));
  t.drag?.(P(b[0], b[1]));
  t.up?.(P(b[0], b[1]));
};

afterEach(() => vi.restoreAllMocks());

describe('Selecionar: terreno pela borda e pela curva, nunca pelo interior', () => {
  it('clique na borda seleciona o terreno (sem kernel vale a borda de reserva)', () => {
    const ctx = cena();
    const s = tool('select', ctx.env);
    clicar(s, 10, 0.03);
    expect(ctx.sel()).toEqual([T3]);
  });

  it('clique no INTERIOR não seleciona e limpa a seleção', () => {
    const ctx = cena();
    ctx.env.setSelection([T3]);
    const s = tool('select', ctx.env);
    clicar(s, 10, 10);
    expect(ctx.sel()).toEqual([]);
    clicar(s, 3, 10);
    expect(ctx.sel()).toEqual([]);
  });

  it('clique numa curva de nível do kernel seleciona o terreno', () => {
    const ctx = cena();
    vi.spyOn(servicoTerreno(), 'planta').mockReturnValue([borda]);
    vi.spyOn(servicoTerreno(), 'curvas').mockReturnValue([curva]);
    const s = tool('select', ctx.env);
    clicar(s, 6.03, 10);
    expect(ctx.sel()).toEqual([T3]);
    clicar(s, 10, 10); // no interior da curva: nada
    expect(ctx.sel()).toEqual([]);
  });

  it('clique no contorno da região seleciona a região; o terreno leva a região ao ser selecionado', () => {
    const ctx = cena('T5');
    const s = tool('select', ctx.env);
    clicar(s, 10, 5.03);
    expect(ctx.sel()).toEqual(['rg_t5']);
  });

  it('caixa: janela pega o terreno só com a borda toda dentro; cruzamento basta tocar a borda; dentro sem tocar não pega', () => {
    const ctx = cena();
    const s = tool('select', ctx.env);
    caixa(s, [-1, -1], [21, 21]); // janela (esquerda para a direita), envolve tudo
    expect(ctx.sel()).toEqual([T3]);
    ctx.env.setSelection([]);
    caixa(s, [-1, -1], [10, 21]); // janela que corta a borda: não pega
    expect(ctx.sel()).toEqual([]);
    caixa(s, [10, 21], [-1, 10]); // cruzamento (direita para a esquerda) que toca a borda
    expect(ctx.sel()).toEqual([T3]);
    ctx.env.setSelection([]);
    caixa(s, [8, 8], [4, 12]); // cruzamento inteiro no interior, sem tocar nenhuma linha
    expect(ctx.sel()).toEqual([]);
  });
});
