import { len, sub, type Vec2 } from '@hestia/geom';
import { areaPlanOf, planAnnotationsOf, planAnnotationIds, type AreaPlan, type AreaPlanAnnotations } from './areaPlan.ts';
import { DIM_MIN_LENGTH } from './dimension.ts';
import { planViewById, type PlanView } from './planView.ts';
import { newId } from './ids.ts';
import { type Dimension, type DetailLine, type DetailRegion, type ElementTag, type Id, type Level, type Project, type RevisionCloud, type RoomSeparator, type SectionView, type SpotAnnotation, type SymbolAnnotation, type TextNote } from './types.ts';
import { cleanSectionAnnotations, sectionAnnotationsOf, type SectionAnnotations } from './sectionAnnotations.ts';
import { t as translate, type Lang } from './i18n.ts';

/**
 * Onde a anotação mora: sempre no nível e, quando `planId`/`sectionId` existe, na vista (planta de área ou corte/elevação).
 * Sem eles a anotação continua na planta de piso do nível, como sempre foi.
 */
interface AnnotationView {
  levelId: Id;
  /**
   * Planta dona da anotação: planta de área OU planta de disciplina (`PlanView`, decisão 0060; os ids são únicos no
   * projeto). Ausente = anotação do nível (planta de piso padrão).
   */
  planId?: Id;
  /** Vista de corte/elevação dona da anotação; ausente = anotação de planta. */
  sectionId?: Id;
}

/**
 * Anotações da planta (decisão 0019): cotas e textos ficam em cada nível. Os comandos recusam com mensagem pt-BR
 * e não alteram o projeto; remover o nível leva as anotações junto (elas moram no próprio nível).
 * Com `planId`, a anotação mora na planta de área e não vaza para a planta de piso.
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
  | ({ type: 'removeTag'; id: Id } & AnnotationView)
  | ({ type: 'addSpot'; item: SpotAnnotation } & AnnotationView)
  | ({ type: 'updateSpot'; id: Id; patch: Partial<Omit<SpotAnnotation, 'id'>> } & AnnotationView)
  | ({ type: 'removeSpot'; id: Id } & AnnotationView)
  | ({ type: 'addRevisionCloud'; item: RevisionCloud } & AnnotationView)
  | ({ type: 'updateRevisionCloud'; id: Id; patch: Partial<Omit<RevisionCloud, 'id'>> } & AnnotationView)
  | ({ type: 'removeRevisionCloud'; id: Id } & AnnotationView)
  | ({ type: 'addSymbol'; item: SymbolAnnotation } & AnnotationView)
  | ({ type: 'updateSymbol'; id: Id; patch: Partial<Omit<SymbolAnnotation, 'id'>> } & AnnotationView)
  | ({ type: 'removeSymbol'; id: Id } & AnnotationView);

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

export const levelDimensions = (p: Pick<Project, 'levels'>, levelId: Id): Dimension[] =>
  p.levels.find((l) => l.id === levelId)?.dimensions ?? [];

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

export const levelTexts = (p: Pick<Project, 'levels'>, levelId: Id): TextNote[] =>
  p.levels.find((l) => l.id === levelId)?.texts ?? [];

/** Leitura e escrita de uma família de anotações na vista (nível ou planta de área). */
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
  spots: AnnotationList<SpotAnnotation>;
  revisionClouds: AnnotationList<RevisionCloud>;
  symbols: AnnotationList<SymbolAnnotation>;
}

/** Anotações do nível (planta de piso). */
const levelScope = (level: Level): AnnotationScope => ({
  dimensions: { get: () => level.dimensions ?? [], set: (next) => { level.dimensions = next; } },
  texts: { get: () => level.texts ?? [], set: (next) => { level.texts = next; } },
  detailLines: { get: () => level.detailLines ?? [], set: (next) => { level.detailLines = next; } },
  detailRegions: { get: () => level.detailRegions ?? [], set: (next) => { level.detailRegions = next; } },
  tags: { get: () => level.tags ?? [], set: (next) => { level.tags = next; } },
  spots: { get: () => level.spots ?? [], set: (next) => { level.spots = next; } },
  revisionClouds: { get: () => level.revisionClouds ?? [], set: (next) => { level.revisionClouds = next; } },
  symbols: { get: () => level.symbols ?? [], set: (next) => { level.symbols = next; } },
});

/** Anotações da planta de área ou da planta de disciplina: cada escrita reatribui o conjunto, sem mutar o array atual. */
const planScope = (plan: AreaPlan | PlanView): AnnotationScope => {
  const write = (patch: Partial<AreaPlanAnnotations>): void => {
    plan.annotations = { ...planAnnotationsOf(plan), ...patch };
  };
  return {
    dimensions: { get: () => planAnnotationsOf(plan).dimensions, set: (dimensions) => write({ dimensions }) },
    texts: { get: () => planAnnotationsOf(plan).texts, set: (texts) => write({ texts }) },
    detailLines: { get: () => planAnnotationsOf(plan).detailLines, set: (detailLines) => write({ detailLines }) },
    detailRegions: { get: () => planAnnotationsOf(plan).detailRegions, set: (detailRegions) => write({ detailRegions }) },
    tags: { get: () => planAnnotationsOf(plan).tags, set: (tags) => write({ tags }) },
    spots: { get: () => planAnnotationsOf(plan).spots ?? [], set: (spots) => write({ spots }) },
    revisionClouds: { get: () => planAnnotationsOf(plan).revisionClouds ?? [], set: (revisionClouds) => write({ revisionClouds }) },
    symbols: { get: () => planAnnotationsOf(plan).symbols ?? [], set: (symbols) => write({ symbols }) },
  };
};

/** Planta da vista (de área ou de disciplina): precisa existir e ser do mesmo nível da anotação. */
function viewPlan(p: Project, planId: Id, levelId: Id, lang: Lang): AreaPlan | PlanView {
  const plan = areaPlanOf(p, planId) ?? planViewById(p, planId);
  if (!plan) throw new Error(translate(lang, 'md_area_plan_missing'));
  if (plan.levelId !== levelId) throw new Error(translate(lang, 'md_cmd_plan_level_mismatch'));
  return plan;
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
    spots: { get: () => sectionAnnotationsOf(view).spots ?? [], set: (spots) => write({ spots }) },
    revisionClouds: { get: () => sectionAnnotationsOf(view).revisionClouds ?? [], set: (revisionClouds) => write({ revisionClouds }) },
    symbols: { get: () => sectionAnnotationsOf(view).symbols ?? [], set: (symbols) => write({ symbols }) },
  };
};

/** Aplica um comando de anotação sobre o rascunho do projeto. Lança Error em texto pt-BR se recusar. */
export function applyAnnotationCommand(p: Project, c: AnnotationCommand, lang: Lang = 'pt'): void {
  const level = p.levels.find((l) => l.id === c.levelId);
  if (!level) throw new Error(translate(lang, 'md_level_missing'));
  const scope = 'sectionId' in c && c.sectionId
    ? sectionScope(viewSection(p, c.sectionId, lang))
    : 'planId' in c && c.planId
      ? planScope(viewPlan(p, c.planId, c.levelId, lang))
      : levelScope(level);
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
    case 'addSpot':
      if (!finite(c.item.target) || !finite(c.item.at)) throw new Error('Coordenada de anotação inválida.');
      scope.spots.set([...scope.spots.get(), c.item]);
      break;
    case 'updateSpot': {
      const old = scope.spots.get().find((x) => x.id === c.id);
      if (!old) throw new Error('Cota de elevação/coordenada não encontrada.');
      const next = { ...old, ...c.patch, id: old.id };
      scope.spots.set(scope.spots.get().map((x) => x.id === c.id ? next : x));
      break;
    }
    case 'removeSpot':
      if (!scope.spots.get().some((x) => x.id === c.id)) throw new Error('Cota de elevação/coordenada não encontrada.');
      scope.spots.set(scope.spots.get().filter((x) => x.id !== c.id));
      break;
    case 'addRevisionCloud':
      if (c.item.points.length < 2 || c.item.points.some((q) => !finite(q))) throw new Error('Nuvem de revisão inválida.');
      scope.revisionClouds.set([...scope.revisionClouds.get(), c.item]);
      break;
    case 'updateRevisionCloud': {
      const old = scope.revisionClouds.get().find((x) => x.id === c.id);
      if (!old) throw new Error('Nuvem de revisão não encontrada.');
      const next = { ...old, ...c.patch, id: old.id };
      scope.revisionClouds.set(scope.revisionClouds.get().map((x) => x.id === c.id ? next : x));
      break;
    }
    case 'removeRevisionCloud':
      if (!scope.revisionClouds.get().some((x) => x.id === c.id)) throw new Error('Nuvem de revisão não encontrada.');
      scope.revisionClouds.set(scope.revisionClouds.get().filter((x) => x.id !== c.id));
      break;
    case 'addSymbol':
      if (!finite(c.item.at)) throw new Error('Posição de símbolo inválida.');
      scope.symbols.set([...scope.symbols.get(), c.item]);
      break;
    case 'updateSymbol': {
      const old = scope.symbols.get().find((x) => x.id === c.id);
      if (!old) throw new Error('Símbolo não encontrado.');
      const next = { ...old, ...c.patch, id: old.id };
      scope.symbols.set(scope.symbols.get().map((x) => x.id === c.id ? next : x));
      break;
    }
    case 'removeSymbol':
      if (!scope.symbols.get().some((x) => x.id === c.id)) throw new Error('Símbolo não encontrado.');
      scope.symbols.set(scope.symbols.get().filter((x) => x.id !== c.id));
      break;
  }
}

export type RemoveAnnotation = Extract<AnnotationCommand, { type: 'removeDimension' | 'removeText' | 'removeRoomSeparator' | 'removeDetailLine' | 'removeDetailRegion' | 'removeTag' | 'removeSpot' | 'removeRevisionCloud' | 'removeSymbol' }>;

/** Origem das anotações (planta que as guarda): fontes do nível, da planta de área ou da planta de disciplina. */
type PlanSource = Pick<Project, 'levels'> & Partial<Pick<Project, 'areaPlans' | 'planViews'>>;

/**
 * Planta de disciplina (`PlanView`) do nível com este id, ou undefined. Planta de disciplina é DONA das suas anotações
 * (decisão 0060 §5): nenhuma anotação do nível entra no conjunto dela, ao contrário da planta de área.
 */
const ownPlanView = (p: PlanSource, levelId: Id, planId?: Id): PlanView | undefined => (planId ? [planViewById(p, planId)].find((v) => v?.levelId === levelId) : undefined);

/** Listas de anotações que Mover/Copiar/Excluir tratam (cota, texto, linha e região de detalhe, etiqueta). */
interface MovableLists {
  dimensions: readonly Dimension[];
  texts: readonly TextNote[];
  detailLines: readonly DetailLine[];
  detailRegions: readonly DetailRegion[];
  tags: readonly ElementTag[];
}

const levelLists = (p: PlanSource, levelId: Id): MovableLists => {
  const level = p.levels.find((l) => l.id === levelId);
  return { dimensions: levelDimensions(p, levelId), texts: levelTexts(p, levelId), detailLines: level?.detailLines ?? [], detailRegions: level?.detailRegions ?? [], tags: level?.tags ?? [] };
};

function removalsOf(a: MovableLists & { spots?: readonly SpotAnnotation[]; revisionClouds?: readonly RevisionCloud[]; symbols?: readonly SymbolAnnotation[] }, levelId: Id, planId: Id | undefined, want: ReadonlySet<Id>, out: RemoveAnnotation[]): void {
  const at = planId ? { levelId, planId } : { levelId };
  for (const x of a.dimensions) if (want.has(x.id)) out.push({ type: 'removeDimension', ...at, id: x.id });
  for (const x of a.texts) if (want.has(x.id)) out.push({ type: 'removeText', ...at, id: x.id });
  for (const x of a.detailLines) if (want.has(x.id)) out.push({ type: 'removeDetailLine', ...at, id: x.id });
  for (const x of a.detailRegions) if (want.has(x.id)) out.push({ type: 'removeDetailRegion', ...at, id: x.id });
  for (const x of a.tags) if (want.has(x.id)) out.push({ type: 'removeTag', ...at, id: x.id });
  for (const x of a.spots ?? []) if (want.has(x.id)) out.push({ type: 'removeSpot', ...at, id: x.id });
  for (const x of a.revisionClouds ?? []) if (want.has(x.id)) out.push({ type: 'removeRevisionCloud', ...at, id: x.id });
  for (const x of a.symbols ?? []) if (want.has(x.id)) out.push({ type: 'removeSymbol', ...at, id: x.id });
}

/**
 * Comandos de exclusão para as cotas e os textos da vista cujos ids estão em `ids` (o resto são elementos).
 * Com `planId` de planta de área, as anotações dela entram junto das do nível; com `planId` de planta de disciplina,
 * só as da própria planta (ela é dona das suas anotações).
 */
export function annotationRemovals(p: PlanSource, levelId: Id, ids: Id[], planId?: Id): RemoveAnnotation[] {
  const want = new Set(ids);
  const out: RemoveAnnotation[] = [];
  const pv = ownPlanView(p, levelId, planId);
  if (pv) {
    removalsOf(planAnnotationsOf(pv), levelId, pv.id, want, out);
    return out;
  }
  const level = p.levels.find((l) => l.id === levelId);
  removalsOf({ ...levelLists(p, levelId), spots: level?.spots, revisionClouds: level?.revisionClouds, symbols: level?.symbols }, levelId, undefined, want, out);
  const plan = planId ? areaPlanOf(p, planId) : undefined;
  if (plan) removalsOf(planAnnotationsOf(plan), levelId, planId, want, out);
  return out;
}

/**
 * Ids das anotações que estão em `ids`. Sem `planId`, só as do nível (planta padrão); com `planId`, as da planta
 * ativa (ver `annotationIdsInView`).
 */
export function annotationIdsIn(p: PlanSource, levelId: Id, ids: Id[], planId?: Id): Id[] {
  const have = new Set(annotationIdsInView(p, levelId, planId));
  return ids.filter((id) => have.has(id));
}

/**
 * Ids de todas as anotações da vista. Sem `planId`, as do nível. Com `planId` de planta de área, as do nível e as da
 * planta de área (cotas, textos, detalhes e etiquetas que moram na própria planta). Com `planId` de planta de
 * disciplina, SÓ as da própria planta (nunca as do nível: cota de arquitetura não vaza para a estrutura).
 */
export function annotationIdsInView(p: PlanSource, levelId: Id, planId?: Id): Id[] {
  const pv = ownPlanView(p, levelId, planId);
  if (pv) return planAnnotationIds(pv);
  const level = p.levels.find((l) => l.id === levelId);
  const ids = [
    ...(level?.dimensions ?? []),
    ...(level?.texts ?? []),
    ...(level?.detailLines ?? []),
    ...(level?.detailRegions ?? []),
    ...(level?.tags ?? []),
    ...(level?.spots ?? []),
    ...(level?.revisionClouds ?? []),
    ...(level?.symbols ?? []),
  ].map((a) => a.id);
  if (!planId) return ids;
  const plan = areaPlanOf(p, planId);
  return plan ? [...ids, ...planAnnotationIds(plan)] : ids;
}

/** Comandos que movem por `d` (ou, com `copy`, copiam com ids novos) as anotações de `a` que estão em `want`. */
function moveCommandsOf(a: MovableLists, levelId: Id, planId: Id | undefined, want: ReadonlySet<Id>, d: Vec2, copy: boolean, out: AnnotationCommand[]): void {
  const at = planId ? { levelId, planId } : { levelId };
  const shift = (v: Vec2): Vec2 => ({ x: v.x + d.x, y: v.y + d.y });
  for (const dim of a.dimensions) {
    if (!want.has(dim.id)) continue;
    const moved = { ...dim, a: shift(dim.a), b: shift(dim.b), ...(dim.textAt ? { textAt: shift(dim.textAt) } : {}), ...(dim.angular ? { angular: { ...dim.angular, center: shift(dim.angular.center) } } : {}) };
    if (copy) out.push({ type: 'addDimension', ...at, dimension: { ...moved, id: newId('dim'), refs: undefined } });
    else out.push({ type: 'updateDimension', ...at, id: dim.id, patch: { ...moved, refs: undefined } });
  }
  for (const t of a.texts) {
    if (!want.has(t.id)) continue;
    const movedLeader = t.leader?.map(shift);
    if (copy) out.push({ type: 'addText', ...at, text: { ...t, id: newId('txt'), at: shift(t.at), leader: movedLeader } });
    else out.push({ type: 'updateText', ...at, id: t.id, patch: { at: shift(t.at), leader: movedLeader } });
  }
  for (const item of a.detailLines) if (want.has(item.id)) {
    const moved = { a: shift(item.a), b: shift(item.b) };
    if (copy) out.push({ type: 'addDetailLine', ...at, item: { ...item, id: newId('dl'), ...moved } });
    else out.push({ type: 'updateDetailLine', ...at, id: item.id, patch: moved });
  }
  for (const item of a.detailRegions) if (want.has(item.id)) {
    const boundary = item.boundary.map(shift);
    if (copy) out.push({ type: 'addDetailRegion', ...at, item: { ...item, id: newId('dr'), boundary } });
    else out.push({ type: 'updateDetailRegion', ...at, id: item.id, patch: { boundary } });
  }
  for (const item of a.tags) if (want.has(item.id)) {
    const pos = shift(item.at);
    if (copy) out.push({ type: 'addTag', ...at, item: { ...item, id: newId('tag'), at: pos } });
    else out.push({ type: 'updateTag', ...at, id: item.id, patch: { at: pos } });
  }
}

/**
 * Comandos que movem por `d` as anotações de `ids` (ou, com `copy`, criam cópias com ids novos). Uma cota movida perde
 * as referências às paredes: a posição passa a ser livre. Sem `planId`, só as do nível (planta padrão). Com `planId` de
 * planta de área: as do nível e as da planta de área, cada uma no seu dono (a cópia da anotação da planta nasce NA
 * planta). Com `planId` de planta de disciplina: só as da própria planta, no dono dela.
 */
export function annotationMoveCommands(p: PlanSource, levelId: Id, ids: Id[], d: Vec2, copy: boolean, planId?: Id): AnnotationCommand[] {
  const want = new Set(ids);
  const out: AnnotationCommand[] = [];
  const pv = ownPlanView(p, levelId, planId);
  if (pv) {
    moveCommandsOf(planAnnotationsOf(pv), levelId, pv.id, want, d, copy, out);
    return out;
  }
  moveCommandsOf(levelLists(p, levelId), levelId, undefined, want, d, copy, out);
  const plan = planId ? areaPlanOf(p, planId) : undefined;
  if (plan) moveCommandsOf(planAnnotationsOf(plan), levelId, planId, want, d, copy, out);
  return out;
}
