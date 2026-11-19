import type { ToolId } from '@hestia/tools';
import type { ViewKind } from '../../editor/state.ts';

/**
 * Ferramentas com a prancha aberta (decisão 0039): as do modelo de edifício não agem sobre a prancha, então só sobram
 * as de vista — Selecionar, Mover e Alinhar. A regra vale só para o estado dos botões da faixa; no modelo, tudo continua
 * liberado (as demais vistas e o teclado não passam por aqui).
 */
export const SHEET_TOOL_IDS: ReadonlySet<ToolId> = new Set<ToolId>(['select', 'move', 'align']);

/** Ferramenta desativada nesta vista? (só a prancha restringe; no modelo tudo continua liberado) */
export function toolDisabledOnSheet(view: ViewKind, tool: ToolId): boolean {
  return (view === 'sheet' || view === 'face') && !SHEET_TOOL_IDS.has(tool);
}
