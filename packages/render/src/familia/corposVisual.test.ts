import type { CorpoResolvido, Malha } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { corDoCorpo, corpoVisivel3d, esferaDaMalhaDosCorpos, malhaDoCorpoNoMundo } from './corposVisual.ts';
import { COR_PADRAO, COR_VAZIO } from './logica.ts';

/** Corpo resolvido mínimo (sólido, sem restrições de detalhe e vistas) para os testes; `extra` sobrescreve. */
const corpo = (extra: Partial<CorpoResolvido> = {}): CorpoResolvido => ({
  id: 'tubo',
  nome: 'Tubo',
  indice: 1,
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { externo: [0, 0, 1, 0, 0, 1], furos: [] }, comprimento: 1 },
  origem: [0, 0, 0],
  rotacao: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  vazio: false,
  material: null,
  detalhe3d: null,
  vistas: null,
  grupo: null,
  ...extra,
});

/** Triângulo unitário no plano XY com normal +Z, indexado como uma malha de uma peça só. */
const triangulo = (): Malha => ({
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
  indices: [0, 1, 2],
  pecaDoTriangulo: [0],
});

/** Matriz identidade em ordem de coluna. */
const IDENTIDADE = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe('corpoVisivel3d', () => {
  it('vistas ausente aparece; com vistas, precisa conter 3d', () => {
    expect(corpoVisivel3d(corpo({ vistas: null }), 'fino')).toBe(true);
    expect(corpoVisivel3d(corpo({ vistas: ['planta', 'corte'] }), 'fino')).toBe(false);
    expect(corpoVisivel3d(corpo({ vistas: ['planta', '3d'] }), 'fino')).toBe(true);
  });

  it('detalhe3d ausente aparece em todos os níveis; com lista, só nos níveis listados', () => {
    expect(corpoVisivel3d(corpo({ detalhe3d: null }), 'grosso')).toBe(true);
    expect(corpoVisivel3d(corpo({ detalhe3d: ['fino'] }), 'grosso')).toBe(false);
    expect(corpoVisivel3d(corpo({ detalhe3d: ['medio', 'fino'] }), 'medio')).toBe(true);
  });

  it('corpo vazio é sempre visível (fantasma), como a peça vazia, salvo pela vista', () => {
    expect(corpoVisivel3d(corpo({ vazio: true, detalhe3d: ['fino'] }), 'grosso')).toBe(true);
    expect(corpoVisivel3d(corpo({ vazio: true, vistas: ['planta'] }), 'fino')).toBe(false);
  });
});

describe('corDoCorpo', () => {
  it('vazio usa a cor do fantasma; material "#rrggbb" do mapa vale; o resto cai na cor padrão', () => {
    expect(corDoCorpo(corpo({ vazio: true }))).toBe(COR_VAZIO);
    expect(corDoCorpo(corpo({ material: 'inox' }), { inox: '#ff0000' })).toBe(0xff0000);
    expect(corDoCorpo(corpo({ material: 'inox' }), { inox: 'azul' })).toBe(COR_PADRAO);
    expect(corDoCorpo(corpo())).toBe(COR_PADRAO);
  });
});

describe('malhaDoCorpoNoMundo', () => {
  it('identidade mantém posições e normais; a elevação soma só em Z', () => {
    const m = malhaDoCorpoNoMundo(triangulo(), IDENTIDADE, 2);
    expect(m.positions).toEqual([0, 0, 2, 1, 0, 2, 0, 1, 2]);
    expect(m.normals).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(m.indices).toEqual([0, 1, 2]);
    expect(m.pecaDoTriangulo).toEqual([0]);
  });

  it('translação nos índices 12..14 da matriz vai para o mundo', () => {
    const m = malhaDoCorpoNoMundo(triangulo(), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1], 0);
    expect(m.positions.slice(0, 3)).toEqual([5, 6, 7]);
  });

  it('espelho (det < 0) troca dois índices por triângulo e mantém as normais para fora', () => {
    const espelho = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const m = malhaDoCorpoNoMundo(triangulo(), espelho, 0);
    expect(m.positions.slice(0, 3)).toEqual([0, 0, 0]);
    expect(m.positions.slice(3, 6)).toEqual([-1, 0, 0]);
    expect(m.normals).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    expect(m.indices).toEqual([0, 2, 1]);
  });

  it('não altera a malha de entrada', () => {
    const entrada = triangulo();
    malhaDoCorpoNoMundo(entrada, [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], 3);
    expect(entrada.positions[0]).toBe(0);
    expect(entrada.indices).toEqual([0, 1, 2]);
  });
});

describe('esferaDaMalhaDosCorpos', () => {
  it('sem malhas ou sem vértices devolve null', () => {
    expect(esferaDaMalhaDosCorpos([])).toBeNull();
  });

  it('caixa de 2×0×0 m centrada em X=1 tem centro (1,0,0) e raio 1', () => {
    const malha: Malha = { positions: [0, 0, 0, 2, 0, 0], normals: [0, 0, 0, 0, 0, 0], indices: [], pecaDoTriangulo: [] };
    const esfera = esferaDaMalhaDosCorpos([malha]);
    expect(esfera?.centro).toEqual([1, 0, 0]);
    expect(esfera?.raio).toBeCloseTo(1, 9);
  });
});
