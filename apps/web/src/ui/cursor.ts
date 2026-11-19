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
  /** A ferramenta não tem alvo sob o cursor (o clique não grava nada): cursor "não permitido". */
  blocked?: boolean;
  /** Modo de pintura direta de faces ativo no 3D (`paint` = balde de tinta, `studioPick` = mira). */
  facePaintMode?: 'paint' | 'studioPick' | null;
}

const PAINT_BUCKET_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M9.5 4.5 17 12l-6.2 6.2a2 2 0 0 1-2.8 0L4.3 14.5a2 2 0 0 1 0-2.8Z' fill='%23ffffff' stroke='%231e293b' stroke-width='1.8' stroke-linejoin='round'/><path d='M9.5 4.5v-1.2a2 2 0 1 1 4 0v4.2' fill='none' stroke='%23ffffff' stroke-width='3' stroke-linecap='round'/><path d='M9.5 4.5v-1.2a2 2 0 1 1 4 0v4.2' fill='none' stroke='%231e293b' stroke-width='1.6' stroke-linecap='round'/><path d='M3.2 14.8c0 0-2.2 2.9-2.2 4.3a2.2 2.2 0 0 0 4.4 0c0-1.4-2.2-4.3-2.2-4.3Z' fill='%232563eb' stroke='%23ffffff' stroke-width='1.1'/></svg>`;

/** Cursor de balde de tinta para pintura direta de faces no 3D e no Estúdio da Face. */
export const PAINT_BUCKET_CURSOR = `url("data:image/svg+xml;utf8,${PAINT_BUCKET_SVG}") 3 20, pointer`;

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
  // A prancha e o estúdio da face têm cursor próprio; o canvas da vista nunca dita a mão ali.
  if (st.view === 'sheet' || st.view === 'face') return 'default';
  if (st.view === '3d' && st.facePaintMode === 'paint') return PAINT_BUCKET_CURSOR;
  if (st.view === '3d' && st.facePaintMode === 'studioPick') return 'crosshair';
  if (st.tool === 'select') return 'default';
  if (st.blocked) return 'not-allowed';
  return TOOL_CURSOR[st.tool] ?? 'crosshair';
}
