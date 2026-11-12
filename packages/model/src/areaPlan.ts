import type { Vec2 } from '@hestia/geom';
import { t, type Lang } from './i18n.ts';
import { isDraft } from 'immer';
import type { DetailLine, DetailRegion, Dimension, ElementTag, TextNote, Id, Project } from './types.ts';
import type { ViewHidden } from './graphics.ts';
import type { PlanView } from './planView.ts';

/** Anotações de uma planta de área (mesmas estruturas da planta de piso, guardadas por vista). */
export interface AreaPlanAnnotations {
  dimensions: Dimension[];
  texts: TextNote[];
  detailLines: DetailLine[];
  detailRegions: DetailRegion[];
  tags: ElementTag[];
}

/** Linha da etiqueta de ambiente (a ordem é a ordem no bloco). */
export type TagField = 'name' | 'number' | 'area' | 'category' | 'level' | 'perimeter' | 'volume' | 'custom';

/** Chamada da etiqueta: nenhuma, reta, com ombro (Revit: Leader com cotovelo) ou duas linhas cruzadas. */
export type TagLeader = 'none' | 'straight' | 'kinked' | 'crossed';

/**
 * Etiqueta de ambiente de uma planta de área. É anotação da vista: não move o ambiente, não altera a
 * área e pode existir em posições diferentes em plantas diferentes (Revit: Room Tag).
 */
export interface RoomTag {
  id: Id;
  planId: Id;
  roomId: Id;
  /** Centro do bloco de texto, em coordenadas de modelo. */
  at: Vec2;
  orientation: 'horizontal' | 'vertical';
  leader: TagLeader;
  fields: TagField[];
  /** Texto livre quando `fields` inclui `custom`. */
  custom?: string;
  visible: boolean;
  locked?: boolean;
}

/** Esquema de cores aplicado à planta (só existe cor depois de configurado). */
export type ColorSchemeBy = 'category' | 'level' | 'areaRange';

export interface ColorRange {
  min: number;
  max: number;
  color: string;
  label: string;
}

export interface ColorScheme {
  id: Id;
  name: string;
  by: ColorSchemeBy;
  /** Overrides por categoria ou por nível; ausente usa a cor da categoria ou a paleta. */
  overrides?: Record<Id, string>;
  ranges?: ColorRange[];
}

/** Categoria de ambiente: nome, código, cor e hachura (para planta P&B). */
export interface RoomCategory {
  id: Id;
  name: string;
  code?: string;
  color: string;
  hatch?: 'none' | 'diagonal' | 'cross' | 'dots' | 'solid';
}

export interface AreaLegend {
  at: Vec2;
  title: string;
  groupBy: 'category' | 'level';
  showCount: boolean;
  showArea: boolean;
  showPercent: boolean;
}

export type AreaTableColumn = 'number' | 'name' | 'level' | 'category' | 'area' | 'percent' | 'perimeter' | 'volume';

export interface AreaTable {
  at: Vec2;
  title: string;
  columns: AreaTableColumn[];
  groupBy: 'level' | 'category' | 'none';
  totals: 'level' | 'general' | 'both';
}

/** Gráficos da planta de área. O padrão é sem cor: só linhas de referência, etiquetas e paredes claras. */
export interface AreaPlanGraphics {
  /** Diagonais que atravessam o ambiente (Revit: Reference). */
  referenceLines: 'always' | 'selected' | 'never';
  referenceLinesPrint: boolean;
  /** Preenchimento só entra com esquema de cores configurado. */
  fill: 'none' | 'scheme' | 'hatch';
  fillOpacity: number;
  outline: 'none' | 'thin' | 'dashed';
  showWalls: 'light' | 'normal' | 'hidden';
  showOpenings: boolean;
  showDimensions: boolean;
  showAnnotations: boolean;
  showFloors: boolean;
  /** Grades de eixos (opcional; padrão desligado). */
  showGrids?: boolean;
  /** Marcas de corte e elevação (opcional; padrão desligado). */
  showSectionMarks?: boolean;
  /** Escadas e rampas do nível (opcional; padrão ligado). */
  showStairs?: boolean;
  /** Telhados em projeção (opcional; padrão ligado). */
  showRoofs?: boolean;
  /** Objetos importados (opcional; padrão desligado). */
  showGeneric?: boolean;
  showBelowLevel: boolean;
  tagDefault: Pick<RoomTag, 'leader' | 'fields' | 'orientation'>;
}

/** Planta de área de um pavimento. */
export interface AreaPlan {
  id: Id;
  name: string;
  levelId: Id;
  /** Esquema de cores; ausente = sem cor. */
  schemeId?: Id;
  scale: number;
  graphics: AreaPlanGraphics;
  tags: RoomTag[];
  legend?: AreaLegend;
  table?: AreaTable;
  /** Cotas, textos, detalhes e etiquetas desta vista (não vazam para a planta de piso). */
  annotations?: AreaPlanAnnotations;
  /** Elementos/categorias ocultos nesta planta de área (Hide in View). */
  hidden?: ViewHidden;
}

export const DEFAULT_TAG_FIELDS: TagField[] = ['name', 'number', 'area'];

export const DEFAULT_AREA_GRAPHICS: AreaPlanGraphics = {
  referenceLines: 'always',
  referenceLinesPrint: true,
  fill: 'none',
  fillOpacity: 0.14,
  outline: 'thin',
  showWalls: 'light',
  showOpenings: false,
  showDimensions: true,
  showAnnotations: true,
  showFloors: false,
  showGrids: false,
  showSectionMarks: false,
  showStairs: true,
  showRoofs: true,
  showGeneric: false,
  showBelowLevel: false,
  tagDefault: { leader: 'straight', fields: DEFAULT_TAG_FIELDS, orientation: 'horizontal' },
};

/** Categorias de ambiente padrão no idioma pedido. */
export function roomCategories(lang: Lang = 'pt'): RoomCategory[] {
  return [
    { id: 'rc_sala', name: t(lang, 'md_room_sala'), code: 'SL', color: '#dbe7f3', hatch: 'diagonal' },
    { id: 'rc_cozinha', name: t(lang, 'md_room_cozinha'), code: 'CZ', color: '#f6e3c8', hatch: 'cross' },
    { id: 'rc_quarto', name: t(lang, 'md_room_quarto'), code: 'QT', color: '#e2f0dc', hatch: 'dots' },
    { id: 'rc_banho', name: t(lang, 'md_room_banho'), code: 'BH', color: '#e6e1f4', hatch: 'solid' },
    { id: 'rc_circulacao', name: t(lang, 'md_room_circulacao'), code: 'CR', color: '#f3e7cf', hatch: 'diagonal' },
    { id: 'rc_servico', name: t(lang, 'md_room_servico'), code: 'SV', color: '#e8eef2', hatch: 'cross' },
    { id: 'rc_garagem', name: t(lang, 'md_room_garagem'), code: 'GR', color: '#e4e4e4', hatch: 'solid' },
    { id: 'rc_varanda', name: t(lang, 'md_room_varanda'), code: 'VR', color: '#e7f1e4', hatch: 'dots' },
  ];
}

/** Categorias em PT (compatibilidade); use `roomCategories(lang)` para o idioma ativo. */
export const DEFAULT_ROOM_CATEGORIES: RoomCategory[] = roomCategories('pt');

export const categoryById = (p: Pick<Project, 'roomCategories'>, id: Id | undefined): RoomCategory | undefined =>
  id ? (p.roomCategories ?? DEFAULT_ROOM_CATEGORIES).find((c) => c.id === id) : undefined;

/**
 * FACHADA (Fase 2): a planta de área é uma `PlanView` de `kind: 'area'`. Estes objetos `AreaPlan` são PROJETADOS a partir
 * das vistas, estáveis por referência (memorizados pela `PlanView`): a mesma vista devolve o mesmo objeto. Fora de comandos.
 * Não importa `planView.ts` (ciclo com `viewProfile.ts`): lê `p.planViews` direto.
 */
const projectedAreaPlan = new WeakMap<PlanView, AreaPlan>();
function areaPlanOfView(v: PlanView): AreaPlan | undefined {
  if (v.kind !== 'area' || !v.area) return undefined;
  const cached = isDraft(v) ? undefined : projectedAreaPlan.get(v);
  if (cached) return cached;
  const a = v.area;
  const plan: AreaPlan = {
    id: v.id, name: v.name, levelId: v.levelId,
    ...(a.schemeId !== undefined ? { schemeId: a.schemeId } : {}),
    scale: a.scale, graphics: a.graphics, tags: a.tags,
    ...(a.legend ? { legend: a.legend } : {}),
    ...(a.table ? { table: a.table } : {}),
    annotations: v.annotations,
    ...(v.hidden ? { hidden: v.hidden } : {}),
  };
  if (!isDraft(v)) projectedAreaPlan.set(v, plan);
  return plan;
}

const NO_AREA_PLANS: AreaPlan[] = [];
const areaListCache = new WeakMap<PlanView[], AreaPlan[]>();

/** Plantas de área do projeto (projeção das vistas `area`), na ordem de `planViews`. Estável por referência. */
export const areaPlansOf = (p: Pick<Project, 'planViews'>): AreaPlan[] => {
  const views = p.planViews ?? [];
  if (views.length === 0) return NO_AREA_PLANS;
  const hit = isDraft(views) ? undefined : areaListCache.get(views);
  if (hit) return hit;
  const list = views.flatMap((v) => areaPlanOfView(v) ?? []);
  if (!isDraft(views)) areaListCache.set(views, list);
  return list;
};

export const areaPlanOf = (p: Pick<Project, 'planViews'>, id: Id): AreaPlan | undefined => areaPlansOf(p).find((x) => x.id === id);

export const areaPlansOfLevel = (p: Pick<Project, 'planViews'>, levelId: Id): AreaPlan[] => areaPlansOf(p).filter((x) => x.levelId === levelId);

export const tagsOfPlan = (plan: Pick<AreaPlan, 'tags'>): RoomTag[] => plan.tags;

/** Anotações vazias de uma planta de área. */
export const emptyPlanAnnotations = (): AreaPlanAnnotations => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] });

/**
 * Anotações da planta normalizadas: listas ausentes viram `[]` (então `{}` é "próprio e vazio"). Devolve a mesma
 * referência quando já está completo. Sem conjunto próprio devolve vazio (o chamador decide se cai nas do nível).
 */
export const planAnnotationsOf = (plan: Pick<AreaPlan, 'annotations'>): AreaPlanAnnotations => {
  const a: Partial<AreaPlanAnnotations> | undefined = plan.annotations;
  if (a === undefined) return emptyPlanAnnotations();
  if (a.dimensions && a.texts && a.detailLines && a.detailRegions && a.tags) return a as AreaPlanAnnotations;
  return { dimensions: a.dimensions ?? [], texts: a.texts ?? [], detailLines: a.detailLines ?? [], detailRegions: a.detailRegions ?? [], tags: a.tags ?? [] };
};

/** Cópia das anotações da planta: os comandos nunca compartilham os arrays da origem. */
export const copyPlanAnnotations = (a: AreaPlanAnnotations): AreaPlanAnnotations => ({
  dimensions: a.dimensions.map((x) => ({ ...x })),
  texts: a.texts.map((x) => ({ ...x })),
  detailLines: a.detailLines.map((x) => ({ ...x })),
  detailRegions: a.detailRegions.map((x) => ({ ...x, boundary: x.boundary.map((p) => ({ ...p })) })),
  tags: a.tags.map((x) => ({ ...x, at: { ...x.at } })),
});

/** Ids de todas as anotações da planta (seleção e ocultação). */
export const planAnnotationIds = (plan: Pick<AreaPlan, 'annotations'>): Id[] => {
  const a = planAnnotationsOf(plan);
  return [...a.dimensions.map((x) => x.id), ...a.texts.map((x) => x.id), ...a.detailLines.map((x) => x.id), ...a.detailRegions.map((x) => x.id), ...a.tags.map((x) => x.id)];
};

export const roomTagsOf = (p: Pick<Project, 'planViews'>, roomId: Id): RoomTag[] => areaPlansOf(p).flatMap((x) => x.tags.filter((t) => t.roomId === roomId));

/** Motivo de recusa de uma planta de área, ou null. */
export function areaPlanIssue(p: Pick<Project, 'levels'>, plan: AreaPlan): string | null {
  if (!plan.name.trim()) return 'A planta de área precisa de nome.';
  if (!p.levels.some((l) => l.id === plan.levelId)) return 'A planta de área aponta para um nível inexistente.';
  if (!(Number.isFinite(plan.scale) && plan.scale > 0)) return 'A escala da planta precisa ser maior que zero.';
  const ids = new Set<Id>();
  for (const tag of plan.tags) {
    if (ids.has(tag.id)) return 'Há duas etiquetas com o mesmo id na planta.';
    ids.add(tag.id);
  }
  return null;
}

/** Motivo de recusa de uma etiqueta, ou null. */
export function roomTagIssue(tag: RoomTag): string | null {
  if (!tag.roomId) return 'A etiqueta não aponta para um ambiente.';
  if (!Number.isFinite(tag.at.x) || !Number.isFinite(tag.at.y)) return 'A posição da etiqueta precisa ser um ponto finito.';
  if (tag.fields.length === 0) return 'A etiqueta precisa de ao menos um campo.';
  return null;
}
