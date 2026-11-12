import { len, sub, type Vec2 } from '@hestia/geom';
import { DIM_MIN_LENGTH } from './dimension.ts';
import { newId } from './ids.ts';
import { type Dimension, type DetailLine, type DetailRegion, type ElementTag, type Id, type Project, type RoomSeparator, type SectionView, type TextNote } from './types.ts';
import { cleanSectionAnnotations, sectionAnnotationsOf, type SectionAnnotations } from './sectionAnnotations.ts';
import { t as translate, type Lang } from './i18n.ts';
import { floorViewId, viewAnnotationsOf, type PlanAnnotations, type PlanView } from './planView.ts';
import { resolvePlanView, resolvePlanViewRef } from './planViewResolve.ts';

/**
 * Onde a anotação mora: na vista de planta (piso, cobertura ou área) ou no corte/elevação.
 *
 * Forma NOVA para planta (docs/vistas/PLANO-MESTRE.md §4.3): `viewId` (a vista exata, de qualquer tipo); `levelId` precisa
 * ser o nível da vista. Forma ANTIGA, que continua valendo: `levelId` sem `viewId` => planta de piso do nível;
 * `levelId` + `planId` => planta de área. `sectionId` (corte) tem precedência sobre as duas.
 */
interface AnnotationView {
  levelId: Id;
  /**
   * Vista de planta dona da anotação (`floorViewId`, `roofViewId` ou o id da planta de área). Quando presente, o destino
   * vem dele e `planId` é ignorado; `levelId` precisa ser o nível da vista.
   */
  viewId?: Id;
  /** Planta de área dona da anotação; ausente = anotação do nível (planta de piso). */
  planId?: Id;
  /** Vista de corte/elevação dona da anotação; ausente = anotação de planta. */
  sectionId?: Id;
}

/**
 * Anotações da planta (decisão 0019): moram na vista (desde a Fase 2, `Project.planViews`). Os comandos recusam com
 * mensagem pt-BR e não alteram o projeto; remover o nível leva as vistas e suas anotações junto.
 */
export type AnnotationCommand =
  | ({ type: 'addDimension'; dimension: Dimension } & AnnotationView)
  | ({ type: 'updateDimension'; id: Id; patch: Partial<Omit<Dimension, 'id'>> } & AnnotationView)
  | ({ type: 'removeDimension'; id: Id } & AnnotationView)
  | ({ type: 'addText'; text: TextNote } & AnnotationView)
  | ({ type: 'updateText'; id: Id; patch: Partial<Omit<TextNote, 'id'>> } & AnnotationView)
  | ({ type: 'removeText'; id: Id } & AnnotationView)
  | { type: 'addRoomSeparator'; levelId: Id; separator: RoomSeparator }
  | { type: 'removeRoomSeparator'; levelId: Id; id: Id }
  | { type: 'updateRoomSeparator'; levelId: Id; id: Id; patch: Partial<Omit<RoomSeparator, 'id'>> }
  | ({ type: 'addDetailLine'; item: DetailLine } & AnnotationView)
  | ({ type: 'updateDetailLine'; id: Id; patch: Partial<Omit<DetailLine, 'id'>> } & AnnotationView)
  | ({ type: 'removeDetailLine'; id: Id } & AnnotationView)
  | ({ type: 'addDetailRegion'; item: DetailRegion } & AnnotationView)
  | ({ type: 'updateDetailRegion'; id: Id; patch: Partial<Omit<DetailRegion, 'id'>> } & AnnotationView)
  | ({ type: 'removeDetailRegion'; id: Id } & AnnotationView)
  | ({ type: 'addTag'; item: ElementTag } & AnnotationView)
  | ({ type: 'updateTag'; id: Id; patch: Partial<Omit<ElementTag, 'id'>> } & AnnotationView)
  | ({ type: 'removeTag'; id: Id } & AnnotationView);

const finite = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);

/** Motivo de recusa de uma cota, ou null. */
export function dimensionIssue(d: Dimension, lang: Lang = 'pt'): string | null {
  if (d.angular) {
    const a = d.angular;
    if (!a.refA || !a.refB) return translate(lang, 'md_cmd_angdim_refs');
    if (!finite(a.center) || !finite(a.from) || !finite(a.to)) return translate(lang, 'md_cmd_angdim_geometry');
    if (!(Number.isFinite(a.radius) && a.radius > 0)) return translate(lang, 'md_cmd_angdim_radius');
    const twoPi = Math.PI * 2;
    if (!(Number.isFinite(a.value) && a.value >= 0 && a.value <= twoPi + 1e-9)) return translate(lang, 'md_cmd_angdim_angle_2pi');
    if (a.side === 'reflex') {
      if (!(a.value > Math.PI + 1e-9 && a.value <= twoPi + 1e-9)) return translate(lang, 'md_cmd_angdim_reflex');
    } else if (a.value > Math.PI + 1e-9) {
      return translate(lang, 'md_cmd_angdim_angle_pi');
    }
    if (d.textHeight !== undefined && !(Number.isFinite(d.textHeight) && d.textHeight > 0)) return translate(lang, 'md_cmd_dim_text_height');
    return null;
  }
  if (!finite(d.a) || !finite(d.b)) return translate(lang, 'md_cmd_dim_coords');
  if (!Number.isFinite(d.offset)) return translate(lang, 'md_cmd_dim_offset');
  if (d.textAt && !finite(d.textAt)) return translate(lang, 'md_cmd_dim_text_position');
  if (d.textHeight !== undefined && !(Number.isFinite(d.textHeight) && d.textHeight > 0)) return translate(lang, 'md_cmd_dim_text_height');
  if (d.precision !== undefined && ![0, 1, 2, 3].includes(d.precision)) return translate(lang, 'md_cmd_dim_precision');
  if (len(sub(d.b, d.a)) < DIM_MIN_LENGTH) return translate(lang, 'md_cmd_dim_two_points');
  return null;
}

/** Motivo de recusa de um texto, ou null. */
export function textIssue(note: TextNote, lang: Lang = 'pt'): string | null {
  if (!finite(note.at)) return translate(lang, 'md_cmd_text_position');
  if (note.text.trim() === '') return translate(lang, 'md_cmd_text_empty');
  if (!(Number.isFinite(note.height) && note.height > 0)) return translate(lang, 'md_cmd_text_height');
  if (!Number.isFinite(note.rotation)) return translate(lang, 'md_cmd_text_rotation');
  if (note.width !== undefined && !(Number.isFinite(note.width) && note.width > 0)) return translate(lang, 'md_cmd_text_width');
  if (note.leader && (note.leader.length < 2 || note.leader.some((p) => !finite(p)))) return translate(lang, 'md_cmd_text_leader');
  return null;
}

export const levelDimensions = (p: Pick<Project, 'planViews'>, levelId: Id): Dimension[] =>
  viewAnnotationsOf(p, floorViewId(levelId)).dimensions;

/** Comprimento mínimo (m) de uma linha de separação de ambiente. */
export const ROOM_SEPARATOR_MIN_LENGTH = 0.05;

/** Motivo de recusa de uma linha de separação, ou null. Pontos distintos e não muito próximos. */
export function roomSeparatorIssue(r: RoomSeparator, lang: Lang = 'pt'): string | null {
  if (!finite(r.a) || !finite(r.b)) return translate(lang, 'md_cmd_separator_coords');
  if (len(sub(r.b, r.a)) < ROOM_SEPARATOR_MIN_LENGTH) return translate(lang, 'md_cmd_separator_two_points');
  return null;
}

export const levelRoomSeparators = (p: Pick<Project, 'levels'>, levelId: Id): RoomSeparator[] =>
  p.levels.find((l) => l.id === levelId)?.roomSeparators ?? [];

export const levelTexts = (p: Pick<Project, 'planViews'>, levelId: Id): TextNote[] =>
  viewAnnotationsOf(p, floorViewId(levelId)).texts;

/** Leitura e escrita de uma família de anotações na vista (planta ou corte). */
interface AnnotationList<T> {
  get(): T[];
  set(next: T[]): void;
}

interface AnnotationScope {
  dimensions: AnnotationList<Dimension>;
  texts: AnnotationList<TextNote>;
  detailLines: AnnotationList<DetailLine>;
  detailRegions: AnnotationList<DetailRegion>;
  tags: AnnotationList<ElementTag>;
}

/** Anotações da vista de planta: cada escrita reatribui o conjunto, sem mutar o array atual. */
const planViewScope = (view: PlanView): AnnotationScope => {
  const write = (patch: Partial<PlanAnnotations>): void => {
    view.annotations = { ...view.annotations, ...patch };
  };
  return {
    dimensions: { get: () => view.annotations.dimensions, set: (dimensions) => write({ dimensions }) },
    texts: { get: () => view.annotations.texts, set: (texts) => write({ texts }) },
    detailLines: { get: () => view.annotations.detailLines, set: (detailLines) => write({ detailLines }) },
    detailRegions: { get: () => view.annotations.detailRegions, set: (detailRegions) => write({ detailRegions }) },
    tags: { get: () => view.annotations.tags, set: (tags) => write({ tags }) },
  };
};

/** Vista de planta do comando (lida direto de `p.planViews`, sem memória): precisa existir e ser do nível da anotação. */
function planViewOfCommand(p: Project, c: { levelId: Id; viewId?: Id; planId?: Id }, lang: Lang): PlanView {
  if (c.viewId) {
    const v = resolvePlanView(p, c.viewId);
    if (!v) throw new Error(translate(lang, 'md_view_missing'));
    if (v.levelId !== c.levelId) throw new Error(translate(lang, 'md_cmd_view_level_mismatch'));
    return v;
  }
  if (c.planId) {
    const v = resolvePlanView(p, c.planId);
    if (v?.kind !== 'area') throw new Error(translate(lang, 'md_area_plan_missing'));
    if (v.levelId !== c.levelId) throw new Error(translate(lang, 'md_cmd_plan_level_mismatch'));
    return v;
  }
  const floor = resolvePlanView(p, floorViewId(c.levelId));
  if (!floor) throw new Error(translate(lang, 'md_level_missing'));
  return floor;
}

/** Vista de corte/elevação dona da anotação: precisa existir no projeto. */
function viewSection(p: Project, sectionId: Id, lang: Lang): SectionView {
  const view = p.views.find((v) => v.id === sectionId);
  if (!view) throw new Error(translate(lang, 'md_cmd_section_view_missing'));
  return view;
}

/**
 * Anotações de uma vista de corte/elevação: cada escrita reatribui o conjunto da vista (o desfazer guarda a vista
 * inteira) e o conjunto vazio volta a `undefined`, como o comando antigo `setSectionAnnotations`.
 */
const sectionScope = (view: SectionView): AnnotationScope => {
  const write = (patch: Partial<SectionAnnotations>): void => {
    view.annotations = cleanSectionAnnotations({ ...sectionAnnotationsOf(view), ...patch });
  };
  return {
    dimensions: { get: () => sectionAnnotationsOf(view).dimensions, set: (dimensions) => write({ dimensions }) },
    texts: { get: () => sectionAnnotationsOf(view).texts, set: (texts) => write({ texts }) },
    detailLines: { get: () => sectionAnnotationsOf(view).detailLines, set: (detailLines) => write({ detailLines }) },
    detailRegions: { get: () => sectionAnnotationsOf(view).detailRegions, set: (detailRegions) => write({ detailRegions }) },
    tags: { get: () => sectionAnnotationsOf(view).tags, set: (tags) => write({ tags }) },
  };
};

/**
 * Destino de escrita (`levelId` + `planId?`) de uma vista de planta, para montar comandos de anotação na forma antiga a
 * partir de um `viewId`. Piso e cobertura: só `levelId` (a forma antiga grava na planta de piso; para gravar na cobertura
 * use `viewId` no comando); planta de área: `levelId` + `planId`. `viewId` inexistente lança Error.
 */
export function annotationTarget(p: Pick<Project, 'planViews'>, viewId: Id, lang: Lang = 'pt'): { levelId: Id; planId?: Id } {
  const ref = resolvePlanViewRef(p, viewId);
  if (!ref) throw new Error(translate(lang, 'md_view_missing'));
  return ref.kind === 'area' ? { levelId: ref.levelId, planId: viewId } : { levelId: ref.levelId };
}

/** Aplica um comando de anotação sobre o rascunho do projeto. Lança Error em texto pt-BR se recusar. */
export function applyAnnotationCommand(p: Project, c: AnnotationCommand, lang: Lang = 'pt'): void {
  const level = p.levels.find((l) => l.id === c.levelId);
  if (!level) throw new Error(translate(lang, 'md_level_missing'));
  const target = { levelId: c.levelId, viewId: 'viewId' in c ? c.viewId : undefined, planId: 'planId' in c ? c.planId : undefined };
  // As linhas de separação moram no nível: não precisam de vista.
  const scope = c.type.endsWith('RoomSeparator')
    ? (undefined as unknown as AnnotationScope)
    : 'sectionId' in c && c.sectionId
      ? sectionScope(viewSection(p, c.sectionId, lang))
      : planViewScope(planViewOfCommand(p, target, lang));
  switch (c.type) {
    case 'addDimension': {
      const issue = dimensionIssue(c.dimension, lang);
      if (issue) throw new Error(issue);
      scope.dimensions.set([...scope.dimensions.get(), c.dimension]);
      break;
    }
    case 'updateDimension': {
      const old = scope.dimensions.get().find((d) => d.id === c.id);
      if (!old) throw new Error(translate(lang, 'md_cmd_dim_missing'));
      const next: Dimension = { ...old, ...c.patch, id: old.id };
      const issue = dimensionIssue(next, lang);
      if (issue) throw new Error(issue);
      scope.dimensions.set(scope.dimensions.get().map((d) => (d.id === c.id ? next : d)));
      break;
    }
    case 'removeDimension':
      if (!scope.dimensions.get().some((d) => d.id === c.id)) throw new Error(translate(lang, 'md_cmd_dim_missing'));
      scope.dimensions.set(scope.dimensions.get().filter((d) => d.id !== c.id));
      break;
    case 'addText': {
      const issue = textIssue(c.text, lang);
      if (issue) throw new Error(issue);
      scope.texts.set([...scope.texts.get(), c.text]);
      break;
    }
    case 'updateText': {
      const old = scope.texts.get().find((t) => t.id === c.id);
      if (!old) throw new Error(translate(lang, 'md_cmd_text_missing'));
      const next: TextNote = { ...old, ...c.patch, id: old.id };
      const issue = textIssue(next, lang);
      if (issue) throw new Error(issue);
      scope.texts.set(scope.texts.get().map((t) => (t.id === c.id ? next : t)));
      break;
    }
    case 'removeText':
      if (!scope.texts.get().some((t) => t.id === c.id)) throw new Error(translate(lang, 'md_cmd_text_missing'));
      scope.texts.set(scope.texts.get().filter((t) => t.id !== c.id));
      break;
    case 'addRoomSeparator': {
      const issue = roomSeparatorIssue(c.separator, lang);
      if (issue) throw new Error(issue);
      level.roomSeparators = [...(level.roomSeparators ?? []), c.separator];
      break;
    }
    case 'removeRoomSeparator':
      if (!level.roomSeparators?.some((r) => r.id === c.id)) throw new Error(translate(lang, 'md_cmd_separator_missing'));
      level.roomSeparators = level.roomSeparators.filter((r) => r.id !== c.id);
      break;
    case 'updateRoomSeparator': {
      const old = level.roomSeparators?.find((r) => r.id === c.id);
      if (!old) throw new Error(translate(lang, 'md_cmd_separator_missing'));
      const next: RoomSeparator = { ...old, ...c.patch, id: old.id };
      const issue = roomSeparatorIssue(next, lang);
      if (issue) throw new Error(issue);
      level.roomSeparators = level.roomSeparators!.map((r) => (r.id === c.id ? next : r));
      break;
    }
    case 'addDetailLine':
      if (!finite(c.item.a) || !finite(c.item.b) || len(sub(c.item.b, c.item.a)) < ROOM_SEPARATOR_MIN_LENGTH) throw new Error(translate(lang, 'md_cmd_detail_line_two_points'));
      scope.detailLines.set([...scope.detailLines.get(), c.item]);
      break;
    case 'updateDetailLine': {
      const old = scope.detailLines.get().find((x) => x.id === c.id);
      if (!old) throw new Error(translate(lang, 'md_cmd_detail_line_missing'));
      const next = { ...old, ...c.patch, id: old.id };
      if (!finite(next.a) || !finite(next.b) || len(sub(next.b, next.a)) < ROOM_SEPARATOR_MIN_LENGTH) throw new Error(translate(lang, 'md_cmd_detail_line_two_points'));
      scope.detailLines.set(scope.detailLines.get().map((x) => x.id === c.id ? next : x));
      break;
    }
    case 'removeDetailLine':
      if (!scope.detailLines.get().some((x) => x.id === c.id)) throw new Error(translate(lang, 'md_cmd_detail_line_missing'));
      scope.detailLines.set(scope.detailLines.get().filter((x) => x.id !== c.id));
      break;
    case 'addDetailRegion':
      if (c.item.boundary.length < 3 || c.item.boundary.some((p) => !finite(p))) throw new Error(translate(lang, 'md_cmd_detail_region_invalid'));
      scope.detailRegions.set([...scope.detailRegions.get(), c.item]);
      break;
    case 'updateDetailRegion': {
      const old = scope.detailRegions.get().find((x) => x.id === c.id);
      if (!old) throw new Error(translate(lang, 'md_cmd_detail_region_missing'));
      const next = { ...old, ...c.patch, id: old.id };
      if (next.boundary.length < 3 || next.boundary.some((p) => !finite(p))) throw new Error(translate(lang, 'md_cmd_detail_region_invalid'));
      scope.detailRegions.set(scope.detailRegions.get().map((x) => x.id === c.id ? next : x));
      break;
    }
    case 'removeDetailRegion':
      if (!scope.detailRegions.get().some((x) => x.id === c.id)) throw new Error(translate(lang, 'md_cmd_detail_region_missing'));
      scope.detailRegions.set(scope.detailRegions.get().filter((x) => x.id !== c.id));
      break;
    case 'addTag':
      if (!finite(c.item.at) || !p.elements[c.item.hostId]) throw new Error(translate(lang, 'md_cmd_tag_host_invalid'));
      scope.tags.set([...scope.tags.get(), c.item]);
      break;
    case 'updateTag': {
      const old = scope.tags.get().find((x) => x.id === c.id);
      if (!old) throw new Error(translate(lang, 'md_cmd_tag_missing'));
      const next = { ...old, ...c.patch, id: old.id };
      if (!finite(next.at) || !p.elements[next.hostId]) throw new Error(translate(lang, 'md_cmd_tag_host_invalid'));
      scope.tags.set(scope.tags.get().map((x) => x.id === c.id ? next : x));
      break;
    }
    case 'removeTag':
      if (!scope.tags.get().some((x) => x.id === c.id)) throw new Error(translate(lang, 'md_cmd_tag_missing'));
      scope.tags.set(scope.tags.get().filter((x) => x.id !== c.id));
      break;
  }
}

export type RemoveAnnotation = Extract<AnnotationCommand, { type: 'removeDimension' | 'removeText' | 'removeRoomSeparator' | 'removeDetailLine' | 'removeDetailRegion' | 'removeTag' }>;

/**
 * Comandos de exclusão para as cotas e os textos da vista cujos ids estão em `ids` (o resto são elementos).
 * Com `planId`, as anotações da planta de área entram junto; sem ele, só as do nível.
 */
export function annotationRemovals(p: Pick<Project, 'planViews'>, levelId: Id, ids: Id[], planId?: Id): RemoveAnnotation[] {
  const want = new Set(ids);
  const out: RemoveAnnotation[] = [];
  for (const d of levelDimensions(p, levelId)) if (want.has(d.id)) out.push({ type: 'removeDimension', levelId, id: d.id });
  for (const t of levelTexts(p, levelId)) if (want.has(t.id)) out.push({ type: 'removeText', levelId, id: t.id });
  const level = viewAnnotationsOf(p, floorViewId(levelId));
  for (const x of level.detailLines) if (want.has(x.id)) out.push({ type: 'removeDetailLine', levelId, id: x.id });
  for (const x of level.detailRegions) if (want.has(x.id)) out.push({ type: 'removeDetailRegion', levelId, id: x.id });
  for (const x of level.tags) if (want.has(x.id)) out.push({ type: 'removeTag', levelId, id: x.id });
  if (planId) {
    const a = viewAnnotationsOf(p, planId);
    for (const x of a.dimensions) if (want.has(x.id)) out.push({ type: 'removeDimension', levelId, planId, id: x.id });
    for (const x of a.texts) if (want.has(x.id)) out.push({ type: 'removeText', levelId, planId, id: x.id });
    for (const x of a.detailLines) if (want.has(x.id)) out.push({ type: 'removeDetailLine', levelId, planId, id: x.id });
    for (const x of a.detailRegions) if (want.has(x.id)) out.push({ type: 'removeDetailRegion', levelId, planId, id: x.id });
    for (const x of a.tags) if (want.has(x.id)) out.push({ type: 'removeTag', levelId, planId, id: x.id });
  }
  return out;
}

/**
 * Ids das anotações da vista de planta que estão em `ids`. Sem `viewId`: as da planta de piso do nível. Com `viewId`
 * (cobertura ou área): só as dessa vista, que não enxerga as das outras.
 */
export function annotationIdsIn(p: Pick<Project, 'planViews'>, levelId: Id, ids: Id[], viewId?: Id): Id[] {
  const own = viewId ? viewAnnotationsOf(p, viewId) : undefined;
  const have = new Set(own ? [...own.dimensions, ...own.texts, ...own.detailLines, ...own.detailRegions, ...own.tags].map((a) => a.id) : annotationIdsInView(p, levelId));
  return ids.filter((id) => have.has(id));
}

/**
 * Ids de todas as anotações da vista: sempre as do nível e, com `planId`, também as da planta de área
 * (cotas, textos, detalhes e etiquetas que moram na própria planta).
 */
export function annotationIdsInView(p: Pick<Project, 'planViews'>, levelId: Id, planId?: Id): Id[] {
  const level = viewAnnotationsOf(p, floorViewId(levelId));
  const ids = [...level.dimensions, ...level.texts, ...level.detailLines, ...level.detailRegions, ...level.tags].map((a) => a.id);
  if (!planId) return ids;
  const own = viewAnnotationsOf(p, planId);
  return [...ids, ...own.dimensions.map((a) => a.id), ...own.texts.map((a) => a.id), ...own.detailLines.map((a) => a.id), ...own.detailRegions.map((a) => a.id), ...own.tags.map((a) => a.id)];
}

/**
 * Comandos que movem por `d` as cotas e os textos de `ids` (ou, com `copy`, criam cópias com ids novos). Uma cota movida
 * perde as referências às paredes: a posição passa a ser livre. Sem `viewId`, opera na planta de piso do nível; com
 * `viewId` (cobertura ou área), só nas anotações dessa vista e os comandos levam o `viewId`.
 */
export function annotationMoveCommands(p: Pick<Project, 'planViews'>, levelId: Id, ids: Id[], d: Vec2, copy: boolean, viewId?: Id): AnnotationCommand[] {
  const piso = floorViewId(levelId);
  const fonte = viewAnnotationsOf(p, viewId ?? piso);
  const destino: { viewId?: Id } = viewId && viewId !== piso ? { viewId } : {};
  const want = new Set(ids);
  const shift = (v: Vec2): Vec2 => ({ x: v.x + d.x, y: v.y + d.y });
  const out: AnnotationCommand[] = [];
  for (const dim of fonte.dimensions) {
    if (!want.has(dim.id)) continue;
    const moved = { ...dim, a: shift(dim.a), b: shift(dim.b), ...(dim.textAt ? { textAt: shift(dim.textAt) } : {}), ...(dim.angular ? { angular: { ...dim.angular, center: shift(dim.angular.center) } } : {}) };
    if (copy) out.push({ type: 'addDimension', levelId, ...destino, dimension: { ...moved, id: newId('dim'), refs: undefined } });
    else out.push({ type: 'updateDimension', levelId, ...destino, id: dim.id, patch: { ...moved, refs: undefined } });
  }
  for (const t of fonte.texts) {
    if (!want.has(t.id)) continue;
    const movedLeader = t.leader?.map(shift);
    if (copy) out.push({ type: 'addText', levelId, ...destino, text: { ...t, id: newId('txt'), at: shift(t.at), leader: movedLeader } });
    else out.push({ type: 'updateText', levelId, ...destino, id: t.id, patch: { at: shift(t.at), leader: movedLeader } });
  }
  const level = fonte;
  for (const item of level.detailLines) if (want.has(item.id)) {
    const moved = { a: shift(item.a), b: shift(item.b) };
    if (copy) out.push({ type: 'addDetailLine', levelId, ...destino, item: { ...item, id: newId('dl'), ...moved } });
    else out.push({ type: 'updateDetailLine', levelId, ...destino, id: item.id, patch: moved });
  }
  for (const item of level.detailRegions) if (want.has(item.id)) {
    const boundary = item.boundary.map(shift);
    if (copy) out.push({ type: 'addDetailRegion', levelId, ...destino, item: { ...item, id: newId('dr'), boundary } });
    else out.push({ type: 'updateDetailRegion', levelId, ...destino, id: item.id, patch: { boundary } });
  }
  for (const item of level.tags) if (want.has(item.id)) {
    const at = shift(item.at);
    if (copy) out.push({ type: 'addTag', levelId, ...destino, item: { ...item, id: newId('tag'), at } });
    else out.push({ type: 'updateTag', levelId, ...destino, id: item.id, patch: { at } });
  }
  return out;
}
