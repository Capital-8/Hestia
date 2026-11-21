import { copyPlanAnnotations, emptyPlanAnnotations } from './areaPlan.ts';
import type { Command } from './commands.ts';
import { applyPlanGraphics, resetPlanGraphics } from './graphicsCommands.ts';
import { t, type Key, type Lang } from './i18n.ts';
import { newId } from './ids.ts';
import { makePlanView, planIdTaken, planViewAnnotationsOf, planViewIssues, planViewsOf, type PlanView, type PlanViewAnnotations } from './planView.ts';
import { dropOrphanViewports } from './sheetCommands.ts';
import { normalizaViewHidden } from './viewHiddenCommands.ts';
import type { Id, Project } from './types.ts';

/** Comandos das plantas adicionais por disciplina (decisão 0060). Fora do `switch` grande de `commands.ts`. */
export type PlanViewCommand = Extract<Command, { type: 'addPlanView' | 'updatePlanView' | 'duplicatePlanView' | 'removePlanView' | 'setPlanGraphics' | 'resetPlanGraphics' }>;

/** Rótulo traduzido da disciplina (as chaves `md_disc_*` existem nos sete idiomas em `i18n.ts`). */
export const disciplineLabel = (lang: Lang, discipline: PlanView['discipline']): string => t(lang, `md_disc_${discipline}` as Key);

/**
 * Nome único dentro do nível (decisão 0060 §12, 3.3). O nome pedido é mantido quando livre; ocupado, recebe sufixo
 * numérico: "Estrutura" → "Estrutura (2)" → "Estrutura (3)". `exceptId` ignora a própria planta (renomear para o
 * mesmo nome não muda nada).
 */
export function uniquePlanViewName(p: Partial<Pick<Project, 'planViews'>>, levelId: Id, name: string, exceptId?: Id): string {
  const base = name.trim();
  const used = new Set(planViewsOf(p).filter((v) => v.levelId === levelId && v.id !== exceptId).map((v) => v.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

/** Nome padrão de uma planta de disciplina: "<Nível> - <Disciplina>", já único no nível. */
export function defaultPlanViewName(
  p: Pick<Project, 'levels'> & Partial<Pick<Project, 'planViews'>>,
  levelId: Id,
  discipline: PlanView['discipline'],
  lang: Lang = 'pt',
): string {
  const level = p.levels.find((l) => l.id === levelId);
  return uniquePlanViewName(p, levelId, `${level?.name ?? levelId} - ${disciplineLabel(lang, discipline)}`);
}

/**
 * Planta nova de uma disciplina, com o predefinido da etapa 3.3: id novo, disciplina, nome padrão único por nível
 * e anotações vazias. `tones` fica ausente de propósito: `planTonesOf` usa o predefinido da disciplina (§4.2).
 */
export function planViewForDiscipline(
  p: Pick<Project, 'levels'> & Partial<Pick<Project, 'planViews'>>,
  levelId: Id,
  discipline: PlanView['discipline'],
  opts: { name?: string; lang?: Lang; id?: Id } = {},
): PlanView {
  const lang = opts.lang ?? 'pt';
  const base = opts.name?.trim() || defaultPlanViewName(p, levelId, discipline, lang);
  return makePlanView({ id: opts.id, levelId, discipline, name: uniquePlanViewName(p, levelId, base), annotations: emptyPlanAnnotations() });
}

/** Cópia profunda das anotações com ids novos (duplicar com anotações nunca compartilha id com a origem). */
function copyAnnotationsWithNewIds(a: PlanViewAnnotations): PlanViewAnnotations {
  const c = copyPlanAnnotations(a);
  return {
    ...c,
    dimensions: c.dimensions.map((x) => ({ ...x, id: newId('dim') })),
    texts: c.texts.map((x) => ({ ...x, id: newId('txt') })),
    detailLines: c.detailLines.map((x) => ({ ...x, id: newId('dl') })),
    detailRegions: c.detailRegions.map((x) => ({ ...x, id: newId('dr') })),
    tags: c.tags.map((x) => ({ ...x, id: newId('tag') })),
    ...(c.spots ? { spots: c.spots.map((x) => ({ ...x, id: newId('spot') })) } : {}),
    ...(c.revisionClouds ? { revisionClouds: c.revisionClouds.map((x) => ({ ...x, id: newId('rc') })) } : {}),
    ...(c.symbols ? { symbols: c.symbols.map((x) => ({ ...x, id: newId('sym') })) } : {}),
  };
}

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
      const plan: PlanView = { ...c.plan, name: uniquePlanViewName(p, c.plan.levelId, c.plan.name) };
      refuse(planViewIssues(p, plan, lang));
      if (planIdTaken(p, plan.id)) throw new Error(t(lang, 'md_cmd_plan_view_id_exists'));
      p.planViews = [...planViewsOf(p), normalized(plan, lang)];
      return true;
    }
    case 'updatePlanView': {
      const old = viewRef(p, c.id, lang);
      const next: PlanView = { ...old };
      // Renomear mantém o invariante de nome único no nível: ocupado, recebe o sufixo numérico.
      if (c.patch.name !== undefined) next.name = uniquePlanViewName(p, old.levelId, c.patch.name, old.id);
      if (c.patch.discipline !== undefined) next.discipline = c.patch.discipline;
      if ('tones' in c.patch) next.tones = c.patch.tones;
      if ('hidden' in c.patch) next.hidden = c.patch.hidden;
      refuse(planViewIssues(p, next, lang));
      const clean = normalized(next, lang);
      p.planViews = planViewsOf(p).map((x) => (x.id === old.id ? clean : x));
      return true;
    }
    case 'duplicatePlanView': {
      const src = viewRef(p, c.id, lang);
      const id = c.newPlanId ?? newId('pv');
      if (planIdTaken(p, id)) throw new Error(t(lang, 'md_cmd_plan_view_id_exists'));
      const plan: PlanView = {
        ...src,
        id,
        name: uniquePlanViewName(p, src.levelId, src.name),
        annotations: c.withAnnotations ? copyAnnotationsWithNewIds(planViewAnnotationsOf(src)) : emptyPlanAnnotations(),
      };
      p.planViews = [...planViewsOf(p), normalized(plan, lang)];
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
