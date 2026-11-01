import { useUi } from './state.ts';
import { editor } from './controller.ts';
import type { PerimeterActions, PerimeterView } from './perimeterApi.ts';

/**
 * Estado do modo de perímetro para a tela. Assina o contador de pré-visualização e a barra de status: toda mudança do
 * editor (ação, evento de ponteiro, tecla) os atualiza, e a tela relê a visão (`PerimeterMode.view`, com cache).
 */
export const usePerimeter = (): PerimeterView => {
  // Só acompanha o contador com o modo aberto: o `previewTick` sobe a cada quadro da órbita 3D e do pan, e quem chama
  // este hook (o painel de Propriedades) refazia todos os painéis filhos a cada quadro. Fechado, a visão não muda com ele.
  useUi((s) => (editor.perimetro.ativo ? s.previewTick : -1));
  useUi((s) => s.status);
  return editor.perimetro.view();
};

/** Ações do modo para a tela (faixa, barra de opções, propriedades e botões Concluir e Cancelar). */
export const perimeterActions: PerimeterActions = {
  begin: (target) => editor.perimetro.begin(target),
  edit: (id) => editor.perimetro.edit(id),
  setShape: (s) => editor.perimetro.setShape(s),
  setLineKind: (k) => editor.perimetro.setLineKind(k),
  setModify: (k) => editor.perimetro.setModify(k),
  setOptions: (patch) => editor.perimetro.setOptions(patch),
  finish: () => editor.perimetro.finish(),
  cancel: () => editor.perimetro.cancel(),
  setEdge: (patch) => editor.perimetro.setEdge(patch),
};
