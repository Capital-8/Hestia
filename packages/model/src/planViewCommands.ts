import { areaPlanIssue, DEFAULT_AREA_GRAPHICS, type AreaLegend, type AreaPlan, type AreaPlanGraphics, type AreaTable, type RoomTag } from './areaPlan.ts';
import type { Command } from './commands.ts';
import { applyViewGraphics, resetViewGraphics } from './graphicsCommands.ts';
import type { DeepPartial, ViewGraphics, ViewHidden } from './graphics.ts';
import { t, type Lang } from './i18n.ts';
import { isMainView } from './levelViews.ts';
import { inheritedAnnotations, newAnnotations, normalizeAnnotations, ownAreaAnnotations, plainClone } from './planViewAnnotations.ts';
import { floorViewId, type PlanAnnotations, type PlanView, type PlanViewKind } from './planView.ts';
import { resolvePlanView } from './planViewResolve.ts';
import { dropOrphanViewports } from './sheetCommands.ts';
import type { Id, Project } from './types.ts';
import { normalizaViewHidden } from './viewHiddenCommands.ts';
import { PROFILE_PRESETS } from './viewProfile.ts';
import { DEFAULT_VIEW_RANGE, viewRangeIssues, type ViewRange } from './viewRange.ts';

/**
 * Comandos da vista de planta como entidade (docs/vistas/PLANO-MESTRE.md §4.3). Desde a Fase 2 gravam em
 * `Project.planViews`; os comandos antigos (`setLevelViewRange`, `updateAreaPlan`, ...) continuam aceitos e passam pelas
 * mesmas funções. Leem DIRETO de `p.planViews` (`resolvePlanView`): rodam sobre o rascunho do immer.
 *
 * `updatePlanView` altera SÓ a vista pedida. Os comandos antigos por nível (`setLevelViewRange`, `setLevelGraphics`)
 * propagam às outras vistas do nível, porque antes eram do nível inteiro (ver `applyLevelViewRange`).
 */
export interface PlanViewPatch {
  name?: string;
  /** Mescla no intervalo atual (como `setLevelViewRange`). */
  viewRange?: Partial<ViewRange>;
  /** Mescla nos gráficos (como `setLevelGraphics`); `null` restaura o padrão (como `resetLevelGraphics`). */
  graphics?: DeepPartial<ViewGraphics> | null;
  /** Substitui a ocultação (como `setViewHidden`); `null` limpa. */
  hidden?: ViewHidden | null;
  /** Só planta de piso; `false` apaga o campo. */
  showRoofOnTop?: boolean;
  /** Campos próprios da planta de área (como `updateAreaPlan`); `null` apaga o campo opcional. */
  area?: { schemeId?: Id | null; scale?: number; graphics?: Partial<AreaPlanGraphics>; legend?: AreaLegend | null; table?: AreaTable | null };
}

/** Vista nova, de qualquer tipo. Sem `viewRange`/`graphics` a vista nasce com cópia dos da planta de piso do nível. */
export interface NewPlanView {
  id: Id;
  kind: PlanViewKind;
  levelId: Id;
  name: string;
  viewRange?: ViewRange;
  graphics?: ViewGraphics;
  /** Só `kind: 'area'`; escala ausente: a padrão da planta de área. */
  area?: { schemeId?: Id; scale?: number; graphics?: Partial<AreaPlanGraphics>; legend?: AreaLegend; table?: AreaTable; tags?: RoomTag[] };
  hidden?: ViewHidden;
  /** Só `kind: 'floor'`, sem faixa para cima; `false` não grava o campo. */
  showRoofOnTop?: boolean;
  /**
   * Conjunto próprio. Ausente: planta de área nasce com cópia das anotações do nível que ela desenha (a herança de antes,
   * materializada, ids `<id>__<idDaVista>`); os outros tipos nascem sem anotações.
   */
  annotations?: PlanAnnotations;
}

export type PlanViewCommand =
  | { type: 'updatePlanView'; viewId: Id; patch: PlanViewPatch }
  | { type: 'addPlanView'; view: NewPlanView }
  | { type: 'removePlanView'; viewId: Id };

function applyViewRange(v: PlanView, patch: Partial<ViewRange>): void {
  // Sem normalização silenciosa: um valor que quebra a ordem topo ≥ corte ≥ base ≥ profundidade é recusado.
  const next: ViewRange = { ...v.viewRange, ...patch };
  const issues = viewRangeIssues(next);
  if (issues.length > 0) throw new Error(issues.join(' '));
  v.viewRange = next;
}

/**
 * Comando antigo `setLevelViewRange`. Antes o intervalo era do NÍVEL e valia para a planta de piso e para as plantas de
 * área; agora cada vista tem o seu. Para o programa se comportar igual nesta etapa a alteração vai para a planta de piso e
 * para as plantas de área do nível (e, desde o esquema 25, para a cobertura migrada, que é planta de piso comum). A Fase 3 decide quando parar de propagar.
 */
export function applyLevelViewRange(p: Project, levelId: Id, patch: Partial<ViewRange>, lang: Lang = 'pt'): void {
  if (!p.levels.some((x) => x.id === levelId)) throw new Error(t(lang, 'md_level_missing'));
  for (const v of p.planViews) if (v.levelId === levelId) applyViewRange(v, patch);
}

const nullToUndefined = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

/** A planta de área como `AreaPlan` (para validar com `areaPlanIssue`), lida direto da vista. */
const areaPlanOfView = (v: PlanView): AreaPlan => ({
  id: v.id, name: v.name, levelId: v.levelId, scale: v.area!.scale, graphics: v.area!.graphics, tags: v.area!.tags,
});

function updatePlanView(p: Project, viewId: Id, patch: PlanViewPatch, lang: Lang): void {
  const v = resolvePlanView(p, viewId);
  if (!v) throw new Error(t(lang, 'md_view_missing'));
  const isArea = v.kind === 'area' && v.area !== undefined;
  if (patch.area && !isArea) throw new Error(t(lang, 'md_cmd_planview_area_only'));
  if (patch.name !== undefined && !patch.name.trim()) throw new Error(t(lang, 'md_cmd_planview_name_empty'));

  if (patch.viewRange) applyViewRange(v, patch.viewRange);
  if (patch.showRoofOnTop !== undefined) {
    if (patch.showRoofOnTop) v.showRoofOnTop = true; else delete v.showRoofOnTop;
  }
  if (v.showRoofOnTop && (v.kind !== 'floor' || v.viewRange.direction === 'up')) throw new Error(t(lang, 'md_cmd_planview_roof_on_top'));
  if (patch.graphics !== undefined) {
    if (patch.graphics === null) resetViewGraphics(p, viewId, lang);
    else applyViewGraphics(p, viewId, patch.graphics, lang);
  }
  if (patch.hidden !== undefined) {
    const clean = normalizaViewHidden(nullToUndefined(patch.hidden), lang);
    if (clean) v.hidden = clean; else delete v.hidden;
  }
  if (patch.name !== undefined) renameView(p, v, patch.name);

  if (isArea && patch.area) {
    const a = patch.area;
    const next = { ...v.area! };
    if (a.schemeId !== undefined) { const s = nullToUndefined(a.schemeId); if (s === undefined) delete next.schemeId; else next.schemeId = s; }
    if (a.scale !== undefined) next.scale = a.scale;
    if (a.graphics) next.graphics = { ...next.graphics, ...a.graphics };
    if (a.legend !== undefined) { const x = nullToUndefined(a.legend); if (x === undefined) delete next.legend; else next.legend = x; }
    if (a.table !== undefined) { const x = nullToUndefined(a.table); if (x === undefined) delete next.table; else next.table = x; }
    const issue = areaPlanIssue(p, { ...areaPlanOfView(v), scale: next.scale, graphics: next.graphics });
    if (issue) throw new Error(issue);
    v.area = next;
  }
}

/** O nome da vista principal é o nome do nível (as duas principais e o nível andam juntos); nas demais só a vista muda. */
function renameView(p: Project, v: PlanView, name: string): void {
  if (!isMainView(p, v)) {
    v.name = name;
    return;
  }
  const level = p.levels.find((l) => l.id === v.levelId)!;
  level.name = name;
  for (const x of p.planViews) if (x.levelId === level.id && isMainView(p, x)) x.name = name;
}

/**
 * Cria uma vista de planta (de qualquer tipo). Valida nome, nível, id livre e, na planta de área, escala e etiquetas
 * (`areaPlanIssue`). `viewRange` e `graphics` ausentes são copiados da planta de piso do nível, como a planta de área
 * sempre usou os do nível.
 */
export function createPlanView(p: Project, nv: NewPlanView, lang: Lang): PlanView {
  const isArea = nv.kind === 'area';
  const areaGraphics: AreaPlanGraphics = { ...DEFAULT_AREA_GRAPHICS, ...nv.area?.graphics };
  const candidate: AreaPlan = { id: nv.id, name: nv.name, levelId: nv.levelId, scale: nv.area?.scale ?? PROFILE_PRESETS.area.scale, graphics: areaGraphics, tags: nv.area?.tags ?? [] };
  const issue = isArea ? areaPlanIssue(p, candidate) : !nv.name.trim() ? t(lang, 'md_cmd_planview_name_empty') : !p.levels.some((l) => l.id === nv.levelId) ? t(lang, 'md_level_missing') : null;
  if (issue) throw new Error(issue);
  if (resolvePlanView(p, nv.id)) throw new Error(t(lang, 'md_cmd_plan_id_exists'));
  // O prefixo `pv_` é do piso principal do nível: id de vista nova nunca pode começar com ele.
  if (nv.id.startsWith('pv_')) throw new Error(t(lang, 'md_cmd_planview_id_reserved'));

  const floor = resolvePlanView(p, floorViewId(nv.levelId));
  const view: PlanView = { id: nv.id, name: nv.name, levelId: nv.levelId, kind: nv.kind, viewRange: plainClone(nv.viewRange ?? floor?.viewRange ?? DEFAULT_VIEW_RANGE), annotations: newAnnotations() };
  if (nv.showRoofOnTop) {
    if (nv.kind !== 'floor' || view.viewRange.direction === 'up') throw new Error(t(lang, 'md_cmd_planview_roof_on_top'));
    view.showRoofOnTop = true;
  }
  const graphics = nv.graphics ?? floor?.graphics;
  if (graphics) view.graphics = plainClone(graphics);
  if (nv.hidden) view.hidden = plainClone(nv.hidden);
  if (isArea) {
    view.area = { scale: candidate.scale, graphics: areaGraphics, tags: plainClone(candidate.tags) };
    if (nv.area?.schemeId !== undefined) view.area.schemeId = nv.area.schemeId;
    if (nv.area?.legend) view.area.legend = plainClone(nv.area.legend);
    if (nv.area?.table) view.area.table = plainClone(nv.area.table);
    const fromLevel = floor?.annotations;
    view.annotations = nv.annotations ? ownAreaAnnotations(nv.annotations) : inheritedAnnotations(fromLevel, nv.id, areaGraphics);
  } else if (nv.annotations) view.annotations = plainClone(normalizeAnnotations(nv.annotations));
  p.planViews = [...p.planViews, view];
  return view;
}

/** Remove uma vista. A planta de piso principal de um nível que existe não pode ser removida (a cobertura migrada pode). */
export function deletePlanView(p: Project, viewId: Id, lang: Lang): void {
  const v = resolvePlanView(p, viewId);
  if (!v) throw new Error(t(lang, 'md_view_missing'));
  if (isMainView(p, v)) throw new Error(t(lang, 'md_cmd_planview_main_undeletable'));
  p.planViews = p.planViews.filter((x) => x.id !== viewId);
  dropOrphanViewports(p);
}

/** Aplica um comando de vista de planta. Devolve false quando o comando não é desta família. */
export function applyPlanViewCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'updatePlanView':
      updatePlanView(p, c.viewId, c.patch, lang);
      return true;
    case 'addPlanView':
      createPlanView(p, c.view, lang);
      return true;
    case 'removePlanView':
      deletePlanView(p, c.viewId, lang);
      return true;
    default:
      return false;
  }
}
