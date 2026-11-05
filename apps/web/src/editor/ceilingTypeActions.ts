import { newId, type Id, type Project, type ProjectStore, type CeilingType } from '@hestia/model';
import { t, useI18n } from './i18n.ts';
import { floorTypeError, instancesOfType, type DeleteResult } from './typeActions.ts';

/** Tradução imediata no idioma ativo (as mensagens voltam como texto para os diálogos). */
const tr = (key: Parameters<typeof t>[1], args?: Record<string, string | number>): string => t(useI18n.getState().lang, key, args);

/** Forros que usam o tipo (em todos os níveis). */
export const ceilingTypeUsage = (p: Project, typeId: Id): number => instancesOfType(p, 'ceiling', typeId).length;

/** Motivo pelo qual o tipo de forro não pode ser excluído (em uso ou único); null quando pode. */
export function ceilingTypeDeleteBlock(p: Project, typeId: Id): string | null {
  if (Object.keys(p.ceilingTypes).length <= 1) return tr('edc_type_only_one', { type: tr('edc_type_ceiling') });
  const uso = ceilingTypeUsage(p, typeId);
  if (uso > 0) return tr('edc_type_in_use', { list: tr(uso === 1 ? 'edc_count_ceiling_one' : 'edc_count_ceiling_many', { n: uso }) });
  return null;
}

/** Exclui o tipo de forro (o comando recusa se estiver em uso), devolvendo o erro em vez de lançá-lo. */
export function tryDeleteCeilingType(store: ProjectStore, typeId: Id): DeleteResult {
  try {
    store.exec({ type: 'deleteCeilingType', id: typeId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : tr('edc_type_delete_failed') };
  }
}

/** Cópia do tipo de forro com id novo e nome "(cópia)". Devolve o id criado, ou null se o tipo não existe. */
export function duplicateCeilingType(store: ProjectStore, typeId: Id): Id | null {
  const src = store.project.ceilingTypes[typeId];
  if (!src) return null;
  const copy: CeilingType = { ...structuredClone(src), id: newId('ls'), name: tr('edc_type_copy_suffix', { name: src.name }) };
  store.exec({ type: 'upsertCeilingType', ceilingType: copy }, 'edc_undo_duplicate_ceiling');
  return copy.id;
}

/** Renomeia o tipo de forro; nome vazio não é aceito. */
export function renameCeilingType(store: ProjectStore, typeId: Id, name: string): DeleteResult {
  const clean = name.trim();
  const src = store.project.ceilingTypes[typeId];
  if (!src) return { ok: false, error: tr('edc_type_missing') };
  if (!clean) return { ok: false, error: tr('edc_type_needs_name') };
  store.exec({ type: 'upsertCeilingType', ceilingType: { ...src, name: clean } }, 'edc_undo_rename_ceiling');
  return { ok: true };
}

/** Mesma regra das camadas do piso: ao menos uma camada, espessura positiva (só membrana pode ser zero), nome. */
export const ceilingTypeError = (t: Pick<CeilingType, 'name' | 'layers'>): string | null => floorTypeError(t);

/** Tipo de forro das opções ao abrir um projeto: mantém o escolhido se existir no projeto, senão o primeiro. */
export const keptCeilingType = (p: Project, current: Id): Id => (p.ceilingTypes[current] ? current : (Object.keys(p.ceilingTypes)[0] ?? current));
