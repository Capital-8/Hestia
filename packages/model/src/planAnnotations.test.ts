import { describe, expect, it } from 'vitest';
import {
  annotationIdsInView,
  annotationRemovals,
  createEmptyProject,
  levelDimensions,
  levelTexts,
  makeRoom,
  planAnnotationIds,
  planAnnotationsOf,
  ProjectStore,
  validateProject,
  DEFAULT_AREA_GRAPHICS,
  type AreaPlan,
  type DetailLine,
  type DetailRegion,
  type Dimension,
  type ElementTag,
  type TextNote,
} from './index.ts';
import { areaPlansOf, floorViewId, viewAnnotationsOf } from './index.ts';

const LV0 = 'lv_0';

const plan = (id: string, over: Partial<AreaPlan> = {}): AreaPlan => ({
  id,
  name: `Planta de área ${id}`,
  levelId: LV0,
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } },
  tags: [],
  ...over,
});

const dim = (id: string, over: Partial<Dimension> = {}): Dimension => ({ id, a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 0.8, ...over });
const txt = (id: string, over: Partial<TextNote> = {}): TextNote => ({ id, at: { x: 1, y: 1 }, text: 'Sala', height: 2.5, rotation: 0, ...over });
const detailLine = (id: string): DetailLine => ({ id, a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, style: 'dashed' });
const detailRegion = (id: string): DetailRegion => ({ id, boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] });
const tag = (id: string, over: Partial<ElementTag> = {}): ElementTag => ({ id, hostId: 'r1', at: { x: 2, y: 2 }, property: 'name', ...over });

/** Projeto com um ambiente (r1) e uma planta de área (ap1) no nível lv_0. */
function withPlan(extraPlans: AreaPlan[] = []): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: LV0, name: 'Sala', number: '101', point: { x: 2, y: 1.5 } }) });
  s.exec({ type: 'addAreaPlan', plan: plan('ap1') });
  for (const p of extraPlans) s.exec({ type: 'addAreaPlan', plan: p });
  return s;
}

const planById = (s: ProjectStore, id: string): AreaPlan => areaPlansOf(s.project).find((p) => p.id === id)!;

describe('anotações por vista (planta de área)', () => {
  it('com planId, cota, texto, detalhe e etiqueta ficam na planta e o nível fica limpo', () => {
    const s = withPlan();
    s.exec({ type: 'addDimension', levelId: LV0, planId: 'ap1', dimension: dim('d1') });
    s.exec({ type: 'addText', levelId: LV0, planId: 'ap1', text: txt('t1') });
    s.exec({ type: 'addDetailLine', levelId: LV0, planId: 'ap1', item: detailLine('dl1') });
    s.exec({ type: 'addDetailRegion', levelId: LV0, planId: 'ap1', item: detailRegion('dr1') });
    s.exec({ type: 'addTag', levelId: LV0, planId: 'ap1', item: tag('tag1') });

    const a = planAnnotationsOf(planById(s, 'ap1'));
    expect(a.dimensions.map((x) => x.id)).toEqual(['d1']);
    expect(a.texts.map((x) => x.id)).toEqual(['t1']);
    expect(a.detailLines.map((x) => x.id)).toEqual(['dl1']);
    expect(a.detailRegions.map((x) => x.id)).toEqual(['dr1']);
    expect(a.tags.map((x) => x.id)).toEqual(['tag1']);

    expect(levelDimensions(s.project, LV0)).toHaveLength(0);
    expect(levelTexts(s.project, LV0)).toHaveLength(0);
    const piso = viewAnnotationsOf(s.project, floorViewId(LV0));
    expect(piso.detailLines).toHaveLength(0);
    expect(piso.detailRegions).toHaveLength(0);
    expect(piso.tags).toHaveLength(0);
  });

  it('sem planId, a anotação continua no nível (planta de piso)', () => {
    const s = withPlan();
    s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('d1') });
    s.exec({ type: 'addText', levelId: LV0, text: txt('t1') });
    s.exec({ type: 'addTag', levelId: LV0, item: tag('tag1') });

    expect(levelDimensions(s.project, LV0).map((x) => x.id)).toEqual(['d1']);
    expect(levelTexts(s.project, LV0).map((x) => x.id)).toEqual(['t1']);
    expect(viewAnnotationsOf(s.project, floorViewId(LV0)).tags.map((x) => x.id)).toEqual(['tag1']);
    const a = planAnnotationsOf(planById(s, 'ap1'));
    expect([...a.dimensions, ...a.texts, ...a.tags]).toHaveLength(0);
  });

  it('atualiza e remove a anotação da planta sem tocar no nível', () => {
    const s = withPlan();
    s.exec({ type: 'addDimension', levelId: LV0, planId: 'ap1', dimension: dim('d1') });
    s.exec({ type: 'updateDimension', levelId: LV0, planId: 'ap1', id: 'd1', patch: { offset: 1.5 } });
    expect(planAnnotationsOf(planById(s, 'ap1')).dimensions[0]!.offset).toBe(1.5);
    expect(levelDimensions(s.project, LV0)).toHaveLength(0);

    s.exec({ type: 'removeDimension', levelId: LV0, planId: 'ap1', id: 'd1' });
    expect(planAnnotationsOf(planById(s, 'ap1')).dimensions).toHaveLength(0);

    s.exec({ type: 'addText', levelId: LV0, planId: 'ap1', text: txt('t1') });
    s.exec({ type: 'updateText', levelId: LV0, planId: 'ap1', id: 't1', patch: { text: 'Quarto' } });
    expect(planAnnotationsOf(planById(s, 'ap1')).texts[0]!.text).toBe('Quarto');
    s.exec({ type: 'removeText', levelId: LV0, planId: 'ap1', id: 't1' });
    expect(planAnnotationsOf(planById(s, 'ap1')).texts).toHaveLength(0);
  });

  it('recusa atualizar anotação que está no nível, não na planta', () => {
    const s = withPlan();
    s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('d1') });
    expect(() => s.exec({ type: 'updateDimension', levelId: LV0, planId: 'ap1', id: 'd1', patch: { offset: 2 } })).toThrow('Cota inexistente');
    expect(levelDimensions(s.project, LV0)[0]!.offset).toBe(0.8);
  });

  it('recusa planta inexistente e planta de outro nível', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'upsertLevel', level: { id: 'lv_9', name: 'Pav. 9', elevation: 9 } });
    s.exec({ type: 'addAreaPlan', plan: plan('ap1', { levelId: 'lv_9' }) });
    expect(() => s.exec({ type: 'addDimension', levelId: LV0, planId: 'ap1', dimension: dim('d1') })).toThrow('não pertence ao nível');
    expect(() => s.exec({ type: 'addDimension', levelId: LV0, planId: 'ap_nao', dimension: dim('d1') })).toThrow('Planta de área inexistente');
  });

  it('duas plantas do mesmo nível têm anotações independentes', () => {
    const s = withPlan([plan('ap2')]);
    s.exec({ type: 'addDimension', levelId: LV0, planId: 'ap1', dimension: dim('d1') });
    s.exec({ type: 'addText', levelId: LV0, planId: 'ap1', text: txt('t1') });
    s.exec({ type: 'addDimension', levelId: LV0, planId: 'ap2', dimension: dim('d2') });

    expect(planAnnotationIds(planById(s, 'ap1'))).toEqual(['d1', 't1']);
    expect(planAnnotationIds(planById(s, 'ap2'))).toEqual(['d2']);
    expect(levelDimensions(s.project, LV0)).toHaveLength(0);
  });

  it('planAnnotationIds devolve cotas, textos, detalhes e etiquetas da planta', () => {
    const s = withPlan();
    s.exec({ type: 'addDimension', levelId: LV0, planId: 'ap1', dimension: dim('d1') });
    s.exec({ type: 'addText', levelId: LV0, planId: 'ap1', text: txt('t1') });
    s.exec({ type: 'addDetailLine', levelId: LV0, planId: 'ap1', item: detailLine('dl1') });
    s.exec({ type: 'addDetailRegion', levelId: LV0, planId: 'ap1', item: detailRegion('dr1') });
    s.exec({ type: 'addTag', levelId: LV0, planId: 'ap1', item: tag('tag1') });
    expect(planAnnotationIds(planById(s, 'ap1'))).toEqual(['d1', 't1', 'dl1', 'dr1', 'tag1']);
  });

  it('annotationIdsInView inclui a planta só quando o planId é dado', () => {
    const s = withPlan();
    s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('dn') });
    s.exec({ type: 'addDimension', levelId: LV0, planId: 'ap1', dimension: dim('dp') });

    expect(annotationIdsInView(s.project, LV0)).toEqual(['dn']);
    expect(annotationIdsInView(s.project, LV0, 'ap1')).toEqual(['dn', 'dp']);
    expect(annotationIdsInView(s.project, LV0, 'ap_nao')).toEqual(['dn']);
  });

  it('annotationRemovals com planId gera remoções na planta e no nível', () => {
    const s = withPlan();
    s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('dn') });
    s.exec({ type: 'addDimension', levelId: LV0, planId: 'ap1', dimension: dim('dp') });
    s.exec({ type: 'addText', levelId: LV0, planId: 'ap1', text: txt('tp') });
    expect(annotationRemovals(s.project, LV0, ['dn', 'dp', 'tp', 'x'], 'ap1')).toEqual([
      { type: 'removeDimension', levelId: LV0, id: 'dn' },
      { type: 'removeDimension', levelId: LV0, planId: 'ap1', id: 'dp' },
      { type: 'removeText', levelId: LV0, planId: 'ap1', id: 'tp' },
    ]);
  });
});

describe('anotações da planta de área · exclusão e validação', () => {
  it('apagar o elemento tira a etiqueta da planta', () => {
    const s = withPlan();
    s.exec({ type: 'addTag', levelId: LV0, planId: 'ap1', item: tag('tag1') });
    s.exec({ type: 'deleteElements', ids: ['r1'] });
    expect(planAnnotationsOf(planById(s, 'ap1')).tags).toHaveLength(0);
  });

  it('etiqueta órfã em arquivo antigo não quebra: a validação avisa', () => {
    const s = new ProjectStore(createEmptyProject());
    const orphan = plan('ap1', {
      annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [tag('tag_orfa', { hostId: 'sumiu' })] },
    });
    s.exec({ type: 'addAreaPlan', plan: orphan });
    const issues = validateProject(s.project).filter((i) => i.code === 'area-plan-tag-host-missing');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('warning');
    expect(issues[0]!.elementId).toBe('tag_orfa');
  });
});
