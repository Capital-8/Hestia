import {
  GRAPHICS_CATEGORIES,
  graphicsIssues,
  graphicsOf,
  resolveViewGraphics,
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
import type { Id, Project } from './types.ts';
import type { PlanView } from './planView.ts';
import { resolvePlanView } from './planViewResolve.ts';
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

function mergeView3D(cur: View3DSettings, patch: DeepPartial<View3DSettings>): View3DSettings {
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

/** Mescla o patch nos gráficos da vista (valor efetivo atual lido do rascunho) e grava o objeto completo. */
function mergeIntoView(v: PlanView, patch: DeepPartial<ViewGraphics>, lang: Lang): void {
  const next = mergeLevel(copy(resolveViewGraphics(v.graphics)), copy(patch));
  refuse(graphicsIssues(next, lang));
  v.graphics = next;
}

/** Gráficos de UMA vista (`updatePlanView`): só a vista pedida muda. */
export function applyViewGraphics(p: Project, viewId: Id, patch: DeepPartial<ViewGraphics>, lang: Lang = 'pt'): void {
  const v = resolvePlanView(p, viewId);
  if (!v) throw new Error(t(lang, 'md_view_missing'));
  mergeIntoView(v, patch, lang);
}

/** Restaura os gráficos padrão de UMA vista. */
export function resetViewGraphics(p: Project, viewId: Id, lang: Lang = 'pt'): void {
  const v = resolvePlanView(p, viewId);
  if (!v) throw new Error(t(lang, 'md_view_missing'));
  delete v.graphics;
}

/**
 * Comando antigo `setLevelGraphics`. Antes os gráficos eram do NÍVEL e valiam para piso, cobertura e planta de área;
 * agora cada vista tem os seus. Para o programa se comportar igual nesta etapa, a alteração é propagada a TODAS as vistas do
 * nível (cada uma mescla o patch sobre o seu valor). A Fase 3 decide quando parar de propagar; `updatePlanView` altera só a
 * vista pedida.
 */
export function applyLevelGraphics(p: Project, levelId: Id, patch: DeepPartial<ViewGraphics>, lang: Lang = 'pt'): void {
  levelOf(p, levelId, lang);
  for (const v of p.planViews) if (v.levelId === levelId) mergeIntoView(v, patch, lang);
}

/** Comando antigo `resetLevelGraphics`: restaura o padrão em todas as vistas do nível (ver `applyLevelGraphics`). */
export function resetLevelGraphics(p: Project, levelId: Id, lang: Lang = 'pt'): void {
  levelOf(p, levelId, lang);
  for (const v of p.planViews) if (v.levelId === levelId) delete v.graphics;
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
