import type { AreaLegend, AreaPlan, AreaPlanGraphics, AreaTable, RoomTag } from './areaPlan.ts';
import { planAnnotationsOf, planOwnsAnnotations } from './areaPlan.ts';
import { levelGraphicsOf, type ViewGraphics, type ViewHidden } from './graphics.ts';
import type { DetailLine, DetailRegion, Dimension, ElementTag, Id, Level, Project, TextNote } from './types.ts';
import { resolveFloorProfile, resolveViewProfile, type ResolvedProfile } from './viewProfile.ts';
import { DEFAULT_VIEW_RANGE, type ViewRange } from './viewRange.ts';

/**
 * Vista de planta como entidade (docs/vistas/PLANO-MESTRE.md §4). FASE 0/1: os dados continuam no armazenamento
 * antigo (`Level` e `Project.areaPlans`); `planViewsOf` devolve uma PROJEÇÃO estável por referência. Na Fase 2 a
 * projeção vira leitura direta de `Project.planViews`.
 */
export type PlanViewKind = 'floor' | 'roof' | 'area' | 'ceiling';

/** As cinco famílias de anotação de uma vista de planta. */
export interface PlanAnnotations {
  dimensions: Dimension[];
  texts: TextNote[];
  detailLines: DetailLine[];
  detailRegions: DetailRegion[];
  tags: ElementTag[];
}

export interface PlanView {
  id: Id;
  name: string;
  levelId: Id;
  kind: PlanViewKind;
  /** Sempre presente. Cotas relativas à elevação do nível. */
  viewRange: ViewRange;
  /** Ausente = padrão do tipo de vista. */
  graphics?: ViewGraphics;
  hidden?: ViewHidden;
  /** Sempre próprias na entidade final (Fase 2); na projeção da Fase 1 pode ser a do nível (herança, ver abaixo). */
  annotations: PlanAnnotations;
  /** Só quando `kind === 'area'`: o que hoje é específico de `AreaPlan`. */
  area?: {
    schemeId?: Id;
    scale: number;
    graphics: AreaPlanGraphics;
    tags: RoomTag[];
    legend?: AreaLegend;
    table?: AreaTable;
  };
}

// ── Ids determinísticos ──────────────────────────────────────────────────────────────────────────────────────────

const FLOOR_PREFIX = 'pv_';
const ROOF_PREFIX = 'pvr_';

/** Id da planta de piso principal do nível. */
export const floorViewId = (levelId: Id): Id => `${FLOOR_PREFIX}${levelId}`;
/** Id da planta de cobertura principal do nível. */
export const roofViewId = (levelId: Id): Id => `${ROOF_PREFIX}${levelId}`;

/** Quem é a vista no armazenamento antigo: nível + tipo (+ planta de área). */
export interface PlanViewRef {
  kind: PlanViewKind;
  levelId: Id;
  areaPlanId?: Id;
}

/**
 * Inverso dos ids determinísticos de piso e cobertura, sem consultar o projeto. Id de planta de área não é
 * decodificável pela forma (é o id do próprio `AreaPlan`): use `planViewRefOf`. Devolve `undefined` se não casa.
 * Sem ambiguidade: `pv_` (3.º caractere `_`) e `pvr_` (3.º caractere `r`) nunca se confundem.
 */
export function planViewRef(viewId: Id): PlanViewRef | undefined {
  if (viewId.startsWith(ROOF_PREFIX) && viewId.length > ROOF_PREFIX.length) return { kind: 'roof', levelId: viewId.slice(ROOF_PREFIX.length) };
  if (viewId.startsWith(FLOOR_PREFIX) && viewId.length > FLOOR_PREFIX.length) return { kind: 'floor', levelId: viewId.slice(FLOOR_PREFIX.length) };
  return undefined;
}

/** Como `planViewRef`, mas também resolve o id de uma planta de área (precisa do projeto). */
export function planViewRefOf(p: Project, viewId: Id): PlanViewRef | undefined {
  const v = planViewOf(p, viewId);
  if (!v) return undefined;
  return v.kind === 'area' ? { kind: 'area', levelId: v.levelId, areaPlanId: v.id } : { kind: v.kind, levelId: v.levelId };
}

// ── Projeção (Fase 1) ────────────────────────────────────────────────────────────────────────────────────────────

const NO_ITEMS: readonly never[] = Object.freeze([]) as readonly never[];
const NO_AREA_PLANS: readonly AreaPlan[] = Object.freeze([]) as readonly AreaPlan[];
const EMPTY_ANNOTATIONS: PlanAnnotations = Object.freeze({ dimensions: NO_ITEMS as never[], texts: NO_ITEMS as never[], detailLines: NO_ITEMS as never[], detailRegions: NO_ITEMS as never[], tags: NO_ITEMS as never[] }) as PlanAnnotations;
const EMPTY_HIDDEN: ViewHidden = Object.freeze({}) as ViewHidden;

/** Anotações do nível, memorizadas pelo `Level` (mesmos arrays do nível; ausente = lista vazia compartilhada). */
const levelAnnotationsCache = new WeakMap<Level, PlanAnnotations>();
function annotationsOfLevelStore(l: Level): PlanAnnotations {
  let a = levelAnnotationsCache.get(l);
  if (!a) {
    a = {
      dimensions: l.dimensions ?? (NO_ITEMS as never[]),
      texts: l.texts ?? (NO_ITEMS as never[]),
      detailLines: l.detailLines ?? (NO_ITEMS as never[]),
      detailRegions: l.detailRegions ?? (NO_ITEMS as never[]),
      tags: l.tags ?? (NO_ITEMS as never[]),
    };
    levelAnnotationsCache.set(l, a);
  }
  return a;
}

const floorCache = new WeakMap<Level, PlanView>();
function floorViewOfLevel(l: Level): PlanView {
  let v = floorCache.get(l);
  if (!v) {
    v = { id: floorViewId(l.id), name: l.name, levelId: l.id, kind: 'floor', viewRange: l.viewRange, graphics: l.graphics, hidden: l.hidden, annotations: annotationsOfLevelStore(l) };
    floorCache.set(l, v);
  }
  return v;
}

/**
 * Planta de cobertura do nível. Tirado do render (packages/render/src/plan/planContext.ts:163-179 e build.ts:221-471):
 * - intervalo de vista: a cobertura NÃO o usa (`rp` => `view = null`, a geometria vem do nível resolvido sem corte).
 *   Como o campo é obrigatório, a projeção usa o padrão (`DEFAULT_VIEW_RANGE`), desacoplado do `Level`;
 * - gráficos: os do nível (`planStyleOf` -> `levelGraphicsOf`), iguais aos da planta de piso;
 * - ocultos: `Level.roofHidden` (apps/web/src/editor/viewVisibility.ts:43);
 * - anotações: as do NÍVEL (build.ts:470-471 chama `noteOps` sem `areaPlan`, logo lê o nível) — a mesma referência da
 *   planta de piso. O contrato da §4.1 previa vazio; o comportamento atual manda (afeta a migração da Fase 2).
 */
const roofCache = new WeakMap<Level, PlanView>();
function roofViewOfLevel(l: Level): PlanView {
  let v = roofCache.get(l);
  if (!v) {
    v = { id: roofViewId(l.id), name: l.name, levelId: l.id, kind: 'roof', viewRange: DEFAULT_VIEW_RANGE, graphics: l.graphics, hidden: l.roofHidden, annotations: annotationsOfLevelStore(l) };
    roofCache.set(l, v);
  }
  return v;
}

/**
 * Planta de área: depende do `AreaPlan` e do `Level`; a entrada vale enquanto os DOIS objetos forem os mesmos.
 * `viewRange` e `graphics` são os do nível (é o que `planStyleOf` e `planViewOf` leem hoje; só a escala é da planta,
 * em `area.scale`). Herança: `annotations === undefined` devolve as anotações do nível (mesmo objeto da planta de piso).
 */
const areaCache = new WeakMap<AreaPlan, { level: Level; view: PlanView }>();
function areaViewOf(a: AreaPlan, l: Level): PlanView {
  const hit = areaCache.get(a);
  if (hit && hit.level === l) return hit.view;
  const view: PlanView = {
    id: a.id, name: a.name, levelId: a.levelId, kind: 'area', viewRange: l.viewRange, graphics: l.graphics, hidden: a.hidden,
    annotations: planOwnsAnnotations(a) ? planAnnotationsOf(a) : annotationsOfLevelStore(l),
    area: { schemeId: a.schemeId, scale: a.scale, graphics: a.graphics, tags: a.tags, legend: a.legend, table: a.table },
  };
  areaCache.set(a, { level: l, view });
  return view;
}

const listCache = new WeakMap<readonly Level[], WeakMap<readonly AreaPlan[], PlanView[]>>();
const indexCache = new WeakMap<PlanView[], Map<Id, PlanView>>();

/**
 * Todas as vistas de planta: por nível (na ordem de `levels`) o piso e a cobertura, depois as plantas de área.
 * Planta de área cujo nível não existe é omitida (dado inconsistente; a validação a aponta).
 * Estável: o mesmo `p.levels` e `p.areaPlans` devolvem o MESMO array; `Level`/`AreaPlan` iguais devolvem a mesma vista.
 */
export function planViewsOf(p: Pick<Project, 'levels' | 'areaPlans'>): PlanView[] {
  const areas: readonly AreaPlan[] = p.areaPlans ?? NO_AREA_PLANS;
  let byAreas = listCache.get(p.levels);
  if (!byAreas) listCache.set(p.levels, (byAreas = new WeakMap()));
  let list = byAreas.get(areas);
  if (!list) {
    list = [];
    const levels = new Map<Id, Level>();
    for (const l of p.levels) {
      levels.set(l.id, l);
      list.push(floorViewOfLevel(l), roofViewOfLevel(l));
    }
    for (const a of areas) {
      const l = levels.get(a.levelId);
      if (l) list.push(areaViewOf(a, l));
    }
    byAreas.set(areas, list);
  }
  return list;
}

/** Vista pelo id; `undefined` se não existe. */
export function planViewOf(p: Pick<Project, 'levels' | 'areaPlans'>, viewId: Id): PlanView | undefined {
  const list = planViewsOf(p);
  let idx = indexCache.get(list);
  if (!idx) indexCache.set(list, (idx = new Map(list.map((v) => [v.id, v] as const))));
  return idx.get(viewId);
}

const byLevelCache = new WeakMap<PlanView[], Map<Id, PlanView[]>>();

/** Vistas do nível, na ordem de `planViewsOf`, opcionalmente só de um tipo. Nível inexistente: lista vazia. */
export function planViewsOfLevel(p: Pick<Project, 'levels' | 'areaPlans'>, levelId: Id, kind?: PlanViewKind): PlanView[] {
  const list = planViewsOf(p);
  let m = byLevelCache.get(list);
  if (!m) {
    m = new Map();
    for (const v of list) {
      const xs = m.get(v.levelId);
      if (xs) xs.push(v);
      else m.set(v.levelId, [v]);
    }
    byLevelCache.set(list, m);
  }
  const all = m.get(levelId) ?? [];
  return kind ? all.filter((v) => v.kind === kind) : all;
}

/** Vista principal (piso ou cobertura) do nível. Lança erro claro se o nível não existe. */
export function mainPlanViewOf(p: Pick<Project, 'levels' | 'areaPlans'>, levelId: Id, kind: 'floor' | 'roof'): PlanView {
  const l = p.levels.find((x) => x.id === levelId);
  if (!l) throw new Error(`Nível "${levelId}" não existe: não há vista principal de ${kind === 'floor' ? 'piso' : 'cobertura'}.`);
  return kind === 'floor' ? floorViewOfLevel(l) : roofViewOfLevel(l);
}

// ── Leituras ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Intervalo de vista. Id inexistente: `DEFAULT_VIEW_RANGE` (padrão do projeto). */
export function viewRangeOf(p: Pick<Project, 'levels' | 'areaPlans'>, viewId: Id): ViewRange {
  return planViewOf(p, viewId)?.viewRange ?? DEFAULT_VIEW_RANGE;
}

const graphicsCache = new WeakMap<PlanView, ViewGraphics>();
const DEFAULT_RESOLVED_GRAPHICS: ViewGraphics = levelGraphicsOf({ levels: [] }, '');

/**
 * Gráficos resolvidos contra o padrão (mesma função do código antigo: `levelGraphicsOf`). Na planta de área a escala
 * da planta fica em `area.scale` (o desenho a sobrepõe como hoje, `planStyleOf(..., areaPlan.scale)`).
 * Id inexistente: o padrão.
 */
export function viewGraphicsOf(p: Pick<Project, 'levels' | 'areaPlans'>, viewId: Id): ViewGraphics {
  const v = planViewOf(p, viewId);
  if (!v) return DEFAULT_RESOLVED_GRAPHICS;
  let g = graphicsCache.get(v);
  if (!g) graphicsCache.set(v, (g = levelGraphicsOf({ levels: [{ id: v.levelId, graphics: v.graphics } as Level] }, v.levelId)));
  return g;
}

/** Ocultos da vista; ausente = `{}` (objeto compartilhado, só leitura). */
export function viewHiddenOf(p: Pick<Project, 'levels' | 'areaPlans'>, viewId: Id): ViewHidden {
  return planViewOf(p, viewId)?.hidden ?? EMPTY_HIDDEN;
}

/** Anotações da vista. Id inexistente: conjunto vazio compartilhado (só leitura). */
export function viewAnnotationsOf(p: Pick<Project, 'levels' | 'areaPlans'>, viewId: Id): PlanAnnotations {
  return planViewOf(p, viewId)?.annotations ?? EMPTY_ANNOTATIONS;
}

const profileCache = new WeakMap<PlanView, ResolvedProfile>();
const FLOOR_PROFILE: ResolvedProfile = resolveFloorProfile();

/**
 * Perfil resolvido. `area`: `resolveViewProfile`; `floor`: `resolveFloorProfile`.
 * LACUNA (cobertura): o render usa `FLOOR_PLAN_PROFILE` e muda o comportamento por `roofPlanMode` no código
 * (paredes só como contorno por cima, sem linhas de pisos/ambientes, telhados opacos; build.ts `rp`), sem
 * `ProfileLayers` equivalente. Devolve o perfil de piso, que é o que o render passa hoje.
 * `ceiling` (Fase 4) também cai no de piso. Id inexistente: perfil de piso.
 */
export function viewProfileOf(p: Pick<Project, 'levels' | 'areaPlans'>, viewId: Id): ResolvedProfile {
  const v = planViewOf(p, viewId);
  if (!v) return FLOOR_PROFILE;
  if (v.kind !== 'area' || !v.area) return FLOOR_PROFILE;
  let r = profileCache.get(v);
  if (!r) profileCache.set(v, (r = resolveViewProfile({ graphics: v.area.graphics, scale: v.area.scale })));
  return r;
}
