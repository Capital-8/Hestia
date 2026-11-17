import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore, type Opening, type OpeningType } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';

/**
 * Bug P1: o tipo com composição autoral ignorava largura/altura do diálogo. O vão do furo (roughWidth/roughHeight) tem de
 * mudar +0,40 (altura da porta com bandeira) e +0,15 (largura da porta com lateral), igual em parede reta, curva e inclinada.
 */
type Parede = { sag?: number; tilt?: number };

function vao(typeId: string, patch: Partial<OpeningType>, parede: Parede): { w: number; h: number } {
  const s = new ProjectStore(createEmptyProject());
  const base = s.project.openingTypes[typeId]!;
  s.exec({ type: 'upsertOpeningType', openingType: { ...base, ...patch } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, ...parede }) });
  s.exec({
    type: 'addOpening',
    opening: { id: 'v', kind: 'door', typeId, hostId: 'w', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' },
  });
  const g = openingGeometry(s.project, s.project.elements.v as Opening, frameOfWall(s.project, 'w')!);
  return { w: g.width, h: g.height };
}

const paredes: Array<[string, Parede]> = [['reta', {}], ['curva (sag 1)', { sag: 1 }], ['inclinada (tilt 10)', { tilt: 10 }]];

describe('vão do tipo com composição autoral, em parede reta, curva e inclinada', () => {
  for (const [nome, parede] of paredes) {
    it(`ot_pband40_90 altura 2,10 -> 2,50: +0,40 de altura, largura igual (${nome})`, () => {
      const a = vao('ot_pband40_90', {}, parede);
      const b = vao('ot_pband40_90', { height: 2.5 }, parede);
      expect(b.h - a.h).toBeCloseTo(0.4, 6);
      expect(b.w - a.w).toBeCloseTo(0, 9);
    });
    it(`ot_plat40e_80 largura 0,80 -> 0,95: +0,15 de largura, altura igual (${nome})`, () => {
      const a = vao('ot_plat40e_80', {}, parede);
      const b = vao('ot_plat40e_80', { width: 0.95 }, parede);
      expect(b.w - a.w).toBeCloseTo(0.15, 6);
      expect(b.h - a.h).toBeCloseTo(0, 9);
    });
  }

  it('o vão do tipo (largura e altura) é o mesmo nas três paredes', () => {
    const [reta, curva, inclinada] = paredes.map(([, p]) => vao('ot_pband40_90', { height: 2.5 }, p));
    expect(curva).toEqual(reta);
    expect(inclinada).toEqual(reta);
  });
});
