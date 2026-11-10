import { view3dOf, viewHiddenIssues, type ViewHidden } from './graphics.ts';
import type { Id, Project, ViewHiddenTarget } from './types.ts';
import { t, type Lang } from './i18n.ts';
import { floorViewId, planViewOf, roofViewId } from './planView.ts';
import { resolvePlanViewRef } from './planViewResolve.ts';

/**
 * Converte um `viewId` de planta (piso, cobertura ou planta de área) no alvo de ocultação atual:
 * `{plan, levelId}`, `{roof, levelId}` ou `{area, planId}`. `viewId` inexistente lança Error.
 * Recomendado para montar `setViewHidden` a partir de um `viewId` (o alvo muda de forma só na Fase 2).
 */
export function hiddenTargetOfView(p: Pick<Project, 'levels' | 'areaPlans'>, viewId: Id, lang: Lang = 'pt'): ViewHiddenTarget {
  const ref = resolvePlanViewRef(p, viewId);
  if (!ref) throw new Error(t(lang, 'md_view_missing'));
  if (ref.kind === 'area') return { kind: 'area', planId: viewId };
  return ref.kind === 'roof' ? { kind: 'roof', levelId: ref.levelId } : { kind: 'plan', levelId: ref.levelId };
}

/**
 * Normaliza e valida uma ocultação de vista. Listas vazias e ids repetidos saem; sem nada, a vista volta a não ter
 * ocultação (o campo é removido do projeto).
 */
export function normalizaViewHidden(hidden: ViewHidden | undefined, lang: Lang = 'pt'): ViewHidden | undefined {
  const issues = viewHiddenIssues(hidden, lang);
  if (issues.length > 0) throw new Error(issues.join(' '));
  if (!hidden) return undefined;
  const elements = hidden.elements ? [...new Set(hidden.elements)] : undefined;
  const categories = hidden.categories ? [...new Set(hidden.categories)] : undefined;
  if ((elements?.length ?? 0) === 0 && (categories?.length ?? 0) === 0) return undefined;
  return {
    ...(elements && elements.length > 0 ? { elements } : {}),
    ...(categories && categories.length > 0 ? { categories } : {}),
  };
}

/**
 * Ocultação permanente atual de uma vista (para o comando fazer união/remoção).
 * @deprecated Use `planViewHiddenOf(p, viewId)` (planta) com `hiddenTargetOfView` para o alvo; esta fica para corte e 3D.
 */
export function viewHiddenOf(p: Project, target: ViewHiddenTarget): ViewHidden | undefined {
  switch (target.kind) {
    case 'plan': return planViewOf(p, floorViewId(target.levelId))?.hidden;
    case 'roof': return planViewOf(p, roofViewId(target.levelId))?.hidden;
    case 'area': return planViewOf(p, target.planId)?.hidden;
    case 'section': return p.views.find((v) => v.id === target.viewId)?.hidden;
    case '3d': return view3dOf(p).hidden;
  }
}

/** Aplica a ocultação permanente numa vista. Alvo inexistente recusa; `undefined` limpa a ocultação. */
// armazenamento (Fase 2): os casos plan/roof/area gravam em Level.hidden, Level.roofHidden e AreaPlan.hidden.
export function applyViewHidden(p: Project, target: ViewHiddenTarget, hidden: ViewHidden | undefined, lang: Lang = 'pt'): void {
  const clean = normalizaViewHidden(hidden, lang);
  switch (target.kind) {
    case 'plan': {
      const l = p.levels.find((x) => x.id === target.levelId);
      if (!l) throw new Error(t(lang, 'md_level_missing'));
      if (clean) l.hidden = clean; else delete l.hidden;
      return;
    }
    case 'roof': {
      const l = p.levels.find((x) => x.id === target.levelId);
      if (!l) throw new Error(t(lang, 'md_level_missing'));
      if (clean) l.roofHidden = clean; else delete l.roofHidden;
      return;
    }
    case 'area': {
      const a = p.areaPlans?.find((x) => x.id === target.planId);
      if (!a) throw new Error(t(lang, 'md_area_plan_missing'));
      if (clean) a.hidden = clean; else delete a.hidden;
      return;
    }
    case 'section': {
      const v = p.views.find((x) => x.id === target.viewId);
      if (!v) throw new Error(t(lang, 'md_view_missing'));
      if (clean) v.hidden = clean; else delete v.hidden;
      return;
    }
    case '3d': {
      p.view3d = { ...view3dOf(p), ...(clean ? { hidden: clean } : { hidden: undefined }) };
      return;
    }
  }
}
