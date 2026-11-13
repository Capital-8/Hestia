/** Geometria 2D auxiliar da referência TS do caminho do guarda-corpo (amostragem de curvas, projeção, deslocamento): separada para manter os arquivos pequenos. */
import { arcFromSagitta, arcPointAt, type Vec2 } from '@hestia/geom';

const GRADE = 1e-6;
/** Limite da esquadria (em múltiplos do deslocamento) acima do qual a quina é cortada. */
export const LIMITE_ESQUADRIA = 2.5;
export type P3 = [number, number, number];

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => v(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => v(a.x - b.x, a.y - b.y);
export const mul = (a: Vec2, k: number): Vec2 => v(a.x * k, a.y * k);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const perp = (a: Vec2): Vec2 => v(-a.y, a.x);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);
export const grade = (x: number): number => Math.round(x / GRADE) * GRADE;
export const normalizado = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-12 ? v(0, 0) : v(a.x / l, a.y / l);
};

export function pontoSegmento(p: Vec2, a: Vec2, b: Vec2): [number, number] {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 < 1e-18 ? 0 : Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2));
  return [dist(p, add(a, mul(ab, t))), t];
}

export function amostrarCurva(a: Vec2, b: Vec2, sag: number, tol: number): [Vec2[], boolean] {
  const arc = Math.abs(sag) < 1e-6 || dist(a, b) < 1e-6 ? null : arcFromSagitta(a, b, sag);
  if (!arc) return [[a, b], false];
  const passo = 2 * Math.acos(Math.max(0, 1 - tol / arc.radius));
  const porCorda = passo > 1e-9 ? Math.ceil(Math.abs(arc.sweep) / passo) : 720;
  const porQuarto = Math.ceil((Math.abs(arc.sweep) / (Math.PI / 2)) * 8);
  const n = Math.min(720, Math.max(2, porCorda, porQuarto));
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) out.push(arcPointAt(arc, (arc.length * i) / n, 0));
  out[0] = a;
  out[n] = b;
  return [out, true];
}

export const acumulado = (p: Vec2[]): number[] => {
  const c = [0];
  for (let i = 0; i + 1 < p.length; i++) c.push(c[c.length - 1]! + dist(p[i]!, p[i + 1]!));
  return c;
};

export function projetar(p: Vec2[], cum: number[], q: Vec2): [number, number] {
  let melhor: [number, number] = [0, Infinity];
  for (let i = 0; i + 1 < p.length; i++) {
    const [d, t] = pontoSegmento(q, p[i]!, p[i + 1]!);
    if (d < melhor[1]) melhor = [cum[i]! + t * (cum[i + 1]! - cum[i]!), d];
  }
  return melhor;
}

export function pontoEm(p: Vec2[], cum: number[], s: number): Vec2 {
  for (let i = 0; i + 1 < p.length; i++) {
    if (s <= cum[i + 1]! || i === p.length - 2) {
      const l = cum[i + 1]! - cum[i]!;
      const t = l < 1e-18 ? 0 : Math.min(1, Math.max(0, (s - cum[i]!) / l));
      return add(p[i]!, mul(sub(p[i + 1]!, p[i]!), t));
    }
  }
  return p[0]!;
}

export function semColineares(nos: P3[]): P3[] {
  if (nos.length < 3) return nos;
  const out: P3[] = [nos[0]!];
  for (let k = 1; k < nos.length - 1; k++) {
    const a = out[out.length - 1]!;
    const u = normalizado(v(nos[k]![0] - a[0], nos[k]![1] - a[1]));
    const w = normalizado(v(nos[k + 1]![0] - nos[k]![0], nos[k + 1]![1] - nos[k]![1]));
    if (Math.abs(cross(u, w)) > 1e-9 || dot(u, w) < 0) out.push(nos[k]!);
  }
  out.push(nos[nos.length - 1]!);
  return out;
}

export const semRepetidos = (p: Vec2[]): Vec2[] => {
  const out: Vec2[] = [];
  for (const q of p) if (out.length === 0 || dist(out[out.length - 1]!, q) > 1e-9) out.push(q);
  return out;
};

export function deslocar(p: Vec2[], d: number, fechado: boolean): Array<[Vec2, number]> | null {
  const n = p.length;
  if (d === 0 || n < 2) return p.map((q, i) => [q, i]);
  const m = fechado ? n : n - 1;
  const nor = Array.from({ length: m }, (_, i) => perp(normalizado(sub(p[(i + 1) % n]!, p[i]!))));
  const out: Array<[Vec2, number]> = [];
  for (let k = 0; k < n; k++) {
    let n1: Vec2;
    let n2: Vec2;
    if (fechado) [n1, n2] = [nor[(k + m - 1) % m]!, nor[k % m]!];
    else if (k === 0) [n1, n2] = [nor[0]!, nor[0]!];
    else if (k === n - 1) [n1, n2] = [nor[m - 1]!, nor[m - 1]!];
    else [n1, n2] = [nor[k - 1]!, nor[k]!];
    const den = 1 + dot(n1, n2);
    const w = den > 1e-9 ? mul(add(n1, n2), d / den) : null;
    if (w && Math.hypot(w.x, w.y) <= LIMITE_ESQUADRIA * Math.abs(d)) out.push([add(p[k]!, w), k]);
    else {
      out.push([add(p[k]!, mul(n1, d)), k]);
      out.push([add(p[k]!, mul(n2, d)), k]);
    }
  }
  const total = fechado ? out.length : out.length - 1;
  for (let k = 0; k < total; k++) {
    const a = out[k]!;
    const b = out[(k + 1) % out.length]!;
    if (b[1] === (a[1] + 1) % n && b[1] !== a[1]) {
      if (dot(sub(b[0], a[0]), sub(p[b[1]]!, p[a[1]]!)) < 0) return null;
    }
  }
  return out;
}
