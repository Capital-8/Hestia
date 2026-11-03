import type { PecaResolvida } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { corDaPeca, deslocamentoDeExplosao, distanciaDeEnquadramento, esferaDeEnquadramento, geometriaDaMalha, pecaVisivel } from './logica.ts';

const peca = (extra: Partial<PecaResolvida> = {}): PecaResolvida => ({
  id: 'p', nome: 'P', indice: 1, papel: 'painel', eixo: 'z', vazio: false, origem: [0, 0, 0], tamanho: [1, 1], espessura: 0.02,
  extensao: [1, 1, 0.02], contorno: null, material: null, fita: null, veio: null, grupo: null, deAninhado: null, ...extra,
});

describe('corDaPeca', () => {
  it('por papel, por material e vazio', () => {
    expect(corDaPeca(peca({ papel: 'porta' }))).toBe(0xe9d6b4);
    expect(corDaPeca(peca({ papel: 'frente_gaveta' }))).toBe(0xe9d6b4);
    expect(corDaPeca(peca({ papel: 'tampo' }))).toBe(0x8c6a4a);
    expect(corDaPeca(peca({ papel: 'fundo' }))).toBe(0xb9b2a6);
    expect(corDaPeca(peca({ papel: 'rodape' }))).toBe(0xc9a97a);
    expect(corDaPeca(peca({ papel: 'lateral' }))).toBe(0xd8b98b);
    expect(corDaPeca(peca({ vazio: true, papel: 'porta' }))).toBe(0x4a90d9);
    expect(corDaPeca(peca({ papel: 'porta', material: 'mat_x' }), { mat_x: '#336699' })).toBe(0x336699);
    expect(corDaPeca(peca({ papel: 'porta', material: 'outro' }), { mat_x: '#336699' })).toBe(0xe9d6b4);
    expect(corDaPeca(peca({ vazio: true, material: 'mat_x' }), { mat_x: '#336699' })).toBe(0x4a90d9);
  });
});

describe('deslocamentoDeExplosao', () => {
  const centro: [number, number, number] = [0.4, 0.3, 0.4];
  it('fator 0 não desloca nada, e o fator é limitado a 0..1', () => {
    expect(deslocamentoDeExplosao(peca({ papel: 'porta' }), 0, centro)).toEqual([0, 0, 0]);
    expect(deslocamentoDeExplosao(peca({ papel: 'porta' }), 5, centro)[1]).toBeCloseTo(-0.3, 9);
    expect(deslocamentoDeExplosao(peca({ papel: 'porta' }), -1, centro)).toEqual([0, 0, 0]);
  });
  it('por papel, com D = 0,25 m', () => {
    const d = (papel: PecaResolvida['papel'], o: [number, number, number] = [0, 0, 0]) => deslocamentoDeExplosao(peca({ papel, origem: o, extensao: [0.02, 0.5, 0.5] }), 1, centro);
    expect(d('lateral', [0, 0, 0])).toEqual([-0.25, 0, 0]);
    expect(d('lateral', [0.78, 0, 0])).toEqual([0.25, 0, 0]);
    expect(d('porta')[1]).toBeCloseTo(-0.3, 9);
    expect(d('frente_gaveta')[1]).toBeCloseTo(-0.3, 9);
    expect(d('fundo')).toEqual([0, 0.25, 0]);
    expect(d('tampo')).toEqual([0, 0, 0.25]);
    expect(d('topo')).toEqual([0, 0, 0.25]);
    expect(d('base')).toEqual([0, 0, -0.125]);
    expect(d('rodape')).toEqual([0, 0, -0.125]);
    expect(d('prateleira')).toEqual([0, 0, 0]);
    expect(d('travessa')).toEqual([0, 0, 0]);
  });
});

describe('pecaVisivel', () => {
  it('fino mostra tudo; médio tira travessa e rodapé; grosso só o volume principal; vazio sempre', () => {
    const todos = ['lateral', 'base', 'topo', 'travessa', 'prateleira', 'divisoria', 'fundo', 'porta', 'frente_gaveta', 'tampo', 'rodape', 'painel', 'bloco', 'generica'] as const;
    for (const papel of todos) expect(pecaVisivel(peca({ papel }), 'fino', true), papel).toBe(true);
    expect(pecaVisivel(peca({ papel: 'travessa' }), 'medio', true)).toBe(false);
    expect(pecaVisivel(peca({ papel: 'rodape' }), 'medio', true)).toBe(false);
    expect(pecaVisivel(peca({ papel: 'prateleira' }), 'medio', true)).toBe(true);
    expect(pecaVisivel(peca({ papel: 'prateleira' }), 'grosso', true)).toBe(false);
    expect(pecaVisivel(peca({ papel: 'fundo' }), 'grosso', true)).toBe(false);
    for (const papel of ['lateral', 'base', 'tampo', 'porta', 'frente_gaveta', 'painel'] as const) expect(pecaVisivel(peca({ papel }), 'grosso', true), papel).toBe(true);
    expect(pecaVisivel(peca({ papel: 'porta' }), 'fino', false)).toBe(false);
    expect(pecaVisivel(peca({ papel: 'frente_gaveta' }), 'fino', false)).toBe(false);
    expect(pecaVisivel(peca({ papel: 'lateral' }), 'fino', false)).toBe(true);
    expect(pecaVisivel(peca({ papel: 'prateleira', vazio: true }), 'grosso', false)).toBe(true);
  });
});

describe('geometriaDaMalha', () => {
  it('atributos position e normal com 3 componentes e índice de 32 bits', () => {
    const g = geometriaDaMalha({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2], pecaDoTriangulo: [0] });
    expect(g.getAttribute('position').count).toBe(3);
    expect(g.getAttribute('position').itemSize).toBe(3);
    expect(g.getAttribute('normal').count).toBe(3);
    expect(g.getIndex()!.count).toBe(3);
    expect(g.getAttribute('position').array).toBeInstanceOf(Float32Array);
    expect(g.getIndex()!.array).toBeInstanceOf(Uint32Array);
    g.dispose();
  });
  it('malha vazia gera geometria vazia sem lançar', () => {
    const g = geometriaDaMalha({ positions: [], normals: [], indices: [], pecaDoTriangulo: [] });
    expect(g.getAttribute('position').count).toBe(0);
    g.dispose();
  });
});

describe('enquadramento', () => {
  it('esfera envolve só as peças não vazias; sem peças devolve o padrão', () => {
    expect(esferaDeEnquadramento([])).toEqual({ centro: [0, 0, 0], raio: 1 });
    const e = esferaDeEnquadramento([peca({ origem: [0, 0, 0], extensao: [2, 0, 0] }), peca({ origem: [0, 0, 0], extensao: [0, 2, 0] }), peca({ vazio: true, origem: [50, 50, 50], extensao: [1, 1, 1] })]);
    expect(e.centro).toEqual([1, 1, 0]);
    expect(e.raio).toBeCloseTo(Math.hypot(2, 2, 0) / 2, 9);
  });
  it('distância: cresce com o raio e com telas mais estreitas, e a esfera cabe no campo de visão', () => {
    const d1 = distanciaDeEnquadramento(1, 50, 1.5);
    expect(distanciaDeEnquadramento(2, 50, 1.5)).toBeCloseTo(2 * d1, 9);
    expect(distanciaDeEnquadramento(1, 50, 0.5)).toBeGreaterThan(d1);
    expect(d1).toBeGreaterThan(1);
    const fovV = (50 * Math.PI) / 180; const fovH = 2 * Math.atan(Math.tan(fovV / 2) * 1.5);
    expect(d1).toBeCloseTo((1 / Math.sin(Math.min(fovV, fovH) / 2)) * 1.1, 9);
  });
});
