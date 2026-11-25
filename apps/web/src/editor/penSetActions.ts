import {
  graphicsOf,
  penSetById,
  tDoModelo,
  type Id,
  type Project,
  type ProjectStore,
  type UserPenSet,
} from '@hestia/model';
import { editProjectGraphics, type GraphicsEdit } from './graphicsActions.ts';
import { t, useI18n, type Lang } from './i18n.ts';

const OK: GraphicsEdit = { ok: true, error: null };
const LABEL = 'eds_undo_apply_pen_set';

const messageOf = (e: unknown, lang: Lang): string =>
  e instanceof Error ? e.message : t(lang, 'eds_msg_graphics_invalid');

/** Primeiro id `ps_N` ainda livre no projeto. */
function firstFreePenSetId(p: Project): string {
  const used = p.penSets ?? {};
  for (let i = 1; ; i += 1) {
    const candidate = `ps_${i}`;
    if (!Object.prototype.hasOwnProperty.call(used, candidate)) return candidate;
  }
}

/**
 * Aplica um conjunto de penas embutido ou do usuário: copia os pesos de linha e os estilos por categoria para o projeto,
 * num único passo de desfazer; aplicar o mesmo conjunto de novo não cria passo vazio.
 */
export function applyPenSet(store: ProjectStore, id: string): GraphicsEdit {
  const set = penSetById(id) ?? store.project.penSets?.[id];
  if (!set) return { ok: false, error: t(useI18n.getState().lang, 'eds_msg_graphics_invalid') };
  return editProjectGraphics(store, { lineWeights: set.lineWeights, categories: set.categories }, LABEL);
}

/**
 * Guarda o ajuste atual (pesos e estilos por categoria) como conjunto do usuário, no primeiro id `ps_N` livre. O campo
 * `estiloPrancha` fica no tipo só para os arquivos salvos: não existe mais como opção, então é gravado sempre falso.
 */
export function saveCurrentAsPenSet(store: ProjectStore, name: string): GraphicsEdit & { id: string | null } {
  const lang = useI18n.getState().lang;
  const g = graphicsOf(store.project);
  const id = firstFreePenSetId(store.project);
  const penSet: UserPenSet = {
    id,
    name: name.trim(),
    lineWeights: g.lineWeights,
    categories: g.categories,
    estiloPrancha: false,
  };
  try {
    store.exec({ type: 'savePenSet', penSet }, 'eds_undo_save_pen_set', lang);
    return { ok: true, error: null, id };
  } catch (e) {
    return { ok: false, error: messageOf(e, lang), id: null };
  }
}

/** Remove um conjunto do usuário pelo id (id desconhecido recusa com a mensagem do modelo). */
export function deleteUserPenSet(store: ProjectStore, id: Id): GraphicsEdit {
  try {
    store.exec({ type: 'deletePenSet', id }, 'eds_undo_delete_pen_set', useI18n.getState().lang);
    return OK;
  } catch (e) {
    return { ok: false, error: messageOf(e, useI18n.getState().lang) };
  }
}

/** Renomeia um conjunto do usuário mantendo pesos, categorias e estilo de prancha. */
export function renameUserPenSet(store: ProjectStore, id: Id, name: string): GraphicsEdit {
  const lang = useI18n.getState().lang;
  const current = store.project.penSets?.[id];
  if (!current) return { ok: false, error: tDoModelo(lang, 'md_penset_missing') };
  const penSet: UserPenSet = { ...current, name: name.trim() };
  try {
    store.exec({ type: 'savePenSet', penSet }, 'eds_undo_rename_pen_set', lang);
    return OK;
  } catch (e) {
    return { ok: false, error: messageOf(e, lang) };
  }
}
