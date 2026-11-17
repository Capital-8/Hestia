import { describe, expect, it } from 'vitest';
import type { Transform, Vec2 } from '@hestia/geom';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { makeTerrain, makeTerrainRegion, normalizarBorda, normalizarContorno, transformTerrain, transformTerrainRegion } from './terrain.ts';
import type { Terrain, TerrainRegion } from './terrainTypes.ts';

const eixoX: Transform = { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } };
const giro90: Transform = { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 };
const mover: Transform = { kind: 'translate', d: { x: 100, y: -50 } };

const proximo = (a: readonly number[], b: readonly number[]): void => {
  expect(a).toHaveLength(b.length);
  a.forEach((v, k) => expect(v).toBeCloseTo(b[k]!, 9));
};
const proximoV = (a: readonly Vec2[], b: readonly Vec2[]): void => {
  expect(a).toHaveLength(b.length);
  a.forEach((q, k) => {
    expect(q.x).toBeCloseTo(b[k]!.x, 9);
    expect(q.y).toBeCloseTo(b[k]!.y, 9);
  });
};

function terreno(): Terrain {
  return {
    ...makeTerrain({
      id: 'tn1',
      levelId: 'lv_0',
      pontos: [1, 2, 10, 3, 4, 20],
      curvas: [{ z: 5, xy: [0, 0, 4, 0, 4, 3], fechada: true }],
      quebras: [{ xyz: [1, 1, 7, 2, 5, 8] }],
      borda: [0, 0, 10, 0, 10, 6, 0, 6],
      linhasRotulo: [0, 1, 5, 1],
      pontosCotados: [2, 2, 7, 3],
    }),
    order: 0,
  };
}

describe('transform do terreno (A.3 item 5)', () => {
  it('mover: soma o deslocamento a todo par (x, y) e não muda z nem a ordem da borda', () => {
    const r = transformTerrain(terreno(), mover);
    proximo(r.pontos, [101, -48, 10, 103, -46, 20]);
    proximo(r.curvas[0]!.xy, [100, -50, 104, -50, 104, -47]);
    expect(r.curvas[0]).toMatchObject({ z: 5, fechada: true });
    proximo(r.quebras[0]!.xyz, [101, -49, 7, 102, -45, 8]);
    proximo(r.borda!, [100, -50, 110, -50, 110, -44, 100, -44]);
    proximo(r.linhasRotulo, [100, -49, 105, -49]);
    proximo(r.pontosCotados, [102, -48, 107, -47]);
  });

  it('girar 90°: (x, y) → (−y, x) em tudo; z intacto', () => {
    const r = transformTerrain(terreno(), giro90);
    proximo(r.pontos, [-2, 1, 10, -4, 3, 20]);
    proximo(r.curvas[0]!.xy, [0, 0, 0, 4, -3, 4]);
    proximo(r.quebras[0]!.xyz, [-1, 1, 7, -5, 2, 8]);
    proximo(r.borda!, [0, 0, 0, 10, -6, 10, -6, 0]);
    proximo(r.linhasRotulo, [-1, 0, -1, 5]);
    proximo(r.pontosCotados, [-2, 2, -3, 7]);
  });

  it('espelhar em torno do eixo x: y → −y; a borda inverte a ordem e continua anti-horária', () => {
    const r = transformTerrain(terreno(), eixoX);
    proximo(r.pontos, [1, -2, 10, 3, -4, 20]);
    proximo(r.curvas[0]!.xy, [0, 0, 4, 0, 4, -3]);
    proximo(r.quebras[0]!.xyz, [1, -1, 7, 2, -5, 8]);
    proximo(r.linhasRotulo, [0, -1, 5, -1]);
    proximo(r.pontosCotados, [2, -2, 7, -3]);
    // Borda original (0,0)(10,0)(10,6)(0,6), espelhada = (0,0)(10,0)(10,-6)(0,-6) e invertida.
    proximo(r.borda!, [0, -6, 10, -6, 10, 0, 0, 0]);
    expect(normalizarBorda(r.borda!)).toEqual(r.borda);
  });

  it('terreno sem borda continua sem borda; não altera o original', () => {
    const { borda: _b, ...sem } = terreno();
    expect('borda' in transformTerrain(sem, eixoX)).toBe(false);
    const o = terreno();
    transformTerrain(o, giro90);
    expect(o).toEqual(terreno());
  });

  it('pelo comando: mover, girar e espelhar com desfazer e refazer; a cópia leva um terreno novo', () => {
    const s = new ProjectStore(createEmptyProject());
    const { order: _ordem, ...base } = terreno();
    s.exec({ type: 'addTerrain', terrain: base });
    const t0 = structuredClone(s.project.elements['tn1']) as Terrain;
    for (const tr of [mover, giro90, eixoX]) {
      s.exec({ type: 'transform', ids: ['tn1'], transform: tr });
      expect(s.project.elements['tn1']).toEqual({ ...transformTerrain(t0, tr), order: t0.order });
      s.undo();
      expect(s.project.elements['tn1']).toEqual(t0);
      s.redo();
      s.undo();
    }
    s.exec({ type: 'transform', ids: ['tn1'], transform: mover, copy: { idMap: { tn1: 'tn_copia' } } });
    expect(s.project.elements['tn1']).toEqual(t0);
    proximo((s.project.elements['tn_copia'] as Terrain).pontos, [101, -48, 10, 103, -46, 20]);
  });
});

describe('transform da região (A.3 item 5)', () => {
  const regiao = (): TerrainRegion => ({
    ...makeTerrainRegion({ id: 'tr1', levelId: 'lv_0', terrenoId: 'tn1', papel: 'plataforma', cota: 2, inclinacao: 0.05, direcao: 0.5, contorno: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }),
    order: 0,
  });

  it('mover não muda a direção', () => {
    const r = transformTerrainRegion(regiao(), mover);
    proximoV(r.contorno, [{ x: 100, y: -50 }, { x: 104, y: -50 }, { x: 104, y: -47 }]);
    expect(r.direcao).toBe(0.5);
  });

  it('girar soma o ângulo a direcao', () => {
    const r = transformTerrainRegion(regiao(), giro90);
    proximoV(r.contorno, [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: -3, y: 4 }]);
    expect(r.direcao).toBeCloseTo(0.5 + Math.PI / 2, 12);
  });

  it('espelhar em torno de uma linha de ângulo φ: direcao\' = 2φ − direcao e a ordem inverte', () => {
    const r = transformTerrainRegion(regiao(), eixoX);
    expect(r.direcao).toBeCloseTo(-0.5, 12);
    proximoV(r.contorno, [{ x: 4, y: -3 }, { x: 4, y: 0 }, { x: 0, y: 0 }]);
    // Continua anti-horária: a área com sinal é positiva.
    expect(normalizarContorno(r.contorno)).toEqual(r.contorno);
    const diag: Transform = { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } };
    expect(transformTerrainRegion(regiao(), diag).direcao).toBeCloseTo(2 * (Math.PI / 4) - 0.5, 12);
  });

  it('o espelho da direção coincide com o espelho do vetor de subida', () => {
    const r = regiao();
    const a = { x: 0, y: 0 };
    const b = { x: Math.cos(0.7), y: Math.sin(0.7) };
    const out = transformTerrainRegion(r, { kind: 'mirror', a, b });
    // Reflexão do vetor (cos d, sin d) em torno do eixo de ângulo φ.
    const phi = 0.7;
    const v = { x: Math.cos(r.direcao), y: Math.sin(r.direcao) };
    const refl = { x: Math.cos(2 * phi) * v.x + Math.sin(2 * phi) * v.y, y: Math.sin(2 * phi) * v.x - Math.cos(2 * phi) * v.y };
    expect(Math.cos(out.direcao)).toBeCloseTo(refl.x, 12);
    expect(Math.sin(out.direcao)).toBeCloseTo(refl.y, 12);
  });

  it('pelo comando, com desfazer e refazer', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn1', levelId: 'lv_0' }) });
    const { order: _o, ...base } = regiao();
    s.exec({ type: 'addTerrainRegion', regiao: base });
    const r0 = structuredClone(s.project.elements['tr1']) as TerrainRegion;
    for (const tr of [mover, giro90, eixoX]) {
      s.exec({ type: 'transform', ids: ['tr1'], transform: tr });
      expect(s.project.elements['tr1']).toEqual({ ...transformTerrainRegion(r0, tr), order: r0.order });
      s.undo();
      expect(s.project.elements['tr1']).toEqual(r0);
      s.redo();
      s.undo();
    }
  });
});
