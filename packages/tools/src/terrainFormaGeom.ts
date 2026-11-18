import { arcFromSagitta, arcPointAt, dist, type SketchSeg, type Vec2 } from '@hestia/geom';
import { buildShape } from './perimeterToolShape.ts';
import type { ShapeKindId } from './sketchShapes.ts';

/**
 * Formas da Topografia (curvas de nível): geometria pura. O terreno só guarda polilinhas retas (`CurvaTerreno`), então toda forma (arco,
 * círculo, elipse, retângulo, polígono, spline) é DISCRETIZADA ao concluir, com erro de corda (flecha máxima) controlado e sempre dentro do
 * teto de vértices do terreno.
 */

/** Flecha máxima padrão (m): distância máxima entre a corda e a curva verdadeira. */
export const FLECHA_PADRAO = 0.01;
export const FLECHA_MIN = 0.001;
export const FLECHA_MAX = 1;

/** Flecha válida (fora do intervalo ou não numérica, o padrão). */
export const flechaValida = (v: number | undefined): number => (v === undefined || !Number.isFinite(v) ? FLECHA_PADRAO : Math.min(FLECHA_MAX, Math.max(FLECHA_MIN, v)));

/** Polilinha gerada, fechada ou não (fechada não repete o primeiro vértice). */
export interface Polilinha {
  pts: Vec2[];
  fechada: boolean;
}

/** Pontos de um trecho do esboço: reta = 2 pontos; arco = cordas inscritas com erro de corda ≤ `flecha`. */
function pontosDoTrecho(s: SketchSeg, flecha: number): Vec2[] {
  const arc = s.sag ? arcFromSagitta(s.a, s.b, s.sag) : null;
  if (!arc) return [s.a, s.b];
  // Corda de ângulo θ num raio r tem flecha r(1 − cos(θ/2)).
  const passo = 2 * Math.acos(Math.max(0, 1 - flecha / arc.radius));
  const n = Math.max(2, Math.ceil(Math.abs(arc.sweep) / Math.max(passo, 1e-6) - 1e-9));
  const out: Vec2[] = [s.a];
  for (let i = 1; i < n; i++) out.push(arcPointAt(arc, (arc.length * i) / n));
  out.push(s.b);
  return out;
}

/** Junta os trechos encadeados numa só polilinha; se o fim volta ao início, fecha (sem repetir o 1º vértice). */
export function polilinhaDeTrechos(segs: readonly SketchSeg[], flecha: number): Polilinha | null {
  if (segs.length === 0) return null;
  const pts: Vec2[] = [];
  for (const s of segs) {
    const p = pontosDoTrecho(s, flecha);
    if (pts.length > 0 && dist(pts[pts.length - 1]!, p[0]!) > 1e-6) return null;
    pts.push(...(pts.length === 0 ? p : p.slice(1)));
  }
  const fechada = pts.length > 2 && dist(pts[0]!, pts[pts.length - 1]!) < 1e-6;
  if (fechada) pts.pop();
  return { pts, fechada };
}

const TWO_PI = Math.PI * 2;

/** Elipse (rx ≠ ry) como polilinha fechada: N partes pela curvatura máxima κ = a/b², múltiplo de 4, de 8 a 100 000. */
export function elipsePontos(center: Vec2, rx: number, ry: number, rotacao: number, flecha: number): Vec2[] {
  const a = Math.max(rx, ry);
  const b = Math.min(rx, ry);
  const bruto = Math.ceil((TWO_PI * Math.pow(a, 1.5)) / (b * Math.sqrt(8 * flecha)));
  const n = Math.min(100_000, Math.max(8, Math.ceil(bruto / 4) * 4));
  const cr = Math.cos(rotacao);
  const sr = Math.sin(rotacao);
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const t = (TWO_PI * i) / n;
    const x = rx * Math.cos(t);
    const y = ry * Math.sin(t);
    pts.push({ x: center.x + x * cr - y * sr, y: center.y + x * sr + y * cr });
  }
  return pts;
}

/** Polilinha da forma do núcleo comum com os valores dados; null se a forma for degenerada. */
export function polilinhaDaForma(kind: ShapeKindId, vals: Record<string, unknown>, flags: Record<string, boolean>, flecha: number): Polilinha | null {
  if (kind === 'ellipse') {
    const rx = vals.rx as number;
    const ry = vals.ry as number;
    if (!(rx > 1e-6) || !(ry > 1e-6)) return null;
    if (Math.abs(rx - ry) > 1e-9 * Math.max(rx, ry)) return { pts: elipsePontos(vals.center as Vec2, rx, ry, vals.rotation as number, flecha), fechada: true };
  }
  return polilinhaDeTrechos(buildShape(kind, vals, flags), flecha);
}

// ---- spline ------------------------------------------------------------------------------------------------------------------

const mistura = (a: Vec2, b: Vec2, wa: number, wb: number): Vec2 => ({ x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb });

/** Trecho P1→P2 da Catmull-Rom centrípeta (alfa 0,5, Barry-Goldman) com vizinhos P0 e P3: sem laços nem cúspides dentro do trecho. */
function trechoCatmull(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): (s: number) => Vec2 {
  const t0 = 0;
  const t1 = t0 + Math.sqrt(dist(p0, p1));
  const t2 = t1 + Math.sqrt(dist(p1, p2));
  const t3 = t2 + Math.sqrt(dist(p2, p3));
  return (s) => {
    const t = t1 + (t2 - t1) * s;
    const a1 = mistura(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0));
    const a2 = mistura(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
    const a3 = mistura(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2));
    const b1 = mistura(a1, a2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0));
    const b2 = mistura(a2, a3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1));
    return mistura(b1, b2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1));
  };
}

/** Subdivide [s0, s1] até a curva em s médio ficar a no máximo `flecha` do meio da corda; acrescenta os pontos após s0, incluindo s1. */
function amostrar(f: (s: number) => Vec2, s0: number, p0: Vec2, s1: number, p1: Vec2, flecha: number, prof: number, out: Vec2[]): void {
  const sm = (s0 + s1) / 2;
  const pm = f(sm);
  const desvio = dist(pm, { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 });
  if (desvio <= flecha || prof >= 14) {
    out.push(p1);
    return;
  }
  amostrar(f, s0, p0, sm, pm, flecha, prof + 1, out);
  amostrar(f, sm, pm, s1, p1, flecha, prof + 1, out);
}

/**
 * Spline por pontos de controle: a curva passa EXATAMENTE por eles (Catmull-Rom centrípeta). Aberta, as pontas usam vizinhos fantasmas por
 * reflexão (tangente natural); fechada, a curva dá a volta e não repete o 1º ponto. Pontos repetidos em sequência são ignorados. Cada trecho é
 * dividido até o erro de corda ficar ≤ `flecha`. Menos de 2 pontos distintos: null.
 */
export function splinePorPontos(controle: readonly Vec2[], fechada: boolean, flecha: number): Polilinha | null {
  const c: Vec2[] = [];
  for (const q of controle) if (c.length === 0 || dist(c[c.length - 1]!, q) > 1e-9) c.push(q);
  if (c.length > 2 && dist(c[0]!, c[c.length - 1]!) <= 1e-9) c.pop();
  const n = c.length;
  if (n < 2) return null;
  const fecha = fechada && n >= 3;
  const trechos = fecha ? n : n - 1;
  const viz = (k: number): Vec2 => {
    if (fecha) return c[((k % n) + n) % n]!;
    if (k < 0) return { x: 2 * c[0]!.x - c[1]!.x, y: 2 * c[0]!.y - c[1]!.y };
    if (k >= n) return { x: 2 * c[n - 1]!.x - c[n - 2]!.x, y: 2 * c[n - 1]!.y - c[n - 2]!.y };
    return c[k]!;
  };
  const pts: Vec2[] = [c[0]!];
  for (let i = 0; i < trechos; i++) {
    const f = trechoCatmull(viz(i - 1), viz(i), viz(i + 1), viz(i + 2));
    const ini = viz(i);
    const fim = viz(i + 1);
    // Oito partes iniciais (uma curva muito aberta não passa pelo teste do ponto médio) e depois a subdivisão adaptativa.
    let ant = ini;
    for (let k = 1; k <= 8; k++) {
      const alvo = k === 8 ? fim : f(k / 8);
      amostrar(f, (k - 1) / 8, ant, k / 8, alvo, flecha, 0, pts);
      ant = alvo;
    }
  }
  if (fecha) pts.pop();
  return { pts, fechada: fecha };
}

// ---- teto de vértices ---------------------------------------------------------------------------------------------------------

export interface FormaDiscretizada extends Polilinha {
  /** Flecha efetivamente usada (maior que a pedida se foi preciso reduzir a densidade). */
  flecha: number;
}

/**
 * Discretiza com a flecha pedida e, se passar de `max` vértices, dobra a flecha (menos vértices) até caber, em vez de recusar. Null se a forma
 * é degenerada ou não cabe nem com a flecha máxima (`FLECHA_MAX` x 2^k, até 40 passos: o número de vértices só para de cair em polígonos e
 * retângulos, que têm contagem fixa).
 */
export function discretizarNoTeto(gerar: (flecha: number) => Polilinha | null, flecha: number, max: number): FormaDiscretizada | null {
  let f = flecha;
  let antes = -1;
  for (let i = 0; i < 40; i++) {
    const r = gerar(f);
    if (!r) return null;
    if (r.pts.length <= max) return { ...r, flecha: f };
    if (r.pts.length === antes) return null;
    antes = r.pts.length;
    f *= 2;
  }
  return null;
}
