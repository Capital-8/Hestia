import { describe, expect, it } from 'vitest';
import type { AlvoComponente3D } from '@hestia/render';
import { deslocamentoGizmoNoEixoM, eixoDoGizmo } from './gizmoComponenteOps.ts';

function alvo(rotation = 0, mirrored = false): AlvoComponente3D {
  return {
    id: 'c1',
    x: 0,
    y: 0,
    z: 0,
    rotation,
    mirrored,
    caixa: { min: [0, 0, 0], max: [0.8, 0.6, 0.9] },
    editavelL: true,
    editavelA: true,
    editavelP: true,
    Lmm: 800,
    Amm: 900,
    Pmm: 600,
  };
}

describe('gizmoComponenteOps (eixos e deslize linear)', () => {
  it('calcula eixo local correto para dim_L, mover_x, mover_y e dim_A', () => {
    const rot90 = Math.PI / 2;
    const eL = eixoDoGizmo(alvo(rot90), 'dim_L');
    expect(eL.x).toBeCloseTo(0, 6);
    expect(eL.y).toBeCloseTo(1, 6);

    const eMx = eixoDoGizmo(alvo(rot90), 'mover_x');
    expect(eMx.x).toBeCloseTo(0, 6);
    expect(eMx.y).toBeCloseTo(-1, 6);

    const eMy = eixoDoGizmo(alvo(0), 'mover_y');
    expect(eMy.x).toBeCloseTo(0, 6);
    expect(eMy.y).toBeCloseTo(-1, 6);

    expect(eixoDoGizmo(alvo(0), 'dim_A')).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('quantiza deslocamento no eixo no passo de 10 mm ou 1 mm', () => {
    const eixo = { x: 1, y: 0, z: 0 };
    expect(deslocamentoGizmoNoEixoM(eixo, { x: 0, y: 0, z: 0 }, { x: 0.124, y: 0.5, z: 0 }, 10)).toBeCloseTo(0.12, 6);
    expect(deslocamentoGizmoNoEixoM(eixo, { x: 0, y: 0, z: 0 }, { x: 0.124, y: 0.5, z: 0 }, 1)).toBeCloseTo(0.124, 6);
  });
});
