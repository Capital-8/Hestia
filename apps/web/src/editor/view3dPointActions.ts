import { defaultView3DPointName, makeView3DPoint, view3DPointOf, type Id, type ProjectStore, type SheetView3DCamera } from '@hestia/model';
import { editor } from './controller.ts';
import { t, useI18n, type Dict } from './i18n.ts';
import { camera3DAtual, pedirCamera3D } from './vista3dAoVivo.ts';

/**
 * Ações do catálogo de pontos de vista 3D (decisão 0040): salvar a câmera atual, atualizar, renomear, excluir e voltar
 * ao 3D num ponto. Cada escrita é um comando com desfazer; a tela só chama (o teste roda com `ProjectStore` real).
 */

/** Recusa de uma ação, ou null quando gravou. */
export type Recusa = string | null;

/** Mensagem no idioma ativo (as recusas voltam como texto pronto para a barra de status). */
const msg = (key: keyof Dict): string => t(useI18n.getState().lang, key);

/** Motivo padrão de falha, para nunca devolver um erro vazio à barra de status. */
const falha = (e: unknown, chave: keyof Dict): string => (e instanceof Error ? e.message : msg(chave));

/** Recado comum quando não há órbita viva de onde ler a câmera. */
const semVista3D = (): string => msg('edc_3d_view_closed');

/**
 * Salva a câmera da vista 3D viva como um ponto novo. Sem nome, usa o próximo "Vista 3D"/"Vista 3D 2"…
 * (no idioma ativo); devolve o id criado, ou a recusa (vista 3D fechada, nome vazio, câmera inválida).
 */
export function salvarPonto3DAction(store: ProjectStore, nome?: string): { id: Id } | { erro: string } {
  const camera = camera3DAtual();
  if (!camera) return { erro: semVista3D() };
  const lang = useI18n.getState().lang;
  try {
    const ponto = makeView3DPoint(camera, nome ?? defaultView3DPointName(store.project, lang));
    store.exec({ type: 'addView3DPoint', point: ponto }, 'edc_undo_save_point', lang);
    return { id: ponto.id };
  } catch (e) {
    return { erro: falha(e, 'edc_save_point_failed') };
  }
}

/**
 * Grava a câmera da vista 3D viva no ponto (Revit: *Update View*). As pranchas que usam o ponto acompanham, porque
 * guardam só o `pointId`. Devolve a recusa, ou null quando gravou.
 */
export function atualizarPonto3DAction(store: ProjectStore, id: Id): Recusa {
  if (!view3DPointOf(store.project, id)) return msg('edc_point_missing');
  const camera = camera3DAtual();
  if (!camera) return semVista3D();
  try {
    store.exec({ type: 'updateView3DPoint', id, patch: { camera } }, 'edc_undo_update_point', useI18n.getState().lang);
    return null;
  } catch (e) {
    return falha(e, 'edc_update_point_failed');
  }
}

/** Troca o nome do ponto (o modelo recusa nome vazio). Devolve a recusa, ou null quando gravou. */
export function renomearPonto3DAction(store: ProjectStore, id: Id, nome: string): Recusa {
  if (!view3DPointOf(store.project, id)) return msg('edc_point_missing');
  try {
    store.exec({ type: 'updateView3DPoint', id, patch: { name: nome } }, 'edc_undo_rename_point', useI18n.getState().lang);
    return null;
  } catch (e) {
    return falha(e, 'edc_rename_point_failed');
  }
}

/**
 * Exclui o ponto do catálogo. O comando do modelo copia a câmera para as vistas de prancha que o usavam, então nenhuma
 * prancha fica em branco. Devolve a recusa, ou null quando gravou.
 */
export function excluirPonto3DAction(store: ProjectStore, id: Id): Recusa {
  if (!view3DPointOf(store.project, id)) return msg('edc_point_missing');
  try {
    store.exec({ type: 'removeView3DPoint', id }, 'edc_undo_delete_point', useI18n.getState().lang);
    return null;
  } catch (e) {
    return falha(e, 'edc_delete_point_failed');
  }
}

/** Câmera do ponto, ou null quando o ponto não existe mais. */
export function cameraDoPonto3D(store: Pick<ProjectStore, 'project'>, id: Id): SheetView3DCamera | null {
  return view3DPointOf(store.project, id)?.camera ?? null;
}

/**
 * Leva a vista 3D à câmera do ponto: abre (ou ativa) a aba 3D e deixa a câmera pendente para a tela aplicar.
 * A leitura do projeto é por parâmetro para o teste não depender do controlador; a tela usa o projeto aberto.
 * Devolve a recusa, ou null quando o pedido foi feito.
 */
export function irParaPonto3DAction(id: Id, store: Pick<ProjectStore, 'project'> = editor.store): Recusa {
  const camera = cameraDoPonto3D(store, id);
  if (!camera) return msg('edc_point_missing');
  pedirCamera3D(camera);
  return null;
}
