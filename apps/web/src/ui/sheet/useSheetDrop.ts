import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { sheetOf, type Sheet } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import type { TextLike } from '../../editor/i18n.ts';
import { addViewportAtAction, dragPlacement, type DragPlacement } from '../../editor/sheetInsert.ts';
import { draggedSheetView, endSheetDrag, SHEET_VIEW_MIME } from '../../editor/sheetDrag.ts';
import { snapMove, type SnapGuide } from './sheetSnap.ts';
import { clampBoxToInner, type InnerBox, type PaperPoint } from './sheetSelection.ts';

const say = (status: TextLike): void => useUi.setState({ status });

export interface SheetDropPreview {
  box: { x: number; y: number; w: number; h: number };
  label: string;
  scale: number;
  adjusted: boolean;
}

export interface SheetDropApi {
  preview: SheetDropPreview | null;
  guides: readonly SnapGuide[];
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
}

/**
 * Arrastar uma vista do Navegador de projeto para a prancha (estilo Revit): durante o `dragover` desenha o retângulo
 * tracejado com nome e escala, encaixa nas outras vistas e, ao soltar, insere centrada no ponteiro na escala natural
 * (ou na maior que cabe), deixando a vista nova selecionada. Um passo de desfazer.
 */
export function useSheetDrop(args: {
  sheetId: string;
  sheet: Sheet | null;
  paperAt: (e: { clientX: number; clientY: number }) => PaperPoint;
  inner: InnerBox;
  zoom: number;
  snap: boolean;
  grid: boolean;
  onAdded: (id: string) => void;
}): SheetDropApi {
  const { sheetId, sheet, paperAt, inner, zoom, snap, grid, onAdded } = args;
  const [drop, setDrop] = useState<{ placement: DragPlacement; label: string; guides: SnapGuide[] } | null>(null);

  // Arraste cancelado (Esc ou solto fora): o `dragend` chega na origem, não na folha.
  useEffect(() => {
    if (!drop) return;
    const clear = (): void => setDrop(null);
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, [drop]);

  const onDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      if (!sheet) return;
      const src = draggedSheetView();
      if (!src || !e.dataTransfer.types.includes(SHEET_VIEW_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const plan = dragPlacement(editor.project, sheet, src.view, paperAt(e));
      if (!plan) {
        setDrop(null);
        return;
      }
      const targets = sheet.viewports.map((v) => ({ x: v.at.x, y: v.at.y, w: v.size.w, h: v.size.h }));
      const sn = snap
        ? snapMove({ x: plan.at.x, y: plan.at.y, w: plan.size.w, h: plan.size.h }, { boxes: targets, inner, step: grid ? 5 : undefined }, { tolMm: 6 / zoom })
        : { box: { x: plan.at.x, y: plan.at.y, w: plan.size.w, h: plan.size.h }, guides: [] as SnapGuide[] };
      const box = clampBoxToInner(sn.box, inner);
      const next = { placement: { ...plan, at: { x: box.x, y: box.y } }, label: src.label, guides: sn.guides };
      setDrop((prev) =>
        prev && Math.abs(prev.placement.at.x - next.placement.at.x) < 1e-6 && Math.abs(prev.placement.at.y - next.placement.at.y) < 1e-6 && prev.label === next.label && prev.placement.scale === next.placement.scale
          ? prev
          : next,
      );
    },
    [sheet, paperAt, snap, grid, inner, zoom],
  );

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>): void => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDrop(null);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      if (!sheet) return;
      e.preventDefault();
      const src = draggedSheetView();
      const planned = drop;
      setDrop(null);
      endSheetDrag();
      if (!src) return;
      const placement = planned?.placement ?? dragPlacement(editor.project, sheet, src.view, paperAt(e));
      if (!placement) {
        say({ key: 'cvs_drop_too_big' });
        return;
      }
      try {
        const id = addViewportAtAction(editor.store, sheetId, src.view, placement);
        onAdded(id);
        say({
          key: placement.adjusted ? 'cvs_drop_done_adjusted' : 'cvs_drop_done',
          args: { label: src.label, scale: placement.scale },
        });
      } catch (err) {
        say(err instanceof Error ? err.message : { key: 'cvs_drop_failed' });
      }
    },
    [sheet, drop, paperAt, sheetId, onAdded],
  );

  const preview = drop ? { box: { x: drop.placement.at.x, y: drop.placement.at.y, w: drop.placement.size.w, h: drop.placement.size.h }, label: drop.label, scale: drop.placement.scale, adjusted: drop.placement.adjusted } : null;
  // Mantém o import de `sheetOf` útil para quem for depurar: garante que a prancha é a mesma do store.
  if (sheet && sheetOf(editor.project, sheetId) !== sheet) return { preview: null, guides: [], onDragOver, onDragLeave, onDrop };
  return { preview, guides: drop?.guides ?? [], onDragOver, onDragLeave, onDrop };
}
