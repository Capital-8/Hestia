import { copyPlanAnnotations } from './areaPlan.ts';
import type { Command } from './commands.ts';
import { applyPlanGraphics, resetPlanGraphics } from './graphicsCommands.ts';
import { t, type Lang } from './i18n.ts';
import { planIdTaken, planViewIssues, planViewsOf, type PlanView } from './planView.ts';
import { dropOrphanViewports } from './sheetCommands.ts';
import { normalizaViewHidden } from './viewHiddenCommands.ts';
import type { Id, Project } from './types.ts';

/** Comandos das plantas adicionais por disciplina (decisão 0060). Fora do `switch` grande de `commands.ts`. */
export type PlanViewCommand = Extract<Command, { type: 'addPlanView' | 'updatePlanView' | 'removePlanView' | 'setPlanGraphics' | 'resetPlanGraphics' }>;

/** Campos editáveis de uma planta adicional. `undefined` em `tones`/`hidden` remove o campo (volta ao padrão). */
export interface PlanViewPatch {
  name?: string;
  discipline?: PlanView['discipline'];
  tones?: PlanView['tones'] | undefined;
  hidden?: PlanView['hidden'] | undefined;
}

/** Cópia sem referências: o estado nunca compartilha objetos com o chamador nem com rascunhos do immer. */
const copy = <T>(x: T): T => {
  if (Array.isArray(x)) return x.map(copy) as T;
  if (x !== null && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, copy(v)])) as T;
  return x;
};

const refuse = (issues: string[]): void => {
  if (issues.length > 0) throw new Error(issues.join(' '));
};

function viewRef(p: Project, id: Id, lang: Lang): PlanView {
  const v = planViewsOf(p).find((x) => x.id === id);
  if (!v) throw new Error(t(lang, 'md_plan_view_missing'));
  return v;
}

/** Monta o objeto gravável: campos opcionais vazios saem, ocultação e tons são normalizados. */
function normalized(plan: PlanView, lang: Lang): PlanView {
  const { graphics, hidden, tones, annotations, ...base } = plan;
  const out: PlanView = { ...base, name: plan.name.trim() };
  if (graphics) out.graphics = copy(graphics);
  const h = normalizaViewHidden(hidden, lang);
  if (h) out.hidden = h;
  if (tones && Object.keys(tones).length > 0) out.tones = { ...tones };
  if (annotations) out.annotations = copyPlanAnnotations(annotations);
  return out;
}

/** Aplica um comando de planta adicional. Devolve false quando o comando não é desta família. */
export function applyPlanViewCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addPlanView': {
      refuse(planViewIssues(p, c.plan, lang));
      if (planIdTaken(p, c.plan.id)) throw new Error(t(lang, 'md_cmd_plan_view_id_exists'));
      p.planViews = [...planViewsOf(p), normalized(c.plan, lang)];
      return true;
    }
    case 'updatePlanView': {
      const old = viewRef(p, c.id, lang);
      const next: PlanView = { ...old };
      if (c.patch.name !== undefined) next.name = c.patch.name;
      if (c.patch.discipline !== undefined) next.discipline = c.patch.discipline;
      if ('tones' in c.patch) next.tones = c.patch.tones;
      if ('hidden' in c.patch) next.hidden = c.patch.hidden;
      refuse(planViewIssues(p, next, lang));
      const clean = normalized(next, lang);
      p.planViews = planViewsOf(p).map((x) => (x.id === old.id ? clean : x));
      return true;
    }
    case 'removePlanView': {
      viewRef(p, c.id, lang);
      const rest = planViewsOf(p).filter((x) => x.id !== c.id);
      if (rest.length > 0) p.planViews = rest;
      else delete p.planViews;
      dropOrphanViewports(p);
      return true;
    }
    case 'setPlanGraphics':
      applyPlanGraphics(p, c.planId, c.patch, lang);
      return true;
    case 'resetPlanGraphics':
      resetPlanGraphics(p, c.planId, lang);
      return true;
    default:
      return false;
  }
}

/** Remove as plantas adicionais de um nível apagado (os viewports órfãos saem em `dropOrphanViewports`, no mesmo comando). */
export function dropPlanViewsOfLevel(p: Project, levelId: Id): void {
  if (!p.planViews?.some((x) => x.levelId === levelId)) return;
  const rest = p.planViews.filter((x) => x.levelId !== levelId);
  if (rest.length > 0) p.planViews = rest;
  else delete p.planViews;
}
