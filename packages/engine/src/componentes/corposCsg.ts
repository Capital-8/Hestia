import type { Malha } from './malha.ts';

/*
 * Subtração de malhas fechadas (ficha D2 / F-CSG): `subtrairMalha(a, b)` = A − B por árvore BSP (algoritmo clássico do csg.js,
 * escrito sem estado global). Entra malha triangular de sólido FECHADO com a face de fora voltada para a normal (a convenção de
 * `Malha`); sai malha triangular com vértices próprios por face (sombreamento como o das demais malhas dos corpos).
 * Normais: os vértices guardam a normal de origem (interpoladas nos cortes); as faces novas do corte herdam a normal de B
 * invertida, então o furo sai liso quando B é um cilindro suave. `pecaDoTriangulo` sai 0 (quem junta reatribui).
 * LIMITES: faces coplanares entre A e B (ex.: tampa do cilindro sobre a face de A) dão fiapo ou face dupla; o cilindro cortante deve
 * atravessar a parede, nunca encostar nela. Determinística (mesma entrada, mesma saída, na mesma ordem). Não é CSG geral robusto:
 * é o mínimo para cilindro − cilindro em ângulo.
 */

const EPS = 1e-7;
const AREA_MIN = 1e-14;

type V3 = [number, number, number];
interface Vert {
  p: V3;
  n: V3;
}
interface Plano {
  n: V3;
  w: number;
}
interface Poligono {
  v: Vert[];
  plano: Plano;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function unitario(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l === 0 ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l];
}

function planoDe(v: Vert[]): Plano | null {
  const a = v[0]!.p;
  const c = cross(sub(v[1]!.p, a), sub(v[2]!.p, a));
  if (Math.hypot(c[0], c[1], c[2]) < AREA_MIN * 2) return null;
  const n = unitario(c);
  return { n, w: dot(n, a) };
}

function poligonos(m: Malha): Poligono[] {
  const saida: Poligono[] = [];
  const vert = (i: number): Vert => ({
    p: [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!],
    n: [m.normals[i * 3]!, m.normals[i * 3 + 1]!, m.normals[i * 3 + 2]!],
  });
  for (let t = 0; t + 2 < m.indices.length; t += 3) {
    const v = [vert(m.indices[t]!), vert(m.indices[t + 1]!), vert(m.indices[t + 2]!)];
    const plano = planoDe(v);
    if (plano) saida.push({ v, plano });
  }
  return saida;
}

function inverterPoligono(p: Poligono): Poligono {
  const v = p.v.map((x): Vert => ({ p: x.p, n: [-x.n[0], -x.n[1], -x.n[2]] })).reverse();
  return { v, plano: { n: [-p.plano.n[0], -p.plano.n[1], -p.plano.n[2]], w: -p.plano.w } };
}

/** Parte `poly` pelo plano: coplanares vão para `cf`/`cb` conforme a normal, o resto para `f`/`b` (corta quem atravessa). */
function dividir(plano: Plano, poly: Poligono, cf: Poligono[], cb: Poligono[], f: Poligono[], b: Poligono[]): void {
  let tipoPoly = 0;
  const tipos = poly.v.map((x) => {
    const d = dot(plano.n, x.p) - plano.w;
    const t = d < -EPS ? 2 : d > EPS ? 1 : 0;
    tipoPoly |= t;
    return t;
  });
  if (tipoPoly === 0) return void (dot(plano.n, poly.plano.n) > 0 ? cf : cb).push(poly);
  if (tipoPoly === 1) return void f.push(poly);
  if (tipoPoly === 2) return void b.push(poly);
  const vf: Vert[] = [];
  const vb: Vert[] = [];
  for (let i = 0; i < poly.v.length; i++) {
    const j = (i + 1) % poly.v.length;
    const ti = tipos[i]!;
    const tj = tipos[j]!;
    const vi = poly.v[i]!;
    const vj = poly.v[j]!;
    if (ti !== 2) vf.push(vi);
    if (ti !== 1) vb.push(ti !== 2 ? { p: vi.p, n: vi.n } : vi);
    if ((ti | tj) === 3) {
      const t = (plano.w - dot(plano.n, vi.p)) / dot(plano.n, sub(vj.p, vi.p));
      const nv: Vert = { p: lerp(vi.p, vj.p, t), n: unitario(lerp(vi.n, vj.n, t)) };
      vf.push(nv);
      vb.push({ p: nv.p, n: nv.n });
    }
  }
  if (vf.length >= 3) f.push({ v: vf, plano: poly.plano });
  if (vb.length >= 3) b.push({ v: vb, plano: poly.plano });
}

class No {
  plano: Plano | null = null;
  frente: No | null = null;
  tras: No | null = null;
  polys: Poligono[] = [];

  constructor(lista?: Poligono[]) {
    if (lista) this.construir(lista);
  }

  inverter(): void {
    this.polys = this.polys.map(inverterPoligono);
    if (this.plano) this.plano = { n: [-this.plano.n[0], -this.plano.n[1], -this.plano.n[2]], w: -this.plano.w };
    this.frente?.inverter();
    this.tras?.inverter();
    [this.frente, this.tras] = [this.tras, this.frente];
  }

  recortar(lista: Poligono[]): Poligono[] {
    if (!this.plano) return lista.slice();
    let f: Poligono[] = [];
    let b: Poligono[] = [];
    for (const p of lista) dividir(this.plano, p, f, b, f, b);
    f = this.frente ? this.frente.recortar(f) : f;
    b = this.tras ? this.tras.recortar(b) : [];
    return f.concat(b);
  }

  recortarPara(outro: No): void {
    this.polys = outro.recortar(this.polys);
    this.frente?.recortarPara(outro);
    this.tras?.recortarPara(outro);
  }

  todos(): Poligono[] {
    return this.polys.concat(this.frente?.todos() ?? [], this.tras?.todos() ?? []);
  }

  construir(lista: Poligono[]): void {
    if (lista.length === 0) return;
    this.plano ??= lista[0]!.plano;
    const f: Poligono[] = [];
    const b: Poligono[] = [];
    for (const p of lista) dividir(this.plano, p, this.polys, this.polys, f, b);
    if (f.length > 0) (this.frente ??= new No()).construir(f);
    if (b.length > 0) (this.tras ??= new No()).construir(b);
  }
}

function paraMalha(polys: Poligono[]): Malha {
  const m: Malha = { positions: [], normals: [], indices: [], pecaDoTriangulo: [] };
  for (const p of polys) {
    for (let k = 1; k + 1 < p.v.length; k++) {
      const tri = [p.v[0]!, p.v[k]!, p.v[k + 1]!];
      const c = cross(sub(tri[1]!.p, tri[0]!.p), sub(tri[2]!.p, tri[0]!.p));
      if (Math.hypot(c[0], c[1], c[2]) < AREA_MIN * 2) continue;
      const base = m.positions.length / 3;
      for (const v of tri) {
        m.positions.push(...v.p);
        m.normals.push(...v.n);
      }
      m.indices.push(base, base + 1, base + 2);
      m.pecaDoTriangulo.push(0);
    }
  }
  return m;
}

/** A − B. Qualquer entrada vazia devolve A copiada sem cortes. */
export function subtrairMalha(a: Malha, b: Malha): Malha {
  const pa = poligonos(a);
  if (pa.length === 0 || b.indices.length === 0) return paraMalha(pa);
  const na = new No(pa);
  const nb = new No(poligonos(b));
  na.inverter();
  na.recortarPara(nb);
  nb.recortarPara(na);
  nb.inverter();
  nb.recortarPara(na);
  nb.inverter();
  na.construir(nb.todos());
  na.inverter();
  return paraMalha(na.todos());
}

/** Volume (m³) de uma malha fechada pela soma dos tetraedros com sinal; vale para a saída de `subtrairMalha`. */
export function volumeDaMalha(m: Malha): number {
  let v = 0;
  for (let t = 0; t + 2 < m.indices.length; t += 3) {
    const g = (k: number): V3 => [m.positions[m.indices[t + k]! * 3]!, m.positions[m.indices[t + k]! * 3 + 1]!, m.positions[m.indices[t + k]! * 3 + 2]!];
    v += dot(g(0), cross(g(1), g(2))) / 6;
  }
  return v;
}
