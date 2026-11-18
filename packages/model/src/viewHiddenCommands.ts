import { view3dOf, viewHiddenIssues, type ViewHidden } from './graphics.ts';
import type { Id, Project, ViewHiddenTarget } from './types.ts';
import { t, type Lang } from './i18n.ts';
import { planViewOf } from './planView.ts';
import { resolvePlanView } from './planViewResolve.ts';
import { normalizeViewHiddenTarget } from './planViewIdentificacao.ts';

/**
 * Alvo de ocultação de uma vista de planta (piso, cobertura ou planta de área): `{ kind: 'plan', viewId }`.
 * `viewId` inexistente lança Error.
 */
export function hiddenTargetOfView(p: Pick<Project, 'planViews'>, viewId: Id, lang: Lang = 'pt'): ViewHiddenTarget {
  if (!resolvePlanView(p, viewId)) throw new Error(t(lang, 'md_view_missing'));
  return { kind: 'plan', viewId };
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
  const alvo = normalizeViewHiddenTarget(target);
  switch (alvo.kind) {
    case 'plan': return planViewOf(p, alvo.viewId)?.hidden;
    case 'section': return p.views.find((v) => v.id === alvo.viewId)?.hidden;
    case '3d': return view3dOf(p).hidden;
  }
}

/**
 * Grava a ocultação numa vista de planta direto em `p.planViews` (sem memória: roda sobre o rascunho). Vista inexistente
 * recusa com a mensagem do alvo antigo (`md_level_missing` para piso/cobertura, `md_area_plan_missing` para área).
 */
function setPlanViewHidden(p: Project, viewId: Id, clean: ViewHidden | undefined, missing: 'md_level_missing' | 'md_area_plan_missing' | 'md_view_missing', lang: Lang): void {
  const v = resolvePlanView(p, viewId);
  if (!v) throw new Error(t(lang, missing));
  if (clean) v.hidden = clean; else delete v.hidden;
}

/** Aplica a ocultação permanente numa vista. Alvo inexistente recusa; `undefined` limpa a ocultação. */
export function applyViewHidden(p: Project, target: ViewHiddenTarget, hidden: ViewHidden | undefined, lang: Lang = 'pt'): void {
  const clean = normalizaViewHidden(hidden, lang);
  // Formas antigas (entrada) mantêm as mensagens de recusa de antes.
  const faltando = target.kind === 'area' ? 'md_area_plan_missing' : target.kind === 'roof' || (target.kind === 'plan' && 'levelId' in target) ? 'md_level_missing' : 'md_view_missing';
  const alvo = normalizeViewHiddenTarget(target);
  switch (alvo.kind) {
    case 'plan':
      if (target.kind === 'area' && resolvePlanView(p, alvo.viewId)?.kind !== 'area') throw new Error(t(lang, 'md_area_plan_missing'));
      return setPlanViewHidden(p, alvo.viewId, clean, faltando, lang);
    case 'section': {
      const v = p.views.find((x) => x.id === alvo.viewId);
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
