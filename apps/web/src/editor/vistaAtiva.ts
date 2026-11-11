import { floorViewId, planViewRefOf, roofViewId, type Id, type PlanViewKind, type Project } from '@hestia/model';
import { useUi, type UiState } from './state.ts';
import type { PlanKind } from './openViews.ts';

/**
 * Seletores da vista de planta ativa. O estado da interface guarda `planViewId` (o id da `PlanView`, forma única de
 * identificar a vista: docs/vistas/PLANO-MESTRE.md §4.4) junto com `levelId` e `planKind`, que acompanham a vista
 * (`planKind` é o tipo dela guardado ao lado do id porque o estado não tem o projeto para consultá-lo). Os três são
 * escritos SEMPRE juntos, por `PatchDeVista` (`patchParaAtivarVista`, `patchDeNivel`). O resto do editor lê a vista por aqui.
 *
 * Estado no formato antigo (sem `planViewId`, com `areaPlanId`) continua sendo lido: a vista sai de `levelId`,
 * `planKind` e `areaPlanId`. Serve a sessões antigas e ao harness do ouro.
 */
export type CamposDaVista = Pick<UiState, 'view' | 'levelId' | 'planKind'> & {
  planViewId?: Id | null;
  /** @deprecated Forma antiga do estado: só lida quando não há `planViewId`. */
  areaPlanId?: Id | null;
};

/**
 * Id da vista de planta dos campos do estado, SEM olhar `view`. Estado antigo com planta de área sem `areaPlanId`
 * não tem vista (`null`).
 */
function idDaPlanta(ui: Omit<CamposDaVista, 'view'>): Id | null {
  if (ui.planViewId) return ui.planViewId;
  if (ui.planKind === 'area') return ui.areaPlanId ?? null;
  return ui.planKind === 'roof' ? roofViewId(ui.levelId) : floorViewId(ui.levelId);
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
 * só bloqueia ferramentas pela planta de área quando `view !== '3d'`, ou seja, no 3D a planta de fundo não restringe
 * nada: quem decide permissão usa `planViewIdAtivo`.
 */
export function planViewIdDeFundo(ui: Omit<CamposDaVista, 'view'>): Id | null {
  return idDaPlanta(ui);
}

/** Nível ativo (sempre definido; em corte e prancha é o último nível usado). */
export const nivelAtivo = (ui: Pick<UiState, 'levelId'>): Id => ui.levelId;

/** Tipo da vista de planta ativa; `null` fora da planta (e, no estado antigo, na planta de área sem `areaPlanId`). */
export function tipoDeVistaAtivo(ui: CamposDaVista): PlanViewKind | null {
  return planViewIdAtivo(ui) === null ? null : ui.planKind;
}

/**
 * Tipo da planta "de fundo" (o que `planKind` guarda, qualquer que seja `view`). Só para o código antigo que valia
 * também fora da planta (ex.: a permissão de ferramenta, que só desliga no 3D).
 */
export const tipoDeVistaDeFundo = (ui: Pick<UiState, 'planKind'>): PlanViewKind => ui.planKind;

/** Id da planta de ÁREA ativa (só em `view === 'plan'`); `null` em piso, cobertura, 3D, corte e prancha. */
export function areaViewIdAtivo(ui: CamposDaVista): Id | null {
  return tipoDeVistaAtivo(ui) === 'area' ? planViewIdAtivo(ui) : null;
}

/** Id da planta de ÁREA "de fundo" (qualquer que seja `view`); `null` quando a planta de fundo não é de área. */
export function areaViewIdDeFundo(ui: Omit<CamposDaVista, 'view'>): Id | null {
  return ui.planKind === 'area' ? idDaPlanta(ui) : null;
}

/** Chave do viewport da planta de fundo: nível (piso), `roof:<nível>` ou `area:<planta>` (cada planta tem o seu). */
export function chaveDeViewportDePlanta(ui: Omit<CamposDaVista, 'view'>): Id {
  if (ui.planKind === 'roof') return `roof:${ui.levelId}`;
  if (ui.planKind === 'area') return `area:${idDaPlanta(ui) ?? ui.levelId}`;
  return ui.levelId;
}

/** Hooks finos (mesmo padrão `useUi((s) => ...)` do resto do editor). Devolvem primitivos: sem re-render à toa. */
export const usePlanViewIdAtivo = (): Id | null => useUi((s) => planViewIdAtivo(s));
export const usePlanViewIdDeFundo = (): Id | null => useUi((s) => planViewIdDeFundo(s));
export const useNivelAtivo = (): Id => useUi((s) => nivelAtivo(s));
export const useTipoDeVistaAtivo = (): PlanViewKind | null => useUi((s) => tipoDeVistaAtivo(s));

/** Patch de estado que ativa uma vista de planta (o inverso de `planViewIdAtivo`). */
export interface PatchDeVista {
  view: 'plan';
  levelId: Id;
  planKind: PlanKind;
  planViewId: Id;
}

/** Campos da planta de fundo sem a tela (`levelId`, `planKind`, `planViewId`): o que se grava junto, sem mudar `view`. */
export type CamposDaPlanta = Pick<PatchDeVista, 'levelId' | 'planKind' | 'planViewId'>;

/**
 * Campos do estado para ativar a vista `viewId`: `useUi.setState(patch)`. `null` se a vista não existe ou é de um tipo
 * que o estado atual não sabe mostrar (`ceiling` só ganha comportamento na Fase 4).
 */
export function patchParaAtivarVista(p: Project, viewId: Id): PatchDeVista | null {
  const ref = planViewRefOf(p, viewId);
  if (!ref || ref.kind === 'ceiling') return null;
  return { view: 'plan', levelId: ref.levelId, planKind: ref.kind, planViewId: viewId };
}

/**
 * Campos da planta para o nível `levelId` mantendo o tipo da planta de fundo: piso e cobertura passam a ser os do novo
 * nível (o estado antigo derivava isso de `levelId`); a planta de área não é do novo nível e continua a mesma.
 */
export function camposDeNivel(ui: Pick<UiState, 'planKind' | 'planViewId'>, levelId: Id): Pick<CamposDaPlanta, 'levelId' | 'planViewId'> {
  if (ui.planKind === 'area') return { levelId, planViewId: ui.planViewId };
  return { levelId, planViewId: ui.planKind === 'roof' ? roofViewId(levelId) : floorViewId(levelId) };
}

/** Id da vista de planta para `levelId` + `planKind` (+ planta de área), na forma antiga de pedir (ex.: `selectLevel`). */
export function planViewIdDe(levelId: Id, kind: PlanKind, areaPlanId: Id | null = null): Id {
  if (kind === 'area' && areaPlanId) return areaPlanId;
  return kind === 'roof' ? roofViewId(levelId) : floorViewId(levelId);
}
