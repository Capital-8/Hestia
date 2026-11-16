import { ringArea, type Vec2 } from '@hestia/geom';
import { casarMonotono } from './wallTiltCasar.ts';

/** Alinhamento dos anéis de nível ao anel vertical `raw` da camada (J2/D2/X1), separado de `wallTiltJoinLevel.ts` pelo limite de linhas. */
const wrapPi = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const RUN_TOL = 1e-7;
interface Run { s: number; len: number }
/** Trechos contíguos (cíclicos) de vértices à mesma distância do centro do arco: as faces de arco do anel. */
function runsOf(poly: readonly Vec2[], c: Vec2): Run[] {
  const n = poly.length;
  const r = poly.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
  let k0 = -1;
  for (let i = 0; i < n; i++) if (Math.abs(r[i]! - r[(i + n - 1) % n]!) >= RUN_TOL) { k0 = i; break; }
  if (k0 < 0) return [];
  const out: Run[] = [];
  let i = 0;
  while (i < n) {
    let len = 1;
    while (len < n && Math.abs(r[(k0 + i + len) % n]! - r[(k0 + i + len - 1) % n]!) < RUN_TOL) len++;
    if (len >= 2) out.push({ s: (k0 + i) % n, len });
    i += len;
  }
  return out;
}

/**
 * Leva o anel `ring` de um nível à contagem e à ordem de vértices de `raw` (anel vertical). Mesma contagem: índice a índice.
 * Contagem diferente (a grade das faces de arco depende do raio e do alcance): cada face de arco é reamostrada por fração
 * angular entre os cantos dela (cantos mantidos), as correntes entre faces casam por ordem (ou pelo vértice mais próximo)
 * e, sem faces de arco, vale o vértice mais próximo (como `alinhar`). null se o anel resultante é degenerado ou invertido.
 */
export function alinharNivel(raw: Vec2[], ring: Vec2[], c: Vec2 | null, memo?: { idx?: number[]; m?: number }, ancoras?: ReadonlyArray<{ raw: Vec2; nivel: Vec2 }>): Vec2[] | null {
  const n = raw.length, m = ring.length;
  const sg = Math.sign(ringArea(raw));
  const nearest = (p: Vec2, from: number, count: number): Vec2 => {
    let best = ring[from % m]!, d = Infinity;
    for (let k = 0; k < count; k++) { const q = ring[(from + k) % m]!; const e = Math.hypot(q.x - p.x, q.y - p.y); if (e < d) { d = e; best = q; } }
    return best;
  };
  let out: Vec2[];
  const rr = c ? runsOf(raw, c) : [], lr = c ? runsOf(ring, c) : [];
  if (m === n && !ancoras?.length) out = ring;
  else if (c && rr.length > 0 && rr.length === lr.length) {
    out = new Array<Vec2>(n);
    for (let k = 0; k < rr.length; k++) {
      const A = rr[k]!, B = lr[k]!;
      const ang = (poly: readonly Vec2[], i: number): number => Math.atan2(poly[i % poly.length]!.y - c.y, poly[i % poly.length]!.x - c.x);
      const cum = (poly: readonly Vec2[], run: Run): number[] => {
        const o = [0];
        for (let j = 1; j < run.len; j++) o.push(o[j - 1]! + wrapPi(ang(poly, run.s + j) - ang(poly, run.s + j - 1)));
        return o;
      };
      const ca = cum(raw, A), cb = cum(ring, B);
      const ta = ca[A.len - 1]!, tb = cb[B.len - 1]!;
      const phi0 = ang(ring, B.s), rho = Math.hypot(ring[B.s % m]!.x - c.x, ring[B.s % m]!.y - c.y);
      // Âncoras (X1): cantos da face e pontas de corda (corte do ramo sobre a face), cada uma com a posição que tem NO nível. Entre duas âncoras a
      // reamostragem é por fração angular; sem âncora interna é a de sempre (de canto a canto).
      const anc: Array<{ j: number; p: Vec2 }> = [{ j: 0, p: ring[B.s % m]! }];
      for (let j = 1; j < A.len - 1; j++) {
        const rv = raw[(A.s + j) % n]!;
        const a = ancoras?.find((q) => Math.hypot(q.raw.x - rv.x, q.raw.y - rv.y) < 1e-6);
        if (a) anc.push({ j, p: a.nivel });
      }
      anc.push({ j: A.len - 1, p: ring[(B.s + B.len - 1) % m]! });
      for (let g = 0; g + 1 < anc.length; g++) {
        const a0 = anc[g]!, a1 = anc[g + 1]!;
        const interna = anc.length > 2;
        const f0 = Math.atan2(a0.p.y - c.y, a0.p.x - c.x);
        const span = interna ? wrapPi(Math.atan2(a1.p.y - c.y, a1.p.x - c.x) - f0) : tb;
        const base0 = interna ? f0 : phi0;
        const r0 = interna ? Math.hypot(a0.p.x - c.x, a0.p.y - c.y) : rho;
        const dca = ca[a1.j]! - ca[a0.j]!;
        for (let j = a0.j; j <= a1.j; j++) {
          const i = (A.s + j) % n;
          if (j === a0.j) { out[i] = a0.p; continue; }
          if (j === a1.j) { out[i] = a1.p; continue; }
          const lam = Math.abs(interna ? dca : ta) < 1e-12 ? (j - a0.j) / (a1.j - a0.j) : interna ? (ca[j]! - ca[a0.j]!) / dca : ca[j]! / ta;
          out[i] = { x: c.x + r0 * Math.cos(base0 + lam * span), y: c.y + r0 * Math.sin(base0 + lam * span) };
        }
      }
      // Corrente entre esta face e a seguinte (vértices fora de qualquer face).
      const An = rr[(k + 1) % rr.length]!, Bn = lr[(k + 1) % lr.length]!;
      const na = (An.s - (A.s + A.len) + 2 * n) % n, nb = (Bn.s - (B.s + B.len) + 2 * m) % m;
      for (let j = 0; j < na; j++) {
        const i = (A.s + A.len + j) % n;
        out[i] = na === nb ? ring[(B.s + B.len + j) % m]! : nb > 0 ? nearest(raw[i]!, B.s + B.len, nb) : nearest(raw[i]!, 0, m);
      }
    }
    if (out.some((q) => !q)) return null;
  } else if (m === n) out = ring;
  else if (memo) {
    // Sem faces de arco: casamento monótono feito na base (anel ≈ raw) e reaproveitado nos níveis acima (mesma contagem).
    if (!memo.idx || memo.m !== m) { memo.idx = casarMonotono(raw, ring); memo.m = m; }
    out = memo.idx.map((j) => ring[j]!);
  } else out = raw.map((r) => nearest(r, 0, m));
  const a = ringArea(out);
  return Number.isFinite(a) && Math.sign(a) === sg && Math.abs(a) > 1e-9 && out.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y)) ? out : null;
}

