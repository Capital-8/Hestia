import { view3dOf, viewHiddenIssues, type ViewHidden } from './graphics.ts';
import type { Project, ViewHiddenTarget } from './types.ts';
import { t, type Lang } from './i18n.ts';

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

/** Ocultação permanente atual de uma vista (para o comando fazer união/remoção). */
export function viewHiddenOf(p: Project, target: ViewHiddenTarget): ViewHidden | undefined {
  switch (target.kind) {
    case 'plan': return p.levels.find((l) => l.id === target.levelId)?.hidden;
    case 'roof': return p.levels.find((l) => l.id === target.levelId)?.roofHidden;
    case 'area': return p.areaPlans?.find((a) => a.id === target.planId)?.hidden;
    case 'section': return p.views.find((v) => v.id === target.viewId)?.hidden;
    case '3d': return view3dOf(p).hidden;
  }
}

/** Aplica a ocultação permanente numa vista. Alvo inexistente recusa; `undefined` limpa a ocultação. */
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
