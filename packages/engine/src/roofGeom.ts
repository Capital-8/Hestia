import { closestOnSegment, cross, dist, dot, intersectSegments, pointInMulti, ringArea, sub, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';

/** Distância (1e-7 m) para um ponto contar como sobre a borda de uma água (divisa, beiral, furo). */
export const EDGE_TOL = 1e-7;
/** Área abaixo disso (1 mm quadrado) não forma água. */
export const WATER_MIN_AREA = 1e-6;

export const unitOf = (v: Vec2): Vec2 | null => {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-12 ? null : { x: v.x / l, y: v.y / l };
};

/** Normal à esquerda de um vetor (rotação de +90°); para anel anti-horário aponta para dentro. */
export const perpOf = (v: Vec2): Vec2 => ({ x: -v.y, y: v.x });

/** Anel no sentido anti-horário (área positiva). */
export const ccwRing = (r: Ring): Ring => (ringArea(r) < 0 ? [...r].reverse() : r);

/**
 * Sanitiza um MultiPolygon antes do 3D/divisas: simplifica cada anel (remove vértices duplicados consecutivos e
 * colineares/espigões degenerados), descarta anéis externos e furos com área `<= WATER_MIN_AREA` e garante orientação
 * anti-horária nos anéis externos e horária nos furos.
 */
export function sanitizeMulti(m: MultiPolygon): MultiPolygon {
  const out: MultiPolygon = [];
  for (const poly of m) {
    if (!poly[0]) continue;
    const outer = simplifyRing(poly[0]);
    if (outer.length < 3 || Math.abs(ringArea(outer)) <= WATER_MIN_AREA) continue;
    const cleanOuter = ringArea(outer) < 0 ? [...outer].reverse() : outer;
    const holes: Ring[] = [];
    for (let i = 1; i < poly.length; i++) {
      const h = simplifyRing(poly[i]!);
      if (h.length < 3 || Math.abs(ringArea(h)) <= WATER_MIN_AREA) continue;
      holes.push(ringArea(h) > 0 ? [...h].reverse() : h);
    }
    out.push([cleanOuter, ...holes]);
  }
  return out;
}

/** Anel sem vértices repetidos nem vértices no meio de trechos retos. */
export function simplifyRing(r: Ring): Ring {
  let ring: Ring = [];
  for (const p of r) {
    const last = ring[ring.length - 1];
    if (!last || dist(last, p) > 1e-9) ring.push(p);
  }
  while (ring.length > 1 && dist(ring[0]!, ring[ring.length - 1]!) <= 1e-9) ring.pop();
  let changed = true;
  while (changed && ring.length > 3) {
    changed = false;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = ring[(i - 1 + n) % n]!;
      const b = ring[i]!;
      const c = ring[(i + 1) % n]!;
      const ab = sub(b, a);
      const bc = sub(c, b);
      const scale = Math.hypot(ab.x, ab.y) * Math.hypot(bc.x, bc.y);
      if (scale > 0 && Math.abs(cross(ab, bc)) / scale < 1e-9) {
        ring = ring.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return ring;
}

/** Anel convexo (já anti-horário e sem vértices colineares): todas as curvas viram para o mesmo lado. */
export function isConvexRing(r: Ring): boolean {
  const n = r.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const ab = sub(r[(i + 1) % n]!, r[i]!);
    const bc = sub(r[(i + 2) % n]!, r[(i + 1) % n]!);
    const scale = Math.hypot(ab.x, ab.y) * Math.hypot(bc.x, bc.y);
    if (scale > 0 && cross(ab, bc) / scale < -1e-9) return false;
  }
  return true;
}

/** Recorte de polígono convexo pelo semiplano A·x + B·y ≤ C (Sutherland–Hodgman). */
export function clipHalfPlane(poly: Vec2[], A: number, B: number, C: number): Vec2[] {
  const f = (p: Vec2): number => A * p.x + B * p.y - C;
  const out: Vec2[] = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    const fp = f(p);
    const fq = f(q);
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  });
  return out;
}

/** Distância do ponto à borda mais próxima de um multipolígono. */
export function boundaryDistance(m: MultiPolygon, p: Vec2): number {
  let best = Infinity;
  for (const poly of m) {
    for (const ring of poly) {
      ring.forEach((a, i) => {
        best = Math.min(best, dist(p, closestOnSegment(p, a, ring[(i + 1) % ring.length]!)));
      });
    }
  }
  return best;
}

/** O ponto está numa água: dentro dela ou sobre a borda (dentro da tolerância). */
export const planeHas = (m: MultiPolygon, p: Vec2): boolean => pointInMulti(p, m) || boundaryDistance(m, p) <= EDGE_TOL;

/**
 * Trechos de p–q que coincidem com arestas de B colineares à reta (dentro de 1e-7 e com sobreposição de comprimento),
 * em ordem de p para q. Quem decide o que o trecho significa é quem chama.
 */
export function segmentOverlaps(p: Vec2, q: Vec2, B: MultiPolygon): Array<[Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2]> = [];
  const L = dist(p, q);
  if (L < 1e-9) return out;
  const u = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
  for (const rb of B) {
    for (const ringB of rb) {
      ringB.forEach((r, j) => {
        const s = ringB[(j + 1) % ringB.length]!;
        if (Math.abs(cross(u, sub(r, p))) > EDGE_TOL || Math.abs(cross(u, sub(s, p))) > EDGE_TOL) return;
        const tr = dot(sub(r, p), u);
        const ts = dot(sub(s, p), u);
        const lo = Math.max(0, Math.min(tr, ts));
        const hi = Math.min(L, Math.max(tr, ts));
        if (hi - lo > EDGE_TOL) out.push([{ x: p.x + u.x * lo, y: p.y + u.y * lo }, { x: p.x + u.x * hi, y: p.y + u.y * hi }]);
      });
    }
  }
  return out;
}

/**
 * Trechos de borda em comum entre duas áreas: segmentos colineares que se sobrepõem (mesma reta, dentro de 1e-7).
 * Cada par de arestas colineares dá um trecho; quem decide se é divisa interna é quem chama.
 */
export function collinearOverlaps(A: MultiPolygon, B: MultiPolygon): Array<[Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2]> = [];
  for (const ra of A) {
    for (const ringA of ra) {
      ringA.forEach((p, i) => out.push(...segmentOverlaps(p, ringA[(i + 1) % ringA.length]!, B)));
    }
  }
  return out;
}

/** Pontos onde o segmento a→b cruza as arestas de um multipolígono, como parâmetros t em [0, 1] (com os extremos). */
export function crossingParams(a: Vec2, b: Vec2, m: MultiPolygon): number[] {
  const ts = [0, 1];
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  for (const poly of m) {
    for (const ring of poly) {
      ring.forEach((c, i) => {
        const x = intersectSegments(a, b, c, ring[(i + 1) % ring.length]!);
        if (x && l2 > 0) ts.push(Math.min(1, Math.max(0, dot(sub(x, a), ab) / l2)));
      });
    }
  }
  return ts.sort((x, y) => x - y);
}
