import type { StairType } from '@hestia/model';
import { fmtNum, t } from '../../editor/i18n.ts';
import {
  CHAR_W,
  LINE_H,
  type DimensionPrim,
  type Drawing,
  type HatchPattern,
  type HatchPrim,
  type LabelPrim,
  type LinePrim,
  type PolygonPrim,
  type PolylinePrim,
  type Prim,
  type Pt,
  type Rect,
} from '../schematic/drawing.ts';
import { bboxOf, dimGeometry, dimTextBox, expandRect, labelBox } from '../schematic/geometry.ts';
import { LaneStack, solveEm } from '../schematic/lanes.ts';

export interface StairDrawingParams {
  riser: number;
  tread: number;
  steps?: number;
  lang?: 'pt' | 'en';
  fmt?: (n: number, decimals: number) => string;
}

export interface StairDrawingText {
  riser: string;
  tread: string;
  nosing: string;
  theta: string;
  floor: string;
  headroom: string;
  thick: string;
  treadThick: string;
  riserThick: string;
  overlap: string;
  capMono: string;
  capAssembled: string;
  capPost: string;
}

export const STAIR_DRAWING_TEXT: Record<'pt' | 'en', StairDrawingText> = {
  pt: {
    riser: t('pt', 'dls_stair_dwg_riser'),
    tread: t('pt', 'dls_stair_dwg_tread'),
    nosing: t('pt', 'dls_stair_dwg_nosing'),
    theta: t('pt', 'dls_stair_dwg_theta'),
    floor: t('pt', 'dls_stair_dwg_floor'),
    headroom: t('pt', 'dls_stair_dwg_headroom'),
    thick: t('pt', 'dls_stair_dwg_thick'),
    treadThick: t('pt', 'dls_stair_dwg_tread_thick'),
    riserThick: t('pt', 'dls_stair_dwg_riser_thick'),
    overlap: t('pt', 'dls_stair_dwg_overlap'),
    capMono: t('pt', 'dls_stair_dwg_cap_mono'),
    capAssembled: t('pt', 'dls_stair_dwg_cap_assembled'),
    capPost: t('pt', 'dls_stair_dwg_cap_post'),
  },
  en: {
    riser: t('en', 'dls_stair_dwg_riser'),
    tread: t('en', 'dls_stair_dwg_tread'),
    nosing: t('en', 'dls_stair_dwg_nosing'),
    theta: t('en', 'dls_stair_dwg_theta'),
    floor: t('en', 'dls_stair_dwg_floor'),
    headroom: t('en', 'dls_stair_dwg_headroom'),
    thick: t('en', 'dls_stair_dwg_thick'),
    treadThick: t('en', 'dls_stair_dwg_tread_thick'),
    riserThick: t('en', 'dls_stair_dwg_riser_thick'),
    overlap: t('en', 'dls_stair_dwg_overlap'),
    capMono: t('en', 'dls_stair_dwg_cap_mono'),
    capAssembled: t('en', 'dls_stair_dwg_cap_assembled'),
    capPost: t('en', 'dls_stair_dwg_cap_post'),
  },
};

const fill = (text: string, values: Record<string, string>): string => text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

const maxLineLength = (text: string): number => Math.max(...text.split('\n').map((l) => l.length));

const poly = (id: string, pts: Pt[], fillKind: PolygonPrim['fill'] = 'body'): PolygonPrim => ({
  kind: 'polygon',
  id,
  pts,
  fill: fillKind,
  tone: 'body',
  weight: 'normal',
  lineStyle: 'solid',
  role: 'body',
});

const hatch = (id: string, pts: Pt[], pattern: HatchPattern): HatchPrim => ({ kind: 'hatch', id, pts, pattern });

const line = (id: string, a: Pt, b: Pt, tone: LinePrim['tone'], weight: LinePrim['weight'], role: LinePrim['role'], lineStyle: LinePrim['lineStyle'] = 'solid'): LinePrim => ({
  kind: 'line',
  id,
  a,
  b,
  tone,
  weight,
  lineStyle,
  role,
});

const polyline = (id: string, pts: Pt[], tone: PolylinePrim['tone'], lineStyle: PolylinePrim['lineStyle']): PolylinePrim => ({
  kind: 'polyline',
  id,
  pts,
  tone,
  weight: 'thin',
  lineStyle,
  role: 'aux',
});

function unionRect(rects: Rect[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    if (r.x0 < x0) x0 = r.x0;
    if (r.y0 < y0) y0 = r.y0;
    if (r.x1 > x1) x1 = r.x1;
    if (r.y1 > y1) y1 = r.y1;
  }
  return { x0, y0, x1, y1 };
}

function boundsOfDrawing(prims: Prim[], em: number): Rect {
  const rects: Rect[] = [bboxOf(prims)];
  for (const p of prims) {
    if (p.kind === 'label') rects.push(labelBox(p, em));
    if (p.kind === 'dimension') {
      const g = dimGeometry(p, em);
      rects.push(dimTextBox(p, em));
      rects.push({ x0: Math.min(g.dimLine[0][0], g.dimLine[1][0]), y0: Math.min(g.dimLine[0][1], g.dimLine[1][1]), x1: Math.max(g.dimLine[0][0], g.dimLine[1][0]), y1: Math.max(g.dimLine[0][1], g.dimLine[1][1]) });
      for (const e of [g.ext1, g.ext2]) {
        rects.push({ x0: Math.min(e[0][0], e[1][0]), y0: Math.min(e[0][1], e[1][1]), x1: Math.max(e[0][0], e[1][0]), y1: Math.max(e[0][1], e[1][1]) });
      }
    }
  }
  return unionRect(rects);
}

function createBuilder(type: StairType, params: StairDrawingParams, R: number, T: number): (em: number) => Drawing {
  const n = Math.max(1, Math.floor(params.steps ?? 3));
  const lang = params.lang ?? 'pt';
  const fmt = params.fmt ?? ((n: number, dec: number): string => fmtNum(n, dec, lang));
  const t = STAIR_DRAWING_TEXT[lang];
  const d = Math.max(type.structuralDepth, 0);
  const H = Math.hypot(T, R);
  const cosTheta = T / H;
  const Tv = d / cosTheta;
  const x0 = (Tv * T) / R;
  const theta = (Math.atan2(R, T) * 180) / Math.PI;
  const nh = Math.min(0.03, 0.4 * R);
  const tt = Math.max(type.treadThickness, 0);
  const rt = Math.max(type.riserThickness, 0);
  const ov = Math.max(type.treadOverlap, 0);
  const nos = Math.max(type.nosing, 0);
  const ny: Pt = [R / H, -T / H];
  const p1Thick: Pt = [n * T, n * R];
  const p2Thick: Pt = [p1Thick[0] + d * ny[0], p1Thick[1] + d * ny[1]];
  const caption =
    type.runStyle === 'monolithic' ? fill(t.capMono, { n: String(n) }) : type.runStyle === 'assembled' ? t.capAssembled : t.capPost;

  const texts = {
    riser: fill(t.riser, { v: fmt(R * 100, 1) }),
    tread: fill(t.tread, { v: fmt(T * 100, 1) }),
    nosing: fill(t.nosing, { v: fmt(nos * 100, 1) }),
    theta: fill(t.theta, { v: fmt(theta, 1) }),
    headroom: fill(t.headroom, { v: fmt(type.minHeadroom, 2) }),
    thick: fill(t.thick, { v: fmt(d * 100, 1) }),
    treadThick: fill(t.treadThick, { v: fmt(tt * 100, 1) }),
    riserThick: fill(t.riserThick, { v: fmt(rt * 100, 1) }),
    overlap: fill(t.overlap, { v: fmt(ov * 100, 1) }),
  };

  return (em: number): Drawing => {
    const bodies: PolygonPrim[] = [];
    const hatches: HatchPrim[] = [];
    const grounds: Array<LinePrim | HatchPrim> = [];
    const guides: Array<LinePrim | PolylinePrim> = [];
    const dims: DimensionPrim[] = [];
    const labels: LabelPrim[] = [];

    if (type.runStyle === 'monolithic') {
      const pts: Pt[] = [[0, 0]];
      for (let i = 0; i < n; i++) pts.push([i * T, (i + 1) * R], [(i + 1) * T, (i + 1) * R]);
      const deep = n * R - Tv;
      if (deep > 0) {
        pts.push([n * T, deep], [x0, 0]);
      } else {
        pts.push([n * T, 0]);
      }
      if (type.undersideStyle === 'stepped') {
        const stepped: Pt[] = pts.slice(0, 1 + 2 * n);
        for (let i = n - 1; i >= 0; i--) {
          const yb = Math.max(i * R - Tv, 0);
          stepped.push([(i + 1) * T, yb], [i * T, yb]);
        }
        const clean: Pt[] = [];
        for (const p of stepped) {
          const prev = clean[clean.length - 1];
          if (!prev || Math.abs(prev[0] - p[0]) > 1e-12 || Math.abs(prev[1] - p[1]) > 1e-12) clean.push(p);
        }
        bodies.push(poly('body.run', clean));
      } else {
        bodies.push(poly('body.run', pts));
      }
    } else if (type.runStyle === 'assembled') {
      for (let i = 0; i < n; i++) {
        bodies.push(
          poly(`body.tread.${i}`, [
            [i * T - nos, (i + 1) * R - tt],
            [(i + 1) * T + rt, (i + 1) * R - tt],
            [(i + 1) * T + rt, (i + 1) * R],
            [i * T - nos, (i + 1) * R],
          ]),
        );
        bodies.push(
          poly(`body.riser.${i}`, [
            [i * T, i * R],
            [i * T + rt, i * R],
            [i * T + rt, (i + 1) * R - tt],
            [i * T, (i + 1) * R - tt],
          ]),
        );
      }
    } else {
      for (let i = 0; i < n; i++) {
        bodies.push(
          poly(`body.tread.${i}`, [
            [i * T, (i + 1) * R - tt],
            [(i + 1) * T + ov, (i + 1) * R - tt],
            [(i + 1) * T + ov, (i + 1) * R],
            [i * T, (i + 1) * R],
          ]),
        );
      }
    }

    if (type.runStyle === 'monolithic' && nos > 0) {
      for (let i = 0; i < n; i++) {
        bodies.push(
          poly(`body.nosing.${i}`, [
            [i * T - nos, (i + 1) * R - nh],
            [i * T, (i + 1) * R - nh],
            [i * T, (i + 1) * R],
            [i * T - nos, (i + 1) * R],
          ]),
        );
      }
    }

    const hatchPattern: HatchPattern = type.runStyle === 'monolithic' ? 'concrete' : 'wood';
    for (const b of bodies) {
      if (b.id.startsWith('body.nosing.')) continue;
      hatches.push(hatch(`hatch.${b.id}`, b.pts, hatchPattern));
    }

    grounds.push(line('ground.line', [-0.9 * T, 0], [0, 0], 'ground', 'heavy', 'aux'));
    grounds.push(
      hatch('hatch.ground', [
        [-0.9 * T, -0.8 * em],
        [0, -0.8 * em],
        [0, 0],
        [-0.9 * T, 0],
      ], 'ground'),
    );

    guides.push(polyline('guide.pitch', [[0, R], [(n - 1) * T, n * R]], 'accent', 'dashed'));
    if (type.runStyle === 'monolithic') {
      guides.push(line('guide.under', [n * T, n * R - Tv], p2Thick, 'muted', 'thin', 'aux', 'dashed'));
    }

    const obstacle = bboxOf([...hatches, ...bodies, ...grounds, ...guides], (p) => p.kind !== 'dimension' && p.kind !== 'label');
    const lanes = new LaneStack(obstacle, em);

    const riserLine = lanes.take('left', CHAR_W * texts.riser.length);
    dims.push({ kind: 'dimension', id: 'dim.riser', p1: [0, 0], p2: [0, R], axis: 'y', line: riserLine, text: texts.riser, tone: 'body' });

    const xL = riserLine;
    let leftMax = 0;
    const riserTextY = R / 2;
    const yNosing = Math.max(1.45 * R, riserTextY + 1.05 * em);
    const yTheta = Math.max(2.2 * R, yNosing + 1.05 * em);

    if (nos > 0 && type.runStyle !== 'post') {
      labels.push({
        kind: 'label',
        id: 'lbl.nosing',
        at: [xL, yNosing],
        text: texts.nosing,
        anchor: 'end',
        tone: 'muted',
        leader: [-nos / 2, R - nh / 2],
      });
      leftMax = Math.max(leftMax, maxLineLength(texts.nosing));
    }
    labels.push({
      kind: 'label',
      id: 'lbl.theta',
      at: [xL, yTheta],
      text: texts.theta,
      anchor: 'end',
      tone: 'accent',
      leader: [T / 2, 1.5 * R],
    });
    leftMax = Math.max(leftMax, maxLineLength(texts.theta));
    labels.push({ kind: 'label', id: 'lbl.floor', at: [xL, -1.2 * em], text: t.floor, anchor: 'end', tone: 'muted' });
    leftMax = Math.max(leftMax, maxLineLength(t.floor));
    lanes.reserve('left', xL - CHAR_W * em * leftMax);

    if (n >= 2) {
      const treadP1: Pt = [(n - 2) * T, (n - 1) * R];
      const treadP2: Pt = [(n - 1) * T, n * R];
      const treadLine = lanes.take('top', LINE_H);
      dims.push({ kind: 'dimension', id: 'dim.tread', p1: treadP1, p2: treadP2, axis: 'x', line: treadLine, text: texts.tread, tone: 'body' });
    }

    if (type.runStyle === 'post' && ov > 0) {
      const topY = n * R;
      const topX = (n - 1) * T;
      const overlapLine = lanes.take('top', 2 * LINE_H);
      dims.push({ kind: 'dimension', id: 'dim.overlap', p1: [topX, topY], p2: [topX + ov, topY], axis: 'x', line: overlapLine, text: texts.overlap, tone: 'body' });
    }

    if (type.runStyle === 'monolithic') {
      const thick: DimensionPrim = { kind: 'dimension', id: 'dim.thick', p1: p1Thick, p2: p2Thick, axis: 'aligned', line: 1.6 * em, text: texts.thick, tone: 'body' };
      dims.push(thick);
      lanes.reserve('right', dimTextBox(thick, em).x1);
    }

    const extra = type.runStyle === 'assembled' ? rt : type.runStyle === 'post' ? ov : 0;
    const headroomExtent = CHAR_W * maxLineLength(texts.headroom);
    let xH = lanes.take('right', headroomExtent);
    if (type.runStyle === 'assembled' || type.runStyle === 'post') {
      dims.push({
        kind: 'dimension',
        id: 'dim.treadThick',
        p1: [n * T + extra, n * R - tt],
        p2: [n * T + extra, n * R],
        axis: 'y',
        line: xH,
        text: texts.treadThick,
        tone: 'body',
      });
      lanes.reserve('right', dimTextBox(dims[dims.length - 1]!, em).x1);
      xH = lanes.take('right', headroomExtent);
    }
    dims.push({
      kind: 'dimension',
      id: 'dim.headroom',
      p1: [(n - 1) * T, n * R],
      p2: [(n - 1) * T, n * R + 3 * em],
      axis: 'y',
      line: xH,
      text: texts.headroom,
      tone: 'danger',
      broken: true,
    });

    if (type.runStyle === 'assembled') {
      const riserThickLine = lanes.take('bottom', LINE_H);
      dims.push({ kind: 'dimension', id: 'dim.riserThick', p1: [0, 0], p2: [rt, 0], axis: 'x', line: riserThickLine, text: texts.riserThick, tone: 'body' });
    }

    const prims: Prim[] = [...hatches, ...bodies, ...grounds, ...guides, ...dims, ...labels];
    const frame = expandRect(boundsOfDrawing(prims, em), em);
    return { frame, em, prims, caption, meta: { kind: 'stair-section' } };
  };
}

export function buildStairSectionDrawing(type: StairType, params: StairDrawingParams): Drawing {
  const R = params.riser;
  const T = params.tread;
  if (!(R > 0) || !(T > 0) || !Number.isFinite(R) || !Number.isFinite(T)) {
    throw new RangeError(t(params.lang ?? 'pt', 'dls_stair_err_riser_tread'));
  }
  const build = createBuilder(type, params, R, T);
  const n = Math.max(1, Math.floor(params.steps ?? 3));
  return solveEm(build, 0.052 * (n * T + 0.9 * T + 0.3));
}
