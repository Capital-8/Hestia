import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore, wallConflict, wallOverlap, type Wall } from './index.ts';

/** Parede completa (com `order`) para os testes do critério: só os eixos a→b importam. */
const wall = (id: string, ax: number, ay: number, bx: number, by: number, levelId = 'lv_0'): Wall => ({
  ...makeWall({ id, typeId: 'wt_alv14', levelId, a: { x: ax, y: ay }, b: { x: bx, y: by } }),
  order: 0,
});

describe('wallOverlap (critério do C14, decisão 0044)', () => {
  it('eixos coincidentes: sobrepõe por todo o comprimento com lateral 0', () => {
    expect(wallOverlap(wall('a', 0, 0, 6, 0), wall('b', 0, 0, 6, 0))).toEqual({ length: 6, lateral: 0 });
  });

  it('sobreposição parcial conta só o trecho em comum', () => {
    expect(wallOverlap(wall('a', 0, 0, 6, 0), wall('b', 4, 0, 10, 0))?.length).toBeCloseTo(2, 9);
  });

  it('trecho em comum de 5 cm (ou menos) não é sobreposição', () => {
    expect(wallOverlap(wall('a', 0, 0, 6, 0), wall('b', 5.95, 0, 10, 0))).toBeNull();
  });

  it('paredes em sentidos opostos também se sobrepõem', () => {
    expect(wallOverlap(wall('a', 0, 0, 6, 0), wall('b', 4, 0, 2, 0))?.length).toBeCloseTo(2, 9);
  });

  it('lateral de 5 mm ainda sobrepõe; 2 cm não', () => {
    expect(wallOverlap(wall('a', 0, 0, 6, 0), wall('b', 0, 0.005, 6, 0.005))?.lateral).toBeCloseTo(0.005, 9);
    expect(wallOverlap(wall('a', 0, 0, 6, 0), wall('b', 0, 0.02, 6, 0.02))).toBeNull();
  });

  it('até 1° entre os eixos ainda é colinear', () => {
    const rad = (0.5 * Math.PI) / 180;
    expect(wallOverlap(wall('a', 0, 0, 1, 0), wall('b', 0, 0, Math.cos(rad), Math.sin(rad)))).not.toBeNull();
  });

  it('2° entre os eixos não é sobreposição', () => {
    const rad = (2 * Math.PI) / 180;
    expect(wallOverlap(wall('a', 0, 0, 1, 0), wall('b', 0, 0, Math.cos(rad), Math.sin(rad)))).toBeNull();
  });

  it('a curvatura (sag) não entra: a conta é só dos eixos', () => {
    const arco: Wall = { ...wall('b', 0, 0, 6, 0), sag: 0.5 };
    expect(wallOverlap(wall('a', 0, 0, 6, 0), arco)?.length).toBeCloseTo(6, 9);
  });

  it('parede de comprimento zero não sobrepõe', () => {
    expect(wallOverlap(wall('a', 0, 0, 6, 0), wall('b', 2, 0, 2, 0))).toBeNull();
  });
});

describe('wallConflict (parede embaixo de uma candidata)', () => {
  it('acha a primeira parede no mesmo nível, não conta consigo mesma e respeita ignore', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: wall('a', 0, 0, 6, 0) });
    s.exec({ type: 'addWall', wall: wall('b', 0, 0, 6, 0) });
    s.exec({ type: 'addWall', wall: wall('livre', 0, 2, 6, 2) });

    expect(wallConflict(s.project, wall('nova', 0, 0, 6, 0))?.wall.id).toBe('a');
    // A própria parede não conflita consigo: procura a próxima por baixo.
    expect(wallConflict(s.project, wall('a', 0, 0, 6, 0))?.wall.id).toBe('b');
    // `ignore` pula ids (ex.: o conjunto que está sendo transformado).
    expect(wallConflict(s.project, wall('nova', 0, 0, 6, 0), new Set(['a']))?.wall.id).toBe('b');
    expect(wallConflict(s.project, wall('nova', 0, 0, 6, 0), new Set(['a', 'b']))).toBeNull();
    // Parede livre não conflita.
    expect(wallConflict(s.project, wall('nova', 0, 3, 6, 3))).toBeNull();
  });

  it('níveis diferentes não conflitam', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: wall('a', 0, 0, 6, 0, 'lv_0') });
    expect(wallConflict(s.project, wall('nova', 0, 0, 6, 0, 'lv_1'))).toBeNull();
  });
});
