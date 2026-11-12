import { isDraft } from 'immer';
import type { AreaLegend, AreaPlanGraphics, AreaTable, RoomTag } from './areaPlan.ts';
import { resolveViewGraphics, type ViewGraphics, type ViewHidden } from './graphics.ts';
import { floorViewId, mainViewRef } from './planViewIds.ts';
import type { DetailLine, DetailRegion, Dimension, ElementTag, Id, Project, TextNote } from './types.ts';
import { resolveFloorProfile, resolveViewProfile, type ResolvedProfile } from './viewProfile.ts';
import { DEFAULT_VIEW_RANGE, type ViewRange } from './viewRange.ts';

/**
 * Vista de planta como entidade (docs/vistas/PLANO-MESTRE.md §4). Desde a Fase 2 o armazenamento é
 * `Project.planViews`: as leituras daqui são leitura direta, com memória por identidade onde há custo.
 *
 * Dentro de aplicação de comando (rascunho do immer) NÃO se lê por aqui: use `resolvePlanView` (`planViewResolve.ts`),
 * que lê direto de `p.planViews`. As memórias abaixo ignoram rascunhos (`isDraft`) por segurança.
 */
export type PlanViewKind = 'floor' | 'area' | 'ceiling';

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
  /**
   * Só `kind: 'floor'`: mostra o telhado em vista superior (a antiga planta de cobertura). Ausente = desligado. Ligado, o
   * desenho ainda ignora a faixa de vista (a raia de render muda isso depois).
   */
  showRoofOnTop?: boolean;
  /** Sempre próprias: não existe herança de anotações entre vistas. */
  annotations: PlanAnnotations;
  /** Só quando `kind === 'area'`: o que é específico da planta de área. */
  area?: {
    schemeId?: Id;
    scale: number;
    graphics: AreaPlanGraphics;
    tags: RoomTag[];
    legend?: AreaLegend;
    table?: AreaTable;
  };
}

export { floorViewId };

/** Nível e tipo de uma vista de planta. */
export interface PlanViewRef {
  kind: PlanViewKind;
  levelId: Id;
}

/**
 * Inverso do id determinístico do piso (`pv_<nível>`), sem consultar o projeto. Id de outra vista não é
 * decodificável pela forma: use `planViewRefOf`. Devolve `undefined` se não casa.
 */
export function planViewRef(viewId: Id): PlanViewRef | undefined {
  return mainViewRef(viewId);
}

/** Como `planViewRef`, mas lê a vista no projeto (qualquer tipo). */
export function planViewRefOf(p: PlanViewsHost, viewId: Id): PlanViewRef | undefined {
  const v = planViewOf(p, viewId);
  if (!v) return undefined;
  return { kind: v.kind, levelId: v.levelId };
}

/** O que as leituras precisam do projeto. */
export type PlanViewsHost = Pick<Project, 'planViews'>;

const NO_VIEWS: PlanView[] = [];
const NO_ITEMS: readonly never[] = Object.freeze([]) as readonly never[];
const EMPTY_ANNOTATIONS: PlanAnnotations = Object.freeze({ dimensions: NO_ITEMS as never[], texts: NO_ITEMS as never[], detailLines: NO_ITEMS as never[], detailRegions: NO_ITEMS as never[], tags: NO_ITEMS as never[] }) as PlanAnnotations;
const EMPTY_HIDDEN: ViewHidden = Object.freeze({}) as ViewHidden;

/** Anotações vazias compartilhadas (só leitura). */
export const emptyViewAnnotations = (): PlanAnnotations => EMPTY_ANNOTATIONS;

/**
 * Todas as vistas de planta, na ordem do armazenamento: por nível (na ordem de `levels`) o piso e a cobertura, depois as
 * demais. Estável: o mesmo `p.planViews` devolve o MESMO array.
 */
export function planViewsOf(p: PlanViewsHost): PlanView[] {
  return p.planViews ?? NO_VIEWS;
}

const indexCache = new WeakMap<PlanView[], Map<Id, PlanView>>();

/** Vista pelo id; `undefined` se não existe. */
export function planViewOf(p: PlanViewsHost, viewId: Id): PlanView | undefined {
  const list = planViewsOf(p);
  if (isDraft(list)) return list.find((v) => v.id === viewId);
  let idx = indexCache.get(list);
  if (!idx) indexCache.set(list, (idx = new Map(list.map((v) => [v.id, v] as const))));
  return idx.get(viewId);
}

const byLevelCache = new WeakMap<PlanView[], Map<Id, PlanView[]>>();

/** Vistas do nível, na ordem de `planViewsOf`, opcionalmente só de um tipo. Nível inexistente: lista vazia. */
export function planViewsOfLevel(p: PlanViewsHost, levelId: Id, kind?: PlanViewKind): PlanView[] {
  const list = planViewsOf(p);
  let all: PlanView[];
  if (isDraft(list)) all = list.filter((v) => v.levelId === levelId);
  else {
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
    all = m.get(levelId) ?? [];
  }
  return kind ? all.filter((v) => v.kind === kind) : all;
}

/** Vista principal (planta de piso) do nível. Lança erro claro se ela não existe (nível inexistente). */
export function mainPlanViewOf(p: PlanViewsHost, levelId: Id, _kind: 'floor' = 'floor'): PlanView {
  const v = planViewOf(p, floorViewId(levelId));
  if (!v) throw new Error(`Nível "${levelId}" não existe: não há vista principal de piso.`);
  return v;
}

// ── Leituras ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Intervalo de vista. Id inexistente: `DEFAULT_VIEW_RANGE` (padrão do projeto). */
export function viewRangeOf(p: PlanViewsHost, viewId: Id): ViewRange {
  return planViewOf(p, viewId)?.viewRange ?? DEFAULT_VIEW_RANGE;
}

const graphicsCache = new WeakMap<PlanView, ViewGraphics>();
const DEFAULT_RESOLVED_GRAPHICS: ViewGraphics = resolveViewGraphics(undefined);

/**
 * Gráficos resolvidos contra o padrão. Na planta de área a escala da planta fica em `area.scale` (o desenho a sobrepõe
 * como sempre, `planStyleOf(..., areaPlan.scale)`). Id inexistente: o padrão.
 */
export function viewGraphicsOf(p: PlanViewsHost, viewId: Id): ViewGraphics {
  const v = planViewOf(p, viewId);
  if (!v) return DEFAULT_RESOLVED_GRAPHICS;
  if (isDraft(v)) return resolveViewGraphics(v.graphics);
  let g = graphicsCache.get(v);
  if (!g) graphicsCache.set(v, (g = resolveViewGraphics(v.graphics)));
  return g;
}

/** Ocultos da vista; ausente = `{}` (objeto compartilhado, só leitura). */
export function viewHiddenOf(p: PlanViewsHost, viewId: Id): ViewHidden {
  return planViewOf(p, viewId)?.hidden ?? EMPTY_HIDDEN;
}

/** Anotações da vista. Id inexistente: conjunto vazio compartilhado (só leitura). */
export function viewAnnotationsOf(p: PlanViewsHost, viewId: Id): PlanAnnotations {
  return planViewOf(p, viewId)?.annotations ?? EMPTY_ANNOTATIONS;
}

const profileCache = new WeakMap<PlanView, ResolvedProfile>();
const FLOOR_PROFILE: ResolvedProfile = resolveFloorProfile();

/**
 * Perfil resolvido. `area`: `resolveViewProfile`; `floor`: `resolveFloorProfile`.
 * LACUNA (`showRoofOnTop`): com a propriedade ligada o render usa `roofPlanMode` no código (paredes só como contorno
 * por cima, sem linhas de pisos/ambientes, telhados opacos; build.ts `rp`), sem `ProfileLayers` equivalente, e ignora a
 * faixa de vista. Devolve o perfil de piso, que é o que o render passa hoje.
 * `ceiling` (Fase 4) também cai no de piso. Id inexistente: perfil de piso.
 */
export function viewProfileOf(p: PlanViewsHost, viewId: Id): ResolvedProfile {
  const v = planViewOf(p, viewId);
  if (!v) return FLOOR_PROFILE;
  if (v.kind !== 'area' || !v.area) return FLOOR_PROFILE;
  if (isDraft(v)) return resolveViewProfile({ graphics: v.area.graphics, scale: v.area.scale });
  let r = profileCache.get(v);
  if (!r) profileCache.set(v, (r = resolveViewProfile({ graphics: v.area.graphics, scale: v.area.scale })));
  return r;
}
