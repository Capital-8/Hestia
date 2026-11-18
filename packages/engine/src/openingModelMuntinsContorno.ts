import { ringSignedArea, type OpeningMuntinKind, type OPt, type OpeningShape } from '@hestia/model';
import type { OpeningPart } from './openingModelTypes.ts';
import { prisma } from './openingModelPrisma.ts';
import { clipConvexo, convexo } from './openingModelContornoCorrer.ts';

/*
 * Divisões decorativas do vidro em vão com forma (docs/estudo-esquadrias/28 §6). As barras são faixas retas (ou polilinhas de
 * arco) de 25 mm, prismas `tz` recortados pelo POLÍGONO DO VIDRO, que já é o contorno recuado. Cada desenho:
 * - colonial: `cols - 1` montantes inteiros e `rows - 1` travessas partidas entre os montantes (sem sobreposição);
 * - mullions (montantes): só os `cols - 1` montantes;
 * - cross (cruz): um montante central e uma travessa na cota do arranque do arco (no meio do vidro se o arranque não cai nele);
 * - prairie: filete que acompanha o contorno do vidro recuado (margem de 1/5 do menor lado, 5 a 12 cm), em duas metades;
 * - diamond (losango): duas famílias de diagonais pela malha `cols x rows` (os nós se sobrepõem: o volume conta cada barra);
 * - fan (leque): `cols - 1` raios a partir do centro do arco e, com `rows > 1`, `rows - 1` arcos concêntricos.
 * O desenho substitui a grade `grid` (muntins `muntin-*`) quando `on = 'all'`; `colonial` com `on = 'all'` deixa a grade existente
 * (já recortada pelo contorno). Vidro não convexo (arco com prateleira) fica sem divisões.
 */

export interface MuntinPadrao {
  kind: OpeningMuntinKind;
  cols: number;
  rows: number;
  on: 'all' | 'transom';
}

const HALF = 0.0125;
const FOLGA = 1e-3;

const bboxOf = (r: readonly OPt[]): { t0: number; t1: number; z0: number; z1: number } => ({
  t0: Math.min(...r.map((p) => p[0])),
  t1: Math.max(...r.map((p) => p[0])),
  z0: Math.min(...r.map((p) => p[1])),
  z1: Math.max(...r.map((p) => p[1])),
});

/** Faixa de largura `w` ao longo da polilinha (juntas em meia-esquadria, limitada a 2x); anel anti-horário. */
export function fita(pts: readonly OPt[], w = 2 * HALF): OPt[] {
  const n = pts.length;
  const normal = (a: OPt, b: OPt): OPt => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
  };
  const lados = (s: number): OPt[] =>
    pts.map((p, i) => {
      const a = normal(pts[Math.max(0, i - 1)]!, pts[Math.min(n - 1, i)]!);
      const b = normal(pts[Math.max(0, i)]!, pts[Math.min(n - 1, i + 1)]!);
      let nx = a[0] + b[0];
      let nz = a[1] + b[1];
      const l = Math.hypot(nx, nz) || 1;
      nx /= l;
      nz /= l;
      const ref = b[0] === 0 && b[1] === 0 ? a : b; // nas pontas só há um segmento
      const cos = Math.max(0.5, nx * ref[0] + nz * ref[1]);
      return [p[0] + (s * (w / 2) * nx) / cos, p[1] + (s * (w / 2) * nz) / cos];
    });
  const ring = [...lados(-1), ...lados(1).reverse()];
  return ringSignedArea(ring) >= 0 ? ring : ring.reverse();
}

/** Margem para dentro de um anel convexo anti-horário: o anel recortado pelos semiplanos das arestas deslocados em `m`. */
function recuoConvexo(ring: readonly OPt[], m: number): OPt[] {
  let r: OPt[] = [...ring];
  for (let i = 0; i < ring.length && r.length >= 3; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l < 1e-9) continue;
    const nx = -(b[1] - a[1]) / l;
    const nz = (b[0] - a[0]) / l;
    const a2: OPt = [a[0] + nx * m, a[1] + nz * m];
    const b2: OPt = [b[0] + nx * m, b[1] + nz * m];
    r = clipConvexo(r, [a2, b2, [b2[0] + 1e3 * nx, b2[1] + 1e3 * nz], [a2[0] + 1e3 * nx, a2[1] + 1e3 * nz]]);
  }
  return r;
}

/** Centro do arco e raio até o topo do contorno (raios do leque e arcos concêntricos). */
function centroDoArco(shape: OpeningShape): { cx: number; cz: number } {
  const w = shape.width;
  const h = shape.height;
  if (shape.kind === 'circle') return { cx: 0, cz: h / 2 };
  if (shape.kind === 'round') return { cx: 0, cz: h - w / 2 };
  if (shape.kind === 'segmental') return { cx: 0, cz: h - (w * w / 4 + shape.rise * shape.rise) / (2 * shape.rise) };
  if (shape.kind === 'pointed') return { cx: 0, cz: h - shape.rise };
  if (shape.kind === 'horseshoe') return { cx: 0, cz: h - w / 2 };
  return { cx: 0, cz: h / 2 };
}

type Caixa = ReturnType<typeof bboxOf>;

/** Montantes (inteiros) e travessas (partidas entre montantes) de uma malha com `xs` e `zs` dados. */
function malha(c: Caixa, xs: readonly number[], zs: readonly number[]): OPt[][] {
  const out: OPt[][] = [];
  for (const x of xs) out.push(fita([[x, c.z0 - FOLGA], [x, c.z1 + FOLGA]]));
  for (const z of zs) {
    const lim = [c.t0 - FOLGA, ...xs.flatMap((x) => [x - HALF, x + HALF]), c.t1 + FOLGA];
    for (let k = 0; k + 1 < lim.length; k += 2) if (lim[k + 1]! - lim[k]! > 1e-6) out.push(fita([[lim[k]!, z], [lim[k + 1]!, z]]));
  }
  return out;
}

const iguais = (a: number, b: number, n: number): number[] => Array.from({ length: n - 1 }, (_, i) => a + ((b - a) * (i + 1)) / n);

/** Barras (anéis antes do recorte) do desenho pedido para um vidro de contorno `ring`. */
function barras(pad: MuntinPadrao, shape: OpeningShape, ring: readonly OPt[]): OPt[][] {
  const c = bboxOf(ring);
  const Wg = c.t1 - c.t0;
  const Hg = c.z1 - c.z0;
  const { cx, cz } = centroDoArco(shape);
  const tc = (c.t0 + c.t1) / 2;
  switch (pad.kind) {
    case 'mullions':
      return malha(c, iguais(c.t0, c.t1, pad.cols), []);
    case 'colonial':
      return malha(c, iguais(c.t0, c.t1, pad.cols), iguais(c.z0, c.z1, pad.rows));
    case 'cross': {
      const zh = cz > c.z0 + 0.02 && cz < c.z1 - 0.02 ? cz : (c.z0 + c.z1) / 2;
      return malha(c, [tc], [zh]);
    }
    case 'prairie': {
      const dentro = recuoConvexo(ring, Math.min(0.12, Math.max(0.05, Math.min(Wg, Hg) / 5)));
      if (dentro.length < 3) return [];
      const m = Math.floor(dentro.length / 2);
      return [fita([...dentro.slice(0, m + 1)]), fita([...dentro.slice(m), dentro[0]!])];
    }
    case 'diamond': {
      const pw = Wg / pad.cols;
      const out: OPt[][] = [];
      const reta = (x0: number, x1: number): void => {
        const d: OPt = [x1 - x0, Hg];
        out.push(fita([[x0 - 0.05 * d[0], c.z0 - 0.05 * d[1]], [x1 + 0.05 * d[0], c.z1 + 0.05 * d[1]]].map((p) => [p[0]!, p[1]!] as OPt)));
      };
      for (let k = 1; k <= pad.cols + pad.rows - 1; k++) reta(c.t0 + k * pw, c.t0 + (k - pad.rows) * pw);
      for (let k = -(pad.rows - 1); k <= pad.cols - 1; k++) reta(c.t0 + k * pw, c.t0 + (k + pad.rows) * pw);
      return out;
    }
    case 'fan': {
      const circ = shape.kind === 'circle';
      const n = Math.max(2, pad.cols);
      const total = circ ? 2 * n : n;
      const gap = (circ ? 2 * Math.PI : Math.PI) / total;
      const alcance = Math.max(...ring.map((p) => Math.hypot(p[0] - cx, p[1] - cz))) + 0.01;
      const r0 = Math.min(alcance * 0.5, HALF / Math.sin(gap / 2) + 1e-4);
      const esc = circ ? shape.height / shape.width : 1;
      const out: OPt[][] = [];
      for (let k = circ ? 0 : 1; k < (circ ? total : n); k++) {
        const a = k * gap;
        const p = (r: number): OPt => [cx + r * Math.cos(a), cz + r * Math.sin(a) * esc];
        out.push(fita([p(r0), p(alcance)]));
      }
      const topo = c.z1 - cz;
      for (let j = 1; j < pad.rows; j++) {
        const rho = (topo * j) / pad.rows / esc;
        const pts: OPt[] = Array.from({ length: 33 }, (_, i): OPt => {
          const a = (i / 32) * (circ ? 2 * Math.PI : Math.PI);
          return [cx + rho * Math.cos(a), cz + rho * Math.sin(a) * esc];
        });
        out.push(fita(circ ? pts.slice(0, 32) : pts));
      }
      return out;
    }
  }
}

/** Anel do vidro: o polígono `tz` ou a caixa. */
const anelDoVidro = (g: OpeningPart): OPt[] =>
  g.profile?.plane === 'tz' ? g.profile.pts.map((p): OPt => [p[0], p[1]]) : [[g.box.t0, g.box.z0], [g.box.t1, g.box.z0], [g.box.t1, g.box.z1], [g.box.t0, g.box.z1]];

/**
 * Troca as divisões do vidro pelas do desenho. Vidro em arco/círculo e padrão diferente de `colonial` + `on = 'all'`; o resto
 * devolve `parts` como veio.
 */
export function muntinsDecorativos(parts: OpeningPart[], shape: OpeningShape, pad: MuntinPadrao): OpeningPart[] {
  if (pad.kind === 'colonial' && pad.on === 'all') return parts;
  const vidros = parts.filter((p) => p.role === 'glass' && !p.dashed && (pad.on === 'all' || p.id.includes('transom')));
  if (vidros.length === 0) return parts;
  const grade = parts.filter((p) => p.role === 'muntin' && p.id.startsWith('muntin-'));
  const base = pad.on === 'all' ? parts.filter((p) => !grade.includes(p)) : [...parts];
  const head = parts.find((p) => p.role === 'head' && p.material === 'frame');
  const out: OpeningPart[] = [...base];
  for (const g of vidros) {
    const ring = anelDoVidro(g);
    if (!convexo(ring)) continue;
    const D = head ? head.box.s1 - head.box.s0 : g.box.s1 - g.box.s0;
    const prof = grade[0] ? grade[0].box.s1 - grade[0].box.s0 : Math.min(D * 0.6, D - 0.001);
    const sc = (g.box.s0 + g.box.s1) / 2;
    const s = { s0: sc - prof / 2, s1: sc + prof / 2 };
    let i = 0;
    for (const b of barras(pad, shape, ring)) {
      const poly = clipConvexo(b, ring);
      if (poly.length < 3 || Math.abs(ringSignedArea(poly)) < 1e-8) continue;
      const molde: OpeningPart = { id: `muntin-${g.id}-${pad.kind}-${i++}`, role: 'muntin', material: 'frame', box: g.box, ...(g.motion ? { motion: g.motion } : {}), ...(g.leaf !== undefined ? { leaf: g.leaf } : {}) };
      out.push(prisma(molde, poly, {}, s));
    }
  }
  return out;
}
