import { view3dOf, viewHiddenIssues, type ViewHidden } from './graphics.ts';
import type { Id, Project, ViewHiddenTarget } from './types.ts';
import { t, type Lang } from './i18n.ts';
import { floorViewId, planViewOf, roofViewId } from './planView.ts';
import { resolvePlanView, resolvePlanViewRef } from './planViewResolve.ts';

/**
 * Converte um `viewId` de planta (piso, cobertura ou planta de área) no alvo de ocultação atual:
 * `{plan, levelId}`, `{roof, levelId}` ou `{area, planId}`. `viewId` inexistente lança Error.
 * Recomendado para montar `setViewHidden` a partir de um `viewId` (o alvo muda de forma só na Fase 2).
 */
export function hiddenTargetOfView(p: Pick<Project, 'planViews'>, viewId: Id, lang: Lang = 'pt'): ViewHiddenTarget {
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

/**
 * Grava a ocultação numa vista de planta direto em `p.planViews` (sem memória: roda sobre o rascunho). Vista inexistente
 * recusa com a mensagem do alvo antigo (`md_level_missing` para piso/cobertura, `md_area_plan_missing` para área).
 */
function setPlanViewHidden(p: Project, viewId: Id, clean: ViewHidden | undefined, missing: 'md_level_missing' | 'md_area_plan_missing', lang: Lang): void {
  const v = resolvePlanView(p, viewId);
  if (!v) throw new Error(t(lang, missing));
  if (clean) v.hidden = clean; else delete v.hidden;
}

/** Aplica a ocultação permanente numa vista. Alvo inexistente recusa; `undefined` limpa a ocultação. */
export function applyViewHidden(p: Project, target: ViewHiddenTarget, hidden: ViewHidden | undefined, lang: Lang = 'pt'): void {
  const clean = normalizaViewHidden(hidden, lang);
  switch (target.kind) {
    case 'plan':
      return setPlanViewHidden(p, floorViewId(target.levelId), clean, 'md_level_missing', lang);
    case 'roof':
      return setPlanViewHidden(p, roofViewId(target.levelId), clean, 'md_level_missing', lang);
    case 'area':
      if (resolvePlanView(p, target.planId)?.kind !== 'area') throw new Error(t(lang, 'md_area_plan_missing'));
      return setPlanViewHidden(p, target.planId, clean, 'md_area_plan_missing', lang);
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
