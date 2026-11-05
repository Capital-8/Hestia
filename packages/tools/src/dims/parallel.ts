import { add, dot, len, mul, norm, perp, sub, type Vec2 } from '@hestia/geom';
import { t, type Lang } from '../i18n.ts';

/**
 * Mecanismo único das cotas "ao vizinho paralelo mais próximo" (paredes, grades, linhas, contornos): o elemento tem
 * um eixo `u` e uma normal `n`; cada vizinho paralelo vira um plano em coordenadas locais (`s` = afastamento ao longo
 * de `n`, `t0..t1` = trecho coberto ao longo de `u`). A edição desloca o elemento na normal e o sinal é decidido aqui,
 * uma vez, para que digitar `v` resulte sempre em medida `v` ao remedir (invariante de ida e volta).
 */

/** Sistema local de um segmento reto: origem, eixo, normal (esquerda do eixo) e comprimento. */
export interface SegFrame {
  origin: Vec2;
  u: Vec2;
  n: Vec2;
  length: number;
}

const EPS = 1e-6;
/** |cos| mínimo entre os eixos para dois segmentos valerem como paralelos (cerca de 2,5 graus). */
export const PARALLEL_TOL = 0.999;

/** Quadro do segmento a→b; null se for degenerado. */
export function segFrame(a: Vec2, b: Vec2): SegFrame | null {
  const length = len(sub(b, a));
  if (length < EPS) return null;
  const u = norm(sub(b, a));
  return { origin: a, u, n: perp(u), length };
}

/** Coordenadas locais (`t` ao longo do eixo, `s` ao longo da normal) de um ponto do mundo. */
export function segLocal(f: SegFrame, p: Vec2): { t: number; s: number } {
  const r = sub(p, f.origin);
  return { t: dot(r, f.u), s: dot(r, f.n) };
}

/** Ponto do mundo a partir de coordenadas locais. */
export function segPoint(f: SegFrame, t: number, s: number): Vec2 {
  return add(f.origin, add(mul(f.u, t), mul(f.n, s)));
}

/** Os segmentos a→b e c→d são paralelos (qualquer ângulo, qualquer sentido)? */
export function areParallel(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const u = sub(b, a);
  const v = sub(d, c);
  const lu = len(u);
  const lv = len(v);
  return lu > EPS && lv > EPS && Math.abs(dot(u, v)) / (lu * lv) >= PARALLEL_TOL;
}

/** Plano de um vizinho paralelo, em coordenadas locais do elemento cotado. */
export interface LocalPlane {
  id: string;
  /** Afastamento do plano ao longo da normal do elemento. */
  s: number;
  /** Trecho que o vizinho cobre ao longo do eixo (use -Infinity..Infinity para uma reta ilimitada). */
  t0: number;
  t1: number;
}

/** Vão até o vizinho paralelo mais próximo de um dos lados. */
export interface ParallelGap {
  /** +1 = lado da normal `n`; -1 = lado oposto. */
  side: 1 | -1;
  id: string;
  /** `s` do plano do vizinho. */
  s: number;
  /** `s` do plano do elemento voltado para o vizinho (a origem da medida). */
  hostS: number;
  /** Medida (sempre maior que zero). */
  distance: number;
  /** Posição ao longo do eixo em que a cota é desenhada: meio da sobreposição. */
  t: number;
}

/**
 * O vizinho paralelo mais próximo de cada lado. `hostPlane(side)` é o plano do elemento voltado para aquele lado
 * (a face, o eixo...), `center` separa os lados e `length` é o comprimento do elemento. Só contam vizinhos que se
 * sobrepõem ao elemento ao longo do eixo; vizinhos encostados (vão zero) são ignorados.
 */
export function nearestParallelGaps(hostPlane: (side: 1 | -1) => number, center: number, length: number, planes: readonly LocalPlane[]): ParallelGap[] {
  let right: ParallelGap | null = null;
  let left: ParallelGap | null = null;
  for (const p of planes) {
    const lo = Math.max(0, p.t0);
    const hi = Math.min(length, p.t1);
    if (hi - lo <= EPS) continue;
    const side: 1 | -1 = p.s >= center ? 1 : -1;
    const hostS = hostPlane(side);
    const distance = Math.abs(p.s - hostS);
    if (distance < EPS) continue;
    const gap: ParallelGap = { side, id: p.id, s: p.s, hostS, distance, t: (lo + hi) / 2 };
    if (side > 0) {
      if (!right || distance < right.distance) right = gap;
    } else if (!left || distance < left.distance) left = gap;
  }
  return [left, right].filter((g): g is ParallelGap => g !== null);
}

/** Erro padrão de uma distância que não é positiva. */
export const NON_POSITIVE_MSG = t('pt', 'tl_msg_non_positive');
/** Aviso de medida não positiva no idioma pedido. */
export const nonPositiveMsg = (lang: Lang = 'pt'): string => t(lang, 'tl_msg_non_positive');

/**
 * Deslocamento (mundo) que leva a medida do vão de `gap.distance` para `value`: afastar do vizinho aumenta a
 * medida, aproximar diminui. Com o vizinho no lado `side`, aproximar é andar para `+side` na normal. Remedir depois
 * de aplicar devolve exatamente `value`.
 */
export function gapTranslation(n: Vec2, gap: ParallelGap, value: number): Vec2 {
  return mul(n, gap.side * (gap.distance - value));
}

/** Segmento nomeado de um vizinho (linha de detalhe, outro lado do contorno...). */
export interface NamedSeg {
  id: string;
  a: Vec2;
  b: Vec2;
}

/** Vizinhos paralelos mais próximos do segmento `host` entre `others` (plano = a própria reta de cada vizinho). */
export function segmentGaps(host: SegFrame, others: readonly NamedSeg[]): ParallelGap[] {
  const hostEnd = segPoint(host, host.length, 0);
  const planes: LocalPlane[] = [];
  for (const o of others) {
    if (!areParallel(host.origin, hostEnd, o.a, o.b)) continue;
    const la = segLocal(host, o.a);
    const lb = segLocal(host, o.b);
    planes.push({ id: o.id, s: (la.s + lb.s) / 2, t0: Math.min(la.t, lb.t), t1: Math.max(la.t, lb.t) });
  }
  return nearestParallelGaps(() => 0, 0, host.length, planes);
}
