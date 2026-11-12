import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import {
  DEFAULT_AREA_GRAPHICS, ProjectStore, createEmptyProject, emptyTitleBlock, floorViewId, makeWall, resolveViewGraphics, withAreaPlansOfTest, withViewPatchOfTest,
  type AreaPlan, type Dimension, type ElementTag, type Project, type Sheet,
} from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { buildSheetDrawList } from '../sheet/build.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

/**
 * Etapa 7 da regra 4.5 no desenho: a cota some quando um elemento que ela referencia está oculto na vista, e a etiqueta
 * quando o hospedeiro está. O desenho recebe o conjunto de ocultos (Hide in View, temporário) e resolve o alcance e a
 * categoria sozinho; em todos os casos o que depende do oculto sai junto.
 */

const LV = 'lv_0';
const V: Viewport = { cx: 3, cy: 2, zoom: 100, width: 800, height: 600 };
const dim = (id: string, text: string, over: Partial<Dimension> = {}): Dimension => ({ id, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, offset: 1, mode: 'aligned', text, ...over });
const tag = (id: string, hostId: string): ElementTag => ({ id, hostId, at: { x: 3, y: 5 }, property: 'mark' });

/** Sala 6 × 4 (w0 embaixo, w1 à direita, w2 em cima, w3 à esquerda) com cotas presas a w1 e a w3, uma livre e etiquetas de w1 e w2. */
function cena(): Project {
  const s = new ProjectStore(createEmptyProject());
  const c = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
  c.forEach((a, i) => s.exec({ type: 'addWall', wall: { ...makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: LV, a, b: c[(i + 1) % 4]! }), mark: `MK${i}` } }));
  s.exec({ type: 'addDimension', levelId: LV, dimension: dim('d_w1', 'COTA_W1', { refs: { a: { wallId: 'w1', end: 'a' } } }) });
  s.exec({ type: 'addDimension', levelId: LV, dimension: dim('d_w3', 'COTA_W3', { refs: { a: { elementId: 'w3', feature: 'wall-axis-a' } } }) });
  s.exec({ type: 'addDimension', levelId: LV, dimension: dim('d_livre', 'COTA_LIVRE') });
  s.exec({ type: 'addTag', levelId: LV, item: tag('tg_w1', 'w1') });
  s.exec({ type: 'addTag', levelId: LV, item: tag('tg_w2', 'w2') });
  return s.project;
}

function entrada(p: Project, over: Partial<PlanInput> = {}): PlanInput {
  return { project: p, viewId: floorViewId(LV), levelId: LV, resolved: resolveLevel(p, LV, new Map()), below: null, viewport: V, theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: false, ...over };
}

const desenho = (p: Project, over: Partial<PlanInput> = {}): string => JSON.stringify(buildPlanDrawList(entrada(p, over)));
const tem = (saida: string, ...textos: string[]): boolean[] => textos.map((t) => saida.includes(t));

describe('planta de piso: cota e etiqueta somem com o elemento oculto', () => {
  const p = cena();

  it('sem ocultos aparece tudo', () => {
    expect(tem(desenho(p), 'COTA_W1', 'COTA_W3', 'COTA_LIVRE', 'MK1', 'MK2')).toEqual([true, true, true, true, true]);
  });

  it('parede oculta (conjunto de ocultos): somem a cota presa a ela e a etiqueta dela; o resto fica', () => {
    const saida = desenho(p, { hidden: new Set(['w1']) });
    expect(tem(saida, 'COTA_W1', 'MK1')).toEqual([false, false]);
    expect(tem(saida, 'COTA_W3', 'COTA_LIVRE', 'MK2')).toEqual([true, true, true]);
  });

  it('cota presa à parede pela feição (forma nova) some do mesmo jeito', () => {
    const saida = desenho(p, { hidden: new Set(['w3']) });
    expect(tem(saida, 'COTA_W3')).toEqual([false]);
    expect(tem(saida, 'COTA_W1', 'COTA_LIVRE')).toEqual([true, true]);
  });

  it('categoria "parede" desligada nos gráficos da vista: as cotas e etiquetas presas a paredes somem', () => {
    const g = resolveViewGraphics(undefined);
    const q = withViewPatchOfTest(p, floorViewId(LV), { graphics: { ...g, overrides: { ...g.overrides, wall: { ...g.overrides.wall, visible: false } } } });
    const saida = desenho(q);
    expect(tem(saida, 'COTA_W1', 'COTA_W3', 'MK1', 'MK2')).toEqual([false, false, false, false]);
    expect(tem(saida, 'COTA_LIVRE')).toEqual([true]);
  });

  it('parede revelada (Reveal) volta com a cota e a etiqueta', () => {
    const saida = desenho(p, { hidden: new Set(['w1']), revealed: new Set(['w1', 'd_w1', 'tg_w1']) });
    expect(tem(saida, 'COTA_W1', 'MK1')).toEqual([true, true]);
  });

  it('a cota já listada entre os ocultos (o que o editor monta) também some', () => {
    const saida = desenho(p, { hidden: new Set(['w1', 'd_w1', 'tg_w1']) });
    expect(tem(saida, 'COTA_W1', 'MK1')).toEqual([false, false]);
  });
});

describe('planta de área: a cota e a etiqueta da vista somem com o elemento oculto na própria vista', () => {
  const area: AreaPlan = {
    id: 'ap1', name: 'A', levelId: LV, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'light' }, tags: [],
    annotations: { dimensions: [dim('a_w1', 'ACOTA_W1', { refs: { a: { wallId: 'w1', end: 'a' } } }), dim('a_livre', 'ACOTA_LIVRE')], texts: [], detailLines: [], detailRegions: [], tags: [tag('a_tg2', 'w2')] },
  };
  const p = withAreaPlansOfTest(cena(), [area]);
  const planta = (over: Partial<PlanInput> = {}): string => desenho(p, { viewId: 'ap1', ...over });

  it('sem ocultos aparecem', () => {
    expect(tem(planta(), 'ACOTA_W1', 'ACOTA_LIVRE', 'MK2')).toEqual([true, true, true]);
  });

  it('parede oculta: a cota da área presa a ela e a etiqueta (a da vista e a do piso lida pela área) somem', () => {
    const saida = planta({ hidden: new Set(['w1', 'w2']) });
    expect(tem(saida, 'ACOTA_W1')).toEqual([false]);
    expect(tem(saida, 'ACOTA_LIVRE')).toEqual([true]);
    // Duas etiquetas de w2 (a da planta de piso e a cópia da área): nenhuma sai.
    expect(tem(saida, 'MK2')).toEqual([false]);
  });
});

describe('prancha: a vista aparece como é, sem a cota e a etiqueta do que está oculto nela', () => {
  const folha = (viewId: string): Sheet => ({
    id: 'sh1', number: 'A-101', name: 'Planta', size: 'A3', orientation: 'landscape', margin: 10,
    titleBlock: { ...emptyTitleBlock(), project: 'Casa', client: 'Cliente', author: 'Autor', date: '2026-10-22', revision: 'R0' },
    viewports: [{ id: 'v1', view: { kind: 'plan', viewId }, at: { x: 20, y: 20 }, size: { w: 280, h: 190 }, scale: 50 }],
  });
  const naPrancha = (p: Project, viewId: string): string => JSON.stringify(buildSheetDrawList({ ...p, sheets: [folha(viewId)] }, 'sh1'));

  it('planta de piso: Hide in View da parede esconde a cota e a etiqueta presas; outra vista do nível não muda', () => {
    const p = cena();
    const cheia = naPrancha(p, floorViewId(LV));
    expect(tem(cheia, 'COTA_W1', 'COTA_LIVRE', 'MK1')).toEqual([true, true, true]);
    const oculta = withViewPatchOfTest(p, floorViewId(LV), { hidden: { elements: ['w1'] } });
    const saida = naPrancha(oculta, floorViewId(LV));
    expect(tem(saida, 'COTA_W1', 'MK1')).toEqual([false, false]);
    expect(tem(saida, 'COTA_W3', 'COTA_LIVRE', 'MK2')).toEqual([true, true, true]);
  });

  it('planta de área: os ocultos da área valem na área, não os do piso', () => {
    const area: AreaPlan = {
      id: 'ap1', name: 'A', levelId: LV, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'light' }, tags: [],
      annotations: { dimensions: [dim('a_w1', 'ACOTA_W1', { refs: { a: { wallId: 'w1', end: 'a' } } })], texts: [], detailLines: [], detailRegions: [], tags: [] },
    };
    const base = withAreaPlansOfTest(cena(), [area]);
    expect(tem(naPrancha(base, 'ap1'), 'ACOTA_W1')).toEqual([true]);
    const soPiso = withViewPatchOfTest(base, floorViewId(LV), { hidden: { elements: ['w1'] } });
    expect(tem(naPrancha(soPiso, 'ap1'), 'ACOTA_W1')).toEqual([true]);
    const naArea = withViewPatchOfTest(base, 'ap1', { hidden: { elements: ['w1'] } });
    expect(tem(naPrancha(naArea, 'ap1'), 'ACOTA_W1')).toEqual([false]);
  });
});
