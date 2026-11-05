import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { projectView3DPoints, sheetDimsMm, sheetInnerBox, sheetOf, viewportBox, type SheetViewport } from '@hestia/model';
import { buildSheetDrawList } from '@hestia/render';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { useT, type TextLike } from '../../editor/i18n.ts';
import { alignViewportsAction, distributeViewportsAction, type AlignMode } from '../../editor/sheetAlign.ts';
import { fitViewportAction, moveViewportContentAction, resizeViewportAction, setViewportScaleAction, setViewportView3DPointAction, toggleViewportLockAction } from '../../editor/sheetActions.ts';
import { SheetCanvas } from './SheetCanvas.tsx';
import { SheetControlBar } from './SheetControlBar.tsx';
import { panBy } from './sheetCamera.ts';
import { commitMove, commitNudge, commitRemove } from './sheetCommit.ts';
import { cursorForHandle, hitBox, hitHandle, type HandleId, type PaperBox } from './sheetSelection.ts';
import type { SnapLine } from './sheetSnap.ts';
import { snapLinesOf } from './sheetSnap.ts';
import { movedBoxes, resolveGesture, type GestureContext, type SheetGesture } from './sheetGestures.ts';
import { useSheetAlign } from './useSheetAlign.ts';
import { useSheetCamera } from './useSheetCamera.ts';
import { useSheetDrop } from './useSheetDrop.ts';
import { useSheetKeys } from './useSheetKeys.ts';
import { useSheetMove } from './useSheetMove.ts';

const say = (status: TextLike): void => useUi.setState({ status });
const refused = (e: unknown): TextLike => (e instanceof Error ? e.message : { key: 'cvs_refused' });

/**
 * Palco da prancha (decisões 0022 e 0039): câmera própria (zoom no cursor e pan), seleção com alças para redimensionar
 * o recorte, pan do conteúdo (Alt), encaixe nas outras vistas, arraste do Navegador e as ferramentas Mover e Alinhar.
 * Cada gesto grava um único passo de desfazer ao soltar o ponteiro; durante o arraste só o preview muda.
 */
export function SheetStage({ sheetId }: { sheetId: string }): ReactElement {
  const p = useProject();
  const { t, lang } = useT();
  const sheet = sheetOf(p, sheetId);
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const space = useRef(false);
  const [sel, setSel] = useState<string[]>([]);
  const [gesture, setGesture] = useState<SheetGesture | null>(null);
  /** Cópia síncrona do gesto: o `pointerup` lê daqui, não do estado do React (que pode estar um quadro atrás). */
  const gestureRef = useRef<SheetGesture | null>(null);
  const applyGesture = (g: SheetGesture | null): void => {
    gestureRef.current = g;
    setGesture(g);
  };
  const [hover, setHover] = useState<string | null>(null);
  const [hoverHandle, setHoverHandle] = useState<HandleId | null>(null);
  const [grid, setGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [fitScale, setFitScale] = useState(true);

  const list = useMemo(() => buildSheetDrawList(p, sheetId, lang), [p, sheetId, lang]);
  const paper = useMemo(() => (sheet ? sheetDimsMm(sheet) : { w: 420, h: 297 }), [sheet]);
  const { view, camera, setCamera, fit, zoomStep, actualSize, zoomTo, paperAt } = useSheetCamera(sheetId, paper, boxRef);

  // Seleção válida: some com vistas apagadas.
  useEffect(() => {
    if (!sheet) return;
    const ids = new Set(sheet.viewports.map((v) => v.id));
    setSel((s) => (s.every((id) => ids.has(id)) ? s : s.filter((id) => ids.has(id))));
  }, [sheet]);

  const inner = useMemo(() => (sheet ? sheetInnerBox(sheet) : { x0: 0, y0: 0, x1: 1, y1: 1 }), [sheet]);
  const selected = useMemo(() => (sheet ? sheet.viewports.filter((v) => sel.includes(v.id)) : []), [sheet, sel]);
  const single = selected.length === 1 ? selected[0]! : null;
  const boxesOf = useCallback((s: typeof sheet): { id: string; box: PaperBox }[] => (s ? s.viewports.map((v) => ({ id: v.id, box: viewportBox(v) })) : []), []);

  const align = useSheetAlign({ sheet: sheet ?? null, sheetId, drawList: list, zoom: camera.zoom });
  const move = useSheetMove({ sheet: sheet ?? null, sheetId, drawList: list, zoom: camera.zoom, selection: sel, setSelection: setSel });
  const snapLines = useMemo((): SnapLine[] => (sheet && list ? snapLinesOf(list, sheet.viewports) : []), [sheet, list]);

  const drop = useSheetDrop({
    sheetId,
    sheet: sheet ?? null,
    paperAt,
    inner,
    zoom: camera.zoom,
    snap,
    grid,
    onAdded: (id) => setSel([id]),
  });

  const zoomToSelection = useCallback(() => {
    if (selected.length === 0) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const v of selected) {
      x0 = Math.min(x0, v.at.x);
      y0 = Math.min(y0, v.at.y);
      x1 = Math.max(x1, v.at.x + v.size.w);
      y1 = Math.max(y1, v.at.y + v.size.h);
    }
    zoomTo({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }, [selected, zoomTo]);

  /** Contexto do gesto: alvos de encaixe, grade, zoom e Shift. */
  const gestureCtx = (g: SheetGesture, shift: boolean): GestureContext => ({
    inner,
    others: sheet ? sheet.viewports.filter((v) => !(g.kind === 'move' && g.ids.includes(v.id))).map((v) => viewportBox(v)) : [],
    snapOn: snap,
    gridStep: grid ? 5 : undefined,
    zoom: camera.zoom,
    shift,
    lines: snapLines,
  });

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!sheet) return;
    if (e.button === 1 || (e.button === 0 && space.current)) {
      e.preventDefault();
      svgRef.current?.setPointerCapture(e.pointerId);
      applyGesture({ kind: 'pan', last: { x: e.clientX, y: e.clientY } });
      return;
    }
    if (e.button !== 0) return;
    const pt = paperAt(e);
    if (align.on) {
      e.preventDefault();
      align.click(pt, e.ctrlKey || e.metaKey);
      return;
    }
    if (move.on) {
      e.preventDefault();
      move.click(pt);
      return;
    }
    const tol = 8 / camera.zoom;

    // Alças da vista selecionada (só com uma).
    if (single) {
      const hd = hitHandle(viewportBox(single), pt, tol);
      if (hd) {
        if (single.locked === true) {
          say({ key: 'cvs_locked_hint' });
          return;
        }
        svgRef.current?.setPointerCapture(e.pointerId);
        applyGesture({ kind: 'resize', id: single.id, handle: hd, grab: pt, start: viewportBox(single), box: viewportBox(single) });
        return;
      }
    }

    const id = hitBox(boxesOf(sheet), pt, 0);
    if (!id) {
      setSel([]);
      svgRef.current?.setPointerCapture(e.pointerId);
      applyGesture({ kind: 'pan', last: { x: e.clientX, y: e.clientY } });
      return;
    }
    const vp = sheet.viewports.find((v) => v.id === id)!;
    if (e.shiftKey) {
      setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
      return;
    }
    const ids = sel.includes(id) ? sel : [id];
    if (!sel.includes(id)) setSel([id]);
    if (vp.locked === true) {
      setSel([id]);
      say({ key: 'cvs_locked_hint_short' });
      return;
    }
    if (e.altKey) {
      svgRef.current?.setPointerCapture(e.pointerId);
      applyGesture({ kind: 'content', id, grab: pt, start: { x: vp.offset?.x ?? 0, y: vp.offset?.y ?? 0 }, offset: { x: vp.offset?.x ?? 0, y: vp.offset?.y ?? 0 } });
      return;
    }
    const start: Record<string, PaperBox> = {};
    for (const vid of ids) {
      const v = sheet.viewports.find((x) => x.id === vid);
      if (v) start[vid] = viewportBox(v);
    }
    const primaryId = ids[0];
    const primary = primaryId ? start[primaryId] : undefined;
    if (!primary) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    applyGesture({ kind: 'move', ids, start, grab: pt, box: primary, clicked: id, guides: [] });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!sheet) return;
    const g = gestureRef.current;
    if (!g) {
      const pt = paperAt(e);
      if (align.on) {
        align.hover(pt);
        return;
      }
      if (move.on) {
        move.hover(pt);
        return;
      }
      const hd = single ? hitHandle(viewportBox(single), pt, 8 / camera.zoom) : null;
      setHoverHandle(hd);
      setHover(hd ? (single?.id ?? null) : hitBox(boxesOf(sheet), pt, 0));
      return;
    }
    if (g.kind === 'pan') {
      const dx = e.clientX - g.last.x;
      const dy = e.clientY - g.last.y;
      setCamera((c) => panBy(c, dx, dy));
      applyGesture({ ...g, last: { x: e.clientX, y: e.clientY } });
      return;
    }
    applyGesture(resolveGesture(g, paperAt(e), gestureCtx(g, e.shiftKey)));
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>): void => {
    svgRef.current?.releasePointerCapture?.(e.pointerId);
    const before = gestureRef.current;
    applyGesture(null);
    if (!before || before.kind === 'pan') return;
    // Recalcula com o ponto do próprio `pointerup`: o que foi gravado é exatamente o que está sob o ponteiro.
    const g = resolveGesture(before, paperAt(e), gestureCtx(before, e.shiftKey));
    if (g.kind === 'move') {
      const first = g.start[g.ids[0]!]!;
      if (Math.abs(g.box.x - first.x) < 1e-6 && Math.abs(g.box.y - first.y) < 1e-6) {
        // Clique sem arrasto numa seleção múltipla: passa a selecionar só a vista clicada (como no Revit).
        if (!e.shiftKey && sel.length > 1) setSel([g.clicked]);
        return;
      }
      const err = commitMove(editor.store, sheetId, sheet!, g.ids, movedBoxes(g));
      say(err ?? { key: g.ids.length > 1 ? 'cvs_moved_many' : 'cvs_moved_one' });
      return;
    }
    if (g.kind === 'resize') {
      if (Math.abs(g.box.w - g.start.w) < 1e-6 && Math.abs(g.box.h - g.start.h) < 1e-6 && Math.abs(g.box.x - g.start.x) < 1e-6 && Math.abs(g.box.y - g.start.y) < 1e-6) return;
      const err = resizeViewportAction(editor.store, sheetId, g.id, g.box);
      say(err ?? { key: 'cvs_resized', args: { w: Math.round(g.box.w), h: Math.round(g.box.h) } });
      return;
    }
    if (g.kind !== 'content') return;
    if (Math.abs(g.offset.x - g.start.x) < 0.2 && Math.abs(g.offset.y - g.start.y) < 0.2) return;
    const err = moveViewportContentAction(editor.store, sheetId, g.id, g.offset);
    if (err) say(err);
  };

  const onDoubleClick = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!sheet || align.on || move.on) return;
    const id = hitBox(boxesOf(sheet), paperAt(e), 0);
    const v = id ? sheet.viewports.find((x) => x.id === id) : null;
    if (v) {
      setSel([v.id]);
      zoomTo(viewportBox(v));
      return;
    }
    fit();
  };

  // Preview derivado do gesto.
  const preview = useMemo((): Record<string, PaperBox> | null => {
    if (!gesture) return null;
    if (gesture.kind === 'resize') return { [gesture.id]: gesture.box };
    if (gesture.kind === 'move') {
      const first = gesture.start[gesture.ids[0]!]!;
      const dx = gesture.box.x - first.x;
      const dy = gesture.box.y - first.y;
      const out: Record<string, PaperBox> = {};
      for (const id of gesture.ids) {
        const st = gesture.start[id];
        if (st) out[id] = { ...st, x: st.x + dx, y: st.y + dy };
      }
      return out;
    }
    return null;
  }, [gesture]);
  const contentPreview = useMemo((): Record<string, { x: number; y: number }> | null => (gesture?.kind === 'content' ? { [gesture.id]: gesture.offset } : null), [gesture]);

  const keyActions = useMemo(
    () => ({
      onEscape: () => {
        if (move.on) {
          move.escape();
          return;
        }
        if (align.on) {
          align.back();
          return;
        }
        setSel([]);
      },
      onDelete: () => {
        if (!sheet) return;
        const err = commitRemove(editor.store, sheetId, sheet, sel);
        if (err) say(err);
        else {
          setSel([]);
          say({ key: sel.length > 1 ? 'cvs_removed_many' : 'cvs_removed_one' });
        }
      },
      onNudge: (dx: number, dy: number) => {
        if (!sheet) return;
        const err = commitNudge(editor.store, sheetId, sheet, sel, dx, dy);
        if (err) say(err);
      },
      onFit: fit,
      onActualSize: actualSize,
      onToggleGrid: () => setGrid((v) => !v),
      onTab: align.on ? align.cycle : undefined,
      onConfirm: move.on ? move.confirm : align.on ? align.confirm : undefined,
      onAlign: () => useUi.setState({ sheetAlign: !align.on, sheetMove: false }),
      onMove: () => useUi.setState({ sheetMove: !move.on, sheetAlign: false }),
      onChar: move.on ? move.char : undefined,
      onBackspace: move.on ? move.backspace : undefined,
    }),
    [sheet, sheetId, sel, fit, actualSize, align, move],
  );
  useSheetKeys(keyActions, space);

  if (!sheet || !list) return <p className="tree-empty">{t('cvs_sheet_missing')}</p>;

  const patchSelected = (patch: Partial<Omit<SheetViewport, 'id'>>, label: string): void => {
    if (!single) return;
    try {
      editor.store.exec({ type: 'updateViewport', sheetId, id: single.id, patch }, label);
    } catch (e) {
      say(refused(e));
    }
  };

  const onAlignSelection = (mode: AlignMode): void => {
    const err = alignViewportsAction(editor.store, sheetId, sel, mode);
    say(err ?? { key: 'cvs_aligned' });
  };
  const onDistribute = (axis: 'h' | 'v'): void => {
    const err = distributeViewportsAction(editor.store, sheetId, sel, axis);
    say(err ?? { key: 'cvs_distributed' });
  };

  const cursor = align.on || move.on
    ? 'crosshair'
    : gesture?.kind === 'pan'
      ? 'grabbing'
      : hoverHandle
        ? cursorForHandle(hoverHandle)
        : gesture?.kind === 'resize'
          ? cursorForHandle(gesture.handle)
          : gesture?.kind === 'move'
            ? 'move'
            : gesture?.kind === 'content'
              ? 'grabbing'
              : hover
                ? 'move'
                : 'default';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div
        ref={boxRef}
        className="sheet-stage"
        data-sel={sel.join(',')}
        data-align={align.on ? '1' : undefined}
        data-move={move.on ? '1' : undefined}
        data-align-ref={align.overlay?.ref?.key ?? ''}
        data-align-cand={align.overlay?.candidate?.key ?? ''}
        data-drop={drop.preview ? '1' : undefined}
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
        style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        <SheetCanvas
          list={list}
          sheet={sheet}
          camera={camera}
          view={view}
          selection={sel}
          preview={preview}
          contentPreview={contentPreview}
          resizingHandle={gesture?.kind === 'resize' ? gesture.handle : null}
          guides={[...(gesture?.kind === 'move' ? gesture.guides : []), ...(drop.preview ? drop.guides : [])]}
          dropPreview={drop.preview}
          align={align.overlay}
          move={move.overlay}
          showGrid={grid}
          hovered={hover}
          cursor={cursor}
          svgRef={svgRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => applyGesture(null)}
          onDoubleClick={onDoubleClick}
          onPointerLeave={() => {
            if (!gestureRef.current) {
              setHover(null);
              setHoverHandle(null);
            }
          }}
        />
        {sheet.viewports.length === 0 ? (
          <div className="sheet-empty">
            <p>{t('cvs_empty')}</p>
            <button className="btn small primary" onClick={() => useUi.setState({ dialog: 'addView', dialogArg: sheetId })}>
              {t('cvs_add_view')}
            </button>
            <p className="val soft">{t('cvs_empty_hint')}</p>
          </div>
        ) : null}
      </div>
      <SheetControlBar
        sheet={sheet}
        camera={camera}
        view={view}
        selected={selected}
        grid={grid}
        snap={snap}
        fitScale={fitScale}
        alignOn={align.on}
        onToggleAlign={() => useUi.setState({ sheetAlign: !align.on, sheetMove: false })}
        moveOn={move.on}
        onToggleMove={() => useUi.setState({ sheetMove: !move.on, sheetAlign: false })}
        onZoom={zoomStep}
        onFit={fit}
        onActualSize={actualSize}
        onZoomToSelection={zoomToSelection}
        onToggleGrid={() => setGrid((v) => !v)}
        onToggleSnap={() => setSnap((v) => !v)}
        onToggleFitScale={() => setFitScale((v) => !v)}
        onScale={(s) => {
          if (!single) return;
          const err = setViewportScaleAction(editor.store, sheetId, single.id, s, fitScale);
          say(err ?? { key: 'cvs_scale_changed', args: { scale: s } });
        }}
        onToggleClip={() => patchSelected({ clip: single?.clip === false ? true : false }, t('cvs_undo_crop'))}
        onToggleFrame={() => patchSelected({ frame: single?.frame === false ? true : false }, t('cvs_undo_frame'))}
        onToggleLabel={() => patchSelected({ label: { ...single?.label, show: single?.label?.show === false } }, t('cvs_undo_label'))}
        onToggleLock={() => {
          if (!single) return;
          const err = toggleViewportLockAction(editor.store, sheetId, single.id);
          say(err ?? { key: single.locked === true ? 'cvs_unlocked' : 'cvs_locked' });
        }}
        onFitFrame={() => {
          if (!single) return;
          const err = fitViewportAction(editor.store, sheetId, single.id);
          say(err ?? { key: 'cvs_frame_fitted' });
        }}
        onAlign={onAlignSelection}
        onDistribute={onDistribute}
        onAddView={() => useUi.setState({ dialog: 'addView', dialogArg: sheetId })}
        onProps={() => useUi.setState({ dialog: 'sheet', dialogArg: sheetId })}
        view3DPoints={projectView3DPoints(p)}
        onChange3DPoint={(id) => {
          if (!single) return;
          const erro = setViewportView3DPointAction(editor.store, sheetId, single.id, id);
          if (erro) say(erro);
        }}
      />
    </div>
  );
}
