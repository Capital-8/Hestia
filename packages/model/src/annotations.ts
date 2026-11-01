import { len, sub, type Vec2 } from '@hestia/geom';
import { areaPlanOf, planAnnotationsOf, planAnnotationIds, type AreaPlan, type AreaPlanAnnotations } from './areaPlan.ts';
import { DIM_MIN_LENGTH } from './dimension.ts';
import { newId } from './ids.ts';
import { type Dimension, type DetailLine, type DetailRegion, type ElementTag, type Id, type Level, type Project, type RoomSeparator, type SectionView, type TextNote } from './types.ts';
import { cleanSectionAnnotations, sectionAnnotationsOf, type SectionAnnotations } from './sectionAnnotations.ts';

/**
 * Onde a anotação mora: sempre no nível e, quando `planId`/`sectionId` existe, na vista (planta de área ou corte/elevação).
 * Sem eles a anotação continua na planta de piso do nível, como sempre foi.
 */
interface AnnotationView {
  levelId: Id;
  /** Planta de área dona da anotação; ausente = anotação do nível (planta de piso). */
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
  | ({ type: 'removeTag'; id: Id } & AnnotationView);

const finite = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);

/** Motivo de recusa de uma cota, ou null. */
export function dimensionIssue(d: Dimension): string | null {
  if (d.angular) {
    const a = d.angular;
    if (!a.refA || !a.refB) return 'A cota angular precisa de duas referências.';
    if (!finite(a.center) || !finite(a.from) || !finite(a.to)) return 'A geometria da cota angular precisa de pontos finitos.';
    if (!(Number.isFinite(a.radius) && a.radius > 0)) return 'O raio da cota angular deve ser maior que zero.';
    const twoPi = Math.PI * 2;
    if (!(Number.isFinite(a.value) && a.value >= 0 && a.value <= twoPi + 1e-9)) return 'O ângulo da cota angular deve estar em radianos entre 0 e 2π.';
    if (a.side === 'reflex') {
      if (!(a.value > Math.PI + 1e-9 && a.value <= twoPi + 1e-9)) return 'A volta da cota angular deve medir mais de 180° e no máximo 360°.';
    } else if (a.value > Math.PI + 1e-9) {
      return 'O ângulo da cota angular deve estar em radianos entre 0 e π.';
    }
    if (d.textHeight !== undefined && !(Number.isFinite(d.textHeight) && d.textHeight > 0)) return 'A altura do texto da cota deve ser maior que zero.';
    return null;
  }
  if (!finite(d.a) || !finite(d.b)) return 'As coordenadas da cota devem ser números finitos.';
  if (!Number.isFinite(d.offset)) return 'O deslocamento da cota deve ser um número finito.';
  if (d.textAt && !finite(d.textAt)) return 'A posição do texto da cota deve ser finita.';
  if (d.textHeight !== undefined && !(Number.isFinite(d.textHeight) && d.textHeight > 0)) return 'A altura do texto da cota deve ser maior que zero.';
  if (d.precision !== undefined && ![0, 1, 2, 3].includes(d.precision)) return 'A precisão da cota deve ter entre zero e três casas decimais.';
  if (len(sub(d.b, d.a)) < DIM_MIN_LENGTH) return 'A cota precisa de dois pontos distintos.';
  return null;
}

/** Motivo de recusa de um texto, ou null. */
export function textIssue(t: TextNote): string | null {
  if (!finite(t.at)) return 'A posição do texto deve ser um ponto finito.';
  if (t.text.trim() === '') return 'O texto não pode ser vazio.';
  if (!(Number.isFinite(t.height) && t.height > 0)) return 'A altura do texto deve ser maior que zero.';
  if (!Number.isFinite(t.rotation)) return 'A rotação do texto deve ser um número finito.';
  if (t.width !== undefined && !(Number.isFinite(t.width) && t.width > 0)) return 'A largura do texto deve ser maior que zero.';
  if (t.leader && (t.leader.length < 2 || t.leader.some((p) => !finite(p)))) return 'A chamada precisa de dois pontos válidos.';
  return null;
}

export const levelDimensions = (p: Pick<Project, 'levels'>, levelId: Id): Dimension[] =>
  p.levels.find((l) => l.id === levelId)?.dimensions ?? [];

/** Comprimento mínimo (m) de uma linha de separação de ambiente. */
export const ROOM_SEPARATOR_MIN_LENGTH = 0.05;

/** Motivo de recusa de uma linha de separação, ou null. Pontos distintos e não muito próximos. */
export function roomSeparatorIssue(r: RoomSeparator): string | null {
  if (!finite(r.a) || !finite(r.b)) return 'As coordenadas da linha de separação devem ser números finitos.';
  if (len(sub(r.b, r.a)) < ROOM_SEPARATOR_MIN_LENGTH) return 'A linha de separação precisa de dois pontos distintos.';
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
}

/** Anotações do nível (planta de piso). */
const levelScope = (level: Level): AnnotationScope => ({
  dimensions: { get: () => level.dimensions ?? [], set: (next) => { level.dimensions = next; } },
  texts: { get: () => level.texts ?? [], set: (next) => { level.texts = next; } },
  detailLines: { get: () => level.detailLines ?? [], set: (next) => { level.detailLines = next; } },
  detailRegions: { get: () => level.detailRegions ?? [], set: (next) => { level.detailRegions = next; } },
  tags: { get: () => level.tags ?? [], set: (next) => { level.tags = next; } },
});

/** Anotações da planta de área: cada escrita reatribui o conjunto, sem mutar o array atual. */
const planScope = (plan: AreaPlan): AnnotationScope => {
  const write = (patch: Partial<AreaPlanAnnotations>): void => {
    plan.annotations = { ...planAnnotationsOf(plan), ...patch };
  };
  return {
    dimensions: { get: () => planAnnotationsOf(plan).dimensions, set: (dimensions) => write({ dimensions }) },
    texts: { get: () => planAnnotationsOf(plan).texts, set: (texts) => write({ texts }) },
    detailLines: { get: () => planAnnotationsOf(plan).detailLines, set: (detailLines) => write({ detailLines }) },
    detailRegions: { get: () => planAnnotationsOf(plan).detailRegions, set: (detailRegions) => write({ detailRegions }) },
    tags: { get: () => planAnnotationsOf(plan).tags, set: (tags) => write({ tags }) },
  };
};

/** Planta de área da vista: precisa existir e ser do mesmo nível da anotação. */
function viewPlan(p: Project, planId: Id, levelId: Id): AreaPlan {
  const plan = areaPlanOf(p, planId);
  if (!plan) throw new Error('Planta de área inexistente');
  if (plan.levelId !== levelId) throw new Error('A planta de área não pertence ao nível da anotação');
  return plan;
}

/** Vista de corte/elevação dona da anotação: precisa existir no projeto. */
function viewSection(p: Project, sectionId: Id): SectionView {
  const view = p.views.find((v) => v.id === sectionId);
  if (!view) throw new Error('Vista de corte/elevação inexistente');
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

/** Aplica um comando de anotação sobre o rascunho do projeto. Lança Error em texto pt-BR se recusar. */
export function applyAnnotationCommand(p: Project, c: AnnotationCommand): void {
  const level = p.levels.find((l) => l.id === c.levelId);
  if (!level) throw new Error('Nível inexistente');
  const scope = 'sectionId' in c && c.sectionId
    ? sectionScope(viewSection(p, c.sectionId))
    : 'planId' in c && c.planId
      ? planScope(viewPlan(p, c.planId, c.levelId))
      : levelScope(level);
  switch (c.type) {
    case 'addDimension': {
      const issue = dimensionIssue(c.dimension);
      if (issue) throw new Error(issue);
      scope.dimensions.set([...scope.dimensions.get(), c.dimension]);
      break;
    }
    case 'updateDimension': {
      const old = scope.dimensions.get().find((d) => d.id === c.id);
      if (!old) throw new Error('Cota inexistente');
      const next: Dimension = { ...old, ...c.patch, id: old.id };
      const issue = dimensionIssue(next);
      if (issue) throw new Error(issue);
      scope.dimensions.set(scope.dimensions.get().map((d) => (d.id === c.id ? next : d)));
      break;
    }
    case 'removeDimension':
      if (!scope.dimensions.get().some((d) => d.id === c.id)) throw new Error('Cota inexistente');
      scope.dimensions.set(scope.dimensions.get().filter((d) => d.id !== c.id));
      break;
    case 'addText': {
      const issue = textIssue(c.text);
      if (issue) throw new Error(issue);
      scope.texts.set([...scope.texts.get(), c.text]);
      break;
    }
    case 'updateText': {
      const old = scope.texts.get().find((t) => t.id === c.id);
      if (!old) throw new Error('Texto inexistente');
      const next: TextNote = { ...old, ...c.patch, id: old.id };
      const issue = textIssue(next);
      if (issue) throw new Error(issue);
      scope.texts.set(scope.texts.get().map((t) => (t.id === c.id ? next : t)));
      break;
    }
    case 'removeText':
      if (!scope.texts.get().some((t) => t.id === c.id)) throw new Error('Texto inexistente');
      scope.texts.set(scope.texts.get().filter((t) => t.id !== c.id));
      break;
    case 'addRoomSeparator': {
      const issue = roomSeparatorIssue(c.separator);
      if (issue) throw new Error(issue);
      level.roomSeparators = [...(level.roomSeparators ?? []), c.separator];
      break;
    }
    case 'removeRoomSeparator':
      if (!level.roomSeparators?.some((r) => r.id === c.id)) throw new Error('Linha de separação inexistente');
      level.roomSeparators = level.roomSeparators.filter((r) => r.id !== c.id);
      break;
    case 'updateRoomSeparator': {
      const old = level.roomSeparators?.find((r) => r.id === c.id);
      if (!old) throw new Error('Linha de separação inexistente');
      const next: RoomSeparator = { ...old, ...c.patch, id: old.id };
      const issue = roomSeparatorIssue(next);
      if (issue) throw new Error(issue);
      level.roomSeparators = level.roomSeparators!.map((r) => (r.id === c.id ? next : r));
      break;
    }
    case 'addDetailLine':
      if (!finite(c.item.a) || !finite(c.item.b) || len(sub(c.item.b, c.item.a)) < ROOM_SEPARATOR_MIN_LENGTH) throw new Error('A linha de detalhe precisa de dois pontos distintos.');
      scope.detailLines.set([...scope.detailLines.get(), c.item]);
      break;
    case 'updateDetailLine': {
      const old = scope.detailLines.get().find((x) => x.id === c.id);
      if (!old) throw new Error('Linha de detalhe inexistente');
      const next = { ...old, ...c.patch, id: old.id };
      if (!finite(next.a) || !finite(next.b) || len(sub(next.b, next.a)) < ROOM_SEPARATOR_MIN_LENGTH) throw new Error('A linha de detalhe precisa de dois pontos distintos.');
      scope.detailLines.set(scope.detailLines.get().map((x) => x.id === c.id ? next : x));
      break;
    }
    case 'removeDetailLine':
      if (!scope.detailLines.get().some((x) => x.id === c.id)) throw new Error('Linha de detalhe inexistente');
      scope.detailLines.set(scope.detailLines.get().filter((x) => x.id !== c.id));
      break;
    case 'addDetailRegion':
      if (c.item.boundary.length < 3 || c.item.boundary.some((p) => !finite(p))) throw new Error('A região precisa de pelo menos três pontos válidos.');
      scope.detailRegions.set([...scope.detailRegions.get(), c.item]);
      break;
    case 'updateDetailRegion': {
      const old = scope.detailRegions.get().find((x) => x.id === c.id);
      if (!old) throw new Error('Região de detalhe inexistente');
      const next = { ...old, ...c.patch, id: old.id };
      if (next.boundary.length < 3 || next.boundary.some((p) => !finite(p))) throw new Error('A região precisa de pelo menos três pontos válidos.');
      scope.detailRegions.set(scope.detailRegions.get().map((x) => x.id === c.id ? next : x));
      break;
    }
    case 'removeDetailRegion':
      if (!scope.detailRegions.get().some((x) => x.id === c.id)) throw new Error('Região de detalhe inexistente');
      scope.detailRegions.set(scope.detailRegions.get().filter((x) => x.id !== c.id));
      break;
    case 'addTag':
      if (!finite(c.item.at) || !p.elements[c.item.hostId]) throw new Error('A etiqueta precisa estar ligada a um elemento existente.');
      scope.tags.set([...scope.tags.get(), c.item]);
      break;
    case 'updateTag': {
      const old = scope.tags.get().find((x) => x.id === c.id);
      if (!old) throw new Error('Etiqueta inexistente');
      const next = { ...old, ...c.patch, id: old.id };
      if (!finite(next.at) || !p.elements[next.hostId]) throw new Error('A etiqueta precisa estar ligada a um elemento existente.');
      scope.tags.set(scope.tags.get().map((x) => x.id === c.id ? next : x));
      break;
    }
    case 'removeTag':
      if (!scope.tags.get().some((x) => x.id === c.id)) throw new Error('Etiqueta inexistente');
      scope.tags.set(scope.tags.get().filter((x) => x.id !== c.id));
      break;
  }
}

export type RemoveAnnotation = Extract<AnnotationCommand, { type: 'removeDimension' | 'removeText' | 'removeRoomSeparator' | 'removeDetailLine' | 'removeDetailRegion' | 'removeTag' }>;

/**
 * Comandos de exclusão para as cotas e os textos da vista cujos ids estão em `ids` (o resto são elementos).
 * Com `planId`, as anotações da planta de área entram junto; sem ele, só as do nível.
 */
export function annotationRemovals(p: Pick<Project, 'levels' | 'areaPlans'>, levelId: Id, ids: Id[], planId?: Id): RemoveAnnotation[] {
  const want = new Set(ids);
  const out: RemoveAnnotation[] = [];
  for (const d of levelDimensions(p, levelId)) if (want.has(d.id)) out.push({ type: 'removeDimension', levelId, id: d.id });
  for (const t of levelTexts(p, levelId)) if (want.has(t.id)) out.push({ type: 'removeText', levelId, id: t.id });
  const level = p.levels.find((l) => l.id === levelId);
  for (const x of level?.detailLines ?? []) if (want.has(x.id)) out.push({ type: 'removeDetailLine', levelId, id: x.id });
  for (const x of level?.detailRegions ?? []) if (want.has(x.id)) out.push({ type: 'removeDetailRegion', levelId, id: x.id });
  for (const x of level?.tags ?? []) if (want.has(x.id)) out.push({ type: 'removeTag', levelId, id: x.id });
  const plan = planId ? areaPlanOf(p, planId) : undefined;
  if (plan) {
    const a = planAnnotationsOf(plan);
    for (const x of a.dimensions) if (want.has(x.id)) out.push({ type: 'removeDimension', levelId, planId, id: x.id });
    for (const x of a.texts) if (want.has(x.id)) out.push({ type: 'removeText', levelId, planId, id: x.id });
    for (const x of a.detailLines) if (want.has(x.id)) out.push({ type: 'removeDetailLine', levelId, planId, id: x.id });
    for (const x of a.detailRegions) if (want.has(x.id)) out.push({ type: 'removeDetailRegion', levelId, planId, id: x.id });
    for (const x of a.tags) if (want.has(x.id)) out.push({ type: 'removeTag', levelId, planId, id: x.id });
  }
  return out;
}

/** Ids das anotações do nível que estão em `ids`. */
export function annotationIdsIn(p: Pick<Project, 'levels'>, levelId: Id, ids: Id[]): Id[] {
  const have = new Set(annotationIdsInView(p, levelId));
  return ids.filter((id) => have.has(id));
}

/**
 * Ids de todas as anotações da vista: sempre as do nível e, com `planId`, também as da planta de área
 * (cotas, textos, detalhes e etiquetas que moram na própria planta).
 */
export function annotationIdsInView(p: Pick<Project, 'levels' | 'areaPlans'>, levelId: Id, planId?: Id): Id[] {
  const level = p.levels.find((l) => l.id === levelId);
  const ids = [
    ...(level?.dimensions ?? []),
    ...(level?.texts ?? []),
    ...(level?.detailLines ?? []),
    ...(level?.detailRegions ?? []),
    ...(level?.tags ?? []),
  ].map((a) => a.id);
  if (!planId) return ids;
  const plan = areaPlanOf(p, planId);
  return plan ? [...ids, ...planAnnotationIds(plan)] : ids;
}

/**
 * Comandos que movem por `d` as cotas e os textos de `ids` (ou, com `copy`, criam cópias com ids novos). Uma cota movida
 * perde as referências às paredes: a posição passa a ser livre.
 */
export function annotationMoveCommands(p: Pick<Project, 'levels'>, levelId: Id, ids: Id[], d: Vec2, copy: boolean): AnnotationCommand[] {
  const want = new Set(ids);
  const shift = (v: Vec2): Vec2 => ({ x: v.x + d.x, y: v.y + d.y });
  const out: AnnotationCommand[] = [];
  for (const dim of levelDimensions(p, levelId)) {
    if (!want.has(dim.id)) continue;
    const moved = { ...dim, a: shift(dim.a), b: shift(dim.b), ...(dim.textAt ? { textAt: shift(dim.textAt) } : {}), ...(dim.angular ? { angular: { ...dim.angular, center: shift(dim.angular.center) } } : {}) };
    if (copy) out.push({ type: 'addDimension', levelId, dimension: { ...moved, id: newId('dim'), refs: undefined } });
    else out.push({ type: 'updateDimension', levelId, id: dim.id, patch: { ...moved, refs: undefined } });
  }
  for (const t of levelTexts(p, levelId)) {
    if (!want.has(t.id)) continue;
    const movedLeader = t.leader?.map(shift);
    if (copy) out.push({ type: 'addText', levelId, text: { ...t, id: newId('txt'), at: shift(t.at), leader: movedLeader } });
    else out.push({ type: 'updateText', levelId, id: t.id, patch: { at: shift(t.at), leader: movedLeader } });
  }
  const level = p.levels.find((l) => l.id === levelId);
  for (const item of level?.detailLines ?? []) if (want.has(item.id)) {
    const moved = { a: shift(item.a), b: shift(item.b) };
    if (copy) out.push({ type: 'addDetailLine', levelId, item: { ...item, id: newId('dl'), ...moved } });
    else out.push({ type: 'updateDetailLine', levelId, id: item.id, patch: moved });
  }
  for (const item of level?.detailRegions ?? []) if (want.has(item.id)) {
    const boundary = item.boundary.map(shift);
    if (copy) out.push({ type: 'addDetailRegion', levelId, item: { ...item, id: newId('dr'), boundary } });
    else out.push({ type: 'updateDetailRegion', levelId, id: item.id, patch: { boundary } });
  }
  for (const item of level?.tags ?? []) if (want.has(item.id)) {
    const at = shift(item.at);
    if (copy) out.push({ type: 'addTag', levelId, item: { ...item, id: newId('tag'), at } });
    else out.push({ type: 'updateTag', levelId, id: item.id, patch: { at } });
  }
  return out;
}
