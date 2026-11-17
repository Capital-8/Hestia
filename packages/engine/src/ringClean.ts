import type { Ring, Vec2 } from '@hestia/geom';

/**
 * Limpeza de um contorno vindo da união das paredes (perímetro externo): tira os "degraus" de poucos milímetros e os vértices que não
 * mudam de direção. Paredes que quase se alinham (1 cm de diferença, uma ponta que não fecha exata) deixam na união uma aresta de 2 mm e
 * vértices em reta; o contorno então tem duas arestas numa mesma reta (dois campos de inclinação no telhado) e, ao refazer uma linha à
 * mão, a ponta nova cai a 2 mm do vértice e o canto não fecha. O contorno automático não pode trazer isso.
 */

/** Aresta mais curta que isto (m) é um degrau de união, não um lado do desenho. */
export const RING_MICRO_EDGE = 0.01;
/** Giro (graus) abaixo do qual um vértice está numa reta. */
export const RING_STRAIGHT_DEG = 0.5;

const turnDeg = (a: Vec2, b: Vec2, c: Vec2): number => {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  return Math.abs((Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * 180) / Math.PI);
};

/**
 * `keep` marca vértices que não podem ser fundidos nem removidos (por exemplo os que estão sobre o arco de uma parede curva: o arco
 * amostrado tem giros pequenos que não são vértices em reta).
 */
export function cleanOutlineRing(ring: Ring, microEdge = RING_MICRO_EDGE, straightDeg = RING_STRAIGHT_DEG, keep?: (p: Vec2) => boolean): Ring {
  let r: Ring = [...ring];
  // vértice repetido de fechamento
  while (r.length > 1 && Math.hypot(r[0]!.x - r[r.length - 1]!.x, r[0]!.y - r[r.length - 1]!.y) <= 1e-9) r.pop();
  let changed = true;
  while (changed && r.length > 3) {
    changed = false;
    const n = r.length;
    // 1) aresta micro: funde as duas pontas no ponto médio e segue
    for (let i = 0; i < n; i++) {
      const a = r[i]!;
      const b = r[(i + 1) % n]!;
      if (Math.hypot(b.x - a.x, b.y - a.y) < microEdge && !(keep?.(a) && keep?.(b))) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const next = r.filter((_, k) => k !== i && k !== (i + 1) % n);
        // o ponto médio entra onde estava `a`
        const at = (i + 1) % n === 0 ? next.length : Math.min(i, next.length);
        next.splice(at, 0, mid);
        r = next;
        changed = true;
        break;
      }
    }
    if (changed) continue;
    // 2) vértice numa reta (giro desprezível)
    const m = r.length;
    for (let i = 0; i < m; i++) {
      if (turnDeg(r[(i - 1 + m) % m]!, r[i]!, r[(i + 1) % m]!) < straightDeg && !keep?.(r[i]!)) {
        r = r.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return r;
}
