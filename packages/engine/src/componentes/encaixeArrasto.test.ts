import { describe, expect, it } from 'vitest';
import { posarArrastado } from './encaixeArrasto.ts';
import type { CaixaLocal, Corpo, FaceDeParede, Pose } from './encaixeTipos.ts';

const CAIXA: CaixaLocal = { min: [0, 0, 0], max: [0.6, 0.56, 0.72] };

/** Face do "chão" da planta: a=(0,0)→b=(4,0); sólido em y<0, livre em y>0. */
const FACE: FaceDeParede = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };

function pose(x: number, y: number, rotation = 0): Pose {
  return { x, y, rotation, mirrored: false, z: 0 };
}

const vizinho: Corpo = { id: 'v', pose: pose(0.6, 0.56, Math.PI), caixa: CAIXA };
const alvo: Corpo = { id: 'alvo', pose: pose(0.75, 0.3, 0.02), caixa: CAIXA };

describe('posarArrastado', () => {
  it('com distanciaVizinho 0,2: encosta na parede e desliza até colar no vizinho', () => {
    const r = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, { distanciaParede: 1, distanciaVizinho: 0.2 });
    expect(r.pose.rotation).toBeCloseTo(Math.PI, 9);
    expect(r.pose.y).toBeCloseTo(0.56, 9);
    expect(r.pose.x).toBeCloseTo(1.2, 9);
    expect(r.parede).toBe(0);
    expect(r.vizinho).toBe('v');
    expect(r.colisoes.moveis).toEqual([]);
    expect(r.colisoes.paredes).toEqual([]);
  });

  it('sem distanciaVizinho (0,10 padrão): encaixa só na parede', () => {
    const r = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, { distanciaParede: 1 });
    expect(r.pose.rotation).toBeCloseTo(Math.PI, 9);
    expect(r.pose.y).toBeCloseTo(0.56, 9);
    // Centro local (0,3; 0,28) preservado ao longo da face: 0,75 + 0,3·cos(0,02) − 0,28·sen(0,02) + 0,3.
    expect(r.pose.x).toBeCloseTo(1.3443403753258403, 9);
    expect(r.parede).toBe(0);
    expect(r.vizinho).toBeUndefined();
    expect(r.colisoes.moveis).toEqual([]);
  });

  it('semEncaixe: pose desejada, colisões calculadas e sem guias', () => {
    const r = posarArrastado({ alvo, outros: [vizinho], faces: [FACE] }, { semEncaixe: true });
    expect(r.pose).toEqual(alvo.pose);
    expect(r.parede).toBeUndefined();
    expect(r.vizinho).toBeUndefined();
    expect(r.guias).toEqual([]);
    expect(r.colisoes.moveis).toEqual([]);
  });

  it('alvo longe de tudo: pose igual à desejada, sem encaixe', () => {
    const longe: Corpo = { id: 'longe', pose: pose(10, 5, 0.1), caixa: CAIXA };
    const r = posarArrastado({ alvo: longe, outros: [], faces: [FACE] });
    expect(r.pose).toEqual(longe.pose);
    expect(r.parede).toBeUndefined();
    expect(r.vizinho).toBeUndefined();
    expect(r.guias).toEqual([]);
  });

  it('invade o vizinho e fica fora do alcance de parede e de vizinho: colisão apontada', () => {
    const invadindo: Corpo = { id: 'alvo', pose: pose(0.3, 0.2, 0.5), caixa: CAIXA };
    const r = posarArrastado({ alvo: invadindo, outros: [vizinho], faces: [] });
    expect(r.pose).toEqual(invadindo.pose);
    expect(r.parede).toBeUndefined();
    expect(r.vizinho).toBeUndefined();
    expect(r.colisoes.moveis).toContain('v');
  });

  it('distanciaParede pequena: longe da face não encaixa nem na parede', () => {
    const r = posarArrastado({ alvo, outros: [], faces: [FACE] }, { distanciaParede: 0.3 });
    expect(r.pose).toEqual(alvo.pose);
    expect(r.parede).toBeUndefined();
    expect(r.vizinho).toBeUndefined();
  });
});
