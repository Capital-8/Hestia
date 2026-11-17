import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, type JoinKind, type Wall } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { ringArea } from '@hestia/geom';
import { buildFrame } from './index.ts';
import { endPoint as layerEndPoint } from './layerGeom.ts';
import { levelLayers, levelSet, levelSetAdaptive, isFail, type LevelSet, type Relation, type TiltJoinFail, type TiltJoinResult, type TiltWall } from './wallTiltJoin.ts';

/** J1: junção exata de arcos inclinados (círculo×círculo e círculo×reta por cota), valores à mão, tolerância 1e-6. */
const baseType = createEmptyProject().wallTypes.wt_alv14!;
const typeOf = (t: number) => ({ ...baseType, layers: [{ ...baseType.layers[0]!, function: 'structure' as const, thickness: t }] });
function wall(id: string, a: Vec2, b: Vec2, sag: number, kind: JoinKind = 'miter'): Wall {
  const j = { kind, flip: false };
  return { ...makeWall({ id, typeId: 'x', levelId: 'lv_0', a, b, sag, joinStart: j, joinEnd: j }), order: id === 'A' ? 1 : 2 };
}
const tw = (w: Wall, t: number, tiltDeg: number): TiltWall => ({ frame: buildFrame(w, typeOf(t))!, tiltDeg });
const set = (A: TiltWall, B: TiltWall) => new Map([['A', A], ['B', B]]);
const pair = (ea: 'a' | 'b', eb: 'a' | 'b'): Relation[] => [{ kind: 'pair', a: { id: 'A', end: ea }, b: { id: 'B', end: eb } }];
const ok = <T extends object>(r: T | TiltJoinFail): T => {
  if (isFail(r as TiltJoinResult | TiltJoinFail)) throw new Error(`falha ${(r as TiltJoinFail).fail}`);
  return r as T;
};
const node = (ls: LevelSet): Vec2 => ls.nodes.get('A|a') ?? ls.nodes.get('A|b')!;
const TAN15 = 0.2679491924311227;
const TAN10 = 0.17632698070846498;

describe('J1 · arco×arco', () => {
  it('(a) arcos concêntricos tangentes, mesmo R=5 e mesmo tilt: canto = (R_f·cosφ, R_f·sinφ)', () => {
    // A: (5,0)→(0,5) anti-horário (centro à esquerda, sag<0); B: (0,5)→(−5,0). Tilt −10 (topo à direita = afasta do centro).
    const sag = -(5 - Math.sqrt(25 - 12.5));
    const A = tw(wall('A', { x: 5, y: 0 }, { x: 0, y: 5 }, sag), 0.2, -10);
    const B = tw(wall('B', { x: 0, y: 5 }, { x: -5, y: 0 }, sag), 0.2, -10);
    const f = A.frame;
    for (const [z, Rz] of [[0, 5], [1.4, 5 + 1.4 * TAN10], [2.8, 5 + 2.8 * TAN10]] as const) {
      const ls = ok(levelSet(set(A, B), pair('b', 'a'), z));
      const n = node(ls);
      expect(n.x).toBeCloseTo(0, 6);
      expect(n.y).toBeCloseTo(Rz, 6); // φ = 90°: (R_f·cos φ, R_f·sin φ) com ρ = R
      // faces: ρ = R + k·z·tanθ + (ρ0−R)/cosθ; k=−1, d=z·tan(−10°) → +z·tan10
      for (const s of [f.sHi, f.sLo]) {
        const rho = Rz + (f.arc!.k * s) / Math.cos((10 * Math.PI) / 180);
        for (const fr of ['A', 'B'] as const) {
          const fl = ls.frames.get(fr)!;
          const p = layerEndPoint(fl, fr === 'A' ? 'b' : 'a', ls.ends.get(fr)![fr === 'A' ? 'b' : 'a'], s * (1 / Math.cos((10 * Math.PI) / 180)));
          expect(p.x).toBeCloseTo(0, 6);
          expect(p.y).toBeCloseTo(rho, 6);
        }
      }
    }
  });

  it('(b) círculos de centros (0,0) e (6,0), R=5, tilt 15° afastando: eixo em x=3, y=√((5+z·tan15°)²−9)', () => {
    const sg = 5 - Math.sqrt(20);
    const A = tw(wall('A', { x: 3, y: 4 }, { x: 5, y: 0 }, sg), 0.2, 15); // horário em torno de (0,0): centro à direita, tilt>0 afasta
    const B = tw(wall('B', { x: 3, y: 4 }, { x: 1, y: 0 }, -sg), 0.2, -15); // anti-horário em torno de (6,0): afastar = tilt<0
    const lit: Array<[number, number]> = [[0, 4], [1.4, 4.460046004549249], [2.8, 4.905656333530861]];
    for (const [z, y] of lit) {
      const n = node(ok(levelSet(set(A, B), pair('a', 'a'), z)));
      expect(n.x).toBeCloseTo(3, 6);
      expect(n.y).toBeCloseTo(y, 6);
    }
    expect(lit[2]![1]).toBeCloseTo(4.906, 3);
    // níveis adaptativos: de 0 a H, com 0, H/2 e H; em cada nível o nó confere com a fórmula fechada; a corda erra < 0,5 mm
    const r = ok(levelSetAdaptive(set(A, B), pair('a', 'a'), 2.8));
    expect(r.zs[0]).toBe(0);
    expect(r.zs[r.zs.length - 1]).toBe(2.8);
    expect(r.zs).toContain(1.4);
    expect(r.zs.length).toBeGreaterThanOrEqual(3);
    expect(r.zs.length).toBeLessThanOrEqual(10);
    const yOf = (z: number) => Math.sqrt((5 + z * TAN15) ** 2 - 9);
    r.sets.forEach((ls, i) => expect(node(ls).y).toBeCloseTo(yOf(r.zs[i]!), 6));
    for (let i = 0; i + 1 < r.zs.length; i++) {
      const zm = (r.zs[i]! + r.zs[i + 1]!) / 2;
      expect(Math.abs(yOf(zm) - (yOf(r.zs[i]!) + yOf(r.zs[i + 1]!)) / 2)).toBeLessThan(5e-4 + 1e-9);
    }
  });

  it('(c) arco×reta: eixo reta y=0 e círculo de centro (0,−3), R=5: canto x=4 em z=0; inclinado: R=5+z·tan15°, y=z·tan15°', () => {
    const sg = 5 - Math.sqrt(20);
    const A = tw(wall('A', { x: 4, y: 0 }, { x: 0, y: 2 }, -sg), 0.2, -15); // anti-horário em torno de (0,−3): afastar = tilt<0
    const B = tw(wall('B', { x: 4, y: 0 }, { x: 10, y: 0 }, 0), 0.2, 15); // topo à esquerda (+y)
    const n0 = node(ok(levelSet(set(A, B), pair('a', 'a'), 0)));
    expect(n0.x).toBeCloseTo(4, 6);
    expect(n0.y).toBeCloseTo(0, 6);
    const n2 = node(ok(levelSet(set(A, B), pair('a', 'a'), 2)));
    expect(n2.x).toBeCloseTo(4.259529732194504, 6); // x² = (5+2·tan15°)² − (2·tan15°+3)²
    expect(n2.y).toBeCloseTo(2 * TAN15, 6);
  });

  it('(d) cone invertido (R + k·z·tanθ ≤ 0) é recusado com falha tipada', () => {
    // R=1 (a mesma corda de 90°), topo aproximando do centro 45°: R(z)=1−z → ≤0 em z=3
    const sg = -(1 - Math.sqrt(0.5));
    const A = tw(wall('A', { x: 1, y: 0 }, { x: 0, y: 1 }, sg), 0.2, 45);
    const B = tw(wall('B', { x: 0, y: 1 }, { x: -1, y: 0 }, sg), 0.2, 45);
    const r = levelSetAdaptive(set(A, B), pair('b', 'a'), 3);
    expect(r).toMatchObject({ fail: 'cone-invertido' });
    expect(isFail({ fail: 'cone-invertido' } as never)).toBe(true);
  });

  it('reta×reta: níveis exatamente 0, H/2 e H; anéis iguais aos de levelSet', () => {
    const A = tw(wall('A', { x: 4, y: 0 }, { x: 0, y: 0 }, 0), 0.2, 15);
    const B = tw(wall('B', { x: 0, y: 0 }, { x: 0, y: 4 }, 0), 0.2, 30);
    const L = ok(levelLayers(set(A, B), pair('b', 'a'), 3));
    expect(L.zs).toEqual([0, 1.5, 3]);
    const ls = ok(levelSet(set(A, B), pair('b', 'a'), 1.5));
    expect(L.walls.get('A')![0]!.rings[1]).toEqual([...ok(levelSetRings(ls, 'A'))]);
  });
});

import { levelRings } from './wallTiltJoin.ts';
const levelSetRings = (ls: LevelSet, id: string) => [...levelRings(ls, id).values()][0]!;

/** PRNG próprio (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('J1 · fuzz de 300 pares arco×arco e arco×reta (semente fixa)', { timeout: 120000 }, () => {
  const rnd = prng(20261115);
  const span = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  interface Case { A: TiltWall; B: TiltWall; H: number; cls: 'arcoArco' | 'arcoReta' }
  const cases: Case[] = [];
  for (let i = 0; i < 300; i++) {
    const ang0 = span(0, 2 * Math.PI);
    const between = span(20, 160) * (Math.PI / 180) * (rnd() < 0.5 ? 1 : -1);
    const mk = (id: string, ang: number, curvo: boolean): TiltWall => {
      const L = span(2, 5);
      const b = { x: L * Math.cos(ang), y: L * Math.sin(ang) };
      const sag = curvo ? span(0.05, 0.5) * L * (rnd() < 0.5 ? 1 : -1) : 0;
      return tw(wall(id, { x: 0, y: 0 }, b, sag), span(0.1, 0.4), span(-30, 30));
    };
    const arcoArco = i % 2 === 0;
    cases.push({ A: mk('A', ang0, true), B: mk('B', ang0 + between, arcoArco), H: span(2, 6), cls: arcoArco ? 'arcoArco' : 'arcoReta' });
  }
  const rel = pair('a', 'a');
  /** Distância do ponto à face (profundidade s do quadro original) no nível z, pelas fórmulas fechadas (não pelo código testado). */
  const dFace = (tw0: TiltWall, z: number, s: number, p: Vec2): number => {
    const f = tw0.frame, th = (tw0.tiltDeg * Math.PI) / 180;
    const off = s / Math.cos(th) + z * Math.tan(th); // deslocamento à esquerda da face no nível
    if (f.arc) return Math.abs(Math.hypot(p.x - f.arc.center.x, p.y - f.arc.center.y) - (f.arc.radius + f.arc.k * off));
    return Math.abs((p.x - f.a.x) * f.n.x + (p.y - f.a.y) * f.n.y - off);
  };
  it('nunca NaN, volume ≥ 0, cantos sobre as faces (1e-6), < 3 ms por par', () => {
    let ms = 0, msAneis = 0, n = 0, viavel = 0, semEsquadria = 0, verificados = 0;
    const falhas: Record<string, number> = {};
    for (const c of cases) {
      const t0 = performance.now();
      levelSetAdaptive(set(c.A, c.B), rel, c.H);
      ms += performance.now() - t0;
      const t1 = performance.now();
      const L = levelLayers(set(c.A, c.B), rel, c.H);
      msAneis += performance.now() - t1;
      n++;
      if ('fail' in L) { falhas[L.fail] = (falhas[L.fail] ?? 0) + 1; continue; }
      viavel++;
      expect(L.zs[0]).toBe(0);
      expect(L.zs[L.zs.length - 1]).toBe(c.H);
      for (const [id, tws] of [['A', c.A], ['B', c.B]] as const) {
        for (const lay of L.walls.get(id)!) {
          const areas = lay.rings.map((r) => ringArea(r));
          expect(areas.every((a) => Number.isFinite(a))).toBe(true);
          expect(lay.rings.every((r) => r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))).toBe(true);
          const sg = Math.sign(areas[0]!);
          let vol = 0;
          for (let i = 0; i + 1 < areas.length; i++) vol += ((Math.abs(areas[i]!) + Math.abs(areas[i + 1]!)) / 2) * (L.zs[i + 1]! - L.zs[i]!);
          expect(vol).toBeGreaterThanOrEqual(0);
          expect(areas.every((a) => Math.sign(a) === sg)).toBe(true);
          void tws;
        }
      }
      // cantos: em cada nível, as pontas do canto de A caem sobre uma das faces de B e vice-versa
      const R = levelSetAdaptive(set(c.A, c.B), rel, c.H);
      if ('fail' in R) continue;
      R.sets.forEach((ls, i) => {
        const z = R.zs[i]!;
        // Esquadria mal condicionada (ângulo agudo demais): joinPair mantém o corte reto de propósito; fora da verificação de canto.
        const nd = ls.nodes.get('A|a')!;
        expect(dFace(c.A, z, 0, nd)).toBeLessThan(1e-6); // o nó está nos dois eixos do nível
        expect(dFace(c.B, z, 0, nd)).toBeLessThan(1e-6);
        const flat = (id: string): boolean => ls.ends.get(id)!['a'].hi.kind === 'flat';
        if (flat('A') || flat('B')) { semEsquadria++; return; }
        verificados++;
        for (const [self, other] of [[c.A, c.B], [c.B, c.A]] as const) {
          const id = self.frame.wall.id;
          const fl = ls.frames.get(id)!;
          for (const s of [self.frame.sHi, self.frame.sLo]) {
            const p = layerEndPoint(fl, 'a', ls.ends.get(id)!['a'], sAtDepthScaled(self, s));
            expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
            const dOther = Math.min(dFace(other, z, other.frame.sHi, p), dFace(other, z, other.frame.sLo, p));
            if (ls.ends.get(id)!['a'].hi.kind === 'miter' && ls.ends.get(other.frame.wall.id)!['a'].hi.kind === 'miter') expect(dOther).toBeLessThan(1e-6);
            expect(dFace(self, z, s, p)).toBeLessThan(1e-6);
          }
        }
      });
    }
    console.log(`J1 FUZZ n=${n} viavel=${viavel} semEsquadria=${semEsquadria} verificados=${verificados} falhas=${JSON.stringify(falhas)} ms/par(niveis)=${(ms / n).toFixed(3)} ms/par(niveis+aneis)=${(msAneis / n).toFixed(3)}`);
    expect(viavel).toBeGreaterThan(150);
    expect(verificados).toBeGreaterThan(300);
    expect(Object.keys(falhas).every((k) => ['cone-invertido', 'no-fora-da-parede', 'sem-cruzamento', 'corte-nulo'].includes(k))).toBe(true);
    expect(ms / n).toBeLessThan(3); // níveis adaptativos (núcleo)
    expect(msAneis / n).toBeLessThan(8); // com os anéis de todas as camadas (layerQuad de arco domina)
  });
});
/** Coordenada s da face no nível (a espessura horizontal é t/cosθ). */
function sAtDepthScaled(t: TiltWall, s: number): number {
  return s / Math.cos((t.tiltDeg * Math.PI) / 180);
}
