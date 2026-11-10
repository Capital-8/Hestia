import { pointInPolygon, type Polygon } from '@hestia/geom';
import { resolveRooms, roomReferencePoint } from '@hestia/engine';
import {
  areaPlanOf,
  areaPlansOf,
  areaPlansOfLevel,
  DEFAULT_AREA_GRAPHICS,
  DEFAULT_TAG_FIELDS,
  floorViewId,
  newId,
  viewAnnotationsOf,
  type AreaPlan,
  type AreaPlanAnnotations,
  type AreaTable,
  type AreaLegend,
  type ColorScheme,
  type Id,
  type Room,
  type RoomTag,
  type Project,
  type ProjectStore,
} from '@hestia/model';
import { roomTagLines, tagBoxModel } from '@hestia/render';
import { editor } from './controller.ts';
import { t, useI18n } from './i18n.ts';
import { useUi } from './state.ts';

/** Nome padrão de uma planta de área de um nível. */
export const areaPlanName = (p: Pick<Project, 'levels'>, levelId: Id): string => t(useI18n.getState().lang, 'eds_def_area_plan_name', { level: p.levels.find((l) => l.id === levelId)?.name ?? levelId });

/**
 * Cópia das anotações do nível (cotas, textos, linhas/regiões de detalhe e etiquetas) com ids novos.
 * A planta de área nasce com a mesma anotação da planta de piso, mas sem compartilhar objetos com ela.
 */
export function annotationsFromLevel(p: Pick<Project, 'levels' | 'areaPlans'>, levelId: Id): AreaPlanAnnotations {
  // As do nível são as da planta de piso (`floorViewId`), na lista que a vista possui.
  const level = viewAnnotationsOf(p, floorViewId(levelId));
  return {
    dimensions: level.dimensions.map((d) => ({
      ...d,
      id: newId('dim'),
      a: { ...d.a },
      b: { ...d.b },
      ...(d.textAt ? { textAt: { ...d.textAt } } : {}),
      ...(d.refs ? { refs: { ...(d.refs.a ? { a: { ...d.refs.a } } : {}), ...(d.refs.b ? { b: { ...d.refs.b } } : {}) } } : {}),
    })),
    texts: level.texts.map((t) => ({
      ...t,
      id: newId('txt'),
      at: { ...t.at },
      ...(t.leader ? { leader: t.leader.map((q) => ({ ...q })) } : {}),
    })),
    detailLines: level.detailLines.map((x) => ({ ...x, id: newId('dl'), a: { ...x.a }, b: { ...x.b } })),
    detailRegions: level.detailRegions.map((x) => ({ ...x, id: newId('dr'), boundary: x.boundary.map((q) => ({ ...q })) })),
    tags: level.tags.map((x) => ({ ...x, id: newId('tag'), at: { ...x.at } })),
  };
}

/** Quantas anotações há num conjunto (para saber se a cópia tem conteúdo). */
export const annotationCount = (a: AreaPlanAnnotations): number =>
  a.dimensions.length + a.texts.length + a.detailLines.length + a.detailRegions.length + a.tags.length;

/**
 * Semeia as anotações da planta de área com as do nível. Usado ao abrir uma planta antiga (sem `annotations`),
 * num único passo de desfazer. Devolve quantas anotações foram copiadas.
 */
export function seedPlanAnnotationsAction(store: ProjectStore, planId: Id, label = 'eds_undo_copy_level_annotations'): number {
  const plan = areaPlanOf(store.project, planId);
  if (!plan) return 0;
  const annotations = annotationsFromLevel(store.project, plan.levelId);
  const n = annotationCount(annotations);
  if (n === 0) return 0;
  // Um único comando: anotações + as opções que as mostram na vista (um só passo de desfazer).
  store.exec({
    type: 'updateAreaPlan',
    id: planId,
    patch: { annotations, graphics: { ...plan.graphics, showDimensions: true, showAnnotations: true } },
  }, label);
  return n;
}

/** Caixa do texto cabe inteira no polígono (4 cantos + centro), considerando furos. */
function boxFits(poly: Polygon, at: { x: number; y: number }, box: { w: number; h: number }): boolean {
  const pts = [
    at,
    { x: at.x - box.w / 2, y: at.y - box.h / 2 },
    { x: at.x + box.w / 2, y: at.y - box.h / 2 },
    { x: at.x + box.w / 2, y: at.y + box.h / 2 },
    { x: at.x - box.w / 2, y: at.y + box.h / 2 },
  ];
  return pts.every((q) => pointInPolygon(q, poly));
}

/** Etiqueta automática de um ambiente: no cruzamento quando cabe; fora, acima, com chamada, quando não cabe. */
export function autoTag(p: Project, plan: Pick<AreaPlan, 'scale' | 'graphics'>, room: Room, r: ReturnType<typeof resolveRooms>[number]): RoomTag | null {
  if (!r.polygon) return null;
  const fields = plan.graphics.tagDefault.fields.length ? plan.graphics.tagDefault.fields : DEFAULT_TAG_FIELDS;
  const draft: RoomTag = { id: newId('tag'), planId: '', roomId: room.id, at: { x: 0, y: 0 }, orientation: plan.graphics.tagDefault.orientation, leader: 'none', fields, visible: true };
  const lines = roomTagLines(p, room, r, draft);
  if (!lines.length) return null;
  const box = tagBoxModel(lines, plan.scale);
  const at: { x: number; y: number } = room.labelPosition ?? room.referencePoint ?? roomReferencePoint(r.polygon) ?? r.point;
  const leader = room.labelLeader && room.labelLeader !== 'auto' ? room.labelLeader : null;
  if (boxFits(r.polygon, at, box)) return { ...draft, at, leader: leader ?? 'none' };
  let minY = Infinity;
  for (const q of r.polygon[0]!) if (q.y < minY) minY = q.y;
  return { ...draft, at: { x: at.x, y: minY - box.h / 2 - 0.25 }, leader: leader ?? 'crossed' };
}

/** Ajustes da etiqueta que a vista aceita: campos, orientação, chamada, texto livre e visibilidade. */
export type RoomTagPatch = Partial<Omit<RoomTag, 'id' | 'planId' | 'roomId'>>;

/**
 * Etiqueta do ambiente nesta planta, criando-a a partir do padrão da planta quando a vista ainda usa a
 * automática. É idempotente: com etiqueta, não executa comando nenhum. Devolve `null` quando o ambiente não
 * tem circuito fechado (sem rótulo na vista).
 */
export function ensureRoomTagAction(store: ProjectStore, planId: Id, roomId: Id): RoomTag | null {
  const plan = areaPlanOf(store.project, planId);
  if (!plan) return null;
  const existing = plan.tags.find((t) => t.roomId === roomId);
  if (existing) return existing;
  const room = store.project.elements[roomId];
  if (!room || room.kind !== 'room') return null;
  const r = resolveRooms(store.project, plan.levelId).find((x) => x.roomId === roomId);
  if (!r) return null;
  const tag = autoTag(store.project, plan, room, r);
  if (!tag) return null;
  const created: RoomTag = { ...tag, planId, visible: true };
  store.exec({ type: 'addRoomTag', planId, tag: created });
  return areaPlanOf(store.project, planId)?.tags.find((t) => t.id === created.id) ?? created;
}

/**
 * Altera a etiqueta do ambiente nesta planta, materializando-a antes quando preciso (um só passo de desfazer).
 * Os campos vazios são recusados: `roomTagIssue` exige ao menos um campo. Não toca em `Room.labelPosition`.
 */
export function updateRoomTagAction(store: ProjectStore, planId: Id, roomId: Id, patch: RoomTagPatch): RoomTag | null {
  if (patch.fields !== undefined && patch.fields.length === 0) throw new Error(t(useI18n.getState().lang, 'eds_msg_tag_needs_field'));
  if (!areaPlanOf(store.project, planId)) return null;
  let updated: RoomTag | null = null;
  store.transaction('eds_undo_edit_area_tag', () => {
    const tag = ensureRoomTagAction(store, planId, roomId);
    if (!tag) return;
    store.exec({ type: 'updateRoomTag', planId, id: tag.id, patch });
    updated = areaPlanOf(store.project, planId)?.tags.find((t) => t.id === tag.id) ?? null;
  });
  return updated;
}

/** Remove a etiqueta da vista: o ambiente volta ao padrão automático da planta. Devolve se havia etiqueta. */
export function removeRoomTagAction(store: ProjectStore, planId: Id, roomId: Id): boolean {
  const plan = areaPlanOf(store.project, planId);
  const tag = plan?.tags.find((t) => t.roomId === roomId);
  if (!plan || !tag) return false;
  store.exec({ type: 'removeRoomTag', planId, id: tag.id }, 'eds_undo_reset_area_tag');
  return true;
}

/** Etiquetas que faltam numa planta (uma por ambiente com circuito fechado). */
export function missingTags(p: Project, plan: AreaPlan): RoomTag[] {
  const rooms = Object.values(p.elements).filter((e): e is Room => e.kind === 'room' && e.levelId === plan.levelId);
  const resolved = new Map(resolveRooms(p, plan.levelId).map((r) => [r.roomId, r] as const));
  const have = new Set(plan.tags.map((t) => t.roomId));
  const out: RoomTag[] = [];
  for (const room of rooms) {
    if (have.has(room.id)) continue;
    const r = resolved.get(room.id);
    if (!r) continue;
    const tag = autoTag(p, plan, room, r);
    if (tag) out.push({ ...tag, planId: plan.id });
  }
  return out;
}

/** Cria a planta de um nível, com etiquetas automáticas, num passo de desfazer. */
export function createAreaPlanAction(store: ProjectStore, levelId: Id, opts: { scale?: number; name?: string; schemeId?: Id } = {}): Id {
  const p = store.project;
  if (!p.levels.some((l) => l.id === levelId)) throw new Error(t(useI18n.getState().lang, 'eds_msg_level_missing'));
  const id = newId('ap');
  const plan: AreaPlan = {
    id,
    name: opts.name?.trim() || areaPlanName(p, levelId),
    levelId,
    scale: opts.scale ?? 50,
    schemeId: opts.schemeId,
    // A planta nasce com a anotação do nível (cópias com ids novos) e mostrando cotas e anotações.
    annotations: annotationsFromLevel(p, levelId),
    graphics: {
      ...DEFAULT_AREA_GRAPHICS,
      showDimensions: true,
      showAnnotations: true,
      tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] },
    },
    tags: [],
  };
  plan.tags = [];
  store.exec({ type: 'addAreaPlan', plan }, 'eds_undo_create_area_plan');
  return id;
}

/** Cria uma planta para cada nível pedido, num só passo de desfazer. */
export function createAreaPlansForLevels(store: ProjectStore, levelIds: readonly Id[], opts: { scale?: number; createSheet?: boolean } = {}): Id[] {
  const ids: Id[] = [];
  store.transaction('eds_undo_create_area_plans', () => {
    for (const levelId of levelIds) {
      if (areaPlansOfLevel(store.project, levelId).length > 0) continue;
      ids.push(createAreaPlanAction(store, levelId, { scale: opts.scale }));
    }
  });
  return ids;
}

/**
 * Abre a planta de área na área de desenho. Plantas criadas antes das anotações por vista não têm `annotations`:
 * ao abrir, elas recebem uma cópia das anotações do nível (um passo de desfazer), para as ferramentas de anotação
 * já encontrarem a planta na mesma condição da planta de piso.
 */
export function openAreaPlan(store: ProjectStore, planId: Id): void {
  const plan = areaPlanOf(store.project, planId);
  if (!plan) return;
  editor.selectLevel(plan.levelId, 'area', plan.id);
  if (plan.annotations === undefined) seedPlanAnnotationsAction(store, planId, 'eds_undo_seed_area_annotations');
  useUi.setState({ selection: [], hover: null });
}

/** Acrescenta as etiquetas que faltam (Tag All Not Tagged), num passo de desfazer. */
export function addMissingTagsAction(store: ProjectStore, planId: Id): number {
  const plan = areaPlanOf(store.project, planId);
  if (!plan) return 0;
  const tags = missingTags(store.project, plan);
  if (tags.length === 0) return 0;
  store.transaction('eds_undo_tag_rooms', () => {
    for (const tag of tags) store.exec({ type: 'addRoomTag', planId, tag });
  });
  return tags.length;
}

/** Devolve os rótulos ao cruzamento do ambiente (posição compartilhada por todas as vistas). */
export function recenterTagsAction(store: ProjectStore, planId: Id): number {
  const plan = areaPlanOf(store.project, planId);
  if (!plan) return 0;
  const rooms = Object.values(store.project.elements).filter((e): e is Room => e.kind === 'room' && e.levelId === plan.levelId && e.labelPosition !== undefined);
  if (rooms.length === 0) return 0;
  store.transaction('eds_undo_recenter_tags', () => {
    for (const room of rooms) store.exec({ type: 'setRoomLabel', id: room.id, position: null, leader: 'auto' });
  });
  return rooms.length;
}

/** Move o rótulo de um ambiente; a posição vale na planta de piso, na de área e em qualquer outra vista. */
export function moveRoomLabelAction(store: ProjectStore, roomId: Id, at: { x: number; y: number }): void {
  store.exec({ type: 'setRoomLabel', id: roomId, position: at }, 'eds_undo_move_tag');
}

/** Compatibilidade: move pelo id da etiqueta (encontra o ambiente dela). */
export function moveTagAction(store: ProjectStore, planId: Id, tagId: Id, at: { x: number; y: number }): void {
  const plan = areaPlanOf(store.project, planId);
  const tag = plan?.tags.find((t) => t.id === tagId);
  if (!tag) return;
  moveRoomLabelAction(store, tag.roomId, at);
}

/**
 * Opções de desenho que a planta de área ainda não tem no tipo (subagente de modelo): eixos e marcas de corte.
 * Elas ficam gravadas em `graphics` até o modelo ganhar os campos, sem inventar um campo obrigatório.
 */
export type AreaPlanGraphicsPatch = Partial<AreaPlan['graphics']>;

/** Aplica gráficos na planta. */
export function setPlanGraphicsAction(store: ProjectStore, planId: Id, patch: AreaPlanGraphicsPatch): void {
  const plan = areaPlanOf(store.project, planId);
  if (!plan) return;
  store.exec({ type: 'updateAreaPlan', id: planId, patch: { graphics: { ...plan.graphics, ...patch, tagDefault: { ...plan.graphics.tagDefault, ...(patch.tagDefault ?? {}) } } } }, 'eds_undo_edit_area_plan');
}

/** Cria (ou atualiza) o esquema de cores e liga na planta, com legenda e quadro padrão. */
export function applyColorSchemeAction(store: ProjectStore, planId: Id, by: ColorScheme['by']): void {
  const p = store.project;
  const plan = areaPlanOf(p, planId);
  if (!plan) return;
  const lang = useI18n.getState().lang;
  const scheme: ColorScheme = {
    id: `cs_${planId}`,
    name: t(lang, by === 'category' ? 'eds_def_scheme_by_category' : by === 'level' ? 'eds_def_scheme_by_level' : 'eds_def_scheme_by_area_range'),
    by,
    ...(by === 'areaRange'
      ? {
          ranges: [
            { min: 0, max: 5, color: '#eef2f7', label: t(lang, 'eds_def_range_upto_5') },
            { min: 5, max: 12, color: '#dbe7f3', label: t(lang, 'eds_def_range_5_12') },
            { min: 12, max: 25, color: '#f6e3c8', label: t(lang, 'eds_def_range_12_25') },
            { min: 25, max: 1e9, color: '#e2f0dc', label: t(lang, 'eds_def_range_above_25') },
          ],
        }
      : {}),
  };
  const bbox = planBounds(p, plan.levelId);
  const legend: AreaLegend = plan.legend ?? { at: { x: bbox.maxX + 1.5, y: bbox.maxY }, title: t(lang, 'eds_def_area_legend'), groupBy: by === 'level' ? 'level' : 'category', showCount: true, showArea: true, showPercent: true };
  const table: AreaTable = plan.table ?? { at: { x: bbox.maxX + 1.5, y: bbox.maxY - 8 }, title: t(lang, 'eds_def_area_table'), columns: ['number', 'name', 'area', 'percent'], groupBy: 'level', totals: 'both' };
  store.transaction('eds_undo_apply_scheme', () => {
    store.exec({ type: 'upsertColorScheme', scheme });
    store.exec({ type: 'updateAreaPlan', id: planId, patch: { schemeId: scheme.id, graphics: { ...plan.graphics, fill: 'scheme', outline: plan.graphics.outline === 'none' ? 'thin' : plan.graphics.outline }, legend, table } });
  });
}

/** Retira o esquema de cores da planta (volta a ficar sem preenchimento). */
export function clearColorSchemeAction(store: ProjectStore, planId: Id): void {
  const plan = areaPlanOf(store.project, planId);
  if (!plan) return;
  store.exec({ type: 'updateAreaPlan', id: planId, patch: { schemeId: undefined, graphics: { ...plan.graphics, fill: 'none' } } }, 'eds_undo_clear_scheme');
}

/** Caixa de todos os ambientes do nível (para colocar legenda e quadro ao lado). */
export function planBounds(p: Project, levelId: Id): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts = resolveRooms(p, levelId).flatMap((r) => (r.polygon ? r.polygon.flat() : []));
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return {
    minX: Math.min(...pts.map((q) => q.x)),
    minY: Math.min(...pts.map((q) => q.y)),
    maxX: Math.max(...pts.map((q) => q.x)),
    maxY: Math.max(...pts.map((q) => q.y)),
  };
}

/** Todas as plantas de área do projeto, na ordem dos níveis. */
export const allAreaPlans = (p: Pick<Project, 'areaPlans'>): AreaPlan[] => areaPlansOf(p);
