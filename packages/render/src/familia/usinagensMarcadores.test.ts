import type { PecaResolvida, UsinagemResolvida } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { marcadoresDaPeca, marcadoresVisiveis } from './usinagensMarcadores.ts';

const peca = (extra: Partial<PecaResolvida> = {}): PecaResolvida => ({
  id: 'p', nome: 'P', indice: 1, papel: 'painel', eixo: 'z', vazio: false, origem: [0, 0, 0], tamanho: [0.6, 0.4], espessura: 0.02,
  extensao: [0.6, 0.4, 0.02], contorno: null, material: null, fita: null, veio: null, grupo: null, deAninhado: null, chapa: null, usinagens: [], ...extra,
});

const usinagem = (extra: Partial<UsinagemResolvida> = {}): UsinagemResolvida => ({
  id: 'u1', tipo: 'furo', face: 'a', u: 0.2, v: 0.2, diametro: 0.02, largura: 0, comprimento: 0, profundidade: -1, ...extra,
});

describe('marcadoresDaPeca — furo', () => {
  it('furo Ø20 na face a de uma peça em z: disco de raio 0,01 sobre a face, normal para fora', () => {
    const m = marcadoresDaPeca(peca({ usinagens: [usinagem({ profundidade: 0.01 })] }));
    expect(m).toHaveLength(1);
    expect(m[0]!.forma).toBe('disco');
    expect(m[0]!.raio).toBe(0.01);
    expect(m[0]!.centro).toEqual([0.2, 0.2, 0]);
    expect(m[0]!.normal).toEqual([0, 0, -1]);
    expect(m[0]!.altura).toBeCloseTo(0.0005, 12);
    expect(m[0]!.dimensoes).toEqual([0, 0, 0]);
  });
  it('furo passante gera dois marcadores: a face b fica na outra face, com normal oposta', () => {
    const m = marcadoresDaPeca(peca({ usinagens: [usinagem()] }));
    expect(m).toHaveLength(2);
    expect(m[0]!.centro).toEqual([0.2, 0.2, 0]);
    expect(m[0]!.normal).toEqual([0, 0, -1]);
    expect(m[1]!.centro).toEqual([0.2, 0.2, 0.02]);
    expect(m[1]!.normal).toEqual([0, 0, 1]);
    expect(m[1]!.raio).toBe(0.01);
  });
  it('furo em peça com espessura em x: a coordenada de profundidade é a origem no eixo x (calculada à mão)', () => {
    const p = peca({ eixo: 'x', origem: [0.3, 0.1, 0.2], tamanho: [0.5, 0.4], espessura: 0.02, extensao: [0.02, 0.5, 0.4] });
    const m = marcadoresDaPeca(peca({ ...p, usinagens: [usinagem()] }));
    expect(m).toHaveLength(2);
    expect(m[0]!.centro).toEqual([0.3, 0.1 + 0.2, 0.2 + 0.2]);
    expect(m[0]!.normal).toEqual([-1, 0, 0]);
    expect(m[1]!.centro).toEqual([0.3 + 0.02, 0.1 + 0.2, 0.2 + 0.2]);
    expect(m[1]!.normal).toEqual([1, 0, 0]);
  });
  it('furo na face b sai na face b, não na a', () => {
    const m = marcadoresDaPeca(peca({ usinagens: [usinagem({ face: 'b', profundidade: 0.008 })] }));
    expect(m).toHaveLength(1);
    expect(m[0]!.centro).toEqual([0.2, 0.2, 0.02]);
    expect(m[0]!.normal).toEqual([0, 0, 1]);
  });
  it('furo de borda: entra na face norte e, passante, sai na sul (mesmo u e v)', () => {
    const m = marcadoresDaPeca(peca({ usinagens: [usinagem({ face: 'n', u: 0.1, v: 0.01 })] }));
    expect(m).toHaveLength(2);
    expect(m[0]!.centro).toEqual([0.1, 0.4, 0.01]);
    expect(m[0]!.normal).toEqual([0, 1, 0]);
    expect(m[1]!.centro).toEqual([0.1, 0, 0.01]);
    expect(m[1]!.normal).toEqual([0, -1, 0]);
  });
});

describe('marcadoresDaPeca — rasgo e recorte', () => {
  it('rasgo gera caixa com comprimento e largura certos, centrada no retângulo, sobre a face', () => {
    const m = marcadoresDaPeca(peca({ usinagens: [usinagem({ tipo: 'rasgo', u: 0.1, v: 0.1, diametro: 0, comprimento: 0.3, largura: 0.05, profundidade: 0.01 })] }));
    expect(m).toHaveLength(1);
    expect(m[0]!.forma).toBe('caixa');
    expect(m[0]!.dimensoes).toEqual([0.3, 0.05, 0.0005]);
    expect(m[0]!.centro).toEqual([0.25, 0.125, 0]);
    expect(m[0]!.normal).toEqual([0, 0, -1]);
  });
  it('recorte é a caixa aproximada da usinagem; em peça em x as dimensões seguem os eixos locais', () => {
    const p = peca({ eixo: 'x', origem: [0, 0, 0], tamanho: [0.5, 0.4], espessura: 0.02, extensao: [0.02, 0.5, 0.4] });
    const m = marcadoresDaPeca(peca({ ...p, usinagens: [usinagem({ tipo: 'recorte', u: 0.1, v: 0.05, diametro: 0, comprimento: 0.2, largura: 0.1, profundidade: -1 })] }));
    expect(m).toHaveLength(1);
    expect(m[0]!.forma).toBe('caixa');
    expect(m[0]!.dimensoes).toEqual([0.0005, 0.2, 0.1]);
    expect(m[0]!.centro).toEqual([0, 0.2, 0.1]);
  });
});

describe('marcadoresDaPeca — robustez e unidades', () => {
  it('peça sem usinagens: lista vazia', () => {
    expect(marcadoresDaPeca(peca())).toEqual([]);
  });
  it('tipo desconhecido é ignorado sem lançar', () => {
    const estranha = { ...usinagem(), tipo: 'chanfro' } as unknown as UsinagemResolvida;
    expect(marcadoresDaPeca(peca({ usinagens: [estranha] }))).toEqual([]);
  });
  it('face desconhecida e eixo inválido são ignorados sem lançar', () => {
    const faceEstranha = { ...usinagem(), face: 'z' } as unknown as UsinagemResolvida;
    expect(marcadoresDaPeca(peca({ usinagens: [faceEstranha] }))).toEqual([]);
    const eixoEstranho = { ...peca(), eixo: 'w' } as unknown as PecaResolvida;
    expect(marcadoresDaPeca(eixoEstranho)).toEqual([]);
  });
  it('valores inválidos (raio 0, NaN, profundidade 0) não geram marcador', () => {
    expect(marcadoresDaPeca(peca({ usinagens: [usinagem({ diametro: 0 })] }))).toEqual([]);
    expect(marcadoresDaPeca(peca({ usinagens: [usinagem({ diametro: Number.NaN })] }))).toEqual([]);
    expect(marcadoresDaPeca(peca({ usinagens: [usinagem({ profundidade: 0 })] }))).toEqual([]);
    expect(marcadoresDaPeca(peca({ usinagens: [usinagem({ tipo: 'rasgo', comprimento: 0, largura: 0.05 })] }))).toEqual([]);
  });
  it('tudo sai em metros: raio é metade do diâmetro e o centro usa a origem da peça', () => {
    const m = marcadoresDaPeca(peca({ origem: [1, 2, 3], usinagens: [usinagem({ diametro: 0.008, profundidade: 0.005 })] }));
    expect(m[0]!.raio).toBe(0.004);
    expect(m[0]!.centro).toEqual([1.2, 2.2, 3]);
  });
});

describe('marcadoresVisiveis', () => {
  it('ligado por padrão; some só no detalhe grosso, a não ser na peça selecionada', () => {
    expect(marcadoresVisiveis('fino', false)).toBe(true);
    expect(marcadoresVisiveis('medio', false)).toBe(true);
    expect(marcadoresVisiveis('grosso', false)).toBe(false);
    expect(marcadoresVisiveis('grosso', true)).toBe(true);
  });
});
