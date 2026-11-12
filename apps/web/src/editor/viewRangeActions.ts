import { DEFAULT_VIEW_RANGE, floorViewId, planViewOf, planViewRangeOf, type Id, type ProjectStore, type ViewRange } from '@hestia/model';
import { t, useI18n } from './i18n.ts';

/** Resultado de uma edição do intervalo de vista: `error` traz a mensagem pt-BR de quem recusou (nada é gravado). */
export interface ViewRangeEdit {
  ok: boolean;
  error: string | null;
}

/**
 * Altera uma ou mais cotas do intervalo de vista do nível, em um único passo de desfazer ("Alterar intervalo de vista").
 * O comando valida a ordem topo ≥ corte ≥ base ≥ profundidade e lança Error; aqui a mensagem vira resultado e
 * a gravação não acontece (o store não muda nem entra no histórico quando o comando lança).
 */
export function editPlanViewRange(store: ProjectStore, viewId: Id, patch: Partial<ViewRange>): ViewRangeEdit {
  try {
    // Nada muda (mesmos valores): não chama o comando, para não criar passo de desfazer vazio.
    const cur = planViewRangeOf(store.project, viewId);
    const keys = Object.keys(patch) as Array<keyof ViewRange>;
    const exists = planViewOf(store.project, viewId) !== undefined;
    if (exists && keys.every((k) => patch[k] === cur[k])) return { ok: true, error: null };
    store.exec({ type: 'updatePlanView', viewId, patch: { viewRange: patch } }, 'eds_undo_change_view_range');
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t(useI18n.getState().lang, 'edc_view_range_invalid') };
  }
}

/** Atalho da planta de piso de um nível. */
export function editViewRange(store: ProjectStore, levelId: Id, patch: Partial<ViewRange>): ViewRangeEdit {
  return editPlanViewRange(store, floorViewId(levelId), patch);
}

/** Volta o intervalo da vista ao padrão do Revit (2,30 / 1,20 / 0 / 0, para baixo). Sem mudança, não cria passo de desfazer. */
export function restorePlanViewRangeDefault(store: ProjectStore, viewId: Id): ViewRangeEdit {
  return editPlanViewRange(store, viewId, { ...DEFAULT_VIEW_RANGE });
}

/** Atalho da planta de piso de um nível. */
export function restoreViewRangeDefault(store: ProjectStore, levelId: Id): ViewRangeEdit {
  return restorePlanViewRangeDefault(store, floorViewId(levelId));
}
