import type { Vec2 } from '@hestia/geom';
import type { ResolvedRamp, ResolvedStair } from '@hestia/engine';
import { climbWalk, risersInClimbOrder, spiralByComponent, spiralPostRing, stairCut, type StairCut } from '@hestia/render';
import { DXF_LAYER_RAMP_TEXT, type DxfLevelGeometry, type DxfPoint } from '@hestia/io';
import { formatRampSlope, type Project } from '@hestia/model';
import { EPS, ROOM_TEXT_HEIGHT_M } from './dxfConstantes.ts';

type StairDxf = NonNullable<DxfLevelGeometry['stairs']>[number];
type RampDxf = NonNullable<DxfLevelGeometry['ramps']>[number];

/**
 * Zoom usado no símbolo de corte da escada: `stairCut` dá 8 px de avanço em cada lado; com zoom 80 são 0,10 m, em metros.
 * Os dentes do zigue-zague seguem `cutSymbol` da planta (4 px de amplitude, zoom 80: 0,05 m).
 */
const STAIR_CUT_ZOOM = 80;

/**
 * Seta de subida ao longo da caminhada `pts` (do primeiro ao último espelho, como a tela): um LINE por trecho da haste e,
 * no fim, as duas pontas a 30° da última direção, de 0,20 m ou um quarto do comprimento total (o menor). Pontos repetidos
 * e vértices no meio de um trecho reto saem (os pontos médios de um lance reto são colineares: a seta fica um só trecho,
 * como antes). Vazia sem comprimento.
 */
export function arrowOfPath(pts: DxfPoint[]): Array<[DxfPoint, DxfPoint]> {
  const distinct = pts.filter((q, i) => i === 0 || Math.hypot(q.x - pts[i - 1]!.x, q.y - pts[i - 1]!.y) > 1e-9);
  const path = distinct.filter((q, i) => {
    if (i === 0 || i === distinct.length - 1) return true;
    const a = distinct[i - 1]!;
    const c = distinct[i + 1]!;
    const ux = q.x - a.x;
    const uy = q.y - a.y;
    const vx = c.x - q.x;
    const vy = c.y - q.y;
    const straight = Math.abs(ux * vy - uy * vx) < 1e-9 && ux * vx + uy * vy > 0;
    return !straight;
  });
  if (path.length < 2) return [];
  const shaft: Array<[DxfPoint, DxfPoint]> = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    shaft.push([a, b]);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const tip = path[path.length - 1]!;
  const before = path[path.length - 2]!;
  const dx = tip.x - before.x;
  const dy = tip.y - before.y;
  const len = Math.hypot(dx, dy);
  const bx = -dx / len;
  const by = -dy / len;
  const L = Math.min(0.2, total * 0.25);
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  // Gira a direção de volta de ±30° para as duas pontas.
  const barb = (sg: 1 | -1): DxfPoint => ({ x: tip.x + (bx * c - sg * by * s) * L, y: tip.y + (sg * bx * s + by * c) * L });
  return [...shaft, [tip, barb(1)], [tip, barb(-1)]];
}

/** Seta de subida de um só trecho de `a` a `b` (haste e duas pontas). Caso particular de `arrowOfPath`. */
export function stairArrow(a: DxfPoint, b: DxfPoint): Array<[DxfPoint, DxfPoint]> {
  return arrowOfPath([a, b]);
}

/** Símbolo de corte em zigue-zague de oito dentes, em metros (espelha `cutSymbol` da planta). */
function cutSymbolDxf(c: StairCut): DxfPoint[] {
  const teeth = 8;
  const amp = 4 / STAIR_CUT_ZOOM;
  return Array.from({ length: teeth + 1 }, (_, j) => {
    const s = -c.half + (2 * c.half * j) / teeth;
    const k = j % 2 === 0 ? -amp : amp;
    return { x: c.at.x + c.across.x * s + c.walk.x * k, y: c.at.y + c.across.y * s + c.walk.y * k };
  });
}

/**
 * Escada resolvida em geometria de DXF, na vista do nível (decisão 0013 §4): degraus até o topo do intervalo, divididos
 * pela cota de corte (cheios até ela, tracejados acima); espelhos e seta só até o topo; símbolo de corte quando o plano
 * cruza a escada. A seta segue a caminhada da tela (`climbWalk`: a explícita do lance, senão os pontos médios). Caracol:
 * o poste (círculo de `rInner`, `spiralPostRing`) na cota de corte ou abaixo, senão acima (tracejado, como os degraus).
 */
export function stairDxf(p: Project, r: ResolvedStair, view: { cutZ: number; topZ: number }): StairDxf {
  const risers = risersInClimbOrder(r).filter((k) => k.z1 <= view.topZ + EPS);
  const steps = r.steps.filter((st) => st.z <= view.topZ + EPS);
  const outline = (st: (typeof steps)[number]): DxfPoint[] => st.polygon.map((q) => ({ x: q.x, y: q.y }));
  const cut = stairCut(r, risers, STAIR_CUT_ZOOM, view.cutZ);
  const walk: Vec2[] = climbWalk(p, r, risers);
  const posts = [...spiralByComponent(p, r).values()].map((sp) => ({ pts: spiralPostRing(sp.center, sp.rInner), above: r.baseZ > view.cutZ + EPS }));
  return {
    outlines: steps.filter((st) => st.z <= view.cutZ + EPS).map(outline),
    outlinesAbove: steps.filter((st) => st.z > view.cutZ + EPS).map(outline),
    risers: risers.map((k): [DxfPoint, DxfPoint] => [k.a, k.b]),
    arrow: arrowOfPath(walk),
    cut: cut ? cutSymbolDxf(cut) : undefined,
    ...(posts.length > 0 ? { posts } : {}),
  };
}

/**
 * Rampa resolvida em geometria de DXF: lances e patamares até o topo do intervalo, divididos pela cota de corte (cheios
 * até ela, tracejados acima); seta por lance no eixo `start → end`; linha de corte transversal no lance cruzado e o texto
 * da inclinação no meio do primeiro lance, girado com o eixo. O lance que cruza o corte aparece nas duas camadas.
 */
export function rampDxf(_p: Project, rr: ResolvedRamp, view: { cutZ: number; topZ: number }): RampDxf {
  const outline = (ring: { x: number; y: number }[]): DxfPoint[] => ring.map((q) => ({ x: q.x, y: q.y }));
  const outlines: DxfPoint[][] = [];
  const outlinesAbove: DxfPoint[][] = [];
  for (const f of rr.flights) {
    const poly = outline(f.polygon);
    if (f.z0 <= view.cutZ + EPS) outlines.push(poly);
    if (f.z1 > view.cutZ + EPS && f.z1 <= view.topZ + EPS) outlinesAbove.push(poly);
  }
  for (const l of rr.landings) {
    if (l.z > view.topZ + EPS) continue;
    if (l.z <= view.cutZ + EPS) outlines.push(outline(l.polygon));
    else outlinesAbove.push(outline(l.polygon));
  }
  const arrow = rr.flights.flatMap((f) => stairArrow({ x: f.start.x, y: f.start.y }, { x: f.end.x, y: f.end.y }));
  const cut = rr.flights
    .filter((f) => f.z0 < view.cutZ && view.cutZ < f.z1)
    .map((f): [DxfPoint, DxfPoint] => {
      const t = (view.cutZ - f.z0) / (f.z1 - f.z0);
      const at = (a: { x: number; y: number }, b: { x: number; y: number }): DxfPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      return [at(f.startEdge[0], f.endEdge[0]), at(f.startEdge[1], f.endEdge[1])];
    });
  const first = rr.flights[0];
  const texts = first
    ? [
        {
          at: { x: (first.start.x + first.end.x) / 2, y: (first.start.y + first.end.y) / 2 },
          text: formatRampSlope(rr.slope),
          height: ROOM_TEXT_HEIGHT_M,
          rotation: (Math.atan2(first.end.y - first.start.y, first.end.x - first.start.x) * 180) / Math.PI,
          layer: DXF_LAYER_RAMP_TEXT,
        },
      ]
    : [];
  return { outlines, outlinesAbove, arrow, cut, texts };
}
