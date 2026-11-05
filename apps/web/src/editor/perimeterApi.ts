import type { Id } from '@hestia/model';
import type { SketchDraft, SketchResult, SketchTarget, Vec2 } from '@hestia/geom';
import type { PerimeterModifyKind } from '@hestia/tools';
import type { PerimeterOptions } from '../ui/perimeter/PerimeterOptionsBar.tsx';
import type { PerimeterLineKind, PerimeterShape } from '../ui/perimeter/PerimeterRibbonPanels.tsx';
import type { TextLike } from './i18n.ts';

/**
 * Contrato entre a lógica do modo de perímetro (estado + controller) e a tela (faixa, canvas, barra de opções,
 * propriedades). A lógica entrega `usePerimeter()` (editor/perimeter.ts); a tela só consome este formato.
 */
export interface PerimeterView {
  /** Verdadeiro enquanto o modo "Criar/Editar perímetro" está aberto. */
  active: boolean;
  target: SketchTarget;
  /** Id do elemento em edição ("Editar perímetro"); ausente = criando. */
  editing?: Id;
  draft: SketchDraft | null;
  /** Validação do rascunho atual (Concluir só habilita com `ok`). */
  result: SketchResult | null;
  shape: PerimeterShape;
  lineKind: PerimeterLineKind;
  /** Comando de Modificar ativo sobre as linhas do rascunho; null = seleção de linhas. */
  modify: PerimeterModifyKind | null;
  /** Verdadeiro no Selecionar do esboço: sem forma escolhida e sem comando de Modificar. */
  selecting?: boolean;
  options: PerimeterOptions;
  /** Linha sob o cursor, para o realce de `sketchOps`. */
  hoverId: string | null;
  /** Janela de seleção em arraste: `window` (da esquerda para a direita) pega as linhas inteiras. */
  selectionBox?: { a: Vec2; b: Vec2; window: boolean } | null;
  /** Aresta selecionada (primeira de `draft.selected`), para o grupo de propriedades. */
  selectedEdge: { id: string; index: number; total: number; length: number; definesSlope: boolean; slopePct: number; overhang: number } | null;
  /** Mensagem atual da barra de status (dica, aviso ou erro de conclusão). */
  status: TextLike;
}

export interface PerimeterActions {
  /** Abre o modo: criar um novo elemento do alvo, a partir de um rascunho vazio. */
  begin: (target: SketchTarget) => void;
  /** "Editar perímetro" de um elemento existente. */
  edit: (elementId: Id) => void;
  setShape: (s: PerimeterShape) => void;
  setLineKind: (k: PerimeterLineKind) => void;
  /** Liga/desliga um comando de Modificar sobre as linhas do esboço (null volta à seleção). */
  setModify: (k: PerimeterModifyKind | null) => void;
  setOptions: (patch: Partial<PerimeterOptions>) => void;
  /** Botão Concluir: valida, grava o elemento e fecha o modo. Em falha mantém o modo aberto e informa em `status`. */
  finish: () => void;
  /** Botão Cancelar: descarta o rascunho e fecha o modo. */
  cancel: () => void;
  setEdge: (patch: { definesSlope?: boolean; slopePct?: number; overhang?: number }) => void;
}
