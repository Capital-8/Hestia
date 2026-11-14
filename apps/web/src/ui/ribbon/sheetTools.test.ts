import { describe, expect, it } from 'vitest';
import { TOOL_GROUPS, TOOL_LABEL, type ToolId } from '@hestia/tools';
import { SHEET_TOOL_IDS, toolDisabledOnSheet } from './sheetTools.ts';

/** Os ids de `TOOL_GROUPS` mais os que só aparecem em abas contextuais (a lista cobre o registro inteiro). */
const IDS_DOS_GRUPOS: readonly ToolId[] = TOOL_GROUPS.flatMap((g) => g.tools);
// 'mass' (ficha T1a) está na aba Massa e terreno, não em TOOL_GROUPS: por isso a conta da prancha passou de 46 para 47.
const FORA_DOS_GRUPOS: readonly ToolId[] = ['select', 'section', 'grid', 'roofarrow', 'roofextrusion', 'roomsep', 'perimeter', 'paste', 'mass'];
const TODAS: readonly ToolId[] = [...IDS_DOS_GRUPOS, ...FORA_DOS_GRUPOS];

describe('ferramentas com a prancha aberta', () => {
  it('no modelo (planta, 3D e corte) nenhuma ferramenta fica desativada', () => {
    for (const view of ['plan', '3d', 'section'] as const) {
      for (const id of TODAS) expect(toolDisabledOnSheet(view, id), `${view}:${id}`).toBe(false);
    }
  });

  it('na prancha, Selecionar, Mover e Alinhar continuam habilitados', () => {
    for (const id of ['select', 'move', 'align'] as const) expect(toolDisabledOnSheet('sheet', id), id).toBe(false);
  });

  it('na prancha, as ferramentas do modelo de edifício ficam desativadas', () => {
    const desativadas = ['trim', 'split', 'rotate', 'mirror', 'array', 'offset', 'parallel', 'rehost', 'wall', 'door', 'text', 'dimension', 'perimeter'] as const;
    for (const id of desativadas) expect(toolDisabledOnSheet('sheet', id), id).toBe(true);
  });

  it('SHEET_TOOL_IDS só cita ferramentas do registro', () => {
    // A lista do teste é uma lista válida de `ToolId`: todo item existe no rótulo do registro…
    for (const id of TODAS) expect(TOOL_LABEL[id], id).toBeTruthy();
    // …e cobre o registro inteiro (nenhum id ficou de fora da conferência).
    expect(new Set(TODAS).size).toBe(Object.keys(TOOL_LABEL).length);
    // O conjunto da prancha é subconjunto dos ids conferidos e é o esperado.
    for (const id of SHEET_TOOL_IDS) expect(TODAS).toContain(id);
    expect([...SHEET_TOOL_IDS].sort()).toEqual(['align', 'move', 'select']);
  });
});
