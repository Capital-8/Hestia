import {
  dist,
  shapeToMultiPolygon,
  transformDxfPaths,
  type FaceShape2D,
  type MultiPolygon,
  type PartitionFaceResult,
  type Vec2,
} from '@hestia/geom';
import type { UnwrappedFace } from '@hestia/engine';
import { formatQuantity, type FacePaintEntry, type Material, type ResolvedUnits } from '@hestia/model';
import type { Lang } from '../../editor/i18n.ts';
import { faceToScreen, type FaceCamera, type FaceSnapResult } from './faceStudioSnap.ts';
import type { FaceStudioSelection } from './faceStudioTypes.ts';

export interface DrawFaceSceneArgs {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  cam: FaceCamera;
  dark: boolean;
  snapGrid: boolean;
  isDrawing?: boolean;
  face: UnwrappedFace;
  entry: FacePaintEntry;
  partition: PartitionFaceResult;
  materials: Record<string, Material>;
  selection: FaceStudioSelection;
  previewShape: FaceShape2D | null;
  draftPts: readonly Vec2[];
  activeMatId: string;
  snapResult: FaceSnapResult | null;
  units: ResolvedUnits;
  lang: Lang;
}

function traceMulti(ctx: CanvasRenderingContext2D, poly: MultiPolygon, w: number, h: number, cam: FaceCamera): void {
  ctx.beginPath();
  for (const p of poly) {
    for (const ring of p) {
      if (ring.length === 0) continue;
      const p0 = faceToScreen(ring[0]!, w, h, cam);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < ring.length; i++) {
        const pi = faceToScreen(ring[i]!, w, h, cam);
        ctx.lineTo(pi.x, pi.y);
      }
      ctx.closePath();
    }
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, cam: FaceCamera, dark: boolean, gridStep = 0.05): void {
  let step = gridStep > 0 ? gridStep : 0.05;
  while (step * cam.zoom < 6) step *= 5;
  const uMin = cam.cu - w / (2 * cam.zoom);
  const uMax = cam.cu + w / (2 * cam.zoom);
  const vMin = cam.cv - h / (2 * cam.zoom);
  const vMax = cam.cv + h / (2 * cam.zoom);

  const minor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.07)';
  const major = dark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.16)';

  const iStart = Math.floor(uMin / step);
  const iEnd = Math.ceil(uMax / step);
  for (let i = iStart; i <= iEnd; i++) {
    const u = i * step;
    const x = w / 2 + (u - cam.cu) * cam.zoom;
    ctx.strokeStyle = i % 5 === 0 ? major : minor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const jStart = Math.floor(vMin / step);
  const jEnd = Math.ceil(vMax / step);
  for (let j = jStart; j <= jEnd; j++) {
    const v = j * step;
    const y = h / 2 - (v - cam.cv) * cam.zoom;
    ctx.strokeStyle = j % 5 === 0 ? major : minor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawOverlaysAndMeta(
  ctx: CanvasRenderingContext2D,
  args: DrawFaceSceneArgs,
  accent: string,
): void {
  const { width: w, height: h, cam, dark, face } = args;

  for (const cw of face.crossWalls) {
    const a = faceToScreen({ x: cw.u0, y: cw.v1 }, w, h, cam);
    const b = faceToScreen({ x: cw.u1, y: cw.v0 }, w, h, cam);
    ctx.fillStyle = dark ? 'rgba(148,163,184,0.2)' : 'rgba(100,116,139,0.18)';
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = dark ? '#94a3b8' : '#64748b';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.restore();
  }

  for (const dv of face.layerDividers) {
    const a = faceToScreen({ x: dv.u0, y: dv.v1 }, w, h, cam);
    const b = faceToScreen({ x: dv.u1, y: dv.v0 }, w, h, cam);
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = dark ? 'rgba(226,232,240,0.55)' : 'rgba(51,65,85,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.restore();
    const bw = Math.abs(b.x - a.x);
    const bh = Math.abs(b.y - a.y);
    if (bw > 36 && bh > 14) {
      ctx.fillStyle = dark ? 'rgba(241,245,249,0.75)' : 'rgba(30,41,59,0.75)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${dv.layerIndex + 1} ${dv.label}`, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
  }

  for (const op of face.openings) {
    const tl = faceToScreen({ x: op.rect.u0, y: op.rect.v1 }, w, h, cam);
    const br = faceToScreen({ x: op.rect.u1, y: op.rect.v0 }, w, h, cam);
    const rw = br.x - tl.x;
    const rh = br.y - tl.y;
    ctx.fillStyle = dark ? 'rgba(15,23,42,0.72)' : 'rgba(226,232,240,0.72)';
    ctx.fillRect(tl.x, tl.y, rw, rh);
    ctx.strokeStyle = dark ? '#94a3b8' : '#475569';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(tl.x, tl.y, rw, rh);
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(br.x, br.y);
    ctx.moveTo(br.x, tl.y);
    ctx.lineTo(tl.x, br.y);
    ctx.stroke();
    if (rw > 28 && rh > 16) {
      ctx.fillStyle = dark ? '#e2e8f0' : '#1e293b';
      ctx.font = '600 10.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(op.label, (tl.x + br.x) / 2, (tl.y + br.y) / 2);
    }
  }

  for (const ov of args.entry.dxfOverlays ?? []) {
    const selected = args.selection.kind === 'dxf' && args.selection.id === ov.id;
    const paths = transformDxfPaths(ov.paths, ov.offset, ov.rotationDeg, ov.scale);
    const matColor = ov.materialId ? args.materials[ov.materialId]?.color : undefined;
    ctx.strokeStyle = selected ? accent : (matColor ?? (dark ? '#f8fafc' : '#0f172a'));
    ctx.lineWidth = selected ? 2.2 : Math.max(1.2, ov.separatorWidth * cam.zoom);
    for (const path of paths) {
      if (path.pts.length < 2) continue;
      ctx.beginPath();
      const s0 = faceToScreen(path.pts[0]!, w, h, cam);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < path.pts.length; i++) {
        const si = faceToScreen(path.pts[i]!, w, h, cam);
        ctx.lineTo(si.x, si.y);
      }
      if (path.closed) ctx.closePath();
      ctx.stroke();
    }
  }
}

function drawPreviewAndSnap(ctx: CanvasRenderingContext2D, args: DrawFaceSceneArgs, accent: string): void {
  const { width: w, height: h, cam, previewShape, draftPts, activeMatId, materials, snapResult, units, lang } = args;
  const matColor = materials[activeMatId]?.color ?? accent;

  if (previewShape) {
    const poly = shapeToMultiPolygon(previewShape);
    if (poly.length > 0) {
      traceMulti(ctx, poly, w, h, cam);
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = matColor;
      ctx.fill('evenodd');
      ctx.restore();
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  if (draftPts.length > 0) {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    const guidePts = snapResult ? [...draftPts, snapResult.uv] : draftPts;
    if (guidePts.length >= 2) {
      ctx.beginPath();
      const p0 = faceToScreen(guidePts[0]!, w, h, cam);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < guidePts.length; i++) {
        const pi = faceToScreen(guidePts[i]!, w, h, cam);
        ctx.lineTo(pi.x, pi.y);
      }
      ctx.stroke();
    }
    ctx.fillStyle = accent;
    for (const pt of draftPts) {
      const sp = faceToScreen(pt, w, h, cam);
      ctx.fillRect(sp.x - 3, sp.y - 3, 6, 6);
    }
    const last = draftPts[draftPts.length - 1]!;
    let label = '';
    if (previewShape?.kind === 'rect' || previewShape?.kind === 'arch') {
      const du = Math.abs(previewShape.u1 - previewShape.u0);
      const dv = Math.abs(previewShape.v1 - previewShape.v0);
      label = `${formatQuantity(units, 'length', du, { lang })} × ${formatQuantity(units, 'length', dv, { lang })}`;
    } else if (previewShape?.kind === 'circle') {
      label = `R ${formatQuantity(units, 'length', previewShape.radius, { lang })}`;
    } else if (previewShape?.kind === 'ellipse') {
      label = `${formatQuantity(units, 'length', previewShape.rx * 2, { lang })} × ${formatQuantity(units, 'length', previewShape.ry * 2, { lang })}`;
    } else if (snapResult) {
      label = formatQuantity(units, 'length', dist(last, snapResult.uv), { lang });
    }
    if (label && snapResult) {
      const sp = faceToScreen(snapResult.uv, w, h, cam);
      ctx.font = '600 11px monospace';
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      ctx.fillRect(sp.x + 10, sp.y - 24, tw, 18);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, sp.x + 15, sp.y - 15);
    }
    ctx.restore();
  }

  if (snapResult && (snapResult.kind !== 'none' || args.isDrawing)) {
    const sp = faceToScreen(snapResult.uv, w, h, cam);
    ctx.save();
    ctx.strokeStyle = snapResult.kind === 'point' ? '#f97316' : accent;
    ctx.lineWidth = snapResult.kind === 'none' ? 1.4 : 1.8;
    if (snapResult.kind === 'point') {
      ctx.strokeRect(sp.x - 4.5, sp.y - 4.5, 9, 9);
    } else if (snapResult.kind === 'edge') {
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y - 5);
      ctx.lineTo(sp.x + 5, sp.y);
      ctx.lineTo(sp.x, sp.y + 5);
      ctx.lineTo(sp.x - 5, sp.y);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** Renders the entire 2D unwrapped face scene onto the HTML5 canvas. */
export function drawFaceScene(args: DrawFaceSceneArgs): void {
  const { ctx, width: w, height: h, cam, dark, snapGrid, face, partition, materials, selection } = args;
  const accent = dark ? '#60a5fa' : '#0078d4';

  ctx.fillStyle = dark ? '#181a1f' : '#eef1f5';
  ctx.fillRect(0, 0, w, h);

  if (snapGrid) drawGrid(ctx, w, h, cam, dark, 0.05);

  for (const piece of partition.coplanar) {
    traceMulti(ctx, piece.poly, w, h, cam);
    ctx.fillStyle = materials[piece.materialId]?.color ?? '#cccccc';
    ctx.fill('evenodd');
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.18)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    if (selection.kind === 'region' && piece.itemId === selection.id) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }
  }

  for (const ext of partition.extrusions) {
    traceMulti(ctx, ext.poly, w, h, cam);
    ctx.fillStyle = materials[ext.materialId]?.color ?? '#a8a29e';
    ctx.fill('evenodd');
    const isSel = selection.kind === 'region' && ext.itemId === selection.id;
    ctx.strokeStyle = isSel ? accent : (dark ? '#e2e8f0' : '#1e293b');
    ctx.lineWidth = isSel ? 2.4 : 1.1;
    ctx.stroke();
  }

  if (face.boundary.length > 0) {
    traceMulti(ctx, face.boundary, w, h, cam);
    ctx.strokeStyle = dark ? '#e2e8f0' : '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  drawOverlaysAndMeta(ctx, args, accent);
  drawPreviewAndSnap(ctx, args, accent);
}
