import type { ToolId } from '@hestia/tools';
import type { ViewKind } from '../editor/state.ts';

/** Gesto que está segurando o ponteiro (o mesmo `drag.current.mode` do `ViewportCanvas`). */
export type CursorDrag = 'tool' | 'pan' | 'orbit' | 'none';

/** Eixo da alça sob o ponteiro: peitoril/topo do corte são verticais, ombreiras são horizontais. */
export type HandleAxis = 'vertical' | 'horizontal';

export interface CursorViewState {
  view: ViewKind;
  tool: ToolId;
  /** Gesto em andamento; sem ele, o ponteiro só acompanha a ferramenta. */
  drag?: CursorDrag;
  /** O gesto já passou do limiar e vale como arraste (ver `drag.current.moved`). */
  moved?: boolean;
  /** Alça do corte em arraste (ou sob o ponteiro, quando a vista souber disso). */
  handle?: HandleAxis | null;
}

/** Cursores próprios das ferramentas; o resto desenha com a mira. */
const TOOL_CURSOR: Partial<Record<ToolId, string>> = { text: 'text', move: 'move' };

/**
 * Política única de cursor para planta, corte/elevação e 3D.
 *
 * - A mão (`grab`/`grabbing`) só aparece durante navegação (pan/orbit), nunca por cima de um elemento.
 * - Selecionar é sempre a seta do sistema (`default`): nada de `pointer` no hover, em nenhuma vista.
 * - Texto e Mover têm o cursor do sistema; as demais ferramentas desenham com a mira.
 * - Alças do corte pedem o redimensionamento do eixo (vertical `ns-resize`, horizontal `ew-resize`).
 */
export function cursorForView(st: CursorViewState): string {
  if (st.handle === 'vertical') return 'ns-resize';
  if (st.handle === 'horizontal') return 'ew-resize';
  // Pan: mão aberta ao iniciar, fechada ao arrastar. Órbita do 3D é navegação desde o primeiro movimento.
  if (st.drag === 'pan') return st.moved ? 'grabbing' : 'grab';
  if (st.drag === 'orbit') return 'grabbing';
  // A prancha tem cursor próprio (papel); o canvas da vista nunca dita a mão ali.
  if (st.view === 'sheet') return 'default';
  if (st.tool === 'select') return 'default';
  return TOOL_CURSOR[st.tool] ?? 'crosshair';
}
