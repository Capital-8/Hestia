import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type Ref,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { dist, partitionFacePaint, type Vec2 } from '@hestia/geom';
import { faceEntryToArtItems, type UnwrappedFace } from '@hestia/engine';
import { formatQuantity, newId, type FacePaintEntry, type FaceRegion, type Material } from '@hestia/model';
import { t, useI18n } from '../../editor/i18n.ts';
import { useUi, type FaceStudioState } from '../../editor/state.ts';
import { PAINT_BUCKET_CURSOR } from '../cursor.ts';
import { useDark } from '../useDark.ts';
import { useUnits } from '../useUnits.ts';
import { drawFaceScene } from './faceStudioDraw.ts';
import {
  collectSnapTargets,
  fitFaceCamera,
  screenToFace,
  snapFacePoint,
  zoomFaceCamera,
  type FaceCamera,
  type FaceSnapResult,
} from './faceStudioSnap.ts';
import {
  buildShapeFromPoints,
  hitTestFaceEntry,
  nextRegionOrder,
  toolHint,
  toolLabel,
  type FaceStudioShape,
} from './faceStudioTypes.ts';

export interface FaceStudioCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
}

export interface FaceStudioCanvasProps {
  canvasRefHandle?: Ref<FaceStudioCanvasHandle>;
  unwrapped: UnwrappedFace;
  entry: FacePaintEntry;
  materials: Record<string, Material>;
  onChangeEntry: (next: FacePaintEntry) => void;
}

const TWO_PT_SHAPES = new Set<FaceStudioShape>([
  'rect',
  'circle',
  'ellipse',
  'poly-inscribed',
  'poly-circumscribed',
]);

const THREE_PT_SHAPES = new Set<FaceStudioShape>(['arc-3pt', 'arc-center', 'arc-tangent']);

export function FaceStudioCanvas(props: FaceStudioCanvasProps): ReactElement {
  const { canvasRefHandle, unwrapped, entry, materials, onChangeEntry } = props;

  const { tool, shape, activeMaterialId, bandWidth, asBand, snapGrid, selection } = useUi((s) => s.faceStudio);
  const lang = useI18n((s) => s.lang);
  const dark = useDark();
  const units = useUnits();

  const defaultMat = unwrapped.defaultMaterialId || Object.keys(materials)[0] || '';
  const effectiveMatId = activeMaterialId && materials[activeMaterialId] ? activeMaterialId : defaultMat;

  const setFs = useCallback((patch: Partial<FaceStudioState>): void => {
    useUi.setState((s) => ({ faceStudio: { ...s.faceStudio, ...patch } }));
  }, []);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [cam, setCam] = useState<FaceCamera>(() => fitFaceCamera(unwrapped, 600, 400));
  const [draftPts, setDraftPts] = useState<Vec2[]>([]);
  const [cursorSnap, setCursorSnap] = useState<FaceSnapResult | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  const panState = useRef<{ sx: number; sy: number; cu: number; cv: number } | null>(null);
  const dragDrawStart = useRef<{ sx: number; sy: number; uv: Vec2 } | null>(null);
  const fittedFaceKey = useRef<string>('');

  const faceKey = `${unwrapped.elementId}:${unwrapped.face}:${unwrapped.layer}`;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = (): void => {
      const r = el.getBoundingClientRect();
      const w = Math.max(100, Math.round(r.width));
      const h = Math.max(100, Math.round(r.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (fittedFaceKey.current !== faceKey && size.w > 0 && size.h > 0) {
      fittedFaceKey.current = faceKey;
      setCam(fitFaceCamera(unwrapped, size.w, size.h));
      setDraftPts([]);
    }
  }, [faceKey, unwrapped, size.w, size.h]);

  useEffect(() => {
    setDraftPts([]);
    dragDrawStart.current = null;
  }, [tool, shape, asBand]);

  useImperativeHandle(
    canvasRefHandle,
    () => ({
      zoomIn: () => setCam((c) => zoomFaceCamera(c, size.w / 2, size.h / 2, size.w, size.h, 1.25)),
      zoomOut: () => setCam((c) => zoomFaceCamera(c, size.w / 2, size.h / 2, size.w, size.h, 0.8)),
      zoomFit: () => setCam(fitFaceCamera(unwrapped, size.w, size.h)),
    }),
    [size.w, size.h, unwrapped],
  );

  const baseMatId = entry.materialId ?? unwrapped.defaultMaterialId;
  const partition = useMemo(() => {
    const items = faceEntryToArtItems(entry, unwrapped.defaultMaterialId);
    return partitionFacePaint(unwrapped.boundary, baseMatId, items);
  }, [entry, unwrapped.boundary, unwrapped.defaultMaterialId, baseMatId]);

  const snapTargets = useMemo(() => collectSnapTargets(unwrapped), [unwrapped]);

  const previewShape = useMemo(() => {
    if (tool !== 'shape' || draftPts.length === 0 || !cursorSnap) return null;
    const pts = [...draftPts, cursorSnap.uv];
    return buildShapeFromPoints(shape, pts, bandWidth, asBand, false);
  }, [tool, shape, draftPts, cursorSnap, bandWidth, asBand]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFaceScene({
      ctx,
      width: size.w,
      height: size.h,
      cam,
      dark,
      snapGrid,
      isDrawing: tool === 'shape',
      face: unwrapped,
      entry,
      partition,
      materials,
      selection,
      previewShape,
      draftPts,
      activeMatId: effectiveMatId,
      snapResult: cursorSnap,
      units,
      lang,
    });
  }, [size, cam, dark, snapGrid, tool, unwrapped, entry, partition, materials, selection, previewShape, draftPts, effectiveMatId, cursorSnap, units, lang]);

  const commitShapePts = useCallback(
    (pts: Vec2[], closed = false): void => {
      const built = buildShapeFromPoints(shape, pts, bandWidth, asBand, closed);
      setDraftPts([]);
      dragDrawStart.current = null;
      if (!built) return;
      const newRegion: FaceRegion = {
        id: newId('fr'),
        name: toolLabel('shape', shape, asBand, lang),
        shape: built,
        materialId: effectiveMatId,
        order: nextRegionOrder(entry.regions),
        cutMode: 'clipBelow',
      };
      onChangeEntry({
        ...entry,
        regions: [...(entry.regions ?? []), newRegion],
      });
      setFs({ selection: { kind: 'region', id: newRegion.id } });
    },
    [shape, bandWidth, asBand, lang, effectiveMatId, entry, onChangeEntry, setFs],
  );

  const deleteSelected = useCallback((): void => {
    if (selection.kind === 'region') {
      onChangeEntry({
        ...entry,
        regions: (entry.regions ?? []).filter((r) => r.id !== selection.id),
      });
      setFs({ selection: { kind: 'base' } });
    } else if (selection.kind === 'dxf') {
      onChangeEntry({
        ...entry,
        dxfOverlays: (entry.dxfOverlays ?? []).filter((ov) => ov.id !== selection.id),
      });
      setFs({ selection: { kind: 'base' } });
    }
  }, [selection, entry, onChangeEntry, setFs]);

  const getLocal = (e: ReactPointerEvent<HTMLCanvasElement>): { sx: number; sy: number; snap: FaceSnapResult } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const raw = screenToFace(sx, sy, w, h, cam);
    return { sx, sy, snap: snapFacePoint(raw, snapTargets, cam.zoom, snapGrid, 0.05) };
  };

  const handleBucket = (uv: Vec2): void => {
    const hit = hitTestFaceEntry(uv, entry, 10 / cam.zoom);
    if (hit.kind === 'region') {
      const regions = (entry.regions ?? []).map((r) =>
        r.id === hit.id
          ? r.slats
            ? { ...r, materialId: effectiveMatId, slats: { ...r.slats, slatMaterialId: effectiveMatId } }
            : { ...r, materialId: effectiveMatId }
          : r,
      );
      onChangeEntry({ ...entry, regions });
      setFs({ selection: hit });
      return;
    }
    if (hit.kind === 'dxf') {
      const dxfOverlays = (entry.dxfOverlays ?? []).map((ov) =>
        ov.id === hit.id ? { ...ov, materialId: effectiveMatId } : ov,
      );
      onChangeEntry({ ...entry, dxfOverlays });
      setFs({ selection: hit });
      return;
    }
    onChangeEntry({ ...entry, materialId: effectiveMatId });
    setFs({ selection: { kind: 'base' } });
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    wrapRef.current?.focus();
    const { sx, sy, snap } = getLocal(e);
    setCursorSnap(snap);
    if (e.button === 1 || (e.button === 0 && (spaceHeld || e.altKey))) {
      e.currentTarget.setPointerCapture(e.pointerId);
      panState.current = { sx, sy, cu: cam.cu, cv: cam.cv };
      return;
    }
    if (e.button !== 0) return;
    if (tool === 'select') {
      setFs({ selection: hitTestFaceEntry(snap.uv, entry, 10 / cam.zoom) });
      return;
    }
    if (tool === 'paintBucket') {
      handleBucket(snap.uv);
      return;
    }
    if (TWO_PT_SHAPES.has(shape) && draftPts.length === 0) {
      dragDrawStart.current = { sx, sy, uv: snap.uv };
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const { sx, sy, snap } = getLocal(e);
    setCursorSnap(snap);
    if (panState.current) {
      const p = panState.current;
      setCam((c) => ({
        ...c,
        cu: p.cu - (sx - p.sx) / c.zoom,
        cv: p.cv + (sy - p.sy) / c.zoom,
      }));
      return;
    }
    if (dragDrawStart.current && draftPts.length === 0 && Math.hypot(sx - dragDrawStart.current.sx, sy - dragDrawStart.current.sy) > 6) {
      setDraftPts([dragDrawStart.current.uv]);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (panState.current) {
      panState.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0 || tool !== 'shape') return;
    const { sx, sy, snap } = getLocal(e);

    if (TWO_PT_SHAPES.has(shape)) {
      const drag = dragDrawStart.current;
      if (drag && Math.hypot(sx - drag.sx, sy - drag.sy) > 6) {
        commitShapePts([drag.uv, snap.uv], true);
        return;
      }
      dragDrawStart.current = null;
      if (draftPts.length === 0) setDraftPts([snap.uv]);
      else commitShapePts([draftPts[0]!, snap.uv], true);
      return;
    }

    if (THREE_PT_SHAPES.has(shape)) {
      if (draftPts.length < 2) {
        const last = draftPts[draftPts.length - 1];
        if (!last || dist(last, snap.uv) > 1e-4) setDraftPts([...draftPts, snap.uv]);
      } else {
        commitShapePts([draftPts[0]!, draftPts[1]!, snap.uv], false);
      }
      return;
    }

    if (shape === 'line') {
      if (draftPts.length >= 3 && dist(snap.uv, draftPts[0]!) * cam.zoom < 12) {
        commitShapePts(draftPts, true);
        return;
      }
      const last = draftPts[draftPts.length - 1];
      if (!last || dist(last, snap.uv) > 1e-4) {
        setDraftPts([...draftPts, snap.uv]);
      }
    }
  };

  const finishLine = (): void => {
    if (tool !== 'shape' || shape !== 'line') return;
    if (asBand && draftPts.length >= 2) commitShapePts(draftPts, false);
    else if (!asBand && draftPts.length >= 3) commitShapePts(draftPts, true);
  };

  const onWheel = (e: ReactWheelEvent<HTMLCanvasElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    setCam((c) => zoomFaceCamera(c, sx, sy, w, h, Math.exp(-e.deltaY * 0.0015)));
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.code === 'Space') {
      setSpaceHeld(true);
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      if (draftPts.length > 0) {
        setDraftPts([]);
        dragDrawStart.current = null;
      } else {
        setFs({ tool: 'select' });
      }
      return;
    }
    if (e.key === 'Enter') {
      finishLine();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.kind !== 'base') {
      deleteSelected();
    }
  };

  const onKeyUp = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.code === 'Space') setSpaceHeld(false);
  };

  const cursorStyle =
    spaceHeld || panState.current
      ? 'grab'
      : tool === 'select'
        ? 'default'
        : tool === 'paintBucket'
          ? PAINT_BUCKET_CURSOR
          : 'crosshair';

  return (
    <div
      ref={wrapRef}
      className="fs-canvas-wrap"
      tabIndex={0}
      style={{ cursor: cursorStyle }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setCursorSnap(null)}
        onDoubleClick={finishLine}
        onWheel={onWheel}
      />

      {unwrapped.isCurved && unwrapped.curveRadius !== null && (
        <div className="fs-badge-curved">
          <span>
            {t(lang, 'fs_cylindrical_unwrap')} · R ={' '}
            {formatQuantity(units, 'length', unwrapped.curveRadius, { lang })} (
            {unwrapped.concave ? (t(lang, 'fs_concave')) : (t(lang, 'fs_convex'))})
          </span>
        </div>
      )}

      <div className="fs-hud-bottom">
        <div className="fs-hud-pill">{toolHint(tool, shape, asBand, draftPts.length, lang)}</div>
        {cursorSnap && (
          <div className="fs-hud-pill fs-hud-coords">
            u: {formatQuantity(units, 'length', cursorSnap.uv.x, { lang })} · v:{' '}
            {formatQuantity(units, 'length', cursorSnap.uv.y, { lang })}
          </div>
        )}
      </div>
    </div>
  );
}
