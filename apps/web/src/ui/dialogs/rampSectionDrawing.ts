/* eslint-disable max-lines */
import { formatRampSlope, rampNormRowFor, type RampType } from '@hestia/model';
import { fmtNum, t } from '../../editor/i18n.ts';
import {
  CHAR_W,
  LINE_H,
  type DimensionPrim,
  type Drawing,
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

export interface RampDrawingParams {
  view: 'section' | 'plan';
  slope?: number;
  totalRise?: number;
  lang?: 'pt' | 'en';
  fmt?: (n: number, decimals: number) => string;
}

export interface RampDrawingText {
  run: string;
  total: string;
  landing: string;
  rise: string;
  riseMax: string;
  riseMaxUnchecked: string;
  thick: string;
  headroom: string;
  flight1: string;
  flight2: string;
  overLimit: string;
  slope: string;
  width: string;
  up: string;
  land: string;
  capSection: string;
  capSectionOne: string;
  capPlan: string;
}

export const RAMP_DRAWING_TEXT: Record<'pt' | 'en', RampDrawingText> = {
  pt: {
    run: t('pt', 'dls_ramp_dwg_run'),
    total: t('pt', 'dls_ramp_dwg_total'),
    landing: t('pt', 'dls_ramp_dwg_landing'),
    rise: t('pt', 'dls_ramp_dwg_rise'),
    riseMax: t('pt', 'dls_ramp_dwg_rise_max'),
    riseMaxUnchecked: t('pt', 'dls_ramp_dwg_rise_max_unchecked'),
    thick: t('pt', 'dls_ramp_dwg_thick'),
    headroom: t('pt', 'dls_ramp_dwg_headroom'),
    flight1: t('pt', 'dls_ramp_dwg_flight1'),
    flight2: t('pt', 'dls_ramp_dwg_flight2'),
    overLimit: t('pt', 'dls_ramp_dwg_over_limit'),
    slope: t('pt', 'dls_ramp_dwg_slope'),
    width: t('pt', 'dls_ramp_dwg_width'),
    up: t('pt', 'dls_ramp_dwg_up'),
    land: t('pt', 'dls_ramp_dwg_land'),
    capSection: t('pt', 'dls_ramp_dwg_cap_section'),
    capSectionOne: t('pt', 'dls_ramp_dwg_cap_section_one'),
    capPlan: t('pt', 'dls_ramp_dwg_cap_plan'),
  },
  en: {
    run: t('en', 'dls_ramp_dwg_run'),
    total: t('en', 'dls_ramp_dwg_total'),
    landing: t('en', 'dls_ramp_dwg_landing'),
    rise: t('en', 'dls_ramp_dwg_rise'),
    riseMax: t('en', 'dls_ramp_dwg_rise_max'),
    riseMaxUnchecked: t('en', 'dls_ramp_dwg_rise_max_unchecked'),
    thick: t('en', 'dls_ramp_dwg_thick'),
    headroom: t('en', 'dls_ramp_dwg_headroom'),
    flight1: t('en', 'dls_ramp_dwg_flight1'),
    flight2: t('en', 'dls_ramp_dwg_flight2'),
    overLimit: t('en', 'dls_ramp_dwg_over_limit'),
    slope: t('en', 'dls_ramp_dwg_slope'),
    width: t('en', 'dls_ramp_dwg_width'),
    up: t('en', 'dls_ramp_dwg_up'),
    land: t('en', 'dls_ramp_dwg_land'),
    capSection: t('en', 'dls_ramp_dwg_cap_section'),
    capSectionOne: t('en', 'dls_ramp_dwg_cap_section_one'),
    capPlan: t('en', 'dls_ramp_dwg_cap_plan'),
  },
};

const fill = (text: string, values: Record<string, string>): string => text.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');

const maxLineLength = (text: string): number => Math.max(...text.split('\n').map((l) => l.length));

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

const poly = (id: string, pts: Pt[], fillKind: PolygonPrim['fill']): PolygonPrim => ({ kind: 'polygon', id, pts, fill: fillKind, tone: 'body', weight: 'normal', lineStyle: 'solid', role: 'body' });

const hatch = (id: string, pts: Pt[], pattern: HatchPrim['pattern']): HatchPrim => ({ kind: 'hatch', id, pts, pattern });

const line = (id: string, a: Pt, b: Pt, tone: LinePrim['tone'], weight: LinePrim['weight'], role: LinePrim['role']): LinePrim => ({ kind: 'line', id, a, b, tone, weight, lineStyle: 'solid', role });

const polyline = (id: string, pts: Pt[], tone: PolylinePrim['tone'], weight: PolylinePrim['weight'], arrowEnd?: boolean): PolylinePrim => ({
  kind: 'polyline',
  id,
  pts,
  tone,
  weight,
  lineStyle: 'solid',
  role: 'aux',
  arrowEnd,
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
  const rectOf = (a: Pt, b: Pt): Rect => ({
    x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]),
  });
  for (const p of prims) {
    if (p.kind === 'label') rects.push(labelBox(p, em));
    if (p.kind === 'dimension') {
      const g = dimGeometry(p, em);
      rects.push(dimTextBox(p, em), rectOf(g.dimLine[0], g.dimLine[1]), rectOf(g.ext1[0], g.ext1[1]), rectOf(g.ext2[0], g.ext2[1]));
    }
  }
  return unionRect(rects);
}

interface RampNumbers {
  s: number;
  nFl: 1 | 2;
  r1: number;
  r2: number;
  c1: number;
  c2: number;
  P: number;
  Ltot: number;
  tv: number;
  lt: number;
  vExag: number;
  tvY: number;
  ltY: number;
  m: number;
  Y: (h: number) => number;
  overLimit: boolean;
  maxRise: number | null;
}

function computeNumbers(type: RampType, params: RampDrawingParams): RampNumbers {
  const s = params.slope ?? type.defaultSlope;
  if (!(s > 0) || !Number.isFinite(s)) throw new RangeError(t(params.lang ?? 'pt', 'dls_ramp_err_slope'));
  const row = rampNormRowFor(type, s);
  const hasTable = type.normTable.length > 0;
  const overLimit = hasTable && row === null;
  const last = type.normTable[type.normTable.length - 1];
  const maxRise = row?.maxRise ?? (hasTable && last ? last.maxRise : null);
  let totalRise = params.totalRise ?? (maxRise ? 1.5 * maxRise : 1.2);
  if (maxRise) totalRise = Math.min(totalRise, 2 * maxRise);
  let r1: number;
  let r2: number;
  if (maxRise) {
    r1 = Math.min(maxRise, totalRise);
    r2 = totalRise - r1;
  } else {
    r1 = totalRise / 2;
    r2 = totalRise / 2;
  }
  const nFl: 1 | 2 = r2 < 1e-9 ? 1 : 2;
  const c1 = r1 / s;
  const c2 = r2 / s;
  const P = type.landingMinLength;
  const Ltot = c1 + (nFl === 2 ? P + c2 : 0);
  const tv = type.structuralDepth * Math.sqrt(1 + s * s);
  const lt = type.landingThickness;
  const vExag = clamp(Math.round(Ltot / (3.2 * (totalRise + tv))), 1, 12);
  const Y = (h: number): number => h * vExag;
  return {
    s,
    nFl,
    r1,
    r2,
    c1,
    c2,
    P,
    Ltot,
    tv,
    lt,
    vExag,
    tvY: tv * vExag,
    ltY: lt * vExag,
    m: Math.max(tv * vExag, lt * vExag),
    Y,
    overLimit,
    maxRise,
  };
}

function createSectionBuilder(type: RampType, params: RampDrawingParams, num: RampNumbers): (em: number) => Drawing {
  const lang = params.lang ?? 'pt';
  const fmt = params.fmt ?? ((n: number, dec: number): string => fmtNum(n, dec, lang));
  const t = RAMP_DRAWING_TEXT[lang];
  const { s, nFl, r1, c1, c2, P, Ltot, tv, vExag, tvY, ltY, m, Y, overLimit, maxRise } = num;
  const slopeText = lang === 'en' ? formatRampSlope(s).replace(/,/g, '.') : formatRampSlope(s);

  const levelsValues = (nFl === 2 ? [0, r1, r1 + num.r2] : [0, r1]).map((v) => `+${fmt(v, 2)}`);
  const caption =
    nFl === 2
      ? fill(t.capSection, {
          k: String(vExag),
          h1: fmt(r1, 2),
          c1: fmt(c1, 2),
          h2: fmt(num.r2, 2),
          c2: fmt(c2, 2),
          levels: levelsValues.join(', '),
        })
      : fill(t.capSectionOne, { k: String(vExag), h1: fmt(r1, 2), c1: fmt(c1, 2), levels: levelsValues.join(', ') });

  return (em: number): Drawing => {
    const bodies: PolygonPrim[] = [];
    const hatches: HatchPrim[] = [];
    const grounds: Array<LinePrim | HatchPrim> = [];
    const guides: PolylinePrim[] = [];
    const dims: DimensionPrim[] = [];
    const labels: LabelPrim[] = [];

    const yTop = Y(r1);
    const yAll = Y(r1 + num.r2);
    bodies.push(poly('body.flight.0', [[0, 0], [c1, yTop], [c1, yTop - tvY], [0, -tvY]], 'body'));
    if (nFl === 2) {
      bodies.push(poly('body.landing.0', [[c1, yTop], [c1 + P, yTop], [c1 + P, yTop - ltY], [c1, yTop - ltY]], 'body'));
      bodies.push(poly('body.flight.1', [[c1 + P, yTop], [Ltot, yAll], [Ltot, yAll - tvY], [c1 + P, yTop - tvY]], 'body'));
    }
    for (const b of bodies) hatches.push(hatch(`hatch.${b.id}`, b.pts, 'concrete'));

    grounds.push(line('ground.low', [-P, 0], [0, 0], 'ground', 'heavy', 'aux'));
    grounds.push(hatch('hatch.ground.low', [[-P, -0.8 * em], [0, -0.8 * em], [0, 0], [-P, 0]], 'ground'));
    grounds.push(line('ground.high', [Ltot, yAll], [Ltot + P, yAll], 'ground', 'heavy', 'aux'));

    const g = 1.2 * em;
    const P0: Pt = [0, -m - g];
    const P1: Pt = [c1, P0[1]];
    const P2: Pt = [c1, yTop - m - g];
    guides.push(polyline('guide.triangle', [P0, P1, P2, P0], 'accent', 'thin'));

    const obstacle = bboxOf([...hatches, ...bodies, ...grounds, ...guides]);
    const lanes = new LaneStack(obstacle, em);

    const texts = {
      run0: fill(t.run, { v: fmt(c1, 2) }),
      run1: fill(t.run, { v: fmt(c2, 2) }),
      landing: fill(t.landing, { v: fmt(P, 2) }),
      total: fill(t.total, { v: fmt(Ltot, 2) }),
      thick: fill(t.thick, { v: fmt(type.structuralDepth * 100, 1), m: fmt(tv * 100, 1) }),
      headroom: fill(t.headroom, { v: fmt(type.minHeadroom, 2) }),
    };

    const yRow1 = lanes.take('bottom', LINE_H);
    dims.push({ kind: 'dimension', id: 'dim.run.0', p1: P0, p2: P1, axis: 'x', line: yRow1, text: texts.run0, tone: 'body' });
    if (nFl === 2) {
      const run1Line = lanes.take('bottom', LINE_H);
      dims.push({ kind: 'dimension', id: 'dim.run.1', p1: [c1 + P, P0[1]], p2: [Ltot, P0[1]], axis: 'x', line: run1Line, text: texts.run1, tone: 'body' });
      const landingLine = lanes.take('bottom', LINE_H);
      dims.push({ kind: 'dimension', id: 'dim.landing', p1: [c1, P0[1]], p2: [c1 + P, P0[1]], axis: 'x', line: landingLine, text: texts.landing, tone: 'body' });
      const totalLine = lanes.take('bottom', LINE_H);
      dims.push({ kind: 'dimension', id: 'dim.total', p1: [0, P0[1]], p2: [Ltot, P0[1]], axis: 'x', line: totalLine, text: texts.total, tone: 'body' });
    }

    let riseText: string;
    let riseTone: DimensionPrim['tone'];
    if (!overLimit && maxRise !== null && r1 <= maxRise + 1e-9) {
      riseText = fill(type.normChecked ? t.riseMax : t.riseMaxUnchecked, { v: fmt(r1, 2), m: fmt(maxRise, 2) });
      riseTone = 'ok';
    } else {
      riseText = fill(t.rise, { v: fmt(r1, 2) });
      riseTone = overLimit ? 'danger' : 'body';
    }
    dims.push({ kind: 'dimension', id: 'dim.rise.0', p1: P1, p2: P2, axis: 'y', line: c1 + 1.6 * em, text: riseText, tone: riseTone });

    const slopeLabel: LabelPrim = {
      kind: 'label',
      id: 'lbl.slope',
      at: [c1 - 0.5 * em, P0[1] + 1.1 * em],
      text: fill(t.slope, { v: slopeText }),
      anchor: 'end',
      tone: 'accent',
    };
    const ySlope = lanes.take('top', LINE_H);
    labels.push({
      ...slopeLabel,
      at: [Ltot, ySlope + 1.1 * em],
      anchor: 'end',
      leader: [c1 - 0.3 * em, P0[1] + 0.4 * em],
    });

    labels.push({
      kind: 'label',
      id: 'lbl.flight.0',
      at: [c1 / 2, yTop / 2 + 0.975 * em],
      text: t.flight1,
      anchor: 'end',
      tone: 'muted',
    });
    if (nFl === 2) {
      labels.push({
        kind: 'label',
        id: 'lbl.flight.1',
        at: [c1 + P + c2 / 2, Math.max((yTop + yAll) / 2 + 0.975 * em, yTop / 2 + 2.025 * em)],
        text: t.flight2,
        anchor: 'end',
        tone: 'muted',
      });
    }

    const thickLine = lanes.take('left', CHAR_W * maxLineLength(texts.thick));
    dims.push({ kind: 'dimension', id: 'dim.thick', p1: [0, 0], p2: [0, -tvY], axis: 'y', line: thickLine, text: texts.thick, tone: 'body' });

    const xH = lanes.take('right', CHAR_W * maxLineLength(texts.headroom));
    dims.push({
      kind: 'dimension',
      id: 'dim.headroom',
      p1: [Ltot, yAll],
      p2: [Ltot, yAll + 3 * em],
      axis: 'y',
      line: xH,
      text: texts.headroom,
      tone: 'danger',
      broken: true,
    });

    if (overLimit) {
      const lastRow = type.normTable[type.normTable.length - 1];
      const maxSlope = lastRow ? lastRow.maxSlope : s;
      const maxText = lang === 'en' ? formatRampSlope(maxSlope).replace(/,/g, '.') : formatRampSlope(maxSlope);
      const yT = lanes.take('top', 2 * LINE_H);
      labels.push({
        kind: 'label',
        id: 'lbl.limit',
        at: [0, yT + 1.2 * em],
        text: fill(t.overLimit, { v: maxText }),
        anchor: 'end',
        tone: 'danger',
      });
    }

    const prims: Prim[] = [...hatches, ...bodies, ...grounds, ...guides, ...dims, ...labels];
    const frame = expandRect(boundsOfDrawing(prims, em), em);
    return { frame, em, prims, caption, meta: { kind: 'ramp-section', vExag } };
  };
}

function createPlanBuilder(type: RampType, params: RampDrawingParams, num: RampNumbers): (em: number) => Drawing {
  const lang = params.lang ?? 'pt';
  const fmt = params.fmt ?? ((n: number, dec: number): string => fmtNum(n, dec, lang));
  const t = RAMP_DRAWING_TEXT[lang];
  const { c1, c2, P, nFl } = num;
  const w = type.defaultWidth;
  const Pd = Math.max(P, w);
  const run0 = fill(t.run, { v: fmt(c1, 2) });
  const run1 = fill(t.run, { v: fmt(c2, 2) });
  const landing = fill(t.landing, { v: fmt(P, 2) });
  const width = fill(t.width, { v: fmt(w, 2) });

  return (em: number): Drawing => {
    const bodies: PolygonPrim[] = [];
    const hatches: HatchPrim[] = [];
    const guides: PolylinePrim[] = [];
    const dims: DimensionPrim[] = [];
    const labels: LabelPrim[] = [];

    bodies.push(poly('body.flight.0', [[0, 0], [c1, 0], [c1, w], [0, w]], 'soft'));
    if (nFl === 2) {
      bodies.push(poly('body.landing.0', [[c1, 0], [c1 + Pd, 0], [c1 + Pd, 2 * w], [c1, 2 * w]], 'soft'));
      hatches.push(hatch('hatch.body.landing.0', [[c1, 0], [c1 + Pd, 0], [c1 + Pd, 2 * w], [c1, 2 * w]], 'diagonal'));
      bodies.push(poly('body.flight.1', [[c1 - c2, w], [c1, w], [c1, 2 * w], [c1 - c2, 2 * w]], 'soft'));
      guides.push(
        polyline(
          'guide.arrow',
          [
            [0.4, w / 2],
            [c1 + Pd / 2, w / 2],
            [c1 + Pd / 2, 1.5 * w],
            [c1 - c2 + 0.4, 1.5 * w],
          ],
          'accent',
          'normal',
          true,
        ),
      );
    } else {
      guides.push(polyline('guide.arrow', [[0.4, w / 2], [c1 - 0.4, w / 2]], 'accent', 'normal', true));
    }

    const obstacle = bboxOf([...hatches, ...bodies, ...guides]);
    const lanes = new LaneStack(obstacle, em);

    const xL = lanes.take('left', CHAR_W * width.length);
    dims.push({
      kind: 'dimension',
      id: 'dim.width',
      p1: [0, 0],
      p2: [0, w],
      axis: 'y',
      line: xL,
      text: width,
      tone: w < type.minWidth ? 'danger' : 'body',
    });

    labels.push({
      kind: 'label',
      id: 'lbl.up',
      at: [xL, 1.2 * w + 1.2 * em],
      text: t.up,
      anchor: 'end',
      tone: 'accent',
      leader: [0.4, w / 2],
    });

    dims.push({ kind: 'dimension', id: 'dim.run.0', p1: [0, 0], p2: [c1, 0], axis: 'x', line: lanes.take('bottom', LINE_H), text: run0, tone: 'body' });

    if (nFl === 2) {
      dims.push({
        kind: 'dimension',
        id: 'dim.landing',
        p1: [c1, 0],
        p2: [c1 + Pd, 0],
        axis: 'x',
        line: lanes.take('bottom', LINE_H),
        text: landing,
        tone: 'body',
      });
      dims.push({
        kind: 'dimension',
        id: 'dim.run.1',
        p1: [c1 - c2, 2 * w],
        p2: [c1, 2 * w],
        axis: 'x',
        line: lanes.take('top', LINE_H),
        text: run1,
        tone: 'body',
      });
      const xR = lanes.take('right', CHAR_W * t.land.length);
      labels.push({
        kind: 'label',
        id: 'lbl.land',
        at: [xR, w],
        text: t.land,
        anchor: 'start',
        tone: 'muted',
        leader: [c1 + Pd - 0.2 * em, w],
      });
    }

    const prims: Prim[] = [...hatches, ...bodies, ...guides, ...dims, ...labels];
    const frame = expandRect(boundsOfDrawing(prims, em), em);
    return { frame, em, prims, caption: t.capPlan, meta: { kind: 'ramp-plan' } };
  };
}

export function buildRampSectionDrawing(type: RampType, params: RampDrawingParams): Drawing {
  const num = computeNumbers(type, params);
  if (params.view === 'plan') {
    const build = createPlanBuilder(type, params, num);
    return solveEm(build, 0.052 * (num.c1 + Math.max(num.P, type.defaultWidth) + 2));
  }
  const build = createSectionBuilder(type, params, num);
  return solveEm(build, 0.052 * (num.Ltot + 2 * num.P));
}
