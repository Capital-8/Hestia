import { openingFamilyOf, type OpeningGlassKind, type OpeningHandle, type OpeningLeafStyle, type OpeningType } from '@hestia/model';
import type { OpeningGeometry } from './types.ts';
import type {
  LeafOpening,
  OpeningPart,
  PartBox,
  PartMaterial,
  PartMotion,
  PartRole,
} from './openingModelTypes.ts';

/** Folga padrão da esquadria (m), a mesma das famílias antigas. */
const GAP = 0.004;
/** Altura do degrau entre as duas folhas da guilhotina (m). */
const HUNG_OVERLAP = 0.02;
/** Aleta da veneziana: altura, passo e espessura (m). */
const LOUVER_HEIGHT = 0.04;
const LOUVER_PITCH = 0.055;
const LOUVER_THICKNESS = 0.008;
/** Largura do montante entre a bandeira lateral e a folha (m). */
const SIDELIGHT_MULLION = 0.04;

/**
 * Contexto do vão que as famílias novas de janela precisam. É um subconjunto estrutural do contexto interno de
 * `openingModel.ts` (por isso o despacho passa o contexto sem exportar o tipo do dono): medidas já resolvidas do tipo
 * e da parede, a lista de peças e a lista de aberturas a preencher.
 */
export interface WindowCtx {
  t: OpeningType;
  g: OpeningGeometry;
  C: number;
  Cd: number;
  hw: number;
  H: number;
  J: number;
  D: number;
  L: number;
  G: number;
  side: 1 | -1;
  h: 1 | -1;
  leafStyle: OpeningLeafStyle;
  handle: OpeningHandle;
  grid: { cols: number; rows: number };
  transom: { height: number; fixed: boolean } | null;
  sidelights: { left: boolean; right: boolean; width: number } | null;
  parts: OpeningPart[];
  openings: LeafOpening[];
}

function box(t0: number, t1: number, s0: number, s1: number, z0: number, z1: number): PartBox {
  return {
    t0: Math.min(t0, t1),
    t1: Math.max(t0, t1),
    s0: Math.min(s0, s1),
    s1: Math.max(s0, s1),
    z0: Math.min(z0, z1),
    z1: Math.max(z0, z1),
  };
}

const validBox = (b: PartBox): boolean => b.t1 - b.t0 > 1e-9 && b.s1 - b.s0 > 1e-9 && b.z1 - b.z0 > 1e-9;

interface AddOptions {
  motion?: PartMotion;
  leaf?: number;
  dashed?: boolean;
  glassKind?: OpeningGlassKind;
}

function addPart(c: WindowCtx, id: string, role: PartRole, material: PartMaterial, b: PartBox, opts: AddOptions = {}): void {
  if (!validBox(b)) return;
  c.parts.push({ id, role, material, box: b, ...opts });
}

/** Caixilho de janela: duas ombreiras, travessa e soleira, com a profundidade no núcleo (mesma regra das antigas). */
export function buildWindowFrame(c: WindowCtx): void {
  const body = { s0: c.Cd - c.D / 2, s1: c.Cd + c.D / 2 };
  for (const j of [-1, 1] as const) {
    addPart(c, `jamb-${j < 0 ? 'left' : 'right'}`, 'jamb', 'frame', box(j * (c.hw - c.J), j * c.hw, body.s0, body.s1, 0, c.H));
  }
  addPart(c, 'head', 'head', 'frame', box(-c.hw, c.hw, body.s0, body.s1, c.H - c.J, c.H));
  addPart(c, 'sill-frame', 'sillFrame', 'frame', box(-c.hw, c.hw, body.s0, body.s1, 0, c.J));
}

/** Famílias de janela que aceitam bandeira superior (spec E3 §7). Guilhotina, veneziana e vão livre ignoram. */
export function windowTransomApplies(t: Pick<OpeningType, 'kind' | 'plan' | 'leaves'>): boolean {
  if (t.kind !== 'window' || t.leaves === 0) return false;
  const family = openingFamilyOf(t)?.id;
  return (
    family === 'window_fixed' ||
    family === 'window_hinged' ||
    family === 'window_casement' ||
    family === 'window_sliding' ||
    family === 'window_tilt' ||
    family === 'window_pivot'
  );
}

/**
 * Faixa interna de uma janela: o vão do caixilho (t) e a parte reservada às folhas/vidro (z). Com bandeira aplicável,
 * o topo cede a altura da bandeira mais a travessa do caixilho (`J`), e o resto fica para as folhas. As bandeiras
 * laterais só estreitam a janela fixa (nas demais famílias são ignoradas, spec E3 §7).
 */
export interface WindowLayout {
  /** Faixa t das folhas/vidro central (descontadas as bandeiras laterais na janela fixa). */
  t0: number;
  t1: number;
  /** Faixa t de todo o vão interno do caixilho (bandeira superior atravessa as laterais). */
  fullT0: number;
  fullT1: number;
  /** Faixa z das folhas/vidro, abaixo da bandeira. */
  z0: number;
  z1: number;
  transom: { barZ0: number; barZ1: number; bandZ0: number; bandZ1: number; fixed: boolean } | null;
}

export function windowLayout(c: Pick<WindowCtx, 't' | 'hw' | 'H' | 'J' | 'transom' | 'sidelights'>): WindowLayout {
  const family = openingFamilyOf(c.t)?.id;
  const fullT0 = -c.hw + c.J;
  const fullT1 = c.hw - c.J;
  let t0 = fullT0;
  let t1 = fullT1;
  if (family === 'window_fixed' && c.sidelights) {
    const w = c.sidelights.width + SIDELIGHT_MULLION;
    if (c.sidelights.left) t0 += w;
    if (c.sidelights.right) t1 -= w;
  }
  const z0 = c.J;
  let z1 = c.H - c.J;
  let transom: WindowLayout['transom'] = null;
  if (c.transom && windowTransomApplies(c.t)) {
    const th = Math.min(c.transom.height, z1 - z0 - c.J - GAP);
    if (th > GAP) {
      const bandZ1 = z1;
      const bandZ0 = bandZ1 - th;
      const barZ1 = bandZ0;
      const barZ0 = barZ1 - c.J;
      z1 = barZ0;
      transom = { barZ0, barZ1, bandZ0, bandZ1, fixed: c.transom.fixed };
    }
  }
  return { t0, t1, fullT0, fullT1, z0, z1, transom };
}

/** Área interna do caixilho reservada às folhas/vidro (t e z), já descontado o perímetro e a bandeira superior. */
function windowInner(c: WindowCtx): { t0: number; t1: number; z0: number; z1: number } {
  const l = windowLayout(c);
  return { t0: l.t0, t1: l.t1, z0: l.z0, z1: l.z1 };
}

/** Moldura de folha de janela (4 peças `leaf`) com o vidro dentro; move junto com a folha. */
export function addWindowLeaf(
  c: WindowCtx,
  index: number,
  t0: number,
  t1: number,
  z0: number,
  z1: number,
  sCenter: number,
  motion: PartMotion | undefined,
): void {
  const lw = Math.max(0.025, c.J * 0.6);
  const s0 = sCenter - c.L / 2;
  const s1 = sCenter + c.L / 2;
  const opts: AddOptions = { ...(motion ? { motion } : {}), leaf: index };
  addPart(c, `leaf-${index}-left`, 'leaf', 'leaf', box(t0, t0 + lw, s0, s1, z0, z1), opts);
  addPart(c, `leaf-${index}-right`, 'leaf', 'leaf', box(t1 - lw, t1, s0, s1, z0, z1), opts);
  addPart(c, `leaf-${index}-top`, 'leaf', 'leaf', box(t0 + lw, t1 - lw, s0, s1, z1 - lw, z1), opts);
  addPart(c, `leaf-${index}-bottom`, 'leaf', 'leaf', box(t0 + lw, t1 - lw, s0, s1, z0, z0 + lw), opts);
  const gt0 = t0 + lw;
  const gt1 = t1 - lw;
  const gz0 = z0 + lw;
  const gz1 = z1 - lw;
  addPart(c, `glass-${index}`, 'glass', 'glass', box(gt0, gt1, sCenter - c.G / 2, sCenter + c.G / 2, gz0, gz1), { ...opts, glassKind: c.t.glassKind });
  const depth = Math.min(c.D * 0.6, c.D - 0.001);
  const half = 0.0125;
  for (let i = 1; i < c.grid.cols; i++) {
    const t = gt0 + ((gt1 - gt0) * i) / c.grid.cols;
    addPart(c, `muntin-${index}-v-${i - 1}`, 'muntin', 'frame', box(t - half, t + half, sCenter - depth / 2, sCenter + depth / 2, gz0, gz1), opts);
  }
  for (let i = 1; i < c.grid.rows; i++) {
    const z = gz0 + ((gz1 - gz0) * i) / c.grid.rows;
    addPart(c, `muntin-${index}-h-${i - 1}`, 'muntin', 'frame', box(gt0, gt1, sCenter - depth / 2, sCenter + depth / 2, z - half, z + half), opts);
  }
}

/** Sinal do giro lateral da folha: ângulo positivo leva a folha para o lado de abertura. */
function sideSign(c: WindowCtx, hingeT: number, latchT: number): 1 | -1 {
  return (c.side * (hingeT < latchT ? 1 : -1)) as 1 | -1;
}

/** Janela de abrir: uma folha (dobradiça em `h`) ou duas (uma em cada ombreira), giro vertical. */
function buildHinged(c: WindowCtx): void {
  buildWindowFrame(c);
  const inner = windowInner(c);
  const z0 = inner.z0 + GAP;
  const z1 = inner.z1 - GAP;
  const two = c.g.leaves >= 2;
  const center = (inner.t0 + inner.t1) / 2;
  const spans = two
    ? [
        { t0: inner.t0, t1: center - 0.002 },
        { t0: center + 0.002, t1: inner.t1 },
      ]
    : [{ t0: inner.t0 + GAP, t1: inner.t1 - GAP }];
  spans.forEach((span, index) => {
    // Com duas folhas, cada uma articula na sua ombreira (a esquerda na esquerda, a direita na direita).
    const hingeT = two ? (index === 0 ? span.t0 : span.t1) : c.h < 0 ? span.t0 : span.t1;
    const latchT = hingeT === span.t0 ? span.t1 : span.t0;
    const sign = sideSign(c, hingeT, latchT);
    // Eixo na face da folha oposta ao lado de abertura (spec E3 §5).
    const hingeS = c.Cd - c.side * (c.L / 2);
    const motion: PartMotion = { kind: 'rotate', axis: 'z', t: hingeT, s: hingeS, sign };
    addWindowLeaf(c, index, span.t0, span.t1, z0, z1, c.Cd, motion);
    c.openings.push({
      leaf: index,
      kind: 'side',
      side: c.side,
      hingeT,
      latchT,
      pivot: { t: hingeT, s: hingeS },
      radius: Math.abs(span.t1 - span.t0),
      z0,
      z1,
    });
  });
}

/** Janela guilhotina: folha de baixo sobe em pista própria; a de cima fica fixa na pista oposta. */
function buildHung(c: WindowCtx): void {
  buildWindowFrame(c);
  const inner = windowInner(c);
  const t0 = inner.t0 + GAP;
  const t1 = inner.t1 - GAP;
  const mid = (inner.z0 + inner.z1) / 2;
  const half = (inner.z1 - inner.z0) / 2;
  const travel = Math.max(0, half - HUNG_OVERLAP);
  const pitch = Math.max(c.L, 0.02) + 0.004;
  const sBottom = c.Cd - pitch / 2;
  const sTop = c.Cd + pitch / 2;
  const bottom = { z0: inner.z0, z1: mid + HUNG_OVERLAP };
  const top = { z0: mid - HUNG_OVERLAP, z1: inner.z1 };
  const up: PartMotion = { kind: 'slide', dt: 0, ds: 0, dz: 1, travel };
  addWindowLeaf(c, 0, t0, t1, bottom.z0, bottom.z1, sBottom, up);
  addWindowLeaf(c, 1, t0, t1, top.z0, top.z1, sTop, undefined);
  c.openings.push({
    leaf: 0,
    kind: 'slide',
    side: 0,
    slideAxis: 'z',
    hingeT: 0,
    latchT: 0,
    pivot: { t: 0, s: sBottom },
    radius: t1 - t0,
    z0: bottom.z0,
    z1: bottom.z1,
  });
  c.openings.push({
    leaf: 1,
    kind: 'fixed',
    side: 0,
    hingeT: 0,
    latchT: 0,
    pivot: { t: 0, s: sTop },
    radius: t1 - t0,
    z0: top.z0,
    z1: top.z1,
  });
}

/** Janela pivotante: uma folha com moldura e vidro girando em torno do eixo vertical central. */
function buildPivotWin(c: WindowCtx): void {
  buildWindowFrame(c);
  const inner = windowInner(c);
  const t0 = inner.t0 + GAP;
  const t1 = inner.t1 - GAP;
  const z0 = inner.z0 + GAP;
  const z1 = inner.z1 - GAP;
  const sign = c.side;
  const motion: PartMotion = { kind: 'rotate', axis: 'z', t: 0, s: c.Cd, sign };
  addWindowLeaf(c, 0, t0, t1, z0, z1, c.Cd, motion);
  c.openings.push({
    leaf: 0,
    kind: 'pivot',
    side: c.side,
    hingeT: 0,
    latchT: 0,
    pivot: { t: 0, s: c.Cd },
    radius: c.hw - c.J,
    z0,
    z1,
  });
}

/** Veneziana: aletas horizontais em toda a altura interna; cada uma gira em torno do próprio eixo central. */
function buildLouver(c: WindowCtx): void {
  buildWindowFrame(c);
  const inner = windowInner(c);
  const t0 = inner.t0;
  const t1 = inner.t1;
  const s0 = c.Cd - LOUVER_THICKNESS / 2;
  const s1 = c.Cd + LOUVER_THICKNESS / 2;
  let z = inner.z0;
  let index = 0;
  while (z + LOUVER_HEIGHT <= inner.z1 + 1e-9) {
    const center = z + LOUVER_HEIGHT / 2;
    const motion: PartMotion = { kind: 'rotate', axis: 't', s: c.Cd, z: center, sign: 1 };
    addPart(c, `louver-${index}`, 'leafPanel', 'leaf', box(t0, t1, s0, s1, z, z + LOUVER_HEIGHT), { motion, leaf: 0 });
    z += LOUVER_PITCH;
    index++;
  }
  c.openings.push({
    leaf: 0,
    kind: 'louver',
    side: 0,
    hingeT: 0,
    latchT: 0,
    pivot: { t: 0, s: c.Cd },
    radius: (t1 - t0) / 2,
    z0: inner.z0,
    z1: inner.z1,
  });
}

/**
 * Despacho das famílias novas de janela (spec E §3.5). Devolve `true` quando a família foi desenhada; `false` deixa o
 * chamador cair na janela fixa (comportamento antigo para famílias não previstas aqui).
 */
export function buildWindowNew(c: WindowCtx, family: string | undefined): boolean {
  switch (family) {
    case 'window_hinged':
      buildHinged(c);
      return true;
    case 'window_hung':
      buildHung(c);
      return true;
    case 'window_pivot':
      buildPivotWin(c);
      return true;
    case 'window_louver':
      buildLouver(c);
      return true;
    default:
      return false;
  }
}
