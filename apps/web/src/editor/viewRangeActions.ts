import { DEFAULT_VIEW_RANGE, viewRangeOf, type Id, type ProjectStore, type ViewRange } from '@hestia/model';
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
export function editViewRange(store: ProjectStore, levelId: Id, patch: Partial<ViewRange>): ViewRangeEdit {
  try {
    // Nada muda (mesmos valores): não chama o comando, para não criar passo de desfazer vazio.
    const cur = viewRangeOf(store.project, levelId);
    const keys = Object.keys(patch) as Array<keyof ViewRange>;
    const exists = store.project.levels.some((l) => l.id === levelId);
    if (exists && keys.every((k) => patch[k] === cur[k])) return { ok: true, error: null };
    store.exec({ type: 'setLevelViewRange', levelId, patch });
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t(useI18n.getState().lang, 'edc_view_range_invalid') };
  }
}

/** Volta o intervalo do nível ao padrão do Revit (2,30 / 1,20 / 0 / 0, para baixo). Sem mudança, não cria passo de desfazer. */
export function restoreViewRangeDefault(store: ProjectStore, levelId: Id): ViewRangeEdit {
  return editViewRange(store, levelId, { ...DEFAULT_VIEW_RANGE });
}
