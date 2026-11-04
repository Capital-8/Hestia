import { describe, expect, it } from 'vitest';
import type { Pose } from './encaixeTipos.ts';
import { posarGrupoRigido } from './encaixeGrupo.ts';

/** Pose de teste com os campos que o movimento rígido não altera. */
function pose(x: number, y: number, rotation = 0): Pose {
  return { x, y, rotation, mirrored: false, z: 0 };
}

describe('posarGrupoRigido', () => {
  it('sem giro só translada os membros junto com o líder', () => {
    const iniciais = new Map([
      ['a', pose(0, 0)],
      ['b', pose(1, 0)],
    ]);
    const poses = posarGrupoRigido({ lider: 'a', iniciais, poseFinalDoLider: pose(2, 3) });
    expect(poses.get('a')).toEqual({ x: 2, y: 3, rotation: 0 });
    expect(poses.get('b')).toEqual({ x: 3, y: 3, rotation: 0 });
  });

  it('giro de π/2 leva o vizinho em (+1, 0) do líder para (0, +1) do líder final', () => {
    const iniciais = new Map([
      ['a', pose(0, 0)],
      ['b', pose(1, 0)],
    ]);
    const poses = posarGrupoRigido({ lider: 'a', iniciais, poseFinalDoLider: pose(5, 5, Math.PI / 2) });
    expect(poses.get('a')).toEqual({ x: 5, y: 5, rotation: Math.PI / 2 });
    expect(poses.get('b')?.x).toBeCloseTo(5, 9);
    expect(poses.get('b')?.y).toBeCloseTo(6, 9);
    expect(poses.get('b')?.rotation).toBeCloseTo(Math.PI / 2, 9);
  });

  it('com só o líder devolve apenas a pose final dele', () => {
    const iniciais = new Map([['a', pose(1, 2, 0.3)]]);
    const poses = posarGrupoRigido({ lider: 'a', iniciais, poseFinalDoLider: pose(4, 5, 0.8) });
    expect([...poses.keys()]).toEqual(['a']);
    expect(poses.get('a')).toEqual({ x: 4, y: 5, rotation: 0.8 });
  });

  it('lança quando o líder não está nas poses iniciais', () => {
    const iniciais = new Map([['a', pose(0, 0)]]);
    expect(() => posarGrupoRigido({ lider: 'x', iniciais, poseFinalDoLider: pose(1, 1) })).toThrow(/Líder/);
  });
});
