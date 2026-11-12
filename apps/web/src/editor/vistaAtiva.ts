import { floorViewId, planViewRef, planViewRefOf, roofViewId, type Id, type PlanViewKind, type Project } from '@hestia/model';
import { useUi, type UiState } from './state.ts';

/** O que as consultas de tipo precisam do projeto. */
type ProjetoComVistas = Pick<Project, 'planViews'>;

/**
 * Seletores da vista de planta ativa. O estado da interface guarda `planViewId` (o id da `PlanView`, forma única de
 * identificar a vista: docs/vistas/PLANO-MESTRE.md §4.4) junto com `levelId`, que acompanha a vista. Os dois são
 * escritos SEMPRE juntos, por `PatchDeVista` (`patchParaAtivarVista`, `camposDeNivel`). O TIPO da vista não é guardado:
 * sai do projeto (`tipoDeVistaDeFundo`, `tipoDeVistaAtivo`) e as decisões por tipo vêm da tabela `PLAN_VIEW_KINDS`.
 * O resto do editor lê a vista por aqui.
 */
export type CamposDaVista = Pick<UiState, 'view' | 'levelId'> & {
  planViewId?: Id | null;
};

/**
 * Id da vista de planta dos campos do estado, SEM olhar `view`; `null` quando o estado não tem `planViewId`.
 */
function idDaPlanta(ui: Omit<CamposDaVista, 'view'>): Id | null {
  return ui.planViewId || null;
}

/**
 * Vista de planta ATIVA: só quando a tela é planta (`view === 'plan'`). Em 3D, corte e prancha devolve `null`,
 * mesmo que o estado guarde uma planta "de fundo" (o estado a mantém ao sair da planta).
 */
export function planViewIdAtivo(ui: CamposDaVista): Id | null {
  return ui.view === 'plan' ? idDaPlanta(ui) : null;
}

/**
 * Planta "de fundo": a que `planViewId` aponta, qualquer que seja `view`. É a planta para onde o editor volta ao sair do
 * 3D, do corte ou da prancha, e a que as ferramentas de nível (ex.: nível de referência do 3D) usam. Nota: o controlador
 * só restringe ferramentas pelo tipo da planta quando `view !== '3d'`: quem decide permissão usa `planViewIdAtivo`.
 */
export function planViewIdDeFundo(ui: Omit<CamposDaVista, 'view'>): Id | null {
  return idDaPlanta(ui);
}

/** Nível ativo (sempre definido; em corte e prancha é o último nível usado). */
export const nivelAtivo = (ui: Pick<UiState, 'levelId'>): Id => ui.levelId;

/**
 * Tipo da planta "de fundo" (qualquer que seja `view`), lido da vista no projeto: a consulta única do tipo, de onde sai
 * a decisão por tipo (`PLAN_VIEW_KINDS`). Piso e cobertura principais se reconhecem pelo próprio id (`planViewRef`), mesmo
 * sem o projeto ou depois de o nível sair dele; a planta de área precisa do projeto. Vista que não se reconhece vale `floor`.
 */
export function tipoDeVistaDeFundo(p: ProjetoComVistas | undefined, ui: Omit<CamposDaVista, 'view'>): PlanViewKind {
  const id = idDaPlanta(ui);
  const ref = id ? ((p ? planViewRefOf(p, id) : undefined) ?? planViewRef(id)) : undefined;
  return ref ? ref.kind : 'floor';
}

/** Tipo da vista de planta ativa; `null` fora da planta. */
export function tipoDeVistaAtivo(p: ProjetoComVistas | undefined, ui: CamposDaVista): PlanViewKind | null {
  return planViewIdAtivo(ui) === null ? null : tipoDeVistaDeFundo(p, ui);
}

/** Id da planta de ÁREA ativa (só em `view === 'plan'`); `null` em piso, cobertura, 3D, corte e prancha. */
export function areaViewIdAtivo(p: ProjetoComVistas | undefined, ui: CamposDaVista): Id | null {
  return tipoDeVistaAtivo(p, ui) === 'area' ? planViewIdAtivo(ui) : null;
}

/** Id da planta de ÁREA "de fundo" (qualquer que seja `view`); `null` quando a planta de fundo não é de área. */
export function areaViewIdDeFundo(p: ProjetoComVistas | undefined, ui: Omit<CamposDaVista, 'view'>): Id | null {
  return tipoDeVistaDeFundo(p, ui) === 'area' ? idDaPlanta(ui) : null;
}

/** Chave do viewport da planta de fundo: nível (piso), `roof:<nível>` ou `area:<planta>` (cada planta tem o seu). */
export function chaveDeViewportDePlanta(p: ProjetoComVistas | undefined, ui: Omit<CamposDaVista, 'view'>): Id {
  const tipo = tipoDeVistaDeFundo(p, ui);
  if (tipo === 'roof') return `roof:${ui.levelId}`;
  if (tipo === 'area') return `area:${idDaPlanta(ui) ?? ui.levelId}`;
  return ui.levelId;
}

/** Hooks finos (mesmo padrão `useUi((s) => ...)` do resto do editor). Devolvem primitivos: sem re-render à toa. */
export const usePlanViewIdAtivo = (): Id | null => useUi((s) => planViewIdAtivo(s));
export const usePlanViewIdDeFundo = (): Id | null => useUi((s) => planViewIdDeFundo(s));
export const useNivelAtivo = (): Id => useUi((s) => nivelAtivo(s));

/** Patch de estado que ativa uma vista de planta (o inverso de `planViewIdAtivo`). */
export interface PatchDeVista {
  view: 'plan';
  levelId: Id;
  planViewId: Id;
}

/** Campos da planta de fundo sem a tela (`levelId`, `planViewId`): o que se grava junto, sem mudar `view`. */
export type CamposDaPlanta = Pick<PatchDeVista, 'levelId' | 'planViewId'>;

/**
 * Campos do estado para ativar a vista `viewId`: `useUi.setState(patch)`. `null` se a vista não existe ou é de um tipo
 * que o estado atual não sabe mostrar (`ceiling` só ganha comportamento na Fase 4).
 */
export function patchParaAtivarVista(p: Project, viewId: Id): PatchDeVista | null {
  const ref = planViewRefOf(p, viewId);
  if (!ref || ref.kind === 'ceiling') return null;
  return { view: 'plan', levelId: ref.levelId, planViewId: viewId };
}

/**
 * Campos da planta para o nível `levelId` mantendo o tipo da planta de fundo: piso e cobertura passam a ser os do novo
 * nível; a planta de área não é do novo nível e continua a mesma.
 */
export function camposDeNivel(p: ProjetoComVistas | undefined, ui: Omit<CamposDaVista, 'view'>, levelId: Id): CamposDaPlanta {
  const tipo = tipoDeVistaDeFundo(p, ui);
  if (tipo === 'area') return { levelId, planViewId: idDaPlanta(ui) ?? floorViewId(levelId) };
  return { levelId, planViewId: tipo === 'roof' ? roofViewId(levelId) : floorViewId(levelId) };
}
