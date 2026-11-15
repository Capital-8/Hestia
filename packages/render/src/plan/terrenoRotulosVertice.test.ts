import { describe, expect, it } from 'vitest';
import type { CurvaNivelTN } from '@hestia/engine';
import { createEmptyProject, makeTerrain, type Terrain } from '@hestia/model';
import { rotulosDeCurva } from './terrenoRotulos.ts';

const T = 'tn_v';
const terreno = (linha: number[]): Terrain => ({ ...makeTerrain({ id: T, levelId: 'lv_0' }), linhasRotulo: linha }) as Terrain;
// Losango de vértices (0,10), (10,0), (20,10), (10,20): a linha y=10 passa exatamente pelos vértices (0,10) e (20,10).
const losango: CurvaNivelTN = { terrenoId: T, z: 5, mestra: true, fechada: true, pontos: [{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 20 }] };

describe('rótulo de curva cruzando num vértice', () => {
  it('um cruzamento no vértice gera um rótulo só, não um por segmento vizinho', () => {
    const p = createEmptyProject();
    const r = rotulosDeCurva(p, terreno([-5, 10, 25, 10]), [losango], 100);
    expect(r).toHaveLength(2);
    expect(r.map((l) => l.at.x).sort((a, b) => a - b)).toEqual([0, 20]);
  });

  it('cruzamentos distintos da mesma curva continuam todos rotulados', () => {
    const p = createEmptyProject();
    expect(rotulosDeCurva(p, terreno([10, -5, 10, 25]), [losango], 100)).toHaveLength(2);
  });
});
