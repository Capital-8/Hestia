import { describe, expect, it } from 'vitest';
import { junctionLevel, resolveLevel, wallTiltJoinIssues, type ResolvedWall } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project } from '@hestia/model';
import { wallLayerSolid, type SolidBatch } from './solids.ts';

/** SONDAGEM: junções entre paredes de inclinações diferentes (produção, t=0,2, H=3). Não conserta nada. */
const D = Math.PI / 180;
const tan = (deg: number): number => Math.tan(deg * D);
const RAMPA20 = Math.atan(0.2) / D; // 11,3099
const RAMPA15 = Math.atan(0.15) / D; // 8,5308
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt: number; sag?: number; kind?: 'miter' | 'butt' }

const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
function build(walls: W[]): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  for (const w of walls) {
    const j = { kind: w.kind ?? 'miter', flip: false };
    s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height: 3, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) });
  }
  return s.project;
}
const tri = (b: SolidBatch, i: number): number[][] => [0, 1, 2].map((j) => [0, 1, 2].map((c) => b.positions[b.indices[i + j]! * 3 + c]!));
function signedVolume(b: SolidBatch): number {
  let v = 0;
  for (let i = 0; i < b.indices.length; i += 3) {
    const [a, c, d] = tri(b, i) as [number[], number[], number[]];
    v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6;
  }
  return v;
}
function closed(b: SolidBatch): boolean {
  const id = new Map<string, number>();
  const vid = (k: number): number => {
    const key = [0, 1, 2].map((j) => b.positions[k * 3 + j]!.toFixed(6)).join(',');
    if (!id.has(key)) id.set(key, id.size);
    return id.get(key)!;
  };
  const dir = new Map<string, number>();
  for (let i = 0; i < b.indices.length; i += 3) {
    const t = [vid(b.indices[i]!), vid(b.indices[i + 1]!), vid(b.indices[i + 2]!)];
    for (let j = 0; j < 3; j++) {
      const u = t[j]!, w = t[(j + 1) % 3]!;
      if (u !== w) dir.set(`${u}>${w}`, (dir.get(`${u}>${w}`) ?? 0) + 1);
    }
  }
  for (const [k, n] of dir) {
    const [u, w] = k.split('>');
    if (n !== 1 || dir.get(`${w}>${u}`) !== 1) return false;
  }
  return dir.size > 0;
}
/** Fração de triângulos cuja normal geométrica (sentido de enrolamento) concorda com a normal gravada. */
function normaisOk(b: SolidBatch): number {
  let ok = 0, n = 0;
  for (let i = 0; i < b.indices.length; i += 3) {
    const [a, c, d] = tri(b, i) as [number[], number[], number[]];
    const u = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!], w = [d[0]! - a[0]!, d[1]! - a[1]!, d[2]! - a[2]!];
    const g = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const nm = [0, 1, 2].map((c2) => b.normals[b.indices[i]! * 3 + c2]!);
    if (Math.hypot(...g) < 1e-14) continue;
    n++;
    if (g[0]! * nm[0]! + g[1]! * nm[1]! + g[2]! * nm[2]! > 0) ok++;
  }
  return n ? ok / n : 0;
}
/** Pontos do sólido na cota z: vértices em z e cruzamentos de arestas de triângulo com o plano. */
function ptsAt(b: SolidBatch, z: number, sel: (q: number[]) => boolean): number[][] {
  const out: number[][] = [];
  const add = (q: number[]): void => { if (sel(q) && !out.some((o) => Math.hypot(o[0]! - q[0]!, o[1]! - q[1]!) < 1e-7)) out.push(q); };
  for (let i = 0; i < b.indices.length; i += 3) {
    const t = tri(b, i);
    for (let j = 0; j < 3; j++) {
      const p = t[j]!, q = t[(j + 1) % 3]!;
      if (Math.abs(p[2]! - z) < 1e-9) add(p);
      else if ((p[2]! - z) * (q[2]! - z) < 0) { const s = (z - p[2]!) / (q[2]! - p[2]!); add([p[0]! + s * (q[0]! - p[0]!), p[1]! + s * (q[1]! - p[1]!), z]); }
    }
  }
  return out;
}
/** Maior distância (Hausdorff simétrico) entre dois conjuntos de pontos; NaN se algum estiver vazio. */
function gap(A: number[][], B: number[][]): number {
  if (!A.length || !B.length) return NaN;
  const h = (X: number[][], Y: number[][]): number => Math.max(...X.map((x) => Math.min(...Y.map((y) => Math.hypot(x[0]! - y[0]!, x[1]! - y[1]!)))));
  return Math.max(h(A, B), h(B, A));
}

// ---- fórmulas à mão -------------------------------------------------------------------------------------------
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: P): number => Math.hypot(a.x, a.y);
const dirOf = (w: W): P => { const d = sub(w.b, w.a), l = len(d); return { x: d.x / l, y: d.y / l }; };
const leftOf = (w: W): P => { const d = dirOf(w); return { x: -d.y, y: d.x }; };
/** Ponto do eixo da parede na cota z (topo desloca para a esquerda de a→b por z·tanθ, θ>0). */
const axisPt = (w: W, p: P, z: number): P => ({ x: p.x + leftOf(w).x * z * tan(w.tilt), y: p.y + leftOf(w).y * z * tan(w.tilt) });
/** Cruzamento dos eixos na cota z (linhas infinitas). null se paralelas. */
function node(A: W, B: W, z: number): P | null {
  const pa = axisPt(A, A.a, z), da = dirOf(A), pb = axisPt(B, B.a, z), db = dirOf(B);
  const den = da.x * db.y - da.y * db.x;
  if (Math.abs(den) < 1e-12) return null;
  const s = ((pb.x - pa.x) * db.y - (pb.y - pa.y) * db.x) / den;
  return { x: pa.x + s * da.x, y: pa.y + s * da.y };
}
/** Volume esperado: ∫ (t/cosθ)·comprimento_do_eixo(z) dz (Simpson de 3 níveis, exato: integrando linear). `ends` dá o ponto de cada ponta na cota z (nó ou ponta livre). */
function volEsperado(w: W, ends: (z: number) => [P, P]): number {
  const f = (z: number): number => { const [p, q] = ends(z), d = dirOf(w); return ((0.2 / Math.cos(w.tilt * D)) * ((q.x - p.x) * d.x + (q.y - p.y) * d.y)); };
  return (3 / 6) * (f(0) + 4 * f(1.5) + f(3));
}
const free = (w: W, which: 'a' | 'b') => (z: number): P => axisPt(w, w[which], z);

interface Linha { caso: string; fechada: string; normais: string; vol: string; volEsp: string; erroRel: string; gap0: string; gap15: string; gap3: string; avisos: string }
const LINHAS: Linha[] = [];
const f6 = (n: number): string => (Number.isNaN(n) ? 'NaN' : n.toFixed(6));
const f4 = (n: number): string => (Number.isNaN(n) ? 'sem pontos' : n.toFixed(4));

interface Res { walls: W[]; solids: Record<string, SolidBatch>; avisos: string[]; linha: Linha; volTot: number; volEsp: number; erro: number; gaps: number[]; fech: boolean[]; norm: number[] }
/** Mede tudo de um caso. `esp` = volume esperado por parede; `juncoes` = pares de pontos-limite a medir (seletores por parede). */
function medir(caso: string, walls: W[], esp: Record<string, number>, juncoes: { A: string; B: string; selA: (q: number[], z: number) => boolean; selB: (q: number[], z: number) => boolean }[]): Res {
  const p = build(walls);
  const jl = junctionLevel(p, 'lv_0');
  const solids: Record<string, SolidBatch> = {};
  for (const w of walls) { const rw: ResolvedWall = resolveLevel(p, 'lv_0').walls[w.id]!; solids[w.id] = wallLayerSolid(rw, rw.layers[0]!, jl); }
  const fech = walls.map((w) => closed(solids[w.id]!));
  const norm = walls.map((w) => normaisOk(solids[w.id]!));
  const volTot = walls.reduce((s, w) => s + signedVolume(solids[w.id]!), 0);
  const volEsp = walls.reduce((s, w) => s + esp[w.id]!, 0);
  const gaps = [0, 1.5, 3].map((z) => {
    let g = 0;
    for (const j of juncoes) {
      const d = gap(ptsAt(solids[j.A]!, z, (q) => j.selA(q, z)), ptsAt(solids[j.B]!, z, (q) => j.selB(q, z)));
      g = Number.isNaN(d) || Number.isNaN(g) ? NaN : Math.max(g, d);
    }
    return g;
  });
  const avisos = wallTiltJoinIssues(p, 'pt').map((i) => `${i.code}:${i.elementId}`);
  const erro = Math.abs(volTot - volEsp) / volEsp;
  const linha: Linha = { caso, fechada: fech.map((b) => (b ? 'S' : 'N')).join(''), normais: norm.map((n) => n.toFixed(3)).join('/'), vol: f6(volTot), volEsp: f6(volEsp), erroRel: erro.toExponential(2), gap0: f4(gaps[0]!), gap15: f4(gaps[1]!), gap3: f4(gaps[2]!), avisos: avisos.join(',') || '-' };
  LINHAS.push(linha);
  return { walls, solids, avisos, linha, volTot, volEsp, erro, gaps, fech, norm };
}
/** Asserts padrão de um caso de junção por nós: malha, normais, volume e ausência de frestas. */
function confere(r: Res, opts: { gapMax?: number } = {}): void {
  for (const f of r.fech) expect(f).toBe(true);
  for (const n of r.norm) expect(n).toBeGreaterThan(0.999);
  expect(Number.isFinite(r.volTot)).toBe(true);
  expect(r.erro).toBeLessThan(1e-6);
  for (const g of r.gaps) expect(g).toBeLessThan(opts.gapMax ?? 1e-6);
}

/** Canto: seletores de pontos perto do nó (raio 0,3) para A e B, usando o cruzamento à mão. */
const perto = (A: W, B: W) => (q: number[], z: number): boolean => { const n = node(A, B, z)!; return Math.hypot(q[0]! - n.x, q[1]! - n.y) < 0.3; };
const par = (A: W, B: W) => ({ A: A.id, B: B.id, selA: perto(A, B), selB: perto(A, B) });
/** Canto em L (ângulo interno ang entre os braços): A chega em (0,0) vindo de +x, B sai para o ângulo ang. */
const Lw = (tA: number, tB: number, ang: number): W[] => [
  { id: 'A', a: { x: 4, y: 0 }, b: { x: 0, y: 0 }, tilt: tA },
  { id: 'B', a: { x: 0, y: 0 }, b: { x: 4 * Math.cos(ang * D), y: 4 * Math.sin(ang * D) }, tilt: tB },
];
function caso90(nome: string, tA: number, tB: number, ang = 90): Res {
  const [A, B] = Lw(tA, tB, ang) as [W, W];
  const esp = {
    A: volEsperado(A, (z) => [free(A, 'a')(z), node(A, B, z)!]),
    B: volEsperado(B, (z) => [node(A, B, z)!, free(B, 'b')(z)]),
  };
  return medir(nome, [A, B], esp, [par(A, B)]);
}

describe('C1 canto em L a 90 graus, tilts em graus', () => {
  for (const [a, b] of [[-20, -15], [20, -15], [-20, 15], [-20, -20], [-15, -15]] as const) {
    it(`C1 ${a}/${b}`, () => { confere(caso90(`C1 ${a}/${b}`, a, b)); });
  }
});
describe('C2 canto em L a 90 graus, tilts como rampa (-20% / -15%)', () => {
  for (const [a, b] of [[-RAMPA20, -RAMPA15], [RAMPA20, -RAMPA15], [-RAMPA20, RAMPA15], [-RAMPA20, -RAMPA20], [-RAMPA15, -RAMPA15]] as const) {
    it(`C2 ${a.toFixed(4)}/${b.toFixed(4)}`, () => { confere(caso90(`C2 ${a.toFixed(4)}/${b.toFixed(4)}`, a, b)); });
  }
});

describe('C3 colineares (180 graus)', () => {
  it('C3 -20/-15: degrau lateral no topo = z(tan20-tan15)', () => {
    const A: W = { id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt: -20 };
    const B: W = { id: 'B', a: { x: 4, y: 0 }, b: { x: 8, y: 0 }, tilt: -15 };
    const esp = { A: volEsperado(A, (z) => [free(A, 'a')(z), free(A, 'b')(z)]), B: volEsperado(B, (z) => [free(B, 'a')(z), free(B, 'b')(z)]) };
    const r = medir('C3 -20/-15', [A, B], esp, [{ A: 'A', B: 'B', selA: (q) => q[0]! > 3.5, selB: (q) => q[0]! < 4.5 }]);
    const degrau = 3 * (tan(20) - tan(15));
    console.log('C3 degrau esperado', degrau.toFixed(4), 'medido no topo', f4(r.gaps[2]!), 'avisos', r.avisos);
    for (const f of r.fech) expect(f).toBe(true);
    for (const n of r.norm) expect(n).toBeGreaterThan(0.999);
    expect(Math.abs(r.gaps[2]! - degrau)).toBeLessThan(0.0035); // Hausdorff inclui meia diferença de largura (t/cos20 - t/cos15)/2 = 0,0029
    expect(r.gaps[0]!).toBeLessThan(0.0035);
    expect(r.avisos.length).toBeGreaterThan(0); // o código deveria avisar o degrau
  });
});

describe('C4 anel 4x3 com 4 paredes', () => {
  for (const tilts of [[-20, -15, -20, -15], [-15, -15, -15, -15]]) {
    it(`C4 ${tilts.join('/')}`, () => {
      const pts: P[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
      const ws: W[] = pts.map((a, i) => ({ id: `R${i}`, a, b: pts[(i + 1) % 4]!, tilt: tilts[i]! }));
      const esp: Record<string, number> = {};
      ws.forEach((w, i) => { const prev = ws[(i + 3) % 4]!, next = ws[(i + 1) % 4]!; esp[w.id] = volEsperado(w, (z) => [node(prev, w, z)!, node(w, next, z)!]); });
      const juncoes = ws.map((w, i) => { const next = ws[(i + 1) % 4]!; return { A: w.id, B: next.id, selA: perto(w, next), selB: perto(w, next) }; });
      const r = medir(`C4 ${tilts.join('/')}`, ws, esp, juncoes);
      confere(r);
    });
  }
});

describe('C5 encontro em T', () => {
  for (const [tH, tR] of [[-20, -15], [-15, -20]] as const) {
    it(`C5 hospedeira ${tH} / ramo ${tR}`, () => {
      const H: W = { id: 'H', a: { x: -2, y: 0 }, b: { x: 4, y: 0 }, tilt: tH };
      const R: W = { id: 'R', a: { x: 1, y: 3 }, b: { x: 1, y: 0 }, tilt: tR, kind: 'butt' };
      const c = Math.cos(tH * D), s = Math.sin(tH * D);
      // face da hospedeira voltada ao ramo (lado +y): y·cosθ − z·sinθ = 0,1  =>  y = 0,1/cosθ + z·tanθ
      const yFace = (z: number): number => 0.1 / c + z * tan(tH);
      const esp = {
        H: volEsperado(H, (z) => [free(H, 'a')(z), free(H, 'b')(z)]),
        R: (0.2 / Math.cos(tR * D)) * (3 / 6) * [0, 1.5, 3].map((z, i) => (i === 1 ? 4 : 1) * (3 - yFace(z))).reduce((x, y) => x + y, 0),
      };
      const r = medir(`C5 ${tH}/${tR}`, [H, R], esp, []);
      // distância das pontas do ramo ao plano da face da hospedeira (positivo = invade a hospedeira)
      const dist = [0, 1.5, 3].map((z) => Math.max(...ptsAt(r.solids.R!, z, (q) => q[1]! < yFace(z) + 0.3).map((q) => Math.abs(q[1]! * c - z * s - 0.1))));
      console.log('C5', tH, tR, 'dist ponta do ramo ao plano da face z=0/1,5/3', dist.map((d) => d.toFixed(6)).join(' '));
      for (const f of r.fech) expect(f).toBe(true);
      for (const n of r.norm) expect(n).toBeGreaterThan(0.999);
      expect(r.erro).toBeLessThan(1e-6);
      for (const d of dist) expect(d).toBeLessThan(1e-6);
    });
  }
});

describe('C6 cadeia de 2 arcos tangentes (circulo r=3)', () => {
  it('C6 arco1 -20 / arco2 -15', () => {
    const A: W = { id: 'A', a: { x: 3, y: 0 }, b: { x: -3, y: 0 }, tilt: -20, sag: 3 };
    const B: W = { id: 'B', a: { x: -3, y: 0 }, b: { x: 3, y: 0 }, tilt: -15, sag: 3 };
    // topo desloca para a direita de a→b = para o centro: raio(z) = 3 − z·tanθ; área da meia coroa = π·r(z)·t/cosθ; integrando linear em z
    const volArco = (t: number): number => (0.2 / Math.cos(t * D)) * Math.PI * (9 - 4.5 * Math.abs(tan(t)));
    const esp = { A: volArco(-20), B: volArco(-15) };
    const r = medir('C6 -20/-15', [A, B], esp, [
      { A: 'A', B: 'B', selA: (q) => q[0]! > 1 && Math.abs(q[1]!) < 1e-6, selB: (q) => q[0]! > 1 && Math.abs(q[1]!) < 1e-6 },
    ]);
    const g2 = [0, 1.5, 3].map((z) => gap(ptsAt(r.solids.A!, z, (q) => q[0]! < -1 && Math.abs(q[1]!) < 1e-6), ptsAt(r.solids.B!, z, (q) => q[0]! < -1 && Math.abs(q[1]!) < 1e-6)));
    console.log('C6 degrau esperado no topo', (3 * (tan(20) - tan(15))).toFixed(4), 'tangencia x>0 medida', r.gaps.map(f4).join(' '), 'tangencia x<0', g2.map(f4).join(' '), 'avisos', r.avisos);
    for (const f of r.fech) expect(f).toBe(true);
    for (const n of r.norm) expect(n).toBeGreaterThan(0.999);
    expect(r.erro).toBeLessThan(1e-2);
    expect(Math.abs(r.gaps[2]! - 3 * (tan(20) - tan(15)))).toBeLessThan(0.0035);
    expect(r.avisos).toContain('arcoInclinadoSemJuncao:A');
  });
});

describe('C7 canto agudo (60) e obtuso (120)', () => {
  for (const ang of [60, 120]) it(`C7 ${ang} graus, -20/-15`, () => { confere(caso90(`C7 ${ang}° -20/-15`, -20, -15, ang)); });
});

describe('relatório', () => {
  it('imprime a tabela', () => { console.table(LINHAS); expect(LINHAS.length).toBeGreaterThan(0); });
});
