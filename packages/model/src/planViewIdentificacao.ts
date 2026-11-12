import type { SheetViewSource } from './sheet.ts';
import type { Id, Project } from './types.ts';
import { planViewOf, type PlanView } from './planView.ts';

/**
 * Forma única de identificar uma vista de planta (docs/vistas/PLANO-MESTRE.md §4.4): o id da `PlanView`. A forma
 * antiga de arquivo (`levelId` + tipo, `planId`) só é lida em `migrateSheetSources.ts`.
 */

/** Id da vista de planta de uma fonte de viewport; `null` para quadro de áreas, corte e 3D. */
export function sheetPlanViewId(v: SheetViewSource): Id | null {
  return v.kind === 'plan' ? v.viewId : null;
}

/** Vista de planta (`PlanView`) de uma fonte de viewport; `undefined` se não é planta ou não existe. */
export function sheetPlanViewOf(p: Pick<Project, 'planViews'>, v: SheetViewSource): PlanView | undefined {
  const id = sheetPlanViewId(v);
  return id === null ? undefined : planViewOf(p, id);
}
