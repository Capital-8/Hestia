import { floorViewId, planViewRefOf, roofViewId, type Id, type PlanViewKind, type Project } from '@hestia/model';
import { useUi, type UiState } from './state.ts';
import type { PlanKind } from './openViews.ts';

/**
 * Seletores da vista de planta ativa, derivados dos campos soltos do estado da interface (`view`, `levelId`,
 * `planKind`, `areaPlanId`). Não alteram `state.ts`: enquanto o estado guardar os campos antigos, o resto do editor lê
 * a vista por aqui (docs/vistas/PLANO-MESTRE.md §4.4, Fase 1) e, na Fase 2, só estas funções mudam.
 */
export type CamposDaVista = Pick<UiState, 'view' | 'levelId' | 'planKind' | 'areaPlanId'>;

/**
 * Id da vista de planta dos campos `levelId`/`planKind`/`areaPlanId`, SEM olhar `view`. Planta de área sem
 * `areaPlanId` não tem vista (`null`, como `visibilityKeyOf` em viewVisibility.ts:23).
 */
function idDaPlanta(ui: Pick<UiState, 'levelId' | 'planKind' | 'areaPlanId'>): Id | null {
  if (ui.planKind === 'area') return ui.areaPlanId ?? null;
  return ui.planKind === 'roof' ? roofViewId(ui.levelId) : floorViewId(ui.levelId);
}

/**
 * Vista de planta ATIVA: só quando a tela é planta (`view === 'plan'`). Em 3D, corte e prancha devolve `null`,
 * mesmo que `levelId`/`planKind` guardem uma planta "de fundo" (o estado os mantém ao sair da planta).
 */
export function planViewIdAtivo(ui: CamposDaVista): Id | null {
  return ui.view === 'plan' ? idDaPlanta(ui) : null;
}

/**
 * Planta "de fundo": a que `levelId`/`planKind`/`areaPlanId` apontam, qualquer que seja `view`. É a planta para onde
 * o editor volta ao sair do 3D, do corte ou da prancha, e a que as ferramentas de nível (ex.: nível de referência do
 * 3D) usam. Nota: o controlador só bloqueia ferramentas pela planta de área quando `view !== '3d'`
 * (controller.ts:535), ou seja, no 3D a planta de fundo não restringe nada: quem decide permissão usa `planViewIdAtivo`.
 */
export function planViewIdDeFundo(ui: Pick<UiState, 'levelId' | 'planKind' | 'areaPlanId'>): Id | null {
  return idDaPlanta(ui);
}

/** Nível ativo (sempre definido; em corte e prancha é o último nível usado). */
export const nivelAtivo = (ui: Pick<UiState, 'levelId'>): Id => ui.levelId;

/** Tipo da vista de planta ativa; `null` fora da planta (e na planta de área sem `areaPlanId`). */
export function tipoDeVistaAtivo(ui: CamposDaVista): PlanViewKind | null {
  return planViewIdAtivo(ui) === null ? null : ui.planKind;
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
  areaPlanId: Id | null;
}

/**
 * Campos do estado para ativar a vista `viewId`: `useUi.setState(patch)`. `null` se a vista não existe ou é de um tipo
 * que o estado atual não sabe mostrar (`ceiling` só ganha comportamento na Fase 4).
 */
export function patchParaAtivarVista(p: Project, viewId: Id): PatchDeVista | null {
  const ref = planViewRefOf(p, viewId);
  if (!ref || ref.kind === 'ceiling') return null;
  return { view: 'plan', levelId: ref.levelId, planKind: ref.kind, areaPlanId: ref.kind === 'area' ? (ref.areaPlanId ?? null) : null };
}
