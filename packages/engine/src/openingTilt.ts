import type { OpeningPlane } from '@hestia/model';

/**
 * Abertura em parede inclinada (F2.8, promove o spike S4). Eixos locais: x = linha de base, y = normal horizontal (lado
 * em que a parede inclina para tilt > 0), z = vertical. O plano médio da parede passa pela origem: y = z·tanθ.
 * Modo 'inclinado': o vão é um prisma perpendicular às faces (cortes de topo e base ao longo da inclinação).
 * Modo 'vertical': topo e base horizontais (z = s e z = s + h) e o plano do caixilho em prumo, ANCORADO na face da parede.
 */

/** Limite do modo inclinado em arco: w² ≤ 0,4·R (deriva das faces nas ombreiras ≤ t/4 para t = 0,2). */
export const ARC_PLANE_RATIO = 0.4;

/** O modo inclinado cabe num arco de raio R para um vão de largura w? Reta (R ausente) sempre cabe. */
export const inclinedFitsArc = (w: number, R?: number): boolean => R === undefined || w * w <= ARC_PLANE_RATIO * R + 1e-12;

export interface OpeningTiltInput {
  plane: OpeningPlane;
  /** Inclinação em radianos, com sinal (+ = topo para +y). */
  theta: number;
  t: number;
  w: number;
  h: number;
  /** Peitoril: cota z (sempre vertical). */
  s: number;
  /** Folga extra do cortador ao longo do eixo de corte (m). */
  margin?: number;
}

export interface OpeningTiltResult {
  /** Cota z do topo do vão no plano médio. */
  topZ: number;
  /** Deslocamento horizontal (y) do plano médio no centro do vão. */
  frameShift: number;
  /** Profundidade horizontal (y) do corte, sem folga. */
  horizontalDepth: number;
  /** Volume de parede retirado (fórmula fechada). */
  removedVolume: number;
  /**
   * Referencial do caixilho: origem no centro do vão (y ancorado: no modo vertical, na face de ancoragem em z = s; no
   * inclinado, no plano médio), eixos u (largura), v (altura no plano), n (normal do plano).
   */
  frame: { origin: [number, number, number]; u: [number, number, number]; v: [number, number, number]; n: [number, number, number] };
  /**
   * Recuo do plano do caixilho à superfície de referência do corte nas bordas (todos ≥ 0 por construção). Inclinado:
   * distância às faces do corte (t/2 + folga). Vertical: recuo atrás da face de ancoragem (a face para a qual a parede
   * se afasta do prumo): 0 na borda inferior, h·|tanθ| na superior, (h/2)·|tanθ| nas laterais (a meia altura).
   */
  reveal: { left: number; right: number; bottom: number; top: number };
  /** Só modo vertical: quanto o prumo sai pela face OPOSTA à ancoragem no topo (h·|tanθ| − t/cosθ, ≥ 0; 0 se cabe). */
  overhang: number;
}

export function openingTiltGeom(i: OpeningTiltInput): OpeningTiltResult {
  const { theta: th, t, w, h, s } = i;
  const m = i.margin ?? 0;
  const sn = Math.sin(th), cs = Math.cos(th), tn = Math.tan(th);
  const sgn = th >= 0 ? 1 : -1;
  if (i.plane === 'inclinado') {
    const shift = (s + (h * cs) / 2) * tn;
    return {
      topZ: s + h * cs,
      frameShift: shift,
      horizontalDepth: t / cs + Math.abs(h * sn),
      removedVolume: w * h * t,
      frame: { origin: [0, shift, s + (h * cs) / 2], u: [1, 0, 0], v: [0, sn, cs], n: [0, cs, -sn] },
      reveal: { left: t / 2 + m, right: t / 2 + m, bottom: t / 2 + m, top: t / 2 + m },
      overhang: 0,
    };
  }
  // Vertical: a face de ancoragem em z = s fica em y = s·tanθ + sgn·t/(2cosθ).
  const anchorY = s * tn + (sgn * t) / (2 * cs);
  return {
    topZ: s + h,
    frameShift: (s + h / 2) * tn,
    horizontalDepth: t / cs + Math.abs(h * tn),
    removedVolume: (w * h * t) / cs,
    frame: { origin: [0, anchorY, s + h / 2], u: [1, 0, 0], v: [0, 0, 1], n: [0, 1, 0] },
    reveal: { left: Math.abs((h / 2) * tn), right: Math.abs((h / 2) * tn), bottom: 0, top: Math.abs(h * tn) },
    overhang: Math.max(0, Math.abs(h * tn) - t / cs),
  };
}

/**
 * Vão que o sólido inclinado corta perpendicular às faces (modo 'inclinado'). Coordenadas de PLANTA da base (pré-mapa
 * de `tiltMap`) e cotas relativas à base da parede.
 */
export interface TiltCut {
  cx: number;
  cy: number;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  /** Meia largura e meia profundidade (em n) do retângulo do furo na planta. */
  halfW: number;
  halfD: number;
  /** Cota do peitoril e do topo do vão (relativas à base). */
  z0: number;
  z1: number;
  /** Seno e cosseno do ângulo de inclinação (com sinal no seno). */
  sn: number;
  cs: number;
}

const CUT_EPS = 1e-6;

/**
 * Cota pré-mapa de um vértice (x, y, z): os vértices do furo (dentro do retângulo, na cota do peitoril ou do topo) deslocam-se
 * ao longo do plano da face para que o furo fique perpendicular a ela: z − e·senθ (e = distância ao centro do vão em n) e, no
 * topo, − h(1 − cosθ). Peitoril em 0 (porta ao piso): a base continua em z = 0 (o furo abre pelo piso). Com θ = 0 devolve z.
 */
export function tiltCutZ(cuts: readonly TiltCut[], x: number, y: number, z: number): number {
  for (const c of cuts) {
    const du = (x - c.cx) * c.ux + (y - c.cy) * c.uy;
    const dn = (x - c.cx) * c.nx + (y - c.cy) * c.ny;
    if (Math.abs(du) > c.halfW + CUT_EPS || Math.abs(dn) > c.halfD + CUT_EPS) continue;
    if (Math.abs(z - c.z0) < CUT_EPS) return c.z0 <= CUT_EPS ? z : z - dn * c.sn;
    if (Math.abs(z - c.z1) < CUT_EPS) return z - dn * c.sn - (c.z1 - c.z0) * (1 - c.cs);
  }
  return z;
}
