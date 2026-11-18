import { useRef } from 'react';
import type { SheetDrawList } from '@hestia/render';
import type { Sheet } from '@hestia/model';
import { snapLinesOf, type SnapLine } from './sheetSnap.ts';

/**
 * Linhas de encaixe das vistas, montadas só quando um gesto precisa delas (varrer todos os pontos do desenho a cada
 * edição custava caro) e guardadas enquanto a lista de desenho e a prancha forem as mesmas.
 */
export function useSheetSnapLines(sheet: Sheet | null, list: SheetDrawList | null): () => SnapLine[] {
  const memo = useRef<{ list: unknown; sheet: unknown; lines: SnapLine[] } | null>(null);
  return () => {
    if (!sheet || !list) return [];
    const m = memo.current;
    if (m && m.list === list && m.sheet === sheet) return m.lines;
    const lines = snapLinesOf(list, sheet.viewports);
    memo.current = { list, sheet, lines };
    return lines;
  };
}
