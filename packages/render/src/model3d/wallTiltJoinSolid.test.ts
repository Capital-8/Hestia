import { describe, expect, it } from 'vitest';
import { junctionLevel, resolveLevel, type JunctionLevel, type ResolvedWall } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project } from '@hestia/model';
import { wallLayerSolid, type SolidBatch } from './solids.ts';

/** F2.4 · sólido de parede com junção inclinada (faixas de junção em z=base e z=topo), reta×reta, pair e tee. */

const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt?: number; kind?: 'miter' | 'butt' }

function build(walls: W[]): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  for (const w of walls) {
    const j = { kind: w.kind ?? 'miter', flip: false };
    s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height: 3, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), joinStart: j, joinEnd: j }) });
  }
  return s.project;
}
const solidOf = (p: Project, id: string, jl?: JunctionLevel): SolidBatch => {
  const rw: ResolvedWall = resolveLevel(p, 'lv_0').walls[id]!;
  return wallLayerSolid(rw, rw.layers[0]!, jl);
};

function signedVolume(b: SolidBatch): number {
  let v = 0;
  const P3 = (k: number): number[] => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!];
  for (let i = 0; i < b.indices.length; i += 3) {
    const [a, c, d] = [P3(b.indices[i]!), P3(b.indices[i + 1]!), P3(b.indices[i + 2]!)] as [number[], number[], number[]];
    v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6;
  }
  return v;
}
/** Toda aresta (vértices soldados por posição) em exatamente 2 triângulos, em sentidos opostos. */
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
const verts = (b: SolidBatch): number[][] => Array.from({ length: b.positions.length / 3 }, (_, k) => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!]);

/** Canto da referência S1: A de (4,0) a (0,0) (esquerda = -y); B de (0,0) a (0,4) (esquerda = -x). Volumes de referência: Simpson exato das plantas de 3 níveis. */
const corner = (tA: number, tB: number): W[] => [
  { id: 'A', a: { x: 4, y: 0 }, b: { x: 0, y: 0 }, tilt: tA },
  { id: 'B', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, tilt: tB },
];
const CASES = [
  { nome: '15/15', tA: 15, tB: 15, vA: 2.734324107819853, vB: 2.7343241078198526, node: [-0.8038475772933681, -0.8038475772933681] },
  { nome: '15/30', tA: 15, tB: 30, vA: 3.022608116285031, vB: 3.049742261192857, node: [-1.7320508075688772, -0.8038475772933681] },
  { nome: '0/30', tA: 0, tB: 30, vA: 2.9196152422706625, vB: 2.771281292110204, node: [-1.7320508075688772, 0] },
];

describe('F2.4 · canto (pair) com junção inclinada', () => {
  for (const c of CASES) {
    it(`${c.nome}: malha fechada, volume = Simpson de 3 níveis (1e-9 relativo), canto do topo na tabela (1e-6)`, () => {
      const p = build(corner(c.tA, c.tB));
      const jl = junctionLevel(p, 'lv_0');
      for (const [id, v] of [['A', c.vA], ['B', c.vB]] as const) {
        const s = solidOf(p, id, jl);
        expect(closed(s)).toBe(true);
        expect(Math.abs(signedVolume(s) - v) / v).toBeLessThan(1e-9);
      }
      // o canto do topo (z=3): o ponto médio dos dois vértices de esquadria é o cruzamento dos eixos do nível (tabela S1, z=3)
      const top = verts(solidOf(p, 'A', jl)).filter((q) => Math.abs(q[2]! - 3) < 1e-9);
      const mids = top.flatMap((q, i) => top.slice(i + 1).map((r) => [(q[0]! + r[0]!) / 2, (q[1]! + r[1]!) / 2]));
      expect(mids.some((m) => Math.hypot(m[0]! - c.node[0]!, m[1]! - c.node[1]!) < 1e-6)).toBe(true);
    });
  }

  it('face de junção: vértices do canto a <1e-9 dos dois planos de face (15°/15°, espessura 0,2)', () => {
    const p = build(corner(15, 15));
    const jl = junctionLevel(p, 'lv_0');
    const cs = Math.cos((15 * Math.PI) / 180), sn = Math.sin((15 * Math.PI) / 180);
    const dA = (v: number[]) => Math.min(...[-0.1, 0.1].map((h) => Math.abs(v[1]! * cs + v[2]! * sn - h)));
    const dB = (v: number[]) => Math.min(...[-0.1, 0.1].map((h) => Math.abs(v[0]! * cs + v[2]! * sn - h)));
    // vértices da face de junção: os que ficam em x ou y pequenos perto da quina (|x|<1 e |y|<1)
    const q = verts(solidOf(p, 'A', jl)).filter((v) => v[0]! < 0.2 && Math.abs(v[1]!) < 1.5);
    expect(q.length).toBeGreaterThanOrEqual(4);
    for (const v of q) {
      expect(dA(v)).toBeLessThan(1e-9);
      expect(dB(v)).toBeLessThan(1e-9);
    }
  });

  it('sem junção inclinada (jl ausente) o sólido é o de hoje: canto vertical deslocado, volume diferente', () => {
    const p = build(corner(15, 15));
    expect(Math.abs(signedVolume(solidOf(p, 'A')) - 2.484662832984199)).toBeLessThan(1e-9);
  });

  it('parede vertical sem vizinha inclinada: sólido idêntico com e sem a junção do nível', () => {
    const p = build([
      { id: 'A', a: { x: 4, y: 0 }, b: { x: 0, y: 0 } },
      { id: 'B', a: { x: 0, y: 0 }, b: { x: 0, y: 4 } },
    ]);
    const jl = junctionLevel(p, 'lv_0');
    expect(solidOf(p, 'A', jl)).toEqual(solidOf(p, 'A'));
    expect(solidOf(p, 'B', jl)).toEqual(solidOf(p, 'B'));
  });
});

describe('F2.4 · encosto (tee) com junção inclinada', () => {
  // Hospedeira de (-2,0) a (4,0) inclinada 15° (esquerda = +y); ramo vertical de (1,3) a (1,0) encosta nela.
  const tee = (): Project => build([
    { id: 'H', a: { x: -2, y: 0 }, b: { x: 4, y: 0 }, tilt: 15 },
    { id: 'R', a: { x: 1, y: 3 }, b: { x: 1, y: 0 }, kind: 'butt' },
  ]);
  it('a ponta do ramo é cortada pelo plano inclinado da hospedeira: y = 0,1035 em z=0 e y = 0,9074 em z=3', () => {
    const p = tee();
    const jl = junctionLevel(p, 'lv_0');
    const s = solidOf(p, 'R', jl);
    expect(closed(s)).toBe(true);
    const cs = Math.cos((15 * Math.PI) / 180), sn = Math.sin((15 * Math.PI) / 180);
    const fim = verts(s).filter((v) => v[1]! < 1);
    expect(fim.length).toBeGreaterThanOrEqual(4);
    for (const v of fim) expect(Math.abs(v[1]! * cs - v[2]! * sn - 0.1)).toBeLessThan(1e-9);
    expect(Math.min(...fim.filter((v) => Math.abs(v[2]!) < 1e-9).map((v) => v[1]!))).toBeCloseTo(0.1035276180410083, 9);
    expect(Math.max(...fim.filter((v) => Math.abs(v[2]! - 3) < 1e-9).map((v) => v[1]!))).toBeCloseTo(0.9073751953343764, 9);
    // o comprimento do ramo varia d(z): 3 - 0,1035 na base e 3 - 0,9074 no topo
    expect(signedVolume(s)).toBeGreaterThan(0);
  });
});
