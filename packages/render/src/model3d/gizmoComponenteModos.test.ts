import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GizmoComponente3D } from './gizmoComponente3d.ts';
import type { AlvoComponente3D } from './gizmoComponenteTipos.ts';

/** Caixa 0,6 x 0,5 x 0,7 m na origem, sem rotação: centro (0,3; 0,25; 0,35). */
const ALVO: AlvoComponente3D = {
  id: 'c1', x: 0, y: 0, z: 0, rotation: 0, mirrored: false,
  caixa: { min: [0, 0, 0], max: [0.6, 0.5, 0.7] },
  editavelL: true, editavelA: true, editavelP: true, Lmm: 600, Amm: 700, Pmm: 500,
};

/** Câmera olhando reto para baixo sobre (x, y): o centro da tela atinge exatamente esse ponto. */
function pickEm(g: GizmoComponente3D, x: number, y: number): string | null {
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(x, y, 10);
  cam.up.set(0, 1, 0);
  cam.lookAt(x, y, 0);
  cam.updateMatrixWorld(true);
  return g.pick(cam, { x: 0, y: 0 })?.alca ?? null;
}

function alcasDosObjetos(g: GizmoComponente3D): string[] {
  return g.group.children.map((o) => o.userData.gizmoAlca as string | undefined).filter((a): a is string => !!a);
}

describe('GizmoComponente3D: modos', () => {
  it('mover (padrão): nenhum objeto dim_* existe e nenhum clique devolve dim_*', () => {
    const g = new GizmoComponente3D();
    g.atualizar(ALVO);
    expect(alcasDosObjetos(g).some((a) => a.startsWith('dim_'))).toBe(false);
    // sobre onde ficariam: L em x 0,7075; P em y -0,1075; A no centro, acima da caixa.
    expect(pickEm(g, 0.7075, 0.25)).toBeNull();
    expect(String(pickEm(g, 0.3, -0.1075))).not.toMatch(/^dim_/);
    expect(pickEm(g, 0.3, 0.25)).toBe('mover_xy');
    expect(pickEm(g, 0.3 + 0.5, 0.25)).toBe('girar');
  });

  it('redimensionar: só dim_*; mover e girar não existem nem são pegos', () => {
    const g = new GizmoComponente3D();
    g.atualizar(ALVO, undefined, 'redimensionar');
    const alcas = alcasDosObjetos(g).sort();
    expect(alcas).toEqual(['dim_A', 'dim_L', 'dim_P']);
    expect(pickEm(g, 0.7075, 0.25)).toBe('dim_L');
    expect(pickEm(g, 0.3, -0.1075)).toBe('dim_P');
    expect(pickEm(g, 0.3, 0.25)).toBe('dim_A');
    // onde ficavam o pad, a seta frontal, o lado esquerdo e o anel: nada de mover/girar
    for (const [x, y] of [[0.3, 0.25], [0.3, -0.11], [-0.1, 0.25], [0.8, 0.25], [0.3, 0.75]] as const) {
      expect(String(pickEm(g, x, y))).not.toMatch(/^(mover_|girar)/);
    }
  });

  it('redimensionar respeita editavel*: sem L, o gizmo não oferece dim_L', () => {
    const g = new GizmoComponente3D();
    g.atualizar({ ...ALVO, editavelL: false }, undefined, 'redimensionar');
    expect(alcasDosObjetos(g).sort()).toEqual(['dim_A', 'dim_P']);
  });
});
