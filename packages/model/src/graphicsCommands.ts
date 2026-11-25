import {
  GRAPHICS_CATEGORIES,
  graphicsIssues,
  graphicsOf,
  levelGraphicsOf,
  planGraphicsOf,
  sectionGraphicsOf,
  view3dOf,
  type CategoryLineStyle,
  type CategoryOverride,
  type DeepPartial,
  type GraphicsCategory,
  type ProjectGraphics,
  type View3DSettings,
  type ViewGraphics,
} from './graphics.ts';
import { disciplinaExiste } from './disciplineProfile.ts';
import { isDisciplineId, type Discipline } from './planView.ts';
import type { Id, Project } from './types.ts';
import { userPenSetIssues, type UserPenSet } from './penSets.ts';
import { t, type Lang } from './i18n.ts';

/**
 * Comandos de gráficos (decisão 0015). Cada um mescla o patch no valor efetivo atual e grava o objeto COMPLETO;
 * se houver qualquer problema, recusa com mensagens pt-BR e não altera o projeto.
 */

/** Cópia sem referências: rascunhos do immer e objetos do chamador não entram no estado. */
const copy = <T>(x: T): T => {
  if (Array.isArray(x)) return x.map(copy) as T;
  if (x !== null && typeof x === 'object') return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, copy(v)])) as T;
  return x;
};

/** Em substituições por categoria, `undefined` remove o campo opcional (volta a valer o do projeto). */
const withoutUndefined = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

function mergeOverrides(
  base: Record<GraphicsCategory, CategoryOverride>,
  patch: DeepPartial<Record<GraphicsCategory, CategoryOverride>> | undefined,
): Record<GraphicsCategory, CategoryOverride> {
  const out = {} as Record<GraphicsCategory, CategoryOverride>;
  for (const c of GRAPHICS_CATEGORIES) out[c] = withoutUndefined({ ...base[c], ...patch?.[c] }) as CategoryOverride;
  return out;
}

function mergeProject(cur: ProjectGraphics, patch: DeepPartial<ProjectGraphics>): ProjectGraphics {
  const categories = {} as Record<GraphicsCategory, CategoryLineStyle>;
  for (const c of GRAPHICS_CATEGORIES) categories[c] = { ...cur.categories[c], ...patch.categories?.[c] } as CategoryLineStyle;
  return { ...cur, ...patch, categories, detailByScale: { ...cur.detailByScale, ...patch.detailByScale } } as ProjectGraphics;
}

function mergeLevel(cur: ViewGraphics, patch: DeepPartial<ViewGraphics>): ViewGraphics {
  return { ...cur, ...patch, overrides: mergeOverrides(cur.overrides, patch.overrides) } as ViewGraphics;
}

export function mergeView3D(cur: View3DSettings, patch: DeepPartial<View3DSettings>): View3DSettings {
  return { ...cur, ...patch, overrides: mergeOverrides(cur.overrides, patch.overrides) } as View3DSettings;
}

function refuse(issues: string[]): void {
  if (issues.length > 0) throw new Error(issues.join(' '));
}

function levelOf(p: Project, levelId: Id, lang: Lang) {
  const l = p.levels.find((x) => x.id === levelId);
  if (!l) throw new Error(t(lang, 'md_level_missing'));
  return l;
}

export function applyProjectGraphics(p: Project, patch: DeepPartial<ProjectGraphics>, lang: Lang = 'pt'): void {
  const next = mergeProject(copy(graphicsOf(p)), copy(patch));
  refuse(graphicsIssues(next, lang));
  p.graphics = next;
}

export function applyLevelGraphics(p: Project, levelId: Id, patch: DeepPartial<ViewGraphics>, lang: Lang = 'pt'): void {
  const l = levelOf(p, levelId, lang);
  const next = mergeLevel(copy(levelGraphicsOf(p, levelId)), copy(patch));
  refuse(graphicsIssues(next, lang));
  l.graphics = next;
}

export function resetLevelGraphics(p: Project, levelId: Id, lang: Lang = 'pt'): void {
  delete levelOf(p, levelId, lang).graphics;
}

/** Disciplina informada precisa ser um id válido e existir no projeto (embutida ou do projeto); `undefined` limpa. */
function ensureDiscipline(p: Pick<Project, 'disciplines'>, discipline: Discipline | undefined, lang: Lang): void {
  if (discipline === undefined) return;
  if (!isDisciplineId(discipline) || !disciplinaExiste(p, discipline)) {
    throw new Error(t(lang, 'md_cmd_discipline_invalid', { id: String(discipline) }));
  }
}

/** Disciplina da planta PADRÃO do nível: `undefined` apaga o campo (volta a Arquitetura, decisão 0060 adendo 3). */
export function applyLevelDiscipline(p: Project, levelId: Id, discipline: Discipline | undefined, lang: Lang = 'pt'): void {
  const l = levelOf(p, levelId, lang);
  ensureDiscipline(p, discipline, lang);
  if (discipline === undefined) delete l.discipline;
  else l.discipline = discipline;
}

/** Disciplina de trabalho da vista 3D: `undefined` apaga o campo (a vista volta a mostrar todas). */
export function applyView3dDiscipline(p: Project, discipline: Discipline | undefined, lang: Lang = 'pt'): void {
  ensureDiscipline(p, discipline, lang);
  if (discipline !== undefined) {
    p.view3d = { ...(p.view3d ?? {}), discipline } as View3DSettings;
    return;
  }
  if (!p.view3d) return;
  delete p.view3d.discipline;
  if (Object.keys(p.view3d).length === 0) delete p.view3d;
}

function planViewRef(p: Project, planId: Id, lang: Lang) {
  const v = p.planViews?.find((x) => x.id === planId);
  if (!v) throw new Error(t(lang, 'md_plan_view_missing'));
  return v;
}

/** Gráficos de uma planta adicional (decisão 0060): mesma regra de `applyLevelGraphics`, gravando em `PlanView.graphics`. */
export function applyPlanGraphics(p: Project, planId: Id, patch: DeepPartial<ViewGraphics>, lang: Lang = 'pt'): void {
  const v = planViewRef(p, planId, lang);
  const next = mergeLevel(copy(planGraphicsOf(p, v.levelId, v.id)), copy(patch));
  refuse(graphicsIssues(next, lang));
  v.graphics = next;
}

export function resetPlanGraphics(p: Project, planId: Id, lang: Lang = 'pt'): void {
  delete planViewRef(p, planId, lang).graphics;
}

export function applyView3D(p: Project, patch: DeepPartial<View3DSettings>, lang: Lang = 'pt'): void {
  const next = mergeView3D(copy(view3dOf(p)), copy(patch));
  refuse(graphicsIssues(next, lang));
  p.view3d = next;
}

export function resetView3D(p: Project): void {
  delete p.view3d;
}

export function applySectionGraphics(p: Project, patch: DeepPartial<ViewGraphics>, lang: Lang = 'pt'): void {
  const next = mergeLevel(copy(sectionGraphicsOf(p)), copy(patch));
  refuse(graphicsIssues(next, lang));
  p.sectionGraphics = next;
}

export function resetSectionGraphics(p: Project): void {
  delete p.sectionGraphics;
}

/** Grava (cria ou substitui pelo id) um conjunto de penas do usuário, sempre como cópia sem referências externas. */
export function applySavePenSet(p: Project, penSet: UserPenSet, lang: Lang = 'pt'): void {
  const next = copy(penSet);
  refuse(userPenSetIssues(next, lang));
  p.penSets = { ...(p.penSets ?? {}), [next.id]: next };
}

/** Remove um conjunto do usuário; id inexistente recusa com mensagem e não altera o projeto. */
export function applyDeletePenSet(p: Project, id: Id, lang: Lang = 'pt'): void {
  if (!p.penSets || !Object.prototype.hasOwnProperty.call(p.penSets, id)) {
    throw new Error(t(lang, 'md_penset_missing'));
  }
  const next = { ...p.penSets };
  delete next[id];
  if (Object.keys(next).length === 0) delete p.penSets;
  else p.penSets = next;
}
