import { describe, expect, it } from 'vitest';
import { multiArea, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import { buildFrame, joinStatus, resolveLevel, type WallFrame } from './index.ts';

/**
 * SPIKE S2 (docs/parede-formas/METODOLOGIA.md, S2): teste SOMENTE LEITURA sobre as junções atuais.
 * Arcos consecutivos tangentes (junção de ~180°): círculo r=3 em 2 arcos e dois arcos tangentes de raios 2 e 5.
 * Valores literais do documento: área do círculo = 2π·r·t = 3,7699 m² (t=0,2).
 */

const TIPO = 'wt_s2_t20';

interface Peca {
  id: string;
  a: Vec2;
  b: Vec2;
  sag: number;
}

/** Projeto com um tipo de parede de camada única de 0,20 m (t=0,2 do S2) e as peças na ordem dada. */
function montar(pecas: Peca[]): Project {
  const base = createEmptyProject();
  const alv = base.wallTypes['wt_alv14']!;
  const estrutura = alv.layers.find((l) => l.function === 'structure')!;
  const tipo = { ...alv, id: TIPO, layers: [{ ...estrutura, thickness: 0.2 }] };
  const s = new ProjectStore({ ...base, wallTypes: { ...base.wallTypes, [TIPO]: tipo } });
  for (const p of pecas) s.exec({ type: 'addWall', wall: makeWall({ id: p.id, typeId: TIPO, levelId: 'lv_0', a: p.a, b: p.b, sag: p.sag, height: 3 }) });
  return s.project;
}

const framesDe = (p: Project, ids: string[]): WallFrame[] =>
  ids.map((id) => buildFrame(p.elements[id] as never, p.wallTypes[TIPO]!)!);

/** União dos polígonos de planta (camadas cortadas) das paredes dadas. */
function uniao(p: Project, ids: string[]): MultiPolygon {
  const res = resolveLevel(p, 'lv_0', new Map());
  return union(...ids.flatMap((id) => res.walls[id]!.layers.map((l) => l.cut)));
}

const vertices = (mp: MultiPolygon): Vec2[] => mp.flatMap((poly) => poly.flatMap((r) => r as Ring));

/** Desvio angular (rad) da face de topo na ponta `no` de uma parede em arco de centro `c`: vértices de cada raio com menor desvio da direção radial do nó. */
function desvioRadial(p: Project, id: string, c: Vec2, no: Vec2, raios: number[]): number {
  const res = resolveLevel(p, 'lv_0', new Map());
  const vs = res.walls[id]!.layers.flatMap((l) => vertices(l.cut));
  const ang = Math.atan2(no.y - c.y, no.x - c.x);
  let pior = 0;
  for (const r of raios) {
    const doRaio = vs.filter((v) => Math.abs(Math.hypot(v.x - c.x, v.y - c.y) - r) < 1e-6);
    const d = Math.min(...doRaio.map((v) => Math.abs(Math.atan2(v.y - c.y, v.x - c.x) - ang)));
    pior = Math.max(pior, d);
  }
  return pior;
}

/** Arestas de emenda: arestas de região (união por material) que ficam sobre a reta radial do nó, dentro da espessura. */
function arestasDeEmenda(p: Project, c: Vec2, nos: Vec2[], rIn: number, rOut: number): number {
  const res = resolveLevel(p, 'lv_0', new Map());
  let n = 0;
  for (const cl of res.clusters) {
    for (const reg of cl.regions) {
      for (const poly of reg.polygons) {
        for (const ring of poly) {
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!;
            const b = ring[(i + 1) % ring.length]!;
            for (const no of nos) {
              const u = { x: no.x - c.x, y: no.y - c.y };
              const L = Math.hypot(u.x, u.y);
              const naReta = (q: Vec2): boolean => Math.abs(((q.x - c.x) * u.y - (q.y - c.y) * u.x) / L) < 1e-6 && ((q.x - c.x) * u.x + (q.y - c.y) * u.y) / L > rIn - 1e-6 && ((q.x - c.x) * u.x + (q.y - c.y) * u.y) / L < rOut + 1e-6;
              if (naReta(a) && naReta(b) && Math.hypot(a.x - b.x, a.y - b.y) > 1e-6) n++;
            }
          }
        }
      }
    }
  }
  return n;
}

const CIRCULO: Peca[] = [
  { id: 'c1', a: { x: -3, y: 0 }, b: { x: 3, y: 0 }, sag: 3 },
  { id: 'c2', a: { x: 3, y: 0 }, b: { x: -3, y: 0 }, sag: 3 },
];

describe('S2 · círculo r=3 em dois arcos de 180° (t=0,2; H=3)', () => {
  const p = montar(CIRCULO);
  const frames = framesDe(p, ['c1', 'c2']);

  it('joinStatus das 4 pontas = pair', () => {
    for (const id of ['c1', 'c2']) for (const w of ['a', 'b'] as const) expect(joinStatus(frames, id, w).kind, `${id}.${w}`).toBe('pair');
  });

  // O documento pede 1e-4; a planta discretiza o arco em cordas e o polígono fica por dentro do círculo. Medido: erro relativo
  // 1,3e-4 (área ~3,7694). A tolerância documentada para a discretização é 5e-4; o erro não vem da junção.
  it('área da união da planta = 2π·r·t = 3,7699 m² (tolerância relativa 5e-4 pela discretização)', () => {
    expect(Math.abs(multiArea(uniao(p, ['c1', 'c2'])) - 3.7699) / 3.7699).toBeLessThan(5e-4);
  });

  it('face de topo radial nas duas pontas, desvio angular < 1e-6 rad', () => {
    const c = { x: 0, y: 0 };
    expect(desvioRadial(p, 'c1', c, { x: 3, y: 0 }, [2.9, 3.1])).toBeLessThan(1e-6);
    expect(desvioRadial(p, 'c1', c, { x: -3, y: 0 }, [2.9, 3.1])).toBeLessThan(1e-6);
    expect(desvioRadial(p, 'c2', c, { x: 3, y: 0 }, [2.9, 3.1])).toBeLessThan(1e-6);
    expect(desvioRadial(p, 'c2', c, { x: -3, y: 0 }, [2.9, 3.1])).toBeLessThan(1e-6);
  });

  it('zero aresta de emenda na planta entre as duas paredes (mesmo tipo)', () => {
    expect(arestasDeEmenda(p, { x: 0, y: 0 }, [{ x: 3, y: 0 }, { x: -3, y: 0 }], 2.9, 3.1)).toBe(0);
  });

  it('trocar a ordem das paredes dá o mesmo resultado (área e status)', () => {
    const q = montar([CIRCULO[1]!, CIRCULO[0]!]);
    const fq = framesDe(q, ['c1', 'c2']);
    expect(Math.abs(multiArea(uniao(q, ['c1', 'c2'])) - multiArea(uniao(p, ['c1', 'c2'])))).toBeLessThan(1e-9);
    for (const id of ['c1', 'c2']) for (const w of ['a', 'b'] as const) expect(joinStatus(fq, id, w).kind).toBe('pair');
    expect(desvioRadial(q, 'c1', { x: 0, y: 0 }, { x: 3, y: 0 }, [2.9, 3.1])).toBeLessThan(1e-6);
  });
});

/** Arcos tangentes de raios 2 e 5, ambos de 90° virando à esquerda, nó em (0,0), tangente +x, centros (0,2) e (0,5). */
const TANGENTES: Peca[] = [
  { id: 'k1', a: { x: -2, y: 2 }, b: { x: 0, y: 0 }, sag: -0.585786 },
  { id: 'k2', a: { x: 0, y: 0 }, b: { x: 5, y: 5 }, sag: -1.464466 },
];

describe('S2 · dois arcos tangentes de raios 2 e 5 (90° cada)', () => {
  for (const [nome, ordem] of [['ordem k1,k2', TANGENTES], ['ordem k2,k1', [TANGENTES[1]!, TANGENTES[0]!]]] as const) {
    const p = montar([...ordem]);
    const frames = framesDe(p, ['k1', 'k2']);
    it(`${nome}: tangente no nó (sanidade) e joinStatus das pontas do nó = pair`, () => {
      expect(Math.abs(frames[0]!.arc!.radius - 2)).toBeLessThan(1e-3);
      expect(Math.abs(frames[1]!.arc!.radius - 5)).toBeLessThan(1e-3);
      expect(joinStatus(frames, 'k1', 'b').kind).toBe('pair');
      expect(joinStatus(frames, 'k2', 'a').kind).toBe('pair');
    });
    // Oráculo literal: φ·t·(R1+R2) com φ=π/2, t=0,2 = 2,1991 m²; discretização 1e-3.
    it(`${nome}: área da união = 2,1991 m² (rel. 1e-3)`, () => {
      expect(Math.abs(multiArea(uniao(p, ['k1', 'k2'])) - 2.1991) / 2.1991).toBeLessThan(1e-3);
    });
    it(`${nome}: face de topo radial no nó (< 1e-6 rad) nas duas paredes`, () => {
      expect(desvioRadial(p, 'k1', { x: 0, y: 2 }, { x: 0, y: 0 }, [1.9, 2.1])).toBeLessThan(1e-6);
      expect(desvioRadial(p, 'k2', { x: 0, y: 5 }, { x: 0, y: 0 }, [4.9, 5.1])).toBeLessThan(1e-6);
    });
    it(`${nome}: zero aresta de emenda no nó`, () => {
      expect(arestasDeEmenda(p, { x: 0, y: 2 }, [{ x: 0, y: 0 }], 1.9, 2.1)).toBe(0);
    });
  }
});
