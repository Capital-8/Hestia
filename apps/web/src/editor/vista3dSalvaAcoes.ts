import { makeView3DView, newId, view3dOf, view3dViewOf, type Camera3D, type Id, type ProjectStore } from '@hestia/model';
import { editor } from './controller.ts';
import { t, useI18n, type Dict } from './i18n.ts';
import { removeView, type OpenView } from './openViews.ts';
import { useUi } from './state.ts';
import { activateView } from './viewTabActions.ts';
import { camera3DAtual } from './vista3dAoVivo.ts';
import { cameraSalvaDaOrbita, mesmaCamera3d } from './vista3dSalva.ts';

/**
 * Ações das vistas 3D salvas no navegador e nas abas (plano de UX de 2026-11-23). Cada escrita é um comando com
 * desfazer; abrir só troca a aba (`3d:<id>`), e excluir não toca no modelo nem na vista 3D padrão.
 */

export type Recusa = string | null;

const msg = (key: keyof Dict): string => t(useI18n.getState().lang, key);
const falha = (e: unknown, chave: keyof Dict): string => (e instanceof Error ? e.message : msg(chave));

/** Aba/vista 3D de uma vista salva; a mesma chave que o navegador e o `activateView` usam. */
export const vista3dAberta = (id: Id): OpenView => ({ kind: '3d', viewId: id });

/** Abre a aba da vista salva. Devolve a recusa (vista inexistente ou navegação bloqueada pelo perímetro). */
export function abrirVista3dAction(id: Id): Recusa {
  if (!view3dViewOf(editor.project, id)) return msg('cvn_br_status_3d_missing');
  activateView(vista3dAberta(id));
  const st = useUi.getState();
  return st.view === '3d' && st.view3dViewId === id ? null : msg('cvn_br_status_3d_missing');
}

/** Nome, disciplina e gráficos da vista 3D ativa, para "Nova vista 3D". */
export function novaVista3dAction(store: ProjectStore): { id: Id } | { erro: string } {
  const camera = camera3DAtual();
  if (!camera) return { erro: msg('edc_3d_view_closed') };
  const settings = view3dOf(store.project);
  try {
    const view = makeView3DView(store.project, {
      camera: cameraSalvaDaOrbita(camera),
      settings,
      name: msg('cvn_br_default_3d_name'),
      ...(settings.discipline ? { discipline: settings.discipline } : {}),
    });
    store.exec({ type: 'addView3d', view }, 'cvn_undo_add_3d_view', useI18n.getState().lang);
    return { id: view.id };
  } catch (e) {
    return { erro: falha(e, 'cvn_br_status_3d_missing') };
  }
}

/** Duplica a vista salva (`duplicateView3d`) e abre a cópia, como o Revit. */
export function duplicarVista3dAction(store: ProjectStore, id: Id, novoId?: Id): { id: Id } | { erro: string } {
  if (!view3dViewOf(store.project, id)) return { erro: msg('cvn_br_status_3d_missing') };
  const novo = novoId ?? newId('v3d');
  try {
    store.exec({ type: 'duplicateView3d', id, newViewId: novo }, 'cvn_undo_duplicate_3d_view', useI18n.getState().lang);
    abrirVista3dAction(novo);
    return { id: novo };
  } catch (e) {
    return { erro: falha(e, 'cvn_br_status_3d_missing') };
  }
}

/** Renomeia a vista salva (o modelo recusa nome vazio ou repetido; a mensagem dele vai para a barra). */
export function renomearVista3dAction(store: ProjectStore, id: Id, nome: string): Recusa {
  if (!view3dViewOf(store.project, id)) return msg('cvn_br_status_3d_missing');
  try {
    store.exec({ type: 'updateView3d', id, patch: { name: nome } }, 'cvn_undo_rename_3d_view', useI18n.getState().lang);
    return null;
  } catch (e) {
    return falha(e, 'cvn_br_status_3d_missing');
  }
}

/**
 * Exclui a vista salva. A aba dela sai das vistas abertas; se era a ativa, o app volta ao 3D padrão. O modelo e a
 * vista 3D padrão não mudam.
 */
export function excluirVista3dAction(store: ProjectStore, id: Id): Recusa {
  if (!view3dViewOf(store.project, id)) return msg('cvn_br_status_3d_missing');
  try {
    store.exec({ type: 'removeView3d', id }, 'cvn_undo_delete_3d_view', useI18n.getState().lang);
  } catch (e) {
    return falha(e, 'cvn_br_status_3d_missing');
  }
  useUi.setState((s) => ({
    openViews: removeView(s.openViews, vista3dAberta(id)),
    ...(s.view === '3d' && s.view3dViewId === id ? { view3dViewId: null, selection: [], hover: null } : {}),
  }));
  return null;
}

/** Câmera guardada na vista salva (graus); null quando ela não existe. */
export function cameraDaVista3d(store: Pick<ProjectStore, 'project'>, id: Id): Camera3D | null {
  return view3dViewOf(store.project, id)?.camera ?? null;
}

/**
 * Grava a câmera viva na vista salva (ao sair dela). Sem mudança real não gera passo de desfazer.
 */
export function gravarCameraDaVista3dAction(store: ProjectStore, id: Id, camera: Camera3D): Recusa {
  const atual = view3dViewOf(store.project, id);
  if (!atual) return null;
  if (mesmaCamera3d(atual.camera, camera)) return null;
  try {
    store.exec({ type: 'updateView3d', id, patch: { camera } }, 'cvn_undo_save_3d_camera', useI18n.getState().lang);
    return null;
  } catch (e) {
    return falha(e, 'cvn_br_status_3d_missing');
  }
}
