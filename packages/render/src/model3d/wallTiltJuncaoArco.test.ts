import { describe, expect, it } from 'vitest';
import { junctionLevel, resolveLevel, type JunctionLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { wallLayerSolid, type SolidBatch } from './solids.ts';

/** J3: o sólido usa os níveis da junção (arco inclinado); valores à mão (mesmos da J2), tolerância 1e-6. */
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt?: number; sag?: number }

function build(walls: W[], height: number): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  for (const w of walls) s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) as Wall });
  return s.project;
}
function solidsOf(p: Project, ids: string[], jlOverride?: (jl: JunctionLevel) => JunctionLevel): Record<string, SolidBatch> {
  let jl = junctionLevel(p, 'lv_0');
  if (jlOverride) jl = jlOverride(jl);
  const rl = resolveLevel(p, 'lv_0');
  const out: Record<string, SolidBatch> = {};
  for (const id of ids) { const rw = rl.walls[id]!; out[id] = wallLayerSolid(rw, rw.layers[0]!, jl); }
  return out;
}
const pt = (b: SolidBatch, i: number): number[] => [b.positions[i * 3]!, b.positions[i * 3 + 1]!, b.positions[i * 3 + 2]!];
/** Vértices do sólido com |x - x0| < 1e-6 (ou perto do ponto) na cota z. */
function vertsAt(b: SolidBatch, z: number, f: (q: number[]) => boolean): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < b.positions.length / 3; i++) { const q = pt(b, i); if (Math.abs(q[2]! - z) < 1e-6 && f(q) && !out.some((o) => Math.hypot(o[0]! - q[0]!, o[1]! - q[1]!) < 1e-7)) out.push(q); }
  return out;
}
function volume(b: SolidBatch): number {
  let v = 0;
  for (let i = 0; i < b.indices.length; i += 3) {
    const a = pt(b, b.indices[i]!), c = pt(b, b.indices[i + 1]!), d = pt(b, b.indices[i + 2]!);
    v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6;
  }
  return v;
}
/** Malha fechada: cada aresta dirigida tem a oposta (vértices soldados a 1e-6). */
function closed(b: SolidBatch): boolean {
  const k = (i: number): string => pt(b, i).map((x) => x.toFixed(6)).join(','); // units-ok: chave de teste
  const m = new Map<string, number>();
  for (let i = 0; i < b.indices.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = k(b.indices[i + j]!), c = k(b.indices[i + (j + 1) % 3]!);
    if (a === c) continue;
    m.set(`${a}>${c}`, (m.get(`${a}>${c}`) ?? 0) + 1);
  }
  for (const [e, n] of m) { const [a, c] = e.split('>'); if (m.get(`${c}>${a}`) !== n) return false; }
  return true;
}
const sameCorner = (a: SolidBatch, b: SolidBatch, z: number, f: (q: number[]) => boolean): number => {
  const A = vertsAt(a, z, f), B = vertsAt(b, z, f);
  expect(A.length).toBeGreaterThanOrEqual(2);
  expect(B.length).toBeGreaterThanOrEqual(2);
  let worst = 0;
  for (const q of A) worst = Math.max(worst, Math.min(...B.map((r) => Math.hypot(r[0]! - q[0]!, r[1]! - q[1]!))));
  for (const q of B) worst = Math.max(worst, Math.min(...A.map((r) => Math.hypot(r[0]! - q[0]!, r[1]! - q[1]!))));
  return worst;
};

describe('J3 · sólido com os níveis da junção em arco', () => {
  it('arcos concêntricos tangentes R=5, tilt −10°: cantos coincidentes em z=0, 1,4 e 2,8; fechados; volume do par = soma', () => {
    const sag = -(5 - Math.sqrt(25 - 12.5));
    const p = build([{ id: 'A', a: { x: 5, y: 0 }, b: { x: 0, y: 5 }, sag, tilt: -10 }, { id: 'B', a: { x: 0, y: 5 }, b: { x: -5, y: 0 }, sag, tilt: -10 }], 2.8);
    const S = solidsOf(p, ['A', 'B']);
    const lit: Array<[number, number, number]> = [[0, 4.898457, 5.101543], [1.4, 5.145315, 5.3484], [2.8, 5.392173, 5.595258]];
    for (const [z, y0, y1] of lit) {
      const near = (q: number[]): boolean => Math.abs(q[0]!) < 1e-6;
      const a = vertsAt(S.A!, z, near).map((q) => q[1]!).sort((m, n) => m - n);
      expect(a.length).toBe(2);
      expect(a[0]!).toBeCloseTo(y0, 6);
      expect(a[1]!).toBeCloseTo(y1, 6);
      expect(sameCorner(S.A!, S.B!, z, near)).toBeLessThan(1e-6);
    }
    expect(closed(S.A!)).toBe(true);
    expect(closed(S.B!)).toBe(true);
    // volume: cada parede = faixa anular de 0,2/cos10° na horizontal, 2,8 de altura, 90° de arco; o cone tem área média π/4·(Ro²−Ri²) por nível
    const vol = (S.A!.positions.length ? volume(S.A!) : 0) + volume(S.B!);
    expect(volume(S.A!)).toBeGreaterThan(0);
    expect(volume(S.A!)).toBeCloseTo(volume(S.B!), 6);
    // área do setor em z: (π/4)(Ro²−Ri²), Ro,Ri = 5 + z·tan10° ± 0,1/cos10°; integral em z (linear em z → exata por Simpson em 3 pontos)
    const ar = (z: number): number => { const r = 5 + z * Math.tan((10 * Math.PI) / 180), h = 0.1 / Math.cos((10 * Math.PI) / 180); return (Math.PI / 4) * ((r + h) ** 2 - (r - h) ** 2); };
    const esperado = (2.8 / 6) * (ar(0) + 4 * ar(1.4) + ar(2.8));
    expect(vol / 2).toBeCloseTo(esperado, 2);
  });

  it('círculos (0,0) e (6,0), R=5, 15°: cantos coincidentes em x=3 e malhas fechadas', () => {
    const sg = 5 - Math.sqrt(20);
    const p = build([{ id: 'A', a: { x: 3, y: 4 }, b: { x: 5, y: 0 }, sag: sg, tilt: 15 }, { id: 'B', a: { x: 3, y: 4 }, b: { x: 1, y: 0 }, sag: -sg, tilt: -15 }], 2.8);
    const S = solidsOf(p, ['A', 'B']);
    const lit: Array<[number, number, number]> = [[0, 3.869812, 4.128679], [1.4, 4.334718, 4.584286], [2.8, 4.783886, 5.026609]];
    for (const [z, y0, y1] of lit) {
      const near = (q: number[]): boolean => Math.abs(q[0]! - 3) < 1e-6;
      for (const id of ['A', 'B']) {
        const a = vertsAt(S[id]!, z, near).map((q) => q[1]!).sort((m, n) => m - n);
        expect(a.length).toBe(2);
        expect(a[0]!).toBeCloseTo(y0, 6);
        expect(a[1]!).toBeCloseTo(y1, 6);
      }
      expect(sameCorner(S.A!, S.B!, z, near)).toBeLessThan(1e-6);
    }
    expect(closed(S.A!)).toBe(true);
    expect(closed(S.B!)).toBe(true);
  });

  it('arco×reta viável (arco −15°, reta 15°): fresta 0 em z=0, meio e topo (canto x=4,259530 em z=2)', () => {
    const sg = 5 - Math.sqrt(20);
    const p = build([{ id: 'A', a: { x: 4, y: 0 }, b: { x: 0, y: 2 }, sag: -sg, tilt: -15 }, { id: 'B', a: { x: 4, y: 0 }, b: { x: 10, y: 0 }, tilt: 15 }], 2);
    const S = solidsOf(p, ['A', 'B']);
    for (const z of [0, 1, 2]) {
      // os dois vértices de B mais perto do nó (os cantos da ponta de B) existem em A, a menos de 1e-6
      const B = vertsAt(S.B!, z, () => true).sort((m, n) => m[0]! - n[0]!).slice(0, 2);
      const A = vertsAt(S.A!, z, () => true);
      for (const q of B) expect(Math.min(...A.map((r) => Math.hypot(r[0]! - q[0]!, r[1]! - q[1]!)))).toBeLessThan(1e-6);
    }
    // topo z=2: a face de B (reta em y=0, tilt 15°) sobe z·tan15° = 0,535898 e a meia espessura é 0,1/cos15° = 0,103528
    const bz = vertsAt(S.B!, 2, () => true).sort((m, n) => m[0]! - n[0]!).slice(0, 2).map((q) => q[1]!).sort((m, n) => m - n);
    expect(bz[0]!).toBeCloseTo(0.43237, 5);
    expect(closed(S.A!)).toBe(true);
    expect(closed(S.B!)).toBe(true);
  });

  it('par inviável (cone invertido): continua no plano B, sem quebrar (malhas fechadas)', () => {
    const sg = 5 - Math.sqrt(20);
    const p = build([{ id: 'A', a: { x: 3, y: 4 }, b: { x: 5, y: 0 }, sag: sg, tilt: -40 }, { id: 'B', a: { x: 3, y: 4 }, b: { x: 1, y: 0 }, sag: -sg, tilt: 40 }], 2.8);
    const S = solidsOf(p, ['A', 'B']);
    expect(closed(S.A!)).toBe(true);
    expect(closed(S.B!)).toBe(true);
    expect(volume(S.A!)).toBeGreaterThan(0);
  });

  it('reta×reta: malha idêntica à interpolação p0→pH de sempre (mesmos vértices e índices)', () => {
    const p = build([{ id: 'A', a: { x: 4, y: 0 }, b: { x: 0, y: 0 }, tilt: 15 }, { id: 'B', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, tilt: 15 }], 3);
    const novo = solidsOf(p, ['A', 'B']);
    const velho = solidsOf(p, ['A', 'B'], (jl) => {
      const walls = new Map(jl.walls);
      for (const [id, w] of jl.walls) if (w.tilt) walls.set(id, { ...w, tilt: { ...w.tilt, zs: undefined, levels: undefined } });
      return { ...jl, walls };
    });
    for (const id of ['A', 'B']) {
      expect(novo[id]!.positions.length).toBeGreaterThan(0);
      expect(novo[id]!.positions).toEqual(velho[id]!.positions);
      expect(novo[id]!.indices).toEqual(velho[id]!.indices);
    }
  });

  it('parede vertical: sem alteração (caixa/extrusão simples, fechada)', () => {
    const p = build([{ id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }], 3);
    const S = solidsOf(p, ['A']);
    expect(closed(S.A!)).toBe(true);
    expect(volume(S.A!)).toBeCloseTo(4 * 0.2 * 3, 6);
  });

  it('desempenho: 20 paredes em arco inclinadas em < 350 ms', () => {
    const walls: W[] = [];
    // 20 arcos de 5 m de raio, ponta a ponta em cadeia tangente (tilt 12° igual), 18° cada: nó de cadeia exato
    const R = 5, d = (18 * Math.PI) / 180;
    const sag = -(R - R * Math.cos(d / 2));
    for (let i = 0; i < 20; i++) {
      const t0 = i * d, t1 = (i + 1) * d;
      walls.push({ id: `W${i}`, a: { x: R * Math.cos(t0) + 40 * Math.floor(i / 10), y: R * Math.sin(t0) }, b: { x: R * Math.cos(t1) + 40 * Math.floor(i / 10), y: R * Math.sin(t1) }, sag, tilt: 12 });
    }
    const p = build(walls, 2.8);
    const t0 = performance.now();
    const S = solidsOf(p, walls.map((w) => w.id));
    const ms = performance.now() - t0;
    console.log(`J3: 20 paredes em arco inclinadas: ${ms.toFixed(1)} ms`); // units-ok: log de teste
    expect(Object.values(S).every((b) => b.indices.length > 0)).toBe(true);
    expect(ms).toBeLessThan(350);
  });
});
