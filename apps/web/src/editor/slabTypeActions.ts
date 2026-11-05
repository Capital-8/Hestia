import { newId, type Id, type Project, type ProjectStore, type SlabType } from '@hestia/model';
import { t, useI18n } from './i18n.ts';
import { floorTypeError, instancesOfType, type DeleteResult } from './typeActions.ts';

/** Tradução imediata no idioma ativo (as mensagens voltam como texto para os diálogos). */
const tr = (key: Parameters<typeof t>[1], args?: Record<string, string | number>): string => t(useI18n.getState().lang, key, args);

/** Lajes que usam o tipo (em todos os níveis). */
export const slabTypeUsage = (p: Project, typeId: Id): number => instancesOfType(p, 'slab', typeId).length;

/** Motivo pelo qual o tipo de laje não pode ser excluído (em uso ou único); null quando pode. */
export function slabTypeDeleteBlock(p: Project, typeId: Id): string | null {
  if (Object.keys(p.slabTypes).length <= 1) return tr('edc_type_only_one', { type: tr('edc_type_slab') });
  const uso = slabTypeUsage(p, typeId);
  if (uso > 0) return tr('edc_type_in_use', { list: tr(uso === 1 ? 'edc_count_slab_one' : 'edc_count_slab_many', { n: uso }) });
  return null;
}

/** Exclui o tipo de laje (o comando recusa se estiver em uso), devolvendo o erro em vez de lançá-lo. */
export function tryDeleteSlabType(store: ProjectStore, typeId: Id): DeleteResult {
  try {
    store.exec({ type: 'deleteSlabType', id: typeId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : tr('edc_type_delete_failed') };
  }
}

/** Cópia do tipo de laje com id novo e nome "(cópia)". Devolve o id criado, ou null se o tipo não existe. */
export function duplicateSlabType(store: ProjectStore, typeId: Id): Id | null {
  const src = store.project.slabTypes[typeId];
  if (!src) return null;
  const copy: SlabType = { ...structuredClone(src), id: newId('ls'), name: tr('edc_type_copy_suffix', { name: src.name }) };
  store.exec({ type: 'upsertSlabType', slabType: copy }, 'edc_undo_duplicate_slab');
  return copy.id;
}

/** Renomeia o tipo de laje; nome vazio não é aceito. */
export function renameSlabType(store: ProjectStore, typeId: Id, name: string): DeleteResult {
  const clean = name.trim();
  const src = store.project.slabTypes[typeId];
  if (!src) return { ok: false, error: tr('edc_type_missing') };
  if (!clean) return { ok: false, error: tr('edc_type_needs_name') };
  store.exec({ type: 'upsertSlabType', slabType: { ...src, name: clean } }, 'edc_undo_rename_slab');
  return { ok: true };
}

/** Mesma regra das camadas do piso: ao menos uma camada, espessura positiva (só membrana pode ser zero), nome. */
export const slabTypeError = (t: Pick<SlabType, 'name' | 'layers'>): string | null => floorTypeError(t);

/** Tipo de laje das opções ao abrir um projeto: mantém o escolhido se existir no projeto, senão o primeiro. */
export const keptSlabType = (p: Project, current: Id): Id => (p.slabTypes[current] ? current : (Object.keys(p.slabTypes)[0] ?? current));
