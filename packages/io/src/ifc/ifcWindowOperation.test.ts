import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore, type Opening } from '@hestia/model';
import { exportIfc, windowOperation } from './ifcExport.ts';
import type { IfcGeometry } from './ifcTypes.ts';

describe('operação IFC das famílias novas de janela', () => {
  it('janela de abrir: SIDEHUNG à esquerda ou à direita conforme flipHand', () => {
    expect(windowOperation({ plan: 'hinged' }, false)).toBe('SIDEHUNGLEFTHAND');
    expect(windowOperation({ plan: 'hinged' }, true)).toBe('SIDEHUNGRIGHTHAND');
  });

  it('guilhotina: SLIDINGVERTICAL', () => {
    expect(windowOperation({ plan: 'hung' }, false)).toBe('SLIDINGVERTICAL');
  });

  it('pivotante: PIVOTVERTICAL (eixo vertical)', () => {
    expect(windowOperation({ plan: 'pivotwin' }, false)).toBe('PIVOTVERTICAL');
  });

  it('veneziana: OTHEROPERATION (TILTANDTURN é giro com basculamento, não veneziana)', () => {
    expect(windowOperation({ plan: 'louver' }, false)).toBe('OTHEROPERATION');
    expect(windowOperation({ plan: 'louver' }, true)).toBe('OTHEROPERATION');
  });

  it('mantém o mapeamento das famílias antigas', () => {
    expect(windowOperation({ plan: 'casement' }, false)).toBe('TOPHUNG');
    expect(windowOperation({ plan: 'tilt' }, false)).toBe('PIVOTHORIZONTAL');
    expect(windowOperation({ plan: 'sliding' }, false)).toBe('SLIDINGHORIZONTAL');
    expect(windowOperation({ plan: 'fixed' }, false)).toBe('FIXEDCASEMENT');
  });

  it('o exportador grava a operação no IFCWINDOWPANELPROPERTIES da janela', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    const opening: Opening = { id: 'v', kind: 'window', typeId: 'ot_ja120', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
    store.exec({ type: 'addOpening', opening });
    const p = store.project;
    const th = 0.184;
    const geo: IfcGeometry = {
      walls: [{ wallId: 'w', footprints: [[[{ x: 0, y: -th / 2 }, { x: 4, y: -th / 2 }, { x: 4, y: th / 2 }, { x: 0, y: th / 2 }]]], baseZ: 0, height: 2.8 }],
      openings: [{ openingId: 'v', center: { x: 2, y: 0 }, u: { x: 1, y: 0 }, width: 1.2, height: 1.2, roughWidth: 1.2, roughHeight: 1.2, roughBottomZ: 1.1, sillZ: 1.1, thickness: th }],
      floors: [],
      slabs: [],
      roofs: [],
      stairs: [],
    };
    const texto = exportIfc(p, geo, { timestamp: '2026-01-01T00:00:00' });
    expect(texto).toContain('IFCWINDOWPANELPROPERTIES');
    expect(texto).toContain('IFCRELDEFINESBYPROPERTIES');
    expect(texto).toContain('.SIDEHUNGLEFTHAND.');
  });
});
