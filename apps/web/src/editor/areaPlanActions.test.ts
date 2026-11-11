import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { areaPlanOf, createEmptyProject, floorViewId, viewAnnotationsOf, DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS, makeRoom, makeWall, ProjectStore, type AreaPlan } from '@hestia/model';
import { addMissingTagsAction, applyColorSchemeAction, createAreaPlanAction, ensureRoomTagAction, moveRoomLabelAction, openAreaPlan, recenterTagsAction, removeRoomTagAction, setPlanGraphicsAction, updateRoomTagAction } from './areaPlanActions.ts';

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));

function store(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const pts = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  return s;
}

describe('ações da planta de área', () => {
  it('cria a planta sem nenhuma etiqueta armazenada (o rótulo é derivado do ambiente)', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    const plan = areaPlanOf(s.project, id)!;
    expect(plan.tags).toHaveLength(0);
  });

  it('etiquetar sem etiqueta materializa uma etiqueta editável', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    expect(addMissingTagsAction(s, id)).toBe(1);
    expect(areaPlanOf(s.project, id)!.tags).toHaveLength(1);
  });

  it('arrastar para fora e voltar move o rótulo do ambiente (posição compartilhada)', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    moveRoomLabelAction(s, 'r1', { x: 8, y: 8 });
    expect((s.project.elements.r1 as { labelPosition?: { x: number } }).labelPosition).toEqual({ x: 8, y: 8 });
    expect(areaPlanOf(s.project, id)!.tags).toHaveLength(0);
  });

  it('recentralizar devolve ao centro', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    moveRoomLabelAction(s, 'r1', { x: 8, y: 8 });
    recenterTagsAction(s, id);
    expect((s.project.elements.r1 as { labelPosition?: unknown }).labelPosition).toBeUndefined();
  });

  it('esquema de cores cria legenda e quadro e liga o preenchimento', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    applyColorSchemeAction(s, id, 'category');
    const plan = areaPlanOf(s.project, id)!;
    expect(plan.schemeId).toBe(`cs_${id}`);
    expect(plan.graphics.fill).toBe('scheme');
    expect(plan.legend).toBeTruthy();
    expect(plan.table).toBeTruthy();
  });

  it('alterar gráficos não muda a área', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    setPlanGraphicsAction(s, id, { showWalls: 'hidden', referenceLines: 'never' });
    expect(areaPlanOf(s.project, id)!.graphics.showWalls).toBe('hidden');
    expect((s.project.elements.r1 as { point: { x: number; y: number } }).point).toEqual({ x: 2, y: 2.5 });
  });

  it('nasce com as anotações do nível copiadas, com ids novos', () => {
    const s = store();
    s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1, precision: 2 } });
    s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 't1', at: { x: 1, y: 1 }, text: 'Sala', height: 2.5, rotation: 0 } });
    // Linha de detalhe e etiqueta também acompanham a cópia.
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dl1', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } } });
    s.exec({ type: 'addTag', levelId: 'lv_0', item: { id: 'tag1', hostId: 'r1', at: { x: 1, y: 1 }, property: 'name' } });
    const id = createAreaPlanAction(s, 'lv_0');
    const plan = areaPlanOf(s.project, id)!;
    expect(plan.annotations?.dimensions).toHaveLength(1);
    expect(plan.annotations?.dimensions[0]!.id).not.toBe('d1');
    expect(plan.annotations?.texts[0]!.text).toBe('Sala');
    expect(plan.annotations?.detailLines).toHaveLength(1);
    expect(plan.annotations?.tags).toHaveLength(1);
    // O nível continua com as dele.
    expect(viewAnnotationsOf(s.project, floorViewId('lv_0')).dimensions).toHaveLength(1);
    expect(viewAnnotationsOf(s.project, floorViewId('lv_0')).texts).toHaveLength(1);
  });

  it('garantir a etiqueta cria uma vez e devolve a mesma nas próximas chamadas', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    const tag = ensureRoomTagAction(s, id, 'r1')!;
    expect(tag.planId).toBe(id);
    expect(tag.roomId).toBe('r1');
    expect(tag.visible).toBe(true);
    expect(tag.fields).toEqual(DEFAULT_TAG_FIELDS);
    expect(areaPlanOf(s.project, id)!.tags).toHaveLength(1);
    // Idempotente: não cria outra etiqueta nem um passo de desfazer.
    const version = s.version;
    const again = ensureRoomTagAction(s, id, 'r1')!;
    expect(again.id).toBe(tag.id);
    expect(areaPlanOf(s.project, id)!.tags).toHaveLength(1);
    expect(s.version).toBe(version);
  });

  it('atualizar a etiqueta grava em plan.tags e não no rótulo do nível', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    const tag = updateRoomTagAction(s, id, 'r1', { fields: ['name', 'area'], orientation: 'vertical', leader: 'kinked', visible: false, custom: 'Sala de estar' })!;
    const plan = areaPlanOf(s.project, id)!;
    expect(plan.tags).toHaveLength(1);
    expect(plan.tags[0]!.id).toBe(tag.id);
    expect(plan.tags[0]!.fields).toEqual(['name', 'area']);
    expect(plan.tags[0]!.orientation).toBe('vertical');
    expect(plan.tags[0]!.leader).toBe('kinked');
    expect(plan.tags[0]!.visible).toBe(false);
    expect(plan.tags[0]!.custom).toBe('Sala de estar');
    // A posição, rotação e chamada compartilhadas continuam intocadas.
    const room = s.project.elements.r1 as { labelPosition?: unknown; labelRotation?: unknown; labelLeader?: unknown };
    expect(room.labelPosition).toBeUndefined();
    expect(room.labelRotation).toBeUndefined();
    expect(room.labelLeader).toBeUndefined();
    expect(viewAnnotationsOf(s.project, floorViewId('lv_0')).tags).toHaveLength(0);
  });

  it('recusa lista de campos vazia sem criar etiqueta', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    expect(() => updateRoomTagAction(s, id, 'r1', { fields: [] })).toThrow('ao menos um campo');
    expect(areaPlanOf(s.project, id)!.tags).toHaveLength(0);
  });

  it('criação e alteração da etiqueta são um só passo de desfazer', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    updateRoomTagAction(s, id, 'r1', { fields: ['name'] });
    expect(areaPlanOf(s.project, id)!.tags[0]!.fields).toEqual(['name']);
    s.undo();
    expect(areaPlanOf(s.project, id)!.tags).toHaveLength(0);
  });

  it('voltar ao padrão remove a etiqueta da vista', () => {
    const s = store();
    const id = createAreaPlanAction(s, 'lv_0');
    ensureRoomTagAction(s, id, 'r1');
    expect(removeRoomTagAction(s, id, 'r1')).toBe(true);
    expect(areaPlanOf(s.project, id)!.tags).toHaveLength(0);
    expect(removeRoomTagAction(s, id, 'r1')).toBe(false);
    s.undo();
    expect(areaPlanOf(s.project, id)!.tags).toHaveLength(1);
  });

  it('planta sem annotations já nasce com a cópia da anotação do nível; abrir não semeia nada (a herança acabou)', () => {
    const s = store();
    s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 't1', at: { x: 1, y: 1 }, text: 'Antigo', height: 2.5, rotation: 0 } });
    const plan: AreaPlan = {
      id: 'ap_old',
      name: 'Planta antiga',
      levelId: 'lv_0',
      scale: 50,
      graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } },
      tags: [],
    };
    s.exec({ type: 'addAreaPlan', plan });
    // A cópia (id `<id>__<idDaVista>`) é feita na criação: `annotations` projetado nunca é indefinido.
    expect(areaPlanOf(s.project, 'ap_old')!.annotations?.texts[0]!.text).toBe('Antigo');
    expect(areaPlanOf(s.project, 'ap_old')!.annotations?.texts[0]!.id).toBe('t1__ap_old');
    const version = s.version;
    openAreaPlan(s, 'ap_old');
    // Abrir não escreve nada (sem passo de desfazer) e o nível continua com a dele.
    expect(s.version).toBe(version);
    expect(areaPlanOf(s.project, 'ap_old')!.graphics.showAnnotations).toBe(true);
    expect(viewAnnotationsOf(s.project, floorViewId('lv_0')).texts).toHaveLength(1);
  });
});
