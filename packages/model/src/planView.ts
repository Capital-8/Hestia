import { planAnnotationsOf, type AreaPlanAnnotations } from './areaPlan.ts';
import { graphicsIssues, planGraphicsOf, planHiddenOf, viewHiddenIssues, type ViewGraphics, type ViewHidden } from './graphics.ts';
import { t, type Lang } from './i18n.ts';
import { newId } from './ids.ts';
import type { Id, Project } from './types.ts';

/**
 * Planta de piso ADICIONAL de um nível (decisão 0060): uma planta por disciplina além da padrão. A planta padrão de cada
 * nível continua sendo "o nível" (`Level.graphics`, `Level.hidden`, anotações do nível); `Project.planViews` guarda só as
 * adicionais. Ausente = nenhuma, e um arquivo sem a coleção abre e desenha exatamente como antes.
 */

/** Disciplinas embutidas das plantas. Tabelas sobre elas continuam exaustivas (predefinido e rótulo traduzido). */
export type BuiltinDiscipline = 'arquitetura' | 'estrutura' | 'hidrossanitario' | 'eletrico' | 'hvac';
/** Disciplina é identificador (texto): as embutidas acima mais as criadas no projeto (adendo 3). */
export type Discipline = string;
/** Tom de uma disciplina numa planta: oculta, meio-tom ou normal (a regra de visibilidade entra na etapa 3.2). */
export type Tone = 'hidden' | 'halftone' | 'normal';

export const DISCIPLINES: readonly BuiltinDiscipline[] = ['arquitetura', 'estrutura', 'hidrossanitario', 'eletrico', 'hvac'];
/** Alias explícito da lista das cinco embutidas (as disciplinas do usuário ainda não são gravadas). */
export const BUILTIN_DISCIPLINES: readonly BuiltinDiscipline[] = DISCIPLINES;
export const TONES: readonly Tone[] = ['hidden', 'halftone', 'normal'];

/** Disciplina da planta padrão de todo nível (a que reproduz o desenho de hoje). */
export const DEFAULT_DISCIPLINE: BuiltinDiscipline = 'arquitetura';

export const isBuiltinDiscipline = (x: unknown): x is BuiltinDiscipline => typeof x === 'string' && (DISCIPLINES as readonly string[]).includes(x);
/** Nome mantido para os chamadores: verdadeiro só para as cinco embutidas. */
export const isDiscipline = isBuiltinDiscipline;
/** Identificador de disciplina: texto não vazio, sem espaços nas pontas, até 40 caracteres (embutida ou do projeto). */
export const isDisciplineId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 40 && x.trim() === x;
export const isTone = (x: unknown): x is Tone => typeof x === 'string' && (TONES as readonly string[]).includes(x);

/** Anotações de uma planta adicional: mesmas estruturas da planta de área; ausente = vazio (nunca herda do nível). */
export type PlanViewAnnotations = AreaPlanAnnotations;

export interface PlanView {
  /** Id novo (`newId`), único no projeto, inclusive em relação às plantas de área. */
  id: Id;
  /** Nível dono (a planta é de piso: mesmo perfil e mesma altura de corte da planta padrão). */
  levelId: Id;
  discipline: Discipline;
  name: string;
  /** Mesmo tipo de `Level.graphics`; ausente = padrão, como no nível. */
  graphics?: ViewGraphics;
  /** Hide in View desta planta. */
  hidden?: ViewHidden;
  /** Desvios do predefinido de tons da disciplina (a tabela de predefinidos entra na etapa 3.1). */
  tones?: Partial<Record<Discipline, Tone>>;
  /** Cotas, textos, detalhes e etiquetas da própria planta. */
  annotations?: PlanViewAnnotations;
}

/** Planta resolvida: o que a planta padrão do nível ou uma `PlanView` entregam já com os padrões aplicados. */
export interface ResolvedPlan {
  levelId: Id;
  /** Id da `PlanView`; ausente na planta padrão do nível. */
  planId?: Id;
  discipline: Discipline;
  name: string;
  /** Verdadeiro na planta padrão do nível (dados em `Level`). */
  isDefault: boolean;
  graphics: ViewGraphics;
  hidden: ViewHidden;
  /** Desvios gravados de tom; vazio na planta padrão (que usa o predefinido de Arquitetura). */
  tones: Partial<Record<Discipline, Tone>>;
}

export const planViewsOf = (p: Partial<Pick<Project, 'planViews'>>): PlanView[] => p.planViews ?? [];

export const planViewById = (p: Partial<Pick<Project, 'planViews'>>, id: Id): PlanView | undefined => planViewsOf(p).find((x) => x.id === id);

export const planViewsOfLevel = (p: Partial<Pick<Project, 'planViews'>>, levelId: Id): PlanView[] => planViewsOf(p).filter((x) => x.levelId === levelId);

/** Anotações da planta adicional normalizadas (ausente = vazio; nunca cai nas do nível). */
export const planViewAnnotationsOf = (plan: Pick<PlanView, 'annotations'>): PlanViewAnnotations => planAnnotationsOf(plan);

/**
 * Resolve a planta pedida. `planId` ausente é a planta padrão do nível; presente e existente NO MESMO nível é a
 * `PlanView`; desconhecido ou de outro nível cai na padrão (nunca lança; a validação sinaliza o id pendente).
 */
export function planOf(p: Pick<Project, 'levels'> & Partial<Pick<Project, 'planViews'>>, levelId: Id, planId?: Id): ResolvedPlan {
  const view = planId === undefined ? undefined : planViewsOf(p).find((x) => x.id === planId && x.levelId === levelId);
  if (view) {
    return {
      levelId,
      planId: view.id,
      discipline: view.discipline,
      name: view.name,
      isDefault: false,
      graphics: planGraphicsOf(p, levelId, view.id),
      hidden: planHiddenOf(p, levelId, view.id),
      tones: { ...(view.tones ?? {}) },
    };
  }
  const nivel = p.levels.find((l) => l.id === levelId);
  const disciplinaDoNivel = nivel?.discipline;
  return {
    levelId,
    discipline: isDisciplineId(disciplinaDoNivel) ? disciplinaDoNivel : DEFAULT_DISCIPLINE,
    name: nivel?.name ?? '',
    isDefault: true,
    graphics: planGraphicsOf(p, levelId),
    hidden: planHiddenOf(p, levelId),
    tones: {},
  };
}

/** Planta adicional nova, com id novo e sem nada gravado além de nível, disciplina e nome. */
export function makePlanView(input: { levelId: Id; name: string; discipline?: Discipline; id?: Id } & Partial<Pick<PlanView, 'graphics' | 'hidden' | 'tones' | 'annotations'>>): PlanView {
  const { id, discipline, ...rest } = input;
  return { ...rest, id: id ?? newId('pv'), discipline: discipline ?? DEFAULT_DISCIPLINE };
}

/** O id já é de uma planta de área ou de uma planta adicional? (Os ids das duas coleções são disjuntos.) */
export const planIdTaken = (p: Partial<Pick<Project, 'planViews' | 'areaPlans'>>, id: Id): boolean =>
  planViewsOf(p).some((x) => x.id === id) || (p.areaPlans ?? []).some((x) => x.id === id);

/**
 * Problemas de UMA planta adicional (comando e validação), sem o prefixo do contexto. Unicidade do id é do projeto
 * (`planIdTaken`), não da planta. Vazio = válida.
 */
export function planViewIssues(p: Pick<Project, 'levels'> & Partial<Pick<Project, 'planViews'>>, plan: PlanView, lang: Lang = 'pt'): string[] {
  const out: string[] = [];
  if (typeof plan.id !== 'string' || !plan.id) out.push('A planta precisa de um id.');
  if (typeof plan.name !== 'string' || !plan.name.trim()) out.push('A planta precisa de nome.');
  if (!p.levels.some((l) => l.id === plan.levelId)) out.push(t(lang, 'md_level_missing'));
  if (!isDiscipline(plan.discipline)) out.push(`Disciplina inválida: "${String(plan.discipline)}".`);
  if (plan.tones !== undefined) {
    if (plan.tones === null || typeof plan.tones !== 'object' || Array.isArray(plan.tones)) out.push('Os tons da planta precisam ser um objeto disciplina → tom.');
    else
      for (const [d, tone] of Object.entries(plan.tones)) {
        if (!isDiscipline(d)) out.push(`Tom para disciplina inválida: "${d}".`);
        else if (!isTone(tone)) out.push(`Tom inválido para ${d}: "${String(tone)}".`);
      }
  }
  out.push(...viewHiddenIssues(plan.hidden, lang));
  if (plan.graphics !== undefined) out.push(...graphicsIssues(planGraphicsOf({ levels: p.levels, planViews: [plan] }, plan.levelId, plan.id), lang));
  return out;
}
