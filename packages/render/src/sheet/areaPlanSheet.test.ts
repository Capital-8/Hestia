import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeRoom, makeWall, type AreaPlan, type Sheet } from '@hestia/model';
import { DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS } from '@hestia/model';
import { buildSheetDrawList } from './build.ts';
import { areaPlanPartsOf } from './viewports.ts';

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));

function project(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const pts = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  const plan: AreaPlan = {
    id: 'ap1',
    name: 'Planta de área — Térreo',
    levelId: 'lv_0',
    scale: 50,
    graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } },
    tags: [],
  };
  s.exec({ type: 'addAreaPlan', plan });
  const sheet: Sheet = {
    id: 'sh1',
    number: 'A-101',
    name: 'Plantas de área',
    size: 'A3',
    orientation: 'landscape',
    margin: 10,
    titleBlock: { project: 'Teste', client: '', author: '', date: '29/10/2026', revision: '0' },
    viewports: [
      { id: 'v1', view: { kind: 'areaPlan', planId: 'ap1' }, at: { x: 20, y: 120 }, size: { w: 200, h: 150 }, scale: 50 },
      { id: 'v2', view: { kind: 'areaTable' }, at: { x: 240, y: 120 }, size: { w: 150, h: 150 }, scale: 50 },
    ],
  };
  s.exec({ type: 'addSheet', sheet });
  return s;
}

describe('prancha de área', () => {
  it('resolve a planta de área e o quadro geral', () => {
    const s = project();
    const list = buildSheetDrawList(s.project, 'sh1')!;
    expect(list).toBeTruthy();
    const areaGroup = list.groups[0]!;
    expect(areaGroup.texts.map((t) => t.text)).toContain('Sala');
    expect(areaGroup.texts.map((t) => t.text)).toContain('101 · 20,00 m²');
    const tableGroup = list.groups[1]!;
    expect(tableGroup.texts.map((t) => t.text)).toContain('Quadro geral de áreas');
    expect(tableGroup.texts.map((t) => t.text)).toContain('Total geral');
  });

  it('anotações da vista na prancha mantêm o texto em mm de papel', () => {
    const s = project();
    s.exec({
      type: 'updateAreaPlan',
      id: 'ap1',
      patch: {
        annotations: {
          dimensions: [],
          texts: [{ id: 't1', at: { x: 2, y: 2.5 }, text: 'Nota da vista', height: 3, rotation: 0 }],
          detailLines: [],
          detailRegions: [],
          tags: [],
        },
      },
    });
    const parts = areaPlanPartsOf(s.project, 'ap1', { id: 'v1', view: { kind: 'areaPlan', planId: 'ap1' }, at: { x: 20, y: 20 }, size: { w: 200, h: 150 }, scale: 50 });
    const nota = parts.texts.find((t) => t.text === 'Nota da vista');
    expect(nota).toBeTruthy();
    expect(nota!.sizeMm).toBeCloseTo(3, 9);
  });

  it('a legenda da prancha usa o nome da planta e do quadro', () => {
    const s = project();
    const list = buildSheetDrawList(s.project, 'sh1')!;
    const all = list.groups.flatMap((g) => g.texts.map((t) => t.text));
    expect(all.some((t) => t.startsWith('Planta de área — Térreo · 1:50'))).toBe(true);
    expect(all.some((t) => t.startsWith('Quadro geral de áreas · 1:50'))).toBe(true);
  });
});
