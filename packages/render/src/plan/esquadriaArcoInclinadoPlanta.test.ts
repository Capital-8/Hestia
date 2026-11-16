import { describe, expect, it } from 'vitest';
import { levelFrames, openingGeometry } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Opening, type Wall } from '@hestia/model';
import { simboloNaCotaDoCorte } from './tiltOps.ts';

/** P1 (4): em parede em ARCO inclinada o símbolo da planta desloca-se z·tanθ ao longo da normal do CENTRO do vão (tangente do centro). */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
describe('planta: símbolo em arco inclinado', () => {
  it('desloca z·tan15° = 0,2679 (z = 1) ao longo de g.n no centro do vão; porta (padrão inclinado) em arco com w² ≤ 0,4·R', () => {
    const base = createEmptyProject();
    base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
    const s = new ProjectStore(base);
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, sag: 1.5, tilt: 15 }) as Wall });
    s.exec({ type: 'addOpening', opening: { id: 'o', kind: 'door', typeId: 'ot_p80', hostId: 'w', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
    const p = s.project;
    const f = levelFrames(p, 'lv_0').find((x) => x.wall.id === 'w')!;
    const g = openingGeometry(p, p.elements.o as Opening, f);
    expect(g.tiltPlane).toBe('inclinado');
    const d = simboloNaCotaDoCorte(p, g, 1.0);
    expect(Math.hypot(d.center.x - g.center.x, d.center.y - g.center.y)).toBeCloseTo(0.2679, 4);
    expect((d.center.x - g.center.x) * g.n.x + (d.center.y - g.center.y) * g.n.y).toBeCloseTo(0.2679, 4);
  });
});
