import { describe, expect, it } from 'vitest';
import { frameOfWall, openingGeometry } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Opening, type OpeningType, type Wall } from '@hestia/model';
import { openingPieces } from './openingParts.ts';

/*
 * Recuo do batente no 3D: parede de 0,20 (a=(0,0), b=(6,0)), batente fixo de 0,09. As peças do vão ficam no sistema local
 * (y = s relativo ao plano médio); com `reveal` 0,05 as peças do batente, da folha e do vidro andam -0,05 em y, as do
 * alizar, da verga e do peitoril não.
 */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };

function pecas(tipo: string, reveal?: OpeningType['reveal'], wall: Partial<Wall> = {}): ReturnType<typeof openingPieces> {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  const s = new ProjectStore(base);
  const t = s.project.openingTypes[tipo]!;
  s.exec({ type: 'upsertOpeningType', openingType: { ...t, id: 'ot_x', frameDepthMode: 'fixed', frameDepth: 0.09, ...(reveal ? { reveal } : {}) } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, ...wall }) as Wall });
  s.exec({ type: 'addOpening', opening: { id: 'o', kind: t.kind, typeId: 'ot_x', hostId: 'w', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  const p = s.project;
  const o = p.elements.o as Opening;
  const f = frameOfWall(p, 'w')!;
  return openingPieces(p, o, openingGeometry(p, o, f), f, 3, false);
}

describe('3D: recuo do batente (reveal)', () => {
  for (const tipo of ['ot_p90', 'ot_j120']) {
    it(`${tipo}: reveal 0 não muda nenhuma peça; 0,05 move batente, folha e vidro em -0,05 em y`, () => {
      const a = pecas(tipo);
      expect(pecas(tipo, { depth: 0 })).toEqual(a);
      const b = pecas(tipo, { depth: 0.05 });
      expect(b).toHaveLength(a.length);
      a.forEach((x, i) => {
        const dy = ['casing', 'lintel', 'sillBeam', 'sillBoard'].includes(x.role) ? 0 : -0.05;
        expect(b[i]!.y - x.y, `${x.role}#${i}`).toBeCloseTo(dy, 9);
        [b[i]!.x - x.x, b[i]!.z - x.z, b[i]!.w - x.w, b[i]!.d - x.d, b[i]!.h - x.h].forEach((d) => expect(d).toBeCloseTo(0, 9));
      });
      expect(a.some((x) => x.role === 'jamb' || x.role === 'sillFrame')).toBe(true);
    });
  }

  it('parede curva e inclinada: as peças andam os mesmos -0,05 no sistema local do vão', () => {
    for (const wall of [{ sag: 0.8 }, { tilt: 15 }] as Array<Partial<Wall>>) {
      const a = pecas('ot_j120', undefined, wall).find((x) => x.role === 'glass')!;
      const b = pecas('ot_j120', { depth: 0.05 }, wall).find((x) => x.role === 'glass')!;
      expect(b.y - a.y).toBeCloseTo(-0.05, 9);
    }
  });
});
