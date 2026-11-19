import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import type { Project, Wall } from '@hestia/model';
import { resolveAllRoofs } from './roofs.ts';
import { wallZRange } from './wallZ.ts';
import { attachTargets } from './attachTargets.ts';
import { entradaCortinaDoProjeto } from './cortinaProjeto.ts';

describe('projeto.hestia.json validação ponta a ponta', () => {
  const raw = fs.readFileSync(path.resolve(__dirname, '../../../projeto.hestia.json'), 'utf8');
  const proj: Project = JSON.parse(raw);

  it('telhado t_d74554d41kv resolve 4 águas limpas, sem filetes degenerados, e identifica degrau', () => {
    const roofs = resolveAllRoofs(proj);
    expect(roofs.length).toBe(1);
    const r = roofs[0]!;
    expect(r.roofId).toBe('t_d74554d41kv');

    // 4 águas válidas cobrindo toda a pegada
    expect(r.planes.length).toBe(4);

    // Nenhuma água degenerada ou nula
    for (const pl of r.planes) {
      expect(pl.polygon.length).toBeGreaterThan(0);
      for (const poly of pl.polygon) {
        expect(poly.length).toBeGreaterThan(0);
        for (const ring of poly) {
          expect(ring.length).toBeGreaterThanOrEqual(3);
        }
      }
    }

    // Identifica o degrau vertical (step gap de ~0.83 m) no encontro reflexo
    expect(r.steps).toBeDefined();
    expect(r.steps!.length).toBeGreaterThan(0);
    expect(r.stepGaps).toBeDefined();
    expect(r.stepGaps!.length).toBeGreaterThan(0);
    const gap = r.stepGaps![0]!;
    const stepHeight = gap.zHighA - gap.zLowA;
    expect(stepHeight).toBeCloseTo(0.83, 1);
  });

  it('parede cortina w_650b03241kj com attachTopToRoof: true adere ao contorno inclinado do telhado', () => {
    // Clona o projeto e ativa attachTopToRoof na cortina
    const p: Project = JSON.parse(raw);
    const wall = p.elements['w_650b03241kj'] as Wall;
    expect(wall).toBeDefined();
    expect(wall.typeId).toBe('wt_cortina_fachada');
    wall.attachTopToRoof = true;

    const roofs = resolveAllRoofs(p);
    const { floors, slabs } = attachTargets(p, [wall], false);
    const wz = wallZRange(p, wall, floors, slabs, roofs);

    // wz deve conter um perfil de topo inclinado com vértices
    expect(wz.profile).toBeDefined();
    expect(wz.profile!.length).toBeGreaterThanOrEqual(2);

    // O topo não é plano (alturas diferentes ao longo do eixo sob as águas do telhado)
    const hs = wz.profile!.map((pt) => pt.h);
    const minH = Math.min(...hs);
    const maxH = Math.max(...hs);
    expect(maxH - minH).toBeGreaterThan(0.2); // Pelo menos 20 cm de variação inclinada

    // O adaptador do kernel repassa o perfil para o CortinaKernel
    const entrada = entradaCortinaDoProjeto(p);
    const k = entrada.entrada.cortinas.find((c) => c.id === 'w_650b03241kj');
    expect(k).toBeDefined();
    expect(k!.topProfile).toBeDefined();
    expect(k!.topProfile!.length).toBe(wz.profile!.length);
  });
});
