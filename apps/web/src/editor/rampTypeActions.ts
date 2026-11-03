import { newId, rampTypeIssue, rampTypeUsage, type Id, type Project, type ProjectStore, type RampType } from '@hestia/model';
import { t, useI18n } from './i18n.ts';
import type { DeleteResult } from './typeActions.ts';

/** Tradução imediata no idioma ativo (as mensagens voltam como texto para os diálogos). */
const tr = (key: Parameters<typeof t>[1], args?: Record<string, string | number>): string => t(useI18n.getState().lang, key, args);

/** Motivo pelo qual o tipo de rampa não pode ser excluído (em uso ou único); null quando pode. */
export function rampTypeDeleteBlock(p: Project, typeId: Id): string | null {
  if (Object.keys(p.rampTypes).length <= 1) return tr('edc_type_only_one', { type: tr('edc_type_ramp') });
  const uso = rampTypeUsage(p, typeId);
  if (uso > 0) return tr('edc_type_in_use', { list: tr(uso === 1 ? 'edc_count_ramp_one' : 'edc_count_ramp_many', { n: uso }) });
  return null;
}

/** Exclui o tipo de rampa (o comando recusa se estiver em uso), devolvendo o erro em vez de lançá-lo. */
export function tryDeleteRampType(store: ProjectStore, typeId: Id): DeleteResult {
  try {
    store.exec({ type: 'deleteRampType', id: typeId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : tr('edc_type_delete_failed') };
  }
}

/** Cópia do tipo de rampa com id novo e nome "(cópia)". Devolve o id criado, ou null se o tipo não existe. */
export function duplicateRampType(store: ProjectStore, typeId: Id): Id | null {
  const src = store.project.rampTypes[typeId];
  if (!src) return null;
  const copy: RampType = { ...structuredClone(src), id: newId('rmt'), name: tr('edc_type_copy_suffix', { name: src.name }) };
  store.exec({ type: 'upsertRampType', rampType: copy }, 'edc_undo_duplicate_ramp');
  return copy.id;
}

/** Renomeia o tipo de rampa; nome vazio não é aceito. */
export function renameRampType(store: ProjectStore, typeId: Id, name: string): DeleteResult {
  const clean = name.trim();
  const src = store.project.rampTypes[typeId];
  if (!src) return { ok: false, error: tr('edc_type_missing') };
  if (!clean) return { ok: false, error: tr('edc_type_needs_name') };
  store.exec({ type: 'upsertRampType', rampType: { ...src, name: clean } }, 'edc_undo_rename_ramp');
  return { ok: true };
}

/** Validação do tipo antes de salvar: nome e as regras de `rampTypeIssue` (medidas e tabela de norma). */
export function rampTypeError(t: RampType): string | null {
  if (!t.name.trim()) return tr('edc_type_needs_name');
  return rampTypeIssue(t);
}
