import { describe, expect, it } from 'vitest';
import { loteL1, loteL2, projetoLote } from '@hestia/engine';
import { DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS, ProjectStore, makeLevel, type Id, type Project } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { LOTE_TRACO } from './lote.ts';
import { ocultosDoLote } from './loteCamada.ts';
import { buildPlanHoverOverlay, buildPlanSelectionOverlay } from './planOverlay.ts';
import { planFrameUpdateOf } from './planFrame.ts';
import { LIGHT } from './types.ts';

function entrada(p: Project, levelId: Id, over: Partial<PlanInput> = {}): PlanInput {
  return {
    project: p, levelId, resolved: resolveLevel(p, levelId, new Map()), below: null, viewport: { cx: 6, cy: 15, zoom: 20, width: 800, height: 600 },
    theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: false, ...over,
  };
}

/** Os traços do lote na geometria: os tracejados com o padrão do contorno. */
const contornos = (p: Project, levelId: Id, over: Partial<PlanInput> = {}) => buildPlanGeometry(entrada(p, levelId, over)).strokes.filter((s) => s.dash?.[0] === LOTE_TRACO[0] && s.dash?.[1] === LOTE_TRACO[1]);
const textos = (p: Project, levelId: Id, over: Partial<PlanInput> = {}) => buildPlanGeometry(entrada(p, levelId, over)).labels.filter((l) => /^(frente|lateral|fundo) /.test(l.text));

function comNivel1(): Project {
  const s = new ProjectStore(projetoLote());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 1', elevation: 3 }) });
  return s.project;
}

describe('planta: camada do lote', () => {
  it('L1: contorno, edificável e quatro textos na planta do nível do lote', () => {
    const p = projetoLote();
    const g = buildPlanGeometry(entrada(p, 'lv_0'));
    expect(g.strokes).toHaveLength(2);
    expect(contornos(p, 'lv_0')).toHaveLength(1);
    expect(textos(p, 'lv_0')).toHaveLength(4);
  });

  it('L2: contorno de 6 pontos, edificável e seis textos', () => {
    const p = projetoLote(loteL2());
    const g = buildPlanGeometry(entrada(p, 'lv_0'));
    expect(g.strokes).toHaveLength(2);
    expect(g.strokes[0]!.pts).toHaveLength(6);
    expect(textos(p, 'lv_0')).toHaveLength(6);
  });

  it('mostrarEdificavel falso tira só a área edificável', () => {
    const p = projetoLote({ ...loteL1(), mostrarEdificavel: false });
    expect(buildPlanGeometry(entrada(p, 'lv_0')).strokes).toHaveLength(1);
  });

  it('lote de outro nível não aparece na planta ativa', () => {
    const p = comNivel1();
    expect(contornos(p, 'lv_0')).toHaveLength(1);
    expect(contornos(p, 'lv_1')).toHaveLength(0);
    expect(textos(p, 'lv_1')).toHaveLength(0);
    expect(buildPlanGeometry(entrada(p, 'lv_1')).strokes).toHaveLength(0);
  });

  it('categoria lot desligada na vista: o lote some da planta', () => {
    const s = new ProjectStore(projetoLote());
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { lot: { visible: false } } } });
    expect(buildPlanGeometry(entrada(s.project, 'lv_0')).strokes).toHaveLength(0);
    expect(textos(s.project, 'lv_0')).toHaveLength(0);
    // Outra categoria desligada não afeta o lote.
    const s2 = new ProjectStore(projetoLote());
    s2.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { wall: { visible: false } } } });
    expect(buildPlanGeometry(entrada(s2.project, 'lv_0')).strokes).toHaveLength(2);
  });

  it('Hide in View esconde o lote e o Reveal o devolve', () => {
    const p = projetoLote();
    expect(contornos(p, 'lv_0', { hidden: new Set(['lote_l1']) })).toHaveLength(0);
    expect(contornos(p, 'lv_0', { hidden: new Set(['lote_l1']), revealed: new Set(['lote_l1']) })).toHaveLength(1);
    expect(ocultosDoLote(p, 'lv_0', undefined, undefined, true)).toBeUndefined();
    expect([...ocultosDoLote(p, 'lv_0', undefined, undefined, false)!]).toEqual(['lote_l1']);
  });

  it('planta de área não desenha lote', () => {
    const p = projetoLote();
    const g = buildPlanGeometry(entrada(p, 'lv_0', { areaPlan: { id: 'ap1', name: 'Planta de área', levelId: 'lv_0', scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } }, tags: [] } }));
    expect(g.strokes.filter((s) => s.dash?.[0] === LOTE_TRACO[0])).toHaveLength(0);
  });

  it('seleção e hover realçam só o contorno do lote', () => {
    const p = projetoLote();
    const sel = buildPlanSelectionOverlay(entrada(p, 'lv_0', { selection: ['lote_l1'] }));
    expect(sel.strokes.filter((s) => s.color === LIGHT.select && s.closed && s.pts.length === 4)).toHaveLength(1);
    const hov = buildPlanHoverOverlay(entrada(p, 'lv_0', { hover: 'lote_l1' }));
    expect(hov.strokes.filter((s) => s.color === LIGHT.selectHover && s.pts.length === 4)).toHaveLength(1);
    expect(buildPlanSelectionOverlay(entrada(comNivel1(), 'lv_1', { selection: ['lote_l1'] })).strokes).toHaveLength(0);
  });

  it('editar o lote muda a chave da geometria do nível (a planta se refaz)', () => {
    const chave = (p: Project, version: number): string => planFrameUpdateOf({
      project: p, version, levelId: 'lv_0', v: { cx: 0, cy: 0, zoom: 50, width: 800, height: 600 }, theme: LIGHT, dark: false, gpu: true, showGrid: false,
      showUnderlay: false, showRoofProjection: true, thinLines: false, selection: [], hover: null, preview: [], inference: null, resolve: (id: Id) => resolveLevel(p, id, new Map()),
    }).geometryKey;
    const p0 = projetoLote();
    const s = new ProjectStore(p0);
    s.exec({ type: 'updateLot', id: 'lote_l1', patch: { mostrarEdificavel: false } });
    expect(chave(s.project, 2)).not.toBe(chave(p0, 1));
  });
});
