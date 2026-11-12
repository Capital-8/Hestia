import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS, FLOOR_PROFILE_LAYERS, floorViewId, ProjectStore, createEmptyProject, emptyTitleBlock, migrateProject, planAnnotationIds,
  resolveFloorProfile, resolveViewProfile, validateProject, type AreaPlan, type AreaPlanGraphics, type Project, type Sheet,
} from './index.ts';
import { areaPlansOf } from './index.ts';

const plan = (id: string, over: Partial<AreaPlan> = {}): AreaPlan => ({ id, name: id, levelId: 'lv_0', scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS }, tags: [], ...over });
const sheet = (viewports: Sheet['viewports'], id = 'sh1'): Sheet => ({ id, number: 'A-1', name: 'P', size: 'A3', orientation: 'landscape', margin: 10, titleBlock: emptyTitleBlock(), viewports });
const vpArea = (id: string, planId: string): Sheet['viewports'][number] => ({ id, view: { kind: 'plan', viewId: planId }, at: { x: 20, y: 20 }, size: { w: 100, h: 80 }, scale: 100 });

describe('resolveViewProfile', () => {
  it('preset area equivale ao comportamento atual (padrão)', () => {
    const r = resolveViewProfile(plan('a'));
    expect(r.graphics).toEqual(DEFAULT_AREA_GRAPHICS);
    expect(r.scale).toBe(50);
    expect(r.layers).toEqual({
      walls: 'light', openings: false, floors: false, dimensions: true, texts: true, detail: true, tags: true,
      grids: false, sectionMarks: false, rooms: true, referenceLines: true, underlay: false, roofProjection: false,
    });
  });

  it('graphics parcial, tagDefault parcial e lixo nunca geram undefined', () => {
    const parcial = { fill: 'hatch', tagDefault: { leader: 'kinked' }, showGrids: undefined } as unknown as AreaPlanGraphics;
    const r = resolveViewProfile(plan('a', { graphics: parcial, scale: NaN }));
    expect(r.graphics.fill).toBe('hatch');
    expect(r.graphics.tagDefault).toEqual({ leader: 'kinked', fields: DEFAULT_AREA_GRAPHICS.tagDefault.fields, orientation: 'horizontal' });
    expect(r.graphics.outline).toBe('thin');
    expect(r.scale).toBe(50);
    expect(Object.values(r.graphics).every((v) => v !== undefined)).toBe(true);
    expect(resolveViewProfile({ graphics: undefined as never }).graphics).toEqual(DEFAULT_AREA_GRAPHICS);
    expect(resolveViewProfile(null).layers.walls).toBe('light');
  });

  it('opções do usuário mudam as camadas; não compartilha a lista de campos com o padrão', () => {
    const r = resolveViewProfile(plan('a', { graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'hidden', referenceLines: 'never', showGrids: true } }));
    expect(r.layers.walls).toBe('hidden');
    expect(r.layers.referenceLines).toBe(false);
    expect(r.layers.grids).toBe(true);
    r.graphics.tagDefault.fields.push('custom');
    expect(DEFAULT_AREA_GRAPHICS.tagDefault.fields).not.toContain('custom');
  });

  it('piso é constante identidade', () => {
    expect(resolveFloorProfile().layers).toBe(FLOOR_PROFILE_LAYERS);
  });
});

describe('migração v21 → v22', () => {
  const v21 = (): Record<string, unknown> => {
    const b = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    b.schemaVersion = 21;
    b.areaPlans = [
      { id: 'a1', name: 'A1', levelId: 'lv_0', graphics: { fill: 'scheme', tagDefault: { leader: 'none' } } },
      { id: 'a2', name: 'A2', levelId: 'lv_0', scale: 100, tags: [], graphics: { ...DEFAULT_AREA_GRAPHICS }, annotations: {} },
    ];
    return b;
  };

  it('completa graphics, scale e tags, preserva annotations e é idempotente', () => {
    const p = migrateProject(v21());
    const a1 = areaPlansOf(p)[0]!;
    const a2 = areaPlansOf(p)[1]!;
    expect(p.schemaVersion).toBe(24);
    expect(a1.graphics.fill).toBe('scheme');
    expect(a1.graphics.tagDefault).toEqual({ leader: 'none', fields: DEFAULT_AREA_GRAPHICS.tagDefault.fields, orientation: 'horizontal' });
    expect(a1.scale).toBe(50);
    expect(a1.tags).toEqual([]);
    // Esquema 24: não há herança; a vista tem sempre o conjunto próprio (a1 herdava do nível, que não tem anotações).
    expect(a1.annotations).toEqual({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] });
    expect(a2.annotations).toEqual({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] });
    expect(a2.scale).toBe(100);
    expect(migrateProject(JSON.parse(JSON.stringify(p))).planViews).toEqual(p.planViews);
  });

  it('projeto sem areaPlans migra sem erro', () => {
    const b = v21();
    delete b.areaPlans;
    expect(areaPlansOf(migrateProject(b))).toEqual([]);
  });
});

describe('regra única de anotações', () => {
  it('sem herança (v24): todo conjunto é próprio; planAnnotationIds({}) não lança', () => {
    expect(planAnnotationIds({ annotations: {} as never })).toEqual([]);
    expect(planAnnotationIds({ annotations: { texts: [{ id: 't' }] } as never })).toEqual(['t']);
  });
});

describe('pranchas e vistas de área', () => {
  it('addViewport recusa areaPlan inexistente e aceita existente', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addAreaPlan', plan: plan('ap1') });
    s.exec({ type: 'addSheet', sheet: sheet([]) });
    expect(() => s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vpArea('v0', 'nada') })).toThrow(/Vista inexistente/);
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vpArea('v1', 'ap1') });
    expect(s.project.sheets![0]!.viewports).toHaveLength(1);
  });

  it('removeAreaPlan remove as viewports órfãs e um undo restaura tudo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addAreaPlan', plan: plan('ap1') });
    s.exec({ type: 'addAreaPlan', plan: plan('ap2') });
    s.exec({ type: 'addSheet', sheet: sheet([vpArea('v1', 'ap1'), vpArea('v2', 'ap2')]) });
    s.exec({ type: 'removeAreaPlan', id: 'ap1' });
    expect(s.project.sheets![0]!.viewports.map((v) => v.id)).toEqual(['v2']);
    s.undo();
    expect(s.project.sheets![0]!.viewports.map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(areaPlansOf(s.project).map((a) => a.id)).toEqual(['ap1', 'ap2']);
  });

  it('deleteLevel leva planta de área e viewports (de piso e de área) num só undo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'upsertLevel', level: { ...s.project.levels[0]!, id: 'lv_x', name: 'X', elevation: 3 } });
    s.exec({ type: 'addAreaPlan', plan: plan('apx', { levelId: 'lv_x' }) });
    const planV = (id: string, levelId: string): Sheet['viewports'][number] => ({ ...vpArea(id, 'x'), view: { kind: 'plan', viewId: floorViewId(levelId) } });
    s.exec({ type: 'addSheet', sheet: sheet([vpArea('v1', 'apx'), planV('v2', 'lv_x'), planV('v3', 'lv_0')]) });
    s.exec({ type: 'deleteLevel', id: 'lv_x' });
    expect(s.project.sheets![0]!.viewports.map((v) => v.id)).toEqual(['v3']);
    s.undo();
    expect(s.project.sheets![0]!.viewports).toHaveLength(3);
    expect(areaPlansOf(s.project).map((a) => a.id)).toContain('apx');
  });

  it('arquivo com viewport órfã abre sem lançar e a validação reporta', () => {
    const b = JSON.parse(JSON.stringify(createEmptyProject())) as Project;
    b.sheets = [sheet([vpArea('v1', 'sumiu')])];
    const p = migrateProject(b);
    expect(() => validateProject(p)).not.toThrow();
    expect(validateProject(p).some((i) => i.code === 'sheet-view-missing')).toBe(true);
  });
});
