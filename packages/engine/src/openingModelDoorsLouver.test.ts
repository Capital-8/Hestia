import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, ProjectStore, createEmptyProject, makeWall, type Opening, type OpeningShape } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import type { OpeningModel } from './openingModelTypes.ts';

/** docs/estudo-esquadrias/38: as aletas da folha de veneziana saem da folha; embutidas, a porta parecia chapa lisa (com ou sem forma). */
function modelo(shape?: OpeningShape): OpeningModel {
  const base = DEFAULT_OPENING_TYPES.find((t) => t.id === 'ot_pgiro90')!;
  const { shape: _s, ...sem } = base;
  void _s;
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertOpeningType', openingType: { ...sem, id: 'ot_v', leafStyle: 'louver', ...(shape ? { shape } : {}) } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: 'door', typeId: 'ot_v', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  const p = s.project;
  const f = frameOfWall(p, 'w')!;
  return buildOpeningModel(p, p.elements.v as Opening, openingGeometry(p, p.elements.v as Opening, f), f);
}

describe('porta de veneziana: aletas visíveis', () => {
  for (const [nome, shape] of [['sem forma', undefined], ['arco pleno', { kind: 'round', width: 0.9, height: 2.1 } as OpeningShape]] as const) {
    it(`${nome}: cada aleta passa da face da folha nos dois lados`, () => {
      const m = modelo(shape);
      const folha = m.parts.find((q) => q.role === 'leaf')!;
      const aletas = m.parts.filter((q) => q.role === 'leafPanel');
      expect(aletas.length).toBeGreaterThan(20);
      for (const a of aletas) {
        expect(a.box.s0).toBeLessThan(folha.box.s0 - 0.005);
        expect(a.box.s1).toBeGreaterThan(folha.box.s1 + 0.005);
      }
    });
  }
});
