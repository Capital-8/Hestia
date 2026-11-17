import { openingFamilyOf, openingTiltAxis } from '@hestia/model';
import {
  addWindowLeaf,
  buildWindowFrame,
  buildWindowNew,
  windowLayout,
} from './openingModelWindowsNew.ts';
import type { PartMotion } from './openingModelTypes.ts';
import {
  GAP,
  addPart,
  box,
  type Ctx,
} from './openingModelContext.ts';

/** Montantes e travessas que dividem o vidro em `cols × rows` painéis iguais. */
function addGridMuntins(c: Ctx, t0: number, t1: number, z0: number, z1: number): void {
  const depth = Math.min(c.D * 0.6, c.D - 0.001);
  const half = 0.0125;
  for (let i = 1; i < c.grid.cols; i++) {
    const t = t0 + ((t1 - t0) * i) / c.grid.cols;
    addPart(c, `muntin-v-${i - 1}`, 'muntin', 'frame', box(t - half, t + half, c.Cd - depth / 2, c.Cd + depth / 2, z0, z1));
  }
  for (let i = 1; i < c.grid.rows; i++) {
    const z = z0 + ((z1 - z0) * i) / c.grid.rows;
    addPart(c, `muntin-h-${i - 1}`, 'muntin', 'frame', box(t0, t1, c.Cd - depth / 2, c.Cd + depth / 2, z - half, z + half));
  }
}

/** Janela fixa: caixilho e vidro com as divisões do tipo. */
function buildFixedWindow(c: Ctx): void {
  buildWindowFrame(c);
  const l = windowLayout(c);
  addPart(c, 'glass-0', 'glass', 'glass', box(l.t0, l.t1, c.Cd - c.G / 2, c.Cd + c.G / 2, l.z0, l.z1), { glassKind: c.t.glassKind });
  addGridMuntins(c, l.t0, l.t1, l.z0, l.z1);
  c.openings.push({
    leaf: 0,
    kind: 'fixed',
    side: 0,
    hingeT: 0,
    latchT: 0,
    pivot: { t: 0, s: c.Cd },
    radius: 0,
    z0: l.z0,
    z1: l.z1,
  });
}

/** Maxim-ar: moldura de folha com vidro, girando no topo (família `window_casement`, mantida como era). */
function buildCasementWindow(c: Ctx): void {
  buildWindowFrame(c);
  const l = windowLayout(c);
  const t0 = l.t0 + GAP;
  const t1 = l.t1 - GAP;
  const z0 = l.z0 + GAP;
  const z1 = l.z1;
  const motion: PartMotion = { kind: 'rotate', axis: 't', s: c.Cd, z: z1, sign: c.side };
  addWindowLeaf(c, 0, t0, t1, z0, z1, c.Cd, motion);
  c.openings.push({
    leaf: 0,
    kind: 'top',
    side: c.side,
    hingeT: 0,
    latchT: 0,
    pivot: { t: 0, s: c.Cd },
    radius: z1 - z0,
    z0,
    z1,
  });
}

/**
 * Basculante: eixo horizontal em `z = J + tiltAxis·(H − 2J)` (central ou excêntrico). A metade superior vai para `side`
 * e a inferior para o lado oposto; a folha fica com folga em todo o vão interno, então não cruza o caixilho ao abrir.
 */
function buildTiltWindow(c: Ctx): void {
  buildWindowFrame(c);
  const l = windowLayout(c);
  const t0 = l.t0 + GAP;
  const t1 = l.t1 - GAP;
  const z0 = l.z0 + GAP;
  const z1 = l.z1 - GAP;
  const axisZ = l.z0 + openingTiltAxis(c.t) * (l.z1 - l.z0);
  const motion: PartMotion = { kind: 'rotate', axis: 't', s: c.Cd, z: axisZ, sign: (-c.side) as 1 | -1 };
  addWindowLeaf(c, 0, t0, t1, z0, z1, c.Cd, motion);
  c.openings.push({
    leaf: 0,
    kind: 'tilt',
    side: c.side,
    hingeT: 0,
    latchT: 0,
    pivot: { t: 0, s: c.Cd },
    radius: Math.max(axisZ - z0, z1 - axisZ),
    axisZ,
    z0,
    z1,
  });
}

/** Janela de correr de 2 ou 3 folhas em pistas defasadas, com montantes/trilhos. */
function buildSlidingWindow(c: Ctx): void {
  buildWindowFrame(c);
  const l = windowLayout(c);
  const n = Math.max(1, c.g.leaves);
  const center0 = (l.t0 + l.t1) / 2;
  const innerHalf = (l.t1 - l.t0) / 2;
  const leafW = (2 * innerHalf + (n - 1) * 0.05) / n;
  const spacing = leafW - 0.05;
  const pitch = Math.max(c.L, 0.02) + 0.004;
  const travel = leafW - 0.05;
  const z0 = l.z0 + GAP;
  const z1 = l.z1 - GAP;
  const body = { s0: c.Cd - c.D / 2, s1: c.Cd + c.D / 2 };
  addPart(c, 'track-head', 'track', 'metal', box(l.t0, l.t1, body.s0, body.s1, l.z1 - GAP - 0.01, l.z1 - GAP));
  addPart(c, 'track-sill', 'track', 'metal', box(l.t0, l.t1, body.s0, body.s1, c.J, c.J + 0.01));
  for (let k = 0; k < n; k++) {
    const center = center0 + (k - (n - 1) / 2) * spacing;
    const sCenter = c.Cd + (k - (n - 1) / 2) * pitch;
    const moving = k % 2 === 1;
    const motion: PartMotion | undefined = moving ? { kind: 'slide', dt: -1, ds: 0, dz: 0, travel } : undefined;
    addWindowLeaf(c, k, center - leafW / 2, center + leafW / 2, z0, z1, sCenter, motion);
    c.openings.push({
      leaf: k,
      kind: 'slide',
      side: 0,
      hingeT: 0,
      latchT: 0,
      pivot: { t: 0, s: sCenter },
      radius: leafW,
      z0,
      z1,
    });
  }
}

/** Vão livre de janela: só a soleira (sem batente, folha ou vidro). */
export function buildWindowVoid(c: Ctx): void {
  const body = { s0: c.Cd - c.D / 2, s1: c.Cd + c.D / 2 };
  addPart(c, 'sill-frame', 'sillFrame', 'frame', box(-c.hw, c.hw, body.s0, body.s1, 0, c.J));
}

export function buildWindow(c: Ctx): void {
  const family = openingFamilyOf(c.t)?.id;
  switch (family) {
    case 'window_casement':
      buildCasementWindow(c);
      break;
    case 'window_tilt':
      buildTiltWindow(c);
      break;
    case 'window_sliding':
      buildSlidingWindow(c);
      break;
    case 'window_void':
      buildWindowVoid(c);
      break;
    default:
      if (!buildWindowNew(c, family)) buildFixedWindow(c);
  }
}

export function buildVoid(c: Ctx): void {
  if (c.t.kind === 'window') buildWindowVoid(c);
}
