import { defaultRenderCameraName, renderCameraOf, type Id, type ProjectStore } from '@hestia/model';
import { cameraParaRenderCamera, PROPORCOES_RENDER } from '../ui/renderCameraCaptura.ts';
import { camera3DAtual } from './vista3dAoVivo.ts';
import { useUi } from './state.ts';
import { activateView } from './viewTabActions.ts';
import { useRenderCameraUi } from './renderCameraSelecao.ts';

export { useRenderCameraUi, type CapturaRender, type RenderCameraUi } from './renderCameraSelecao.ts';

/**
 * Estado de UI e ações das câmeras de render (H12). A câmera escolhida para render é só de tela: não vai para o projeto.
 * Erros do modelo (Error em pt-BR) voltam como texto para a tela mostrar.
 */

const SEM_VISTA_3D = 'A vista 3D não está aberta. Abra o Modelo 3D para capturar a câmera.';

const falha = (e: unknown, padrao: string): string => (e instanceof Error ? e.message : padrao);

/** Abre a captura: ativa o Modelo 3D (a moldura fica sobre ele) e começa com o nome padrão e 16:9. */
export function iniciarCapturaRenderAction(store: Pick<ProjectStore, 'project'>): void {
  activateView({ kind: '3d' });
  useRenderCameraUi.setState({ captura: { nome: defaultRenderCameraName(store.project), aspect: PROPORCOES_RENDER[0].aspect } });
}

export function cancelarCapturaRenderAction(): void {
  useRenderCameraUi.setState({ captura: null });
}

/**
 * Guarda a câmera 3D atual (posição e alvo) como câmera de render no nível ativo, com a proporção escolhida. A nova
 * câmera fica selecionada. Devolve a recusa em pt-BR, ou null quando gravou.
 */
export function confirmarCapturaRenderAction(store: ProjectStore, nome: string, aspect: { w: number; h: number }): string | null {
  const camera = camera3DAtual();
  if (!camera) return SEM_VISTA_3D;
  const nomeFinal = nome.trim() === '' ? defaultRenderCameraName(store.project) : nome;
  try {
    const nova = cameraParaRenderCamera(camera, useUi.getState().levelId, aspect, nomeFinal);
    store.exec({ type: 'addRenderCamera', camera: nova }, 'Capturar câmera de render');
    useRenderCameraUi.setState({ selecionada: nova.id, captura: null });
    return null;
  } catch (e) {
    return falha(e, 'Não foi possível guardar a câmera de render.');
  }
}

/** Escolhe a câmera de render para o render (só se ela existir). */
export function selecionarCameraRenderAction(store: Pick<ProjectStore, 'project'>, id: Id): void {
  if (renderCameraOf(store.project, id)) useRenderCameraUi.setState({ selecionada: id });
}

/** Troca o nome da câmera. Devolve a recusa do modelo, ou null quando gravou. */
export function renomearCameraRenderAction(store: ProjectStore, id: Id, nome: string): string | null {
  if (!renderCameraOf(store.project, id)) return 'Câmera de render inexistente.';
  try {
    store.exec({ type: 'updateRenderCamera', id, patch: { name: nome } }, 'Renomear câmera de render');
    return null;
  } catch (e) {
    return falha(e, 'Não foi possível renomear a câmera de render.');
  }
}

/** Exclui a câmera; se era a selecionada, a seleção volta a nenhuma. Devolve a recusa, ou null quando gravou. */
export function excluirCameraRenderAction(store: ProjectStore, id: Id): string | null {
  if (!renderCameraOf(store.project, id)) return 'Câmera de render inexistente.';
  try {
    store.exec({ type: 'removeRenderCamera', id }, 'Excluir câmera de render');
    if (useRenderCameraUi.getState().selecionada === id) useRenderCameraUi.setState({ selecionada: null });
    return null;
  } catch (e) {
    return falha(e, 'Não foi possível excluir a câmera de render.');
  }
}
