import {
  disciplineLabel,
  disciplinasDoProjeto,
  isBuiltinDiscipline,
  planViewById,
  planViewsOf,
  planViewForDiscipline,
  type Discipline,
  type Id,
  type Project,
  type ProjectStore,
} from '@hestia/model';
import { editor } from './controller.ts';
import { t, useI18n, type Lang } from './i18n.ts';
import { useUi } from './state.ts';

/** Rótulo da disciplina: as embutidas usam o texto traduzido; as do projeto, o nome declarado (id como último recurso). */
export function rotuloDaDisciplina(p: Pick<Project, 'disciplines'>, lang: Lang, id: Discipline): string {
  if (isBuiltinDiscipline(id)) return disciplineLabel(lang, id);
  return disciplinasDoProjeto(p).find((d) => d.id === id)?.name ?? id;
}

/**
 * Ações das plantas adicionais por disciplina (decisão 0060 §12, etapa 3.3): criar, duplicar, renomear e excluir.
 * Cada ação executa um único comando (um passo de desfazer) e navega pelo mesmo caminho de `selectLevel`; a
 * interface (menus, navegador, abas) fica para a fase 4.
 */

/** Cria a planta de uma disciplina e a abre. Devolve o id da planta nova. */
export function criarPlantaDeDisciplina(store: ProjectStore, levelId: Id, discipline: Discipline, opts: { name?: string } = {}): Id {
  const lang = useI18n.getState().lang;
  if (!store.project.levels.some((l) => l.id === levelId)) throw new Error(t(lang, 'eds_msg_level_missing'));
  const plan = planViewForDiscipline(store.project, levelId, discipline, { name: opts.name, lang });
  store.exec({ type: 'addPlanView', plan }, 'eds_undo_create_plan_view');
  editor.selectLevel(levelId, 'floor', null, plan.id);
  return plan.id;
}

/**
 * Duplica a planta (gráficos, ocultação, tons e, quando pedido, as anotações com ids novos) e abre a cópia.
 * Devolve o id da planta nova, ou null quando a origem não existe.
 */
export function duplicarPlanta(store: ProjectStore, planId: Id, opts: { withAnnotations?: boolean } = {}): Id | null {
  if (!planViewById(store.project, planId)) return null;
  const antes = new Set(planViewsOf(store.project).map((v) => v.id));
  store.exec({ type: 'duplicatePlanView', id: planId, ...(opts.withAnnotations ? { withAnnotations: true } : {}) }, 'eds_undo_duplicate_plan_view');
  const criada = planViewsOf(store.project).find((v) => !antes.has(v.id));
  if (!criada) return null;
  editor.selectLevel(criada.levelId, 'floor', null, criada.id);
  return criada.id;
}

/** Renomeia a planta; nome já usado no nível recebe sufixo numérico. Devolve o nome gravado, ou null se a planta não existe. */
export function renomearPlanta(store: ProjectStore, planId: Id, name: string): string | null {
  if (!planViewById(store.project, planId)) return null;
  if (planViewById(store.project, planId)?.name === name.trim()) return name.trim();
  store.exec({ type: 'updatePlanView', id: planId, patch: { name } }, 'eds_undo_rename_plan_view');
  return planViewById(store.project, planId)?.name ?? null;
}

/** Exclui a planta. Se ela era a ativa, a vista volta para a planta padrão do nível (viewports órfãos saem no comando). */
export function excluirPlanta(store: ProjectStore, planId: Id): boolean {
  const plan = planViewById(store.project, planId);
  if (!plan) return false;
  store.exec({ type: 'removePlanView', id: planId }, 'eds_undo_delete_plan_view');
  if (useUi.getState().planViewId === planId) editor.selectLevel(plan.levelId, 'floor', null, null);
  return true;
}

/** Disciplina da planta PADRÃO do nível (decisão 0060, adendo 3); `undefined` volta a Arquitetura. */
export function definirDisciplinaDaPlantaPadrao(store: ProjectStore, levelId: Id, discipline?: Discipline): void {
  return store.exec({ type: 'setLevelDiscipline', levelId, ...(discipline === undefined ? {} : { discipline }) }, undefined, useI18n.getState().lang);
}

/** Disciplina de uma planta de disciplina (a própria planta); os tons predefinidos acompanham a nova disciplina. */
export function definirDisciplinaDaPlanta(store: ProjectStore, planId: Id, discipline?: Discipline): void {
  return store.exec({ type: 'updatePlanView', id: planId, patch: { ...(discipline === undefined ? {} : { discipline }) } }, undefined, useI18n.getState().lang);
}

/** Disciplina de trabalho da vista 3D; `undefined` volta a mostrar todas as disciplinas. */
export function definirDisciplinaDo3d(store: ProjectStore, discipline?: Discipline): void {
  return store.exec({ type: 'setView3dDiscipline', ...(discipline === undefined ? {} : { discipline }) }, undefined, useI18n.getState().lang);
}
