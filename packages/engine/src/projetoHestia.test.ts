import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeRoof, makeWall, type Project, type Wall } from '@hestia/model';
import { resolveAllRoofs } from './roofs.ts';
import { wallZRange } from './wallZ.ts';
import { attachTargets } from './attachTargets.ts';
import { entradaCortinaDoProjeto } from './cortinaProjeto.ts';

/**
 * Projeto FICTÍCIO (coordenadas inventadas) que reproduz a situação de um telhado em L com parede cortina sob ele.
 * Contorno (m), anti-horário: P0 (5,0) é o canto reentrante; as arestas e0 (P0-P1) e e4 (P4-P5) são empenas (sem inclinação) e as demais têm 30 %.
 * Beiral em z = 2,8 m (heightOffset), balanço de 0,5 m.
 */
const L_FICTICIO = [
  { x: 5, y: 0 },
  { x: 9, y: 0 },
  { x: 9, y: 5 },
  { x: 0, y: 5 },
  { x: 0, y: -1.5 },
  { x: 5, y: -1.5 },
];

function projetoFicticio(attachTopToRoof = false): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({
    type: 'addRoof',
    roof: makeRoof({
      id: 't_ficticio',
      typeId: 'rt_ceramica',
      levelId: 'lv_0',
      boundary: L_FICTICIO,
      shape: 'edges',
      edgeSlopes: [null, 30, 30, 30, null, 30],
      edgeOverhangs: L_FICTICIO.map(() => 0.5),
      heightOffset: 2.8,
    }),
  });
  // Cortina sob a água da aresta x = 0, de x = 0,5 a x = 2,5 em y = 2,5.
  s.exec({
    type: 'addWall',
    wall: makeWall({ id: 'w_ficticia', typeId: 'wt_cortina_fachada', levelId: 'lv_0', a: { x: 0.5, y: 2.5 }, b: { x: 2.5, y: 2.5 }, attachTopToRoof }),
  });
  return s.project;
}

describe('projeto fictício em L: validação ponta a ponta', () => {
  it('telhado t_ficticio resolve 4 águas limpas, sem águas degeneradas, e identifica o degrau', () => {
    const roofs = resolveAllRoofs(projetoFicticio());
    expect(roofs.length).toBe(1);
    const r = roofs[0]!;
    expect(r.roofId).toBe('t_ficticio');
    expect(r.problem).toBeUndefined();
    expect(r.planes.length).toBe(4);

    for (const pl of r.planes) {
      expect(pl.polygon.length).toBeGreaterThan(0);
      for (const poly of pl.polygon) {
        expect(poly.length).toBeGreaterThan(0);
        for (const ring of poly) {
          expect(ring.length).toBeGreaterThanOrEqual(3);
        }
      }
    }

    // Degrau no canto reentrante (5,0): do lado direito a água da aresta x = 9 (beiral em z = 2,8, 30 %) continua até x = 5, onde
    // z = 2,8 + 0,30 x (9 - 5) = 4,0 m; do lado esquerdo a água da aresta x = 5 está em z = 2,8 m (beiral). Degrau = 4,0 - 2,8 = 1,2 m.
    // Na aresta (4,5;0) a (5;0): zHigh 4,15 (0,30 x 4,5 + 2,8) e zLow 2,95 (0,30 x 0,5 + 2,8): também 1,2 m.
    expect(r.steps).toBeDefined();
    expect(r.steps!.length).toBeGreaterThan(0);
    expect(r.stepGaps).toBeDefined();
    expect(r.stepGaps!.length).toBeGreaterThan(0);
    const gap = r.stepGaps![0]!;
    expect(gap.zHighA - gap.zLowA).toBeCloseTo(1.2, 6);
  });

  it('parede cortina com attachTopToRoof: true adere ao contorno inclinado do telhado', () => {
    const p = projetoFicticio(true);
    const wall = p.elements['w_ficticia'] as Wall;
    expect(wall.typeId).toBe('wt_cortina_fachada');
    expect(wall.attachTopToRoof).toBe(true);

    const roofs = resolveAllRoofs(p);
    const { floors, slabs } = attachTargets(p, [wall], false);
    const wz = wallZRange(p, wall, floors, slabs, roofs);

    expect(wz.profile).toBeDefined();
    expect(wz.profile!.length).toBeGreaterThanOrEqual(2);

    // Em y = 2,5 a água da aresta x = 0 sobe 30 % a partir de x = 0 (z = 2,8): de x = 0,5 a 2,5 a cota vai de
    // 2,8 + 0,30 x 0,5 = 2,95 a 2,8 + 0,30 x 2,5 = 3,55 m, variação de 0,60 m.
    const hs = wz.profile!.map((pt) => pt.h);
    const variacao = Math.max(...hs) - Math.min(...hs);
    expect(variacao).toBeGreaterThan(0.2);
    expect(variacao).toBeCloseTo(0.6, 2);

    // O adaptador do kernel repassa o perfil para o CortinaKernel
    const entrada = entradaCortinaDoProjeto(p);
    const k = entrada.entrada.cortinas.find((c) => c.id === 'w_ficticia');
    expect(k).toBeDefined();
    expect(k!.topProfile).toBeDefined();
    expect(k!.topProfile!.length).toBe(wz.profile!.length);
  });
});
