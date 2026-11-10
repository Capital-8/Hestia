import { copyPlanAnnotations, DEFAULT_AREA_GRAPHICS, type AreaLegend, type AreaPlan, type AreaPlanGraphics, type AreaTable } from './areaPlan.ts';
import { applyAreaPlanCommand } from './areaPlanCommands.ts';
import type { Command } from './commands.ts';
import { applyLevelGraphics, resetLevelGraphics } from './graphicsCommands.ts';
import type { DeepPartial, ViewGraphics, ViewHidden } from './graphics.ts';
import { t, type Lang } from './i18n.ts';
import type { PlanAnnotations, PlanViewKind } from './planView.ts';
import { resolvePlanViewRef } from './planViewResolve.ts';
import type { Id, Project } from './types.ts';
import { applyViewHidden, hiddenTargetOfView } from './viewHiddenCommands.ts';
import { PROFILE_PRESETS } from './viewProfile.ts';
import { viewRangeIssues, type ViewRange } from './viewRange.ts';

/**
 * Comandos da vista de planta como entidade (docs/vistas/PLANO-MESTRE.md §4.3), FACHADA sobre o armazenamento atual
 * (`Level` e `Project.areaPlans`): cada um traduz para o mesmo caminho dos comandos antigos (que continuam valendo).
 * Na Fase 2 a tradução some e eles gravam em `Project.planViews`.
 *
 * Onde cada campo cai HOJE (espelha o que `planViewsOf` projeta):
 * - `viewRange` e `graphics` (de `ViewGraphics`): do NÍVEL, nos três tipos (a cobertura não usa intervalo: recusa);
 * - `hidden`: piso => `Level.hidden`; cobertura => `Level.roofHidden`; área => `AreaPlan.hidden`;
 * - `name`: piso e cobertura => nome do nível (é o nome que a projeção mostra); área => `AreaPlan.name`;
 * - `area`: só planta de área, via `updateAreaPlan`.
 */
export interface PlanViewPatch {
  name?: string;
  /** Mescla no intervalo atual (como `setLevelViewRange`). Recusado na cobertura. */
  viewRange?: Partial<ViewRange>;
  /** Mescla nos gráficos (como `setLevelGraphics`); `null` restaura o padrão (como `resetLevelGraphics`). */
  graphics?: DeepPartial<ViewGraphics> | null;
  /** Substitui a ocultação (como `setViewHidden`); `null` limpa. */
  hidden?: ViewHidden | null;
  /** Campos próprios da planta de área (como `updateAreaPlan`); `null` apaga o campo opcional. */
  area?: { schemeId?: Id | null; scale?: number; graphics?: Partial<AreaPlanGraphics>; legend?: AreaLegend | null; table?: AreaTable | null };
}

/** Vista nova. Nesta fase só `kind: 'area'` é aceito (traduz para `addAreaPlan`). */
export interface NewPlanView {
  id: Id;
  kind: PlanViewKind;
  levelId: Id;
  name: string;
  /** Escala ausente: a padrão da planta de área. */
  area?: { schemeId?: Id; scale?: number; graphics?: Partial<AreaPlanGraphics>; legend?: AreaLegend; table?: AreaTable };
  hidden?: ViewHidden;
  /** Ausente = a planta herda as anotações do nível (como `addAreaPlan` sem `annotations`). */
  annotations?: PlanAnnotations;
}

export type PlanViewCommand =
  | { type: 'updatePlanView'; viewId: Id; patch: PlanViewPatch }
  | { type: 'addPlanView'; view: NewPlanView }
  | { type: 'removePlanView'; viewId: Id };

/** Aplica o intervalo de vista no nível (extraído de `setLevelViewRange`; mesma validação). */
export function applyLevelViewRange(p: Project, levelId: Id, patch: Partial<ViewRange>, lang: Lang = 'pt'): void {
  const l = p.levels.find((x) => x.id === levelId);
  if (!l) throw new Error(t(lang, 'md_level_missing'));
  // Sem normalização silenciosa: um valor que quebra a ordem topo ≥ corte ≥ base ≥ profundidade é recusado.
  const next: ViewRange = { ...l.viewRange, ...patch };
  const issues = viewRangeIssues(next);
  if (issues.length > 0) throw new Error(issues.join(' '));
  l.viewRange = next; // armazenamento (Fase 2)
}

const nullToUndefined = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

function updatePlanView(p: Project, viewId: Id, patch: PlanViewPatch, lang: Lang): void {
  const ref = resolvePlanViewRef(p, viewId);
  if (!ref) throw new Error(t(lang, 'md_view_missing'));
  const isArea = ref.kind === 'area';
  if (patch.area && !isArea) throw new Error(t(lang, 'md_cmd_planview_area_only'));
  if (patch.viewRange && ref.kind === 'roof') throw new Error(t(lang, 'md_cmd_planview_roof_range'));
  if (patch.name !== undefined && !patch.name.trim()) throw new Error(t(lang, 'md_cmd_planview_name_empty'));

  if (patch.viewRange) applyLevelViewRange(p, ref.levelId, patch.viewRange, lang);
  if (patch.graphics !== undefined) {
    if (patch.graphics === null) resetLevelGraphics(p, ref.levelId, lang);
    else applyLevelGraphics(p, ref.levelId, patch.graphics, lang);
  }
  if (patch.hidden !== undefined) applyViewHidden(p, hiddenTargetOfView(p, viewId, lang), nullToUndefined(patch.hidden), lang);

  if (isArea) {
    const plan = (p.areaPlans ?? []).find((x) => x.id === viewId)!; // armazenamento (Fase 2)
    const a = patch.area;
    const next: Partial<Omit<AreaPlan, 'id' | 'tags'>> = {};
    if (patch.name !== undefined) next.name = patch.name;
    if (a?.schemeId !== undefined) next.schemeId = nullToUndefined(a.schemeId);
    if (a?.scale !== undefined) next.scale = a.scale;
    if (a?.graphics) next.graphics = { ...plan.graphics, ...a.graphics };
    if (a?.legend !== undefined) next.legend = nullToUndefined(a.legend);
    if (a?.table !== undefined) next.table = nullToUndefined(a.table);
    if (Object.keys(next).length > 0) applyAreaPlanCommand(p, { type: 'updateAreaPlan', id: viewId, patch: next }, lang);
  } else if (patch.name !== undefined) {
    const level = p.levels.find((l) => l.id === ref.levelId)!; // armazenamento (Fase 2)
    level.name = patch.name;
  }
}

function onlyArea(v: NewPlanView, lang: Lang): void {
  if (v.kind !== 'area') throw new Error(t(lang, 'md_cmd_planview_only_area'));
}

/** Aplica um comando de vista de planta. Devolve false quando o comando não é desta família. */
export function applyPlanViewCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'updatePlanView':
      updatePlanView(p, c.viewId, c.patch, lang);
      return true;
    case 'addPlanView': {
      const v = c.view;
      onlyArea(v, lang);
      const plan: AreaPlan = {
        id: v.id, name: v.name, levelId: v.levelId,
        ...(v.area?.schemeId !== undefined ? { schemeId: v.area.schemeId } : {}),
        scale: v.area?.scale ?? PROFILE_PRESETS.area.scale,
        graphics: { ...DEFAULT_AREA_GRAPHICS, ...v.area?.graphics },
        tags: [],
        ...(v.area?.legend ? { legend: v.area.legend } : {}),
        ...(v.area?.table ? { table: v.area.table } : {}),
        ...(v.annotations ? { annotations: copyPlanAnnotations(v.annotations) } : {}),
        ...(v.hidden ? { hidden: v.hidden } : {}),
      };
      applyAreaPlanCommand(p, { type: 'addAreaPlan', plan }, lang);
      return true;
    }
    case 'removePlanView': {
      const ref = resolvePlanViewRef(p, c.viewId);
      if (!ref) throw new Error(t(lang, 'md_view_missing'));
      if (ref.kind !== 'area') throw new Error(t(lang, 'md_cmd_planview_only_area'));
      applyAreaPlanCommand(p, { type: 'removeAreaPlan', id: c.viewId }, lang);
      return true;
    }
    default:
      return false;
  }
}
