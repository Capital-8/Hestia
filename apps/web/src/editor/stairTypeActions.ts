import { newId, stairTypeUsage, type Id, type Project, type ProjectStore, type StairType } from '@hestia/model';
import { t, useI18n, type Dict } from './i18n.ts';
import { validateStairType, type StairValidationInput, type StairTypeIssue } from '../ui/dialogs/stairTypeForm.ts';
import type { DeleteResult } from './typeActions.ts';

/** Tradução imediata no idioma ativo (as mensagens voltam como texto para os diálogos). */
const tr = (key: Parameters<typeof t>[1], args?: Record<string, string | number>): string => t(useI18n.getState().lang, key, args);

/** Motivo pelo qual o tipo de escada não pode ser excluído (em uso ou único); null quando pode. */
export function stairTypeDeleteBlock(p: Project, typeId: Id): string | null {
  if (Object.keys(p.stairTypes).length <= 1) return tr('edc_type_only_one', { type: tr('edc_type_stair') });
  const uso = stairTypeUsage(p, typeId);
  if (uso > 0) return tr('edc_type_in_use', { list: tr(uso === 1 ? 'edc_count_stair_one' : 'edc_count_stair_many', { n: uso }) });
  return null;
}

/** Exclui o tipo de escada (o comando recusa se estiver em uso), devolvendo o erro em vez de lançá-lo. */
export function tryDeleteStairType(store: ProjectStore, typeId: Id): DeleteResult {
  try {
    store.exec({ type: 'deleteStairType', id: typeId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : tr('edc_type_delete_failed') };
  }
}

/** Grava o tipo de escada (o modelo confere as regras ao salvar), devolvendo o erro em vez de lançá-lo. */
export function saveStairType(store: ProjectStore, stairType: StairType, label = 'edc_undo_edit_stair_type'): DeleteResult {
  try {
    store.exec({ type: 'upsertStairType', stairType }, label);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : tr('edc_type_delete_failed') };
  }
}

/** Cópia do tipo de escada com id novo e nome "(cópia)". Devolve o id criado, ou null se o tipo não existe. */
export function duplicateStairType(store: ProjectStore, typeId: Id): Id | null {
  const src = store.project.stairTypes[typeId];
  if (!src) return null;
  const copy: StairType = { ...structuredClone(src), id: newId('stt'), name: tr('edc_type_copy_suffix', { name: src.name }) };
  store.exec({ type: 'upsertStairType', stairType: copy }, 'edc_undo_duplicate_stair');
  return copy.id;
}

/** Renomeia o tipo de escada; nome vazio não é aceito. */
export function renameStairType(store: ProjectStore, typeId: Id, name: string): DeleteResult {
  const clean = name.trim();
  const src = store.project.stairTypes[typeId];
  if (!src) return { ok: false, error: tr('edc_type_missing') };
  if (!clean) return { ok: false, error: tr('edc_type_needs_name') };
  store.exec({ type: 'upsertStairType', stairType: { ...src, name: clean } }, 'edc_undo_rename_stair');
  return { ok: true };
}

/** Chave do dicionário de cada problema estruturado (as mensagens já existiam em `stt_err_*`). */
const ISSUE_KEYS: Record<StairTypeIssue['code'], keyof Dict> = {
  'stt-name-empty': 'stt_err_name',
  'stt-riser': 'stt_err_riser',
  'stt-riser-min': 'stt_err_riser_min',
  'stt-riser-min-range': 'stt_err_riser_min_range',
  'stt-tread': 'stt_err_tread',
  'stt-width': 'stt_err_width',
  'stt-headroom': 'stt_err_headroom',
  'stt-landing': 'stt_err_landing',
  'stt-nosing-negative': 'stt_err_nosing_negative',
  'stt-nosing': 'stt_err_nosing',
  'stt-cost': 'stt_err_cost',
  'stt-mono-depth': 'stt_err_mono_depth',
  'stt-assembled': 'stt_err_assembled',
  'stt-post-tread': 'stt_err_post_tread',
  'stt-tread-range': 'stt_err_tread_range',
  'stt-calc-range': 'stt_err_calc_range',
  'stt-factor': 'stt_err_factor_riser',
  'stt-overlap': 'stt_err_overlap',
  'stt-overlap-negative': 'stt_err_overlap_negative',
  'stt-material': 'stt_err_material',
};

/** Texto de um problema estruturado, no idioma ativo. */
function stairIssueMessage(i: StairTypeIssue): string {
  if (i.code === 'stt-factor') return tr(i.params.factor === 'a' ? 'stt_err_factor_riser' : 'stt_err_factor_tread');
  if (i.code === 'stt-material') return tr(i.params.slot === 'post' ? 'stt_err_material_post' : 'stt_err_material');
  return tr(ISSUE_KEYS[i.code] ?? 'edc_stair_type_invalid');
}

/**
 * Validação do tipo antes de salvar: usa a validação estruturada (`validateStairType`) e devolve a 1ª mensagem de erro
 * no idioma ativo, ou null. Mantida como wrapper para os chamadores antigos.
 */
export function stairTypeError(t: StairValidationInput): string | null {
  const first = validateStairType(t).find((i) => i.severity === 'error');
  return first ? stairIssueMessage(first) : null;
}

/**
 * Cria a cópia do tipo e aplica a cópia às escadas dadas, em UM passo de desfazer (como o painel de paredes).
 * Devolve o id da cópia, ou null se o tipo não existe.
 */
export function duplicateStairTypeFor(store: ProjectStore, ids: Id[], typeId: Id): Id | null {
  const src = store.project.stairTypes[typeId];
  if (!src) return null;
  const copy: StairType = { ...structuredClone(src), id: newId('stt'), name: tr('edc_type_copy_suffix', { name: src.name }) };
  store.transaction('edc_undo_duplicate_stair', () => {
    store.exec({ type: 'upsertStairType', stairType: copy });
    if (ids.length) store.exec({ type: 'updateElements', ids, patch: { typeId: copy.id } });
  });
  return copy.id;
}
