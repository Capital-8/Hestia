import { describe, expect, it } from 'vitest';
import { areaFace, caixaEnvolvente, resumirPecas, volumePeca } from './medidas.ts';
import type { PecaResolvida } from './pecas.ts';

function peca(extra: Partial<PecaResolvida> & Pick<PecaResolvida, 'origem' | 'extensao'>): PecaResolvida {
  const [sx, sy, sz] = extra.extensao;
  const eixo = extra.eixo ?? 'z';
  const tamanho: [number, number] = eixo === 'x' ? [sy, sz] : eixo === 'y' ? [sx, sz] : [sx, sy];
  const espessura = eixo === 'x' ? sx : eixo === 'y' ? sy : sz;
  return { id: 'p', nome: 'p', indice: 1, papel: 'painel', eixo, vazio: false, tamanho, espessura, contorno: null, material: null, fita: null, veio: null, grupo: null, deAninhado: null, chapa: null, usinagens: [], ...extra };
}

describe('caixaEnvolvente', () => {
  it('sem peças ou só com vazios: null; com incluirVazios os vazios entram', () => {
    expect(caixaEnvolvente([])).toBeNull();
    const v = peca({ origem: [0, 0, 0], extensao: [1, 1, 1], vazio: true });
    expect(caixaEnvolvente([v])).toBeNull();
    expect(caixaEnvolvente([v], { incluirVazios: true })).toEqual({ min: [0, 0, 0], max: [1, 1, 1] });
  });
  it('envolve origem e extensão de todas as peças não vazias', () => {
    const a = peca({ origem: [0, 0, 0], extensao: [0.8, 0.018, 0.7] });
    const b = peca({ origem: [-0.1, -0.2, 0.5], extensao: [0.3, 0.3, 0.3] });
    const c = peca({ origem: [9, 9, 9], extensao: [1, 1, 1], vazio: true });
    const cx = caixaEnvolvente([a, b, c])!;
    expect(cx.min[0]).toBeCloseTo(-0.1, 12);
    expect(cx.min[1]).toBeCloseTo(-0.2, 12);
    expect(cx.min[2]).toBeCloseTo(0, 12);
    expect(cx.max[0]).toBeCloseTo(0.8, 12);
    expect(cx.max[1]).toBeCloseTo(0.1, 12);
    expect(cx.max[2]).toBeCloseTo(0.8, 12);
  });
});

describe('areaFace e volumePeca', () => {
  it('retângulo: tamanho[0] × tamanho[1]; volume = área × espessura', () => {
    const p = peca({ origem: [0, 0, 0], extensao: [0.8, 0.56, 0.018] });
    expect(areaFace(p)).toBeCloseTo(0.8 * 0.56, 12);
    expect(volumePeca(p)).toBeCloseTo(0.8 * 0.56 * 0.018, 12);
  });
  it('com contorno usa a área do polígono, em qualquer sentido', () => {
    const ele = [0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2];
    const horario: number[] = [];
    for (let i = ele.length - 2; i >= 0; i -= 2) horario.push(ele[i]!, ele[i + 1]!);
    const base = peca({ origem: [0, 0, 0], extensao: [2, 2, 0.02] });
    expect(areaFace({ ...base, contorno: ele })).toBeCloseTo(3, 12);
    expect(areaFace({ ...base, contorno: horario })).toBeCloseTo(3, 12);
    expect(volumePeca({ ...base, contorno: ele })).toBeCloseTo(0.06, 12);
  });
});

describe('resumirPecas', () => {
  const pecas = [
    peca({ id: 'a', papel: 'lateral', eixo: 'x', origem: [0, 0, 0], extensao: [0.018, 0.56, 0.7] }),
    peca({ id: 'b', papel: 'lateral', eixo: 'x', origem: [0.78, 0, 0], extensao: [0.018, 0.56, 0.7] }),
    peca({ id: 'c', papel: 'fundo', eixo: 'y', origem: [0, 0.55, 0], extensao: [0.8, 0.006, 0.7] }),
    peca({ id: 'd', papel: 'painel', eixo: 'z', origem: [0, 0, 0], extensao: [0.1, 0.1, 0.0065] }),
    peca({ id: 'v', papel: 'painel', origem: [0, 0, 0], extensao: [1, 1, 1], vazio: true }),
  ];
  it('conta, soma e agrupa só as peças não vazias', () => {
    const r = resumirPecas(pecas);
    expect(r.quantidade).toBe(4);
    expect(r.vazios).toBe(1);
    expect(r.porPapel).toEqual({ lateral: 2, fundo: 1, painel: 1 });
    expect(r.areaPorEspessura['18']).toBeCloseTo(2 * 0.56 * 0.7, 12);
    expect(r.areaPorEspessura['6']).toBeCloseTo(0.8 * 0.7, 12);
    expect(r.areaPorEspessura['6.5']).toBeCloseTo(0.01, 12);
    expect(Object.keys(r.areaPorEspessura).sort()).toEqual(['18', '6', '6.5']);
    expect(r.volume).toBeCloseTo(2 * 0.56 * 0.7 * 0.018 + 0.8 * 0.7 * 0.006 + 0.01 * 0.0065, 12);
  });
  it('lista vazia', () => {
    expect(resumirPecas([])).toEqual({ quantidade: 0, vazios: 0, volume: 0, areaPorEspessura: {}, porPapel: {} });
  });
  it('a soma das áreas por espessura é a soma das áreas de face não vazias', () => {
    const r = resumirPecas(pecas);
    const soma = Object.values(r.areaPorEspessura).reduce((s, v) => s + v, 0);
    expect(soma).toBeCloseTo(pecas.filter((p) => !p.vazio).reduce((s, p) => s + areaFace(p), 0), 12);
  });
});
