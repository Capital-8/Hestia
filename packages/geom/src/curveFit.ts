import type { Vec2 } from './vec.ts';

/** Arco tangente no formato da parede: flecha em metros, positiva à esquerda de a→b, |sag| ≤ corda/2. */
export interface ArcoAjustado {
  a: Vec2;
  b: Vec2;
  sag: number;
}

export type CurvaAjustavel =
  | { tipo: 'elipse'; centro: Vec2; rx: number; ry: number; rotacao?: number }
  /** Spline interpoladora cúbica centrípeta (Catmull-Rom) pelos pontos; `fechada` liga o último ao primeiro. */
  | { tipo: 'spline'; pontos: Vec2[]; fechada?: boolean };

export interface AvisoAjuste {
  codigo: 'max-arcos' | 'raio-pequeno' | 'entrada-invalida';
  mensagem: string;
}

export interface ResultadoAjuste {
  arcos: ArcoAjustado[];
  avisos: AvisoAjuste[];
  /** Desvio máximo estimado curva×arcos (m). */
  desvio: number;
}

export const TOL_PADRAO = 0.005;
export const MAX_ARCOS_PADRAO = 64;

interface Amostra {
  p: Vec2;
  t: Vec2;
}
interface Curva {
  spans: number;
  at: (u: number) => Amostra;
}
interface Biarco {
  arcos: [ArcoAjustado, ArcoAjustado];
  centros: [Vec2, Vec2];
}
interface Seg {
  u0: number;
  u1: number;
  b: Biarco | null;
  err: number;
}

const unit = (v: Vec2): Vec2 => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const ptDist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function curvaElipse(rx: number, ry: number): Curva {
  return {
    spans: 1,
    at: (u) => {
      const th = (u * Math.PI) / 2;
      return { p: { x: rx * Math.cos(th), y: ry * Math.sin(th) }, t: unit({ x: -rx * Math.sin(th), y: ry * Math.cos(th) }) };
    },
  };
}

/** Catmull-Rom centrípeta convertida em Béziers cúbicas (uma por vão), com tangente analítica. */
function curvaSpline(pts: Vec2[], fechada: boolean): Curva {
  const n = pts.length;
  const get = (i: number): Vec2 => {
    if (fechada) return pts[((i % n) + n) % n]!;
    if (i < 0) return { x: 2 * pts[0]!.x - pts[1]!.x, y: 2 * pts[0]!.y - pts[1]!.y };
    if (i > n - 1) return { x: 2 * pts[n - 1]!.x - pts[n - 2]!.x, y: 2 * pts[n - 1]!.y - pts[n - 2]!.y };
    return pts[i]!;
  };
  const spans = fechada ? n : n - 1;
  const bez: Vec2[][] = [];
  for (let i = 0; i < spans; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const t1 = Math.sqrt(ptDist(p0, p1)), t2 = Math.sqrt(ptDist(p1, p2)), t3 = Math.sqrt(ptDist(p2, p3));
    const d01 = t1, d12 = t2, d23 = t3;
    const m = (a: Vec2, b: Vec2, c: Vec2, da: number, db: number, dc: number): Vec2 => ({
      x: (b.x - a.x) / da - (c.x - a.x) / (da + db) + (c.x - b.x) / db + 0 * dc,
      y: (b.y - a.y) / da - (c.y - a.y) / (da + db) + (c.y - b.y) / db,
    });
    const m1 = m(p0, p1, p2, d01, d12, 0);
    const m2 = m(p1, p2, p3, d12, d23, 0);
    const k = d12 / 3;
    bez.push([p1, { x: p1.x + m1.x * k, y: p1.y + m1.y * k }, { x: p2.x - m2.x * k, y: p2.y - m2.y * k }, p2]);
  }
  return {
    spans,
    at: (u) => {
      const i = Math.min(spans - 1, Math.max(0, Math.floor(u)));
      const s = u - i;
      const [b0, b1, b2, b3] = bez[i]!;
      const w = 1 - s;
      const p = {
        x: w * w * w * b0!.x + 3 * w * w * s * b1!.x + 3 * w * s * s * b2!.x + s * s * s * b3!.x,
        y: w * w * w * b0!.y + 3 * w * w * s * b1!.y + 3 * w * s * s * b2!.y + s * s * s * b3!.y,
      };
      const d = {
        x: 3 * w * w * (b1!.x - b0!.x) + 6 * w * s * (b2!.x - b1!.x) + 3 * s * s * (b3!.x - b2!.x),
        y: 3 * w * w * (b1!.y - b0!.y) + 6 * w * s * (b2!.y - b1!.y) + 3 * s * s * (b3!.y - b2!.y),
      };
      return { p, t: unit(d) };
    },
  };
}

/** Arco de a até b que sai de a com tangente `t0`; devolve null se passaria de 180°. */
function arcoTangente(a: Vec2, b: Vec2, t0: Vec2): ArcoAjustado | null {
  const c = ptDist(a, b);
  if (c < 1e-12) return null;
  const ux = (b.x - a.x) / c, uy = (b.y - a.y) / c;
  const alfa = Math.atan2(t0.x * uy - t0.y * ux, t0.x * ux + t0.y * uy); // de T0 para a corda, anti-horário positivo
  if (Math.abs(alfa) > Math.PI / 2 + 1e-12) return null;
  return { a, b, sag: -(c / 2) * Math.tan(alfa / 2) };
}

/** Biarco de p0 a p1 com tangentes dadas; `q` (0..1) posiciona o ponto de junção entre os dois arcos. */
function biarco(s0: Amostra, s1: Amostra, q: number): Biarco | null {
  const { p: p0, t: t0 } = s0;
  const { p: p1, t: t1 } = s1;
  const v = { x: p1.x - p0.x, y: p1.y - p0.y };
  const u = { x: q * t0.x + (1 - q) * t1.x, y: q * t0.y + (1 - q) * t1.y };
  // |v - L u|^2 = L^2  =>  (|u|^2 - 1) L^2 - 2 (v.u) L + v.v = 0, com L = d1 + d2.
  const qa = u.x * u.x + u.y * u.y - 1;
  const qb = -2 * (v.x * u.x + v.y * u.y);
  const qc = v.x * v.x + v.y * v.y;
  let L: number;
  if (Math.abs(qa) < 1e-14) {
    if (qb >= 0) return null;
    L = -qc / qb;
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const r1 = (-qb + sq) / (2 * qa), r2 = (-qb - sq) / (2 * qa);
    L = Math.min(...[r1, r2].filter((x) => x > 0));
  }
  if (!(L > 0) || !Number.isFinite(L)) return null;
  const pa = { x: p0.x + q * L * t0.x, y: p0.y + q * L * t0.y };
  const pb = { x: p1.x - (1 - q) * L * t1.x, y: p1.y - (1 - q) * L * t1.y };
  const j = { x: pa.x + q * (pb.x - pa.x), y: pa.y + q * (pb.y - pa.y) };
  const a1 = arcoTangente(p0, j, t0);
  // O segundo arco, percorrido ao contrário, sai de p1 com tangente -t1.
  const a2r = arcoTangente(p1, j, { x: -t1.x, y: -t1.y });
  if (!a1 || !a2r) return null;
  const a2: ArcoAjustado = { a: j, b: p1, sag: -a2r.sag };
  return { arcos: [a1, a2], centros: [j, j] };
}

function distArco(p: Vec2, arc: ArcoAjustado): number {
  const cx = arc.b.x - arc.a.x, cy = arc.b.y - arc.a.y;
  const c = Math.hypot(cx, cy);
  const h = Math.abs(arc.sag);
  const segDist = () => {
    const l2 = cx * cx + cy * cy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - arc.a.x) * cx + (p.y - arc.a.y) * cy) / l2));
    return Math.hypot(p.x - (arc.a.x + t * cx), p.y - (arc.a.y + t * cy));
  };
  if (h < 1e-9) return segDist();
  const r = (c * c) / 4 / (2 * h) + h / 2;
  const s = arc.sag > 0 ? 1 : -1;
  const nx = -cy / c, ny = cx / c;
  const mx = (arc.a.x + arc.b.x) / 2, my = (arc.a.y + arc.b.y) / 2;
  const ctr = { x: mx + nx * (h - r) * s, y: my + ny * (h - r) * s };
  const ang = (q: Vec2) => Math.atan2(q.y - ctr.y, q.x - ctr.x);
  const a0 = ang(arc.a);
  const sweepMag = 2 * Math.asin(Math.min(1, c / (2 * r)));
  const dir = s > 0 ? -1 : 1;
  let rel = (ang(p) - a0) * dir;
  rel = ((rel % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (rel <= sweepMag) return Math.abs(Math.hypot(p.x - ctr.x, p.y - ctr.y) - r);
  return Math.min(ptDist(p, arc.a), ptDist(p, arc.b));
}

/** Distância ponto×polilinha; `piso`: se a distância já cair abaixo dele, devolve cedo (não alteraria um máximo). */
function distPoli(p: Vec2, poly: Vec2[], piso = 0): number {
  let best2 = Infinity;
  const piso2 = piso * piso;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i]!, b = poly[i + 1]!;
    const px = p.x - a.x, py = p.y - a.y;
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / l2));
    const ex = px - t * dx, ey = py - t * dy;
    const d2 = ex * ex + ey * ey;
    if (d2 < best2) {
      best2 = d2;
      if (best2 <= piso2) break;
    }
  }
  return Math.sqrt(best2);
}

function pontoArco(arc: ArcoAjustado, f: number): Vec2 {
  const cx = arc.b.x - arc.a.x, cy = arc.b.y - arc.a.y;
  const c = Math.hypot(cx, cy);
  const h = Math.abs(arc.sag);
  if (h < 1e-9) return { x: arc.a.x + cx * f, y: arc.a.y + cy * f };
  const r = (c * c) / 4 / (2 * h) + h / 2;
  const s = arc.sag > 0 ? 1 : -1;
  const nx = -cy / c, ny = cx / c;
  const ctr = { x: (arc.a.x + arc.b.x) / 2 + nx * (h - r) * s, y: (arc.a.y + arc.b.y) / 2 + ny * (h - r) * s };
  const sweep = 2 * Math.asin(Math.min(1, c / (2 * r))) * (s > 0 ? -1 : 1);
  const th = Math.atan2(arc.a.y - ctr.y, arc.a.x - ctr.x) + sweep * f;
  return { x: ctr.x + r * Math.cos(th), y: ctr.y + r * Math.sin(th) };
}

const QS = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.45, 0.55, 0.35, 0.65, 0.25, 0.75];
const QS_FINO = [-0.025, 0.025, -0.0125, 0.0125];

/** `corte`: ao ultrapassar o erro já é pior que o melhor atual, aborta (o chamador o descartaria de qualquer modo). */
function avaliarQ(s0: Amostra, s1: Amostra, poly: Vec2[], q: number, corte = Infinity): { b: Biarco; err: number } | null {
  const b = biarco(s0, s1, q);
  if (!b) return null;
  let err = 0;
  for (let i = 1; i < 32; i++) {
    const p = poly[i * 4]!;
    err = Math.max(err, Math.min(distArco(p, b.arcos[0]), distArco(p, b.arcos[1])));
    if (err >= corte) return null;
  }
  for (const arc of b.arcos) {
    for (let i = 0; i <= 32; i++) {
      err = Math.max(err, distPoli(pontoArco(arc, i / 32), poly, err));
      if (err >= corte) return null;
    }
  }
  return { b, err };
}

function avaliar(curva: Curva, u0: number, u1: number): Seg {
  const s0 = curva.at(u0), s1 = curva.at(u1);
  const poly: Vec2[] = [];
  for (let i = 0; i <= 128; i++) poly.push(curva.at(u0 + ((u1 - u0) * i) / 128).p);
  let melhor: Seg = { u0, u1, b: null, err: Infinity };
  let qm = 0.5;
  const tentar = (q: number) => {
    const r = avaliarQ(s0, s1, poly, q, melhor.err - 1e-12);
    if (r && r.err < melhor.err - 1e-12) {
      melhor = { u0, u1, b: r.b, err: r.err };
      qm = q;
    }
  };
  for (const q of QS) tentar(q);
  const q0 = qm;
  for (const dq of QS_FINO) tentar(q0 + dq);
  return melhor;
}

const FRACOES = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
const FRACOES_FINO = [-0.04, 0.04, -0.02, 0.02];

/** Refina por bisseção do pior segmento até atingir `tol` ou o limite de segmentos. */
function ajustarVaos(curva: Curva, u0: number, u1: number, tol: number, maxSeg: number): { segs: Seg[]; estourou: boolean } {
  const segs: Seg[] = [];
  for (let u = u0; u < u1; u++) segs.push(avaliar(curva, u, u + 1));
  let estourou = false;
  for (;;) {
    let wi = -1;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]!;
      if (s.err > tol && s.u1 - s.u0 > 1e-6 && (wi < 0 || s.err > segs[wi]!.err)) wi = i;
    }
    if (wi < 0) break;
    if (segs.length >= maxSeg) {
      estourou = true;
      break;
    }
    const s = segs[wi]!;
    let par: [Seg, Seg] | null = null;
    let pior = Infinity;
    let fm = 0.5;
    const tentar = (f: number) => {
      const m = s.u0 + (s.u1 - s.u0) * f;
      const c0 = avaliar(curva, s.u0, m);
      if (!(c0.err < pior - 1e-12)) return; // já não bate o melhor par: poupa a 2ª metade
      const c: [Seg, Seg] = [c0, avaliar(curva, m, s.u1)];
      const e = Math.max(c[0].err, c[1].err);
      if (e < pior - 1e-12) {
        pior = e;
        par = c;
        fm = f;
      }
    };
    for (const f of FRACOES) tentar(f);
    const f0 = fm;
    for (const df of FRACOES_FINO) tentar(f0 + df);
    segs.splice(wi, 1, ...par!);
  }
  return { segs, estourou };
}

const arcosDe = (segs: Seg[]): ArcoAjustado[] => segs.flatMap((s) => (s.b ? s.b.arcos : []));

/**
 * Ajusta a curva a uma cadeia de arcos tangentes (biarcos, bisseção recursiva). Pura e determinística.
 * Nunca lança: ao bater `maxArcos` devolve o melhor ajuste e o aviso `max-arcos`.
 * Elipse: ajusta um quadrante e espelha, então o total é múltiplo de 8 e simétrico nos dois eixos.
 */
export function fitArcs(
  curva: CurvaAjustavel,
  tol: number = TOL_PADRAO,
  maxArcos: number = MAX_ARCOS_PADRAO,
  opcoes: { espessura?: number } = {},
): ResultadoAjuste {
  const avisos: AvisoAjuste[] = [];
  const invalido = (m: string): ResultadoAjuste => ({ arcos: [], avisos: [{ codigo: 'entrada-invalida', mensagem: m }], desvio: 0 });
  let arcos: ArcoAjustado[] = [];
  let estourou = false;
  let desvio = 0;

  if (curva.tipo === 'elipse') {
    const { centro, rx, ry } = curva;
    if (!(rx > 0) || !(ry > 0)) return invalido('elipse com semieixo nulo');
    const r = ajustarVaos(curvaElipse(rx, ry), 0, 1, tol, Math.max(1, Math.floor(maxArcos / 8)));
    estourou = r.estourou;
    desvio = Math.max(...r.segs.map((s) => s.err));
    const q0 = arcosDe(r.segs); // (rx,0) -> (0,ry)
    const sx = (p: Vec2): Vec2 => ({ x: -p.x, y: p.y });
    const neg = (p: Vec2): Vec2 => ({ x: -p.x, y: -p.y });
    const q1 = q0.map((s) => ({ a: sx(s.b), b: sx(s.a), sag: s.sag })).reverse(); // (0,ry) -> (-rx,0)
    const q2 = q0.map((s) => ({ a: neg(s.a), b: neg(s.b), sag: s.sag })); // (-rx,0) -> (0,-ry)
    const q3 = q1.map((s) => ({ a: neg(s.a), b: neg(s.b), sag: s.sag })); // (0,-ry) -> (rx,0)
    const rot = curva.rotacao ?? 0;
    const co = Math.cos(rot), si = Math.sin(rot);
    const tf = (p: Vec2): Vec2 => ({ x: centro.x + p.x * co - p.y * si, y: centro.y + p.x * si + p.y * co });
    arcos = [...q0, ...q1, ...q2, ...q3].map((s) => ({ a: tf(s.a), b: tf(s.b), sag: s.sag }));
  } else {
    const pts: Vec2[] = [];
    for (const p of curva.pontos) if (!pts.length || ptDist(p, pts[pts.length - 1]!) > 1e-9) pts.push(p);
    const fechada = !!curva.fechada;
    if (fechada && pts.length > 1 && ptDist(pts[0]!, pts[pts.length - 1]!) < 1e-9) pts.pop();
    if (pts.length < (fechada ? 3 : 2)) return invalido('pontos insuficientes para a spline');
    const c = curvaSpline(pts, fechada);
    const r = ajustarVaos(c, 0, c.spans, tol, Math.max(c.spans, Math.floor(maxArcos / 2)));
    estourou = r.estourou;
    desvio = Math.max(...r.segs.map((s) => s.err));
    arcos = arcosDe(r.segs);
  }

  if (estourou) {
    avisos.push({ codigo: 'max-arcos', mensagem: `limite de ${maxArcos} arcos atingido; desvio ${Math.round(desvio * 100000) / 100} mm` });
  }
  if (opcoes.espessura !== undefined) {
    const lim = opcoes.espessura / 2 + 0.01;
    arcos.forEach((s, i) => {
      const h = Math.abs(s.sag);
      if (h < 1e-9) return;
      const c = ptDist(s.a, s.b);
      const raio = (c * c) / 4 / (2 * h) + h / 2;
      if (raio < lim) avisos.push({ codigo: 'raio-pequeno', mensagem: `arco ${i}: raio ${Math.round(raio * 1000) / 1000} m menor que t/2 + 1 cm` });
    });
  }
  return { arcos, avisos, desvio };
}
