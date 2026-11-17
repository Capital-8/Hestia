// Geometria 2D pura das paredes inclinadas da massa (frente massa-paredes-torcidas): distância entre conjuntos de segmentos (desvio de
// Hausdorff amostrado) e deslocamento normal de uma aresta até um contorno (raio ao longo da normal). Sem kernel, sem modelo.

import type { Vec2 } from '@hestia/geom';

export type Segmento = readonly [Vec2, Vec2];

/** Distância de um ponto ao segmento a–b. */
export function distPontoSegmento(q: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const k = dx * dx + dy * dy;
  const t = k === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / k));
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

/** Segmentos de anéis fechados. */
export function segmentosDeAneis(aneis: readonly (readonly Vec2[])[]): Segmento[] {
  const out: Segmento[] = [];
  for (const r of aneis) for (let i = 0; i < r.length; i++) out.push([r[i]!, r[(i + 1) % r.length]!]);
  return out;
}

/** Pontos de amostra de um conjunto de segmentos: as pontas e `n` divisões por segmento (o suficiente para o desvio sair a ~1 mm de erro de amostra). */
function amostras(segs: readonly Segmento[], passo: number): Vec2[] {
  const out: Vec2[] = [];
  for (const [a, b] of segs) {
    const n = Math.max(1, Math.min(64, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / passo)));
    for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n });
  }
  return out;
}

const distAoConjunto = (q: Vec2, segs: readonly Segmento[]): number => {
  let m = Infinity;
  for (const [a, b] of segs) m = Math.min(m, distPontoSegmento(q, a, b));
  return m;
};

/** Desvio de Hausdorff simétrico entre dois conjuntos de segmentos, por amostragem (passo 0,05 m). Conjunto vazio dá 0. */
export function desvioEntre(a: readonly Segmento[], b: readonly Segmento[], passo = 0.05): number {
  if (a.length === 0 || b.length === 0) return 0;
  let m = 0;
  for (const q of amostras(a, passo)) m = Math.max(m, distAoConjunto(q, b));
  for (const q of amostras(b, passo)) m = Math.max(m, distAoConjunto(q, a));
  return m;
}

/**
 * Deslocamento assinado, ao longo da normal `n` (unitária), do ponto `m` até o contorno: a interseção da reta `m + t·n` com o contorno de menor
 * |t|; sem interseção, o ponto mais próximo do contorno projetado na normal. Contorno vazio: 0.
 */
export function deslocamentoNormal(m: Vec2, n: Vec2, segs: readonly Segmento[]): number {
  let melhor: number | null = null;
  for (const [a, b] of segs) {
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = n.x * ey - n.y * ex;
    if (Math.abs(den) < 1e-12) continue;
    const wx = a.x - m.x;
    const wy = a.y - m.y;
    const t = (wx * ey - wy * ex) / den;
    const s = (wx * n.y - wy * n.x) / den;
    if (s < -1e-12 || s > 1 + 1e-12) continue;
    if (melhor === null || Math.abs(t) < Math.abs(melhor)) melhor = t;
  }
  if (melhor !== null) return melhor;
  let dmin = Infinity;
  let q: Vec2 | null = null;
  for (const [a, b] of segs) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const k = dx * dx + dy * dy;
    const u = k === 0 ? 0 : Math.max(0, Math.min(1, ((m.x - a.x) * dx + (m.y - a.y) * dy) / k));
    const p = { x: a.x + u * dx, y: a.y + u * dy };
    const d = Math.hypot(p.x - m.x, p.y - m.y);
    if (d < dmin) {
      dmin = d;
      q = p;
    }
  }
  return q ? (q.x - m.x) * n.x + (q.y - m.y) * n.y : 0;
}
