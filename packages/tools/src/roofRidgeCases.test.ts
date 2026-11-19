import { describe, expect, it } from 'vitest';
import { type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, type Project } from '@hestia/model';
import { resolveRoofs, roofTopAt, type ResolvedRoof, type RoofLine } from '@hestia/engine';
import { addSegs, newDraft, setSegSlope, type NewSeg } from './perimeterSession.ts';
import { commitPerimeter } from './perimeterCommit.ts';

/**
 * Regra da cumeeira (aprovada), casos documentados com o motor real: a pegada sai do esboço (commit) e as águas, a
 * cumeeira e os espigões vêm do esqueleto reto. Balanço de 0,5 m (padrão): o beiral é a pegada menos 0,5 m em volta.
 */

const P = (x: number, y: number): Vec2 => ({ x, y });
/** Retângulo 10 × 7 anti-horário: aresta 0 = base (y = 0), 1 = direita (x = 10), 2 = topo (y = 7), 3 = esquerda (x = 0). */
const RECT: Vec2[] = [P(0, 0), P(10, 0), P(10, 7), P(0, 7)];
/** L de 10 × 8: braço de baixo 10 × 4, braço de cima 5 × 4 à esquerda. Arestas: 0 base, 1 direita baixa, 2 degrau, 3 interna, 4 topo, 5 esquerda. */
const L: Vec2[] = [P(0, 0), P(10, 0), P(10, 4), P(5, 4), P(5, 8), P(0, 8)];

/** Esboço com um lado por aresta: `slopes[i]` = inclinação em % (lado que define) ou null (empena). */
function sketch(ring: Vec2[], slopes: Array<number | null>, slopeDefault = 30) {
  const segs: NewSeg[] = ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length]! }));
  let d = addSegs(newDraft('roof', { slopePct: slopeDefault }), segs);
  slopes.forEach((s, i) => {
    const id = d.segs[i]!.id;
    d = s === null ? setSegSlope(d, id, { definesSlope: false }) : setSegSlope(d, id, { definesSlope: true, slopePct: s });
  });
  return d;
}

/** Cria o telhado pelo esboço e devolve o projeto e o resultado do motor. */
function build(ring: Vec2[], slopes: Array<number | null>, slopeDefault?: number): { p: Project; roof: ResolvedRoof; msg: string } {
  const r = commitPerimeter(new ProjectStore(createEmptyProject()).project, sketch(ring, slopes, slopeDefault), { typeId: 'rt_ceramica', levelId: 'lv_0' });
  if (!r.ok) throw new Error(`recusado: ${r.message}`);
  const store = new ProjectStore(createEmptyProject());
  store.exec(r.commands[0]!);
  return { p: store.project, roof: resolveRoofs(store.project, 'lv_0')[0]!, msg: r.message };
}

const ofKind = (lines: RoofLine[], kind: RoofLine['kind']): RoofLine[] => lines.filter((l) => l.kind === kind);
const near = (v: number, want: number, tol = 1e-6): void => expect(Math.abs(v - want)).toBeLessThanOrEqual(tol);

describe('caso 1: uma aresta define = uma água, sem cumeeira', () => {
  it('base com 30 %: uma água, nenhuma cumeeira, espigão ou rincão', () => {
    const { roof, msg } = build(RECT, [30, null, null, null]);
    expect(roof.problem).toBeUndefined();
    expect(roof.planes).toHaveLength(1);
    expect(msg).toBe('Telhado criado: 1 água.');
    expect(ofKind(roof.lines, 'ridge')).toHaveLength(0);
    expect(ofKind(roof.lines, 'hip')).toHaveLength(0);
    expect(ofKind(roof.lines, 'valley')).toHaveLength(0);
  });

  it('a água sobe 30 % da aresta definidora até o outro lado do beiral: cota 2,80 m no beiral (padrão sem paredes)', () => {
    const { roof } = build(RECT, [30, null, null, null]);
    // Beiral em y = -0,5 com cota 2,80 m; em y = 7 a água está 0,30 × 7,5 m acima.
    near(roofTopAt(roof, P(4, -0.5))!, 2.8, 1e-6);
    near(roofTopAt(roof, P(4, 7))!, 2.8 + 0.3 * 7.5, 1e-6);
  });
});

describe('caso 2: duas arestas opostas definem = duas águas, cumeeira no meio', () => {
  it('base e topo definem (10 m de comprimento): duas águas, cumeeira horizontal em y = 3,5 (meio do beiral)', () => {
    const { roof, msg } = build(RECT, [30, null, 30, null]);
    expect(roof.problem).toBeUndefined();
    expect(roof.planes).toHaveLength(2);
    expect(msg).toBe('Telhado criado: 2 águas.');
    const [ridge] = ofKind(roof.lines, 'ridge');
    expect(ridge).toBeDefined();
    near(ridge!.a.y, 3.5);
    near(ridge!.b.y, 3.5);
    // Corre por todo o comprimento do beiral: de x = -0,5 a x = 10,5.
    expect(Math.min(ridge!.a.x, ridge!.b.x)).toBeCloseTo(-0.5, 6);
    expect(Math.max(ridge!.a.x, ridge!.b.x)).toBeCloseTo(10.5, 6);
    // As laterais curtas são empenas (sem beiral nesse lado).
    expect(ofKind(roof.lines, 'gable').length).toBeGreaterThan(0);
  });

  it('direita e esquerda definem (7 m de comprimento): cumeeira vertical em x = 5', () => {
    const { roof } = build(RECT, [null, 30, null, 30]);
    expect(roof.planes).toHaveLength(2);
    const [ridge] = ofKind(roof.lines, 'ridge');
    expect(ridge).toBeDefined();
    near(ridge!.a.x, 5);
    near(ridge!.b.x, 5);
  });
});

describe('caso 3: três ou quatro arestas definem: esqueleto reto (cumeeira, espigões, rincões)', () => {
  it('quatro arestas: quatro águas, cumeeira de 3 m no meio (10 - 7), quatro espigões', () => {
    const { roof, msg } = build(RECT, [30, 30, 30, 30]);
    expect(roof.problem).toBeUndefined();
    expect(roof.planes).toHaveLength(4);
    expect(msg).toBe('Telhado criado: 4 águas.');
    const [ridge] = ofKind(roof.lines, 'ridge');
    expect(ridge).toBeDefined();
    expect(Math.hypot(ridge!.b.x - ridge!.a.x, ridge!.b.y - ridge!.a.y)).toBeCloseTo(3, 6);
    expect(ofKind(roof.lines, 'hip')).toHaveLength(4);
    expect(ofKind(roof.lines, 'gable')).toHaveLength(0);
  });

  it('três arestas (base, direita, topo): três águas com uma cumeeira e dois espigões; a esquerda é empena', () => {
    // Três lados que definem já fecham o esqueleto: a quarta aresta não tem água, então o total é 3, não 4.
    const { roof, msg } = build(RECT, [30, 30, 30, null]);
    expect(roof.problem).toBeUndefined();
    expect(roof.planes).toHaveLength(3);
    expect(msg).toBe('Telhado criado: 3 águas.');
    expect(ofKind(roof.lines, 'ridge')).toHaveLength(1);
    expect(ofKind(roof.lines, 'hip')).toHaveLength(2);
    expect(ofKind(roof.lines, 'gable').length).toBeGreaterThan(0);
  });
});

describe('caso 4: mista = cumeeira do esqueleto das arestas que definem; águas terminam na empena', () => {
  it('base e direita definem (canto): duas águas que se encontram num espigão, sem cumeeira', () => {
    const { roof, msg } = build(RECT, [30, 30, null, null]);
    expect(roof.problem).toBeUndefined();
    expect(roof.planes).toHaveLength(2);
    expect(msg).toBe('Telhado criado: 2 águas.');
    expect(ofKind(roof.lines, 'ridge')).toHaveLength(0);
    expect(ofKind(roof.lines, 'hip')).toHaveLength(1);
    expect(ofKind(roof.lines, 'gable').length).toBeGreaterThan(0);
  });

  it('L com a empena interna: o esqueleto não fecha, a envoltória fecha e o commit cria o telhado', () => {
    // Base, braço de baixo e topo definem; a aresta interna é empena. Antes o commit recusava listando o ponto (5; 4).
    const { roof, msg } = build(L, [30, 30, null, null, 30, null]);
    expect(roof.problem).toBeUndefined();
    expect(roof.steps).toBeUndefined();
    expect(roof.planes.length).toBeGreaterThan(0);
    expect(msg).toMatch(/^Telhado criado/);
  });

  it('L com degrau entre água e empena: mantém o degrau do esqueleto e o commit cria o telhado sem recusa', () => {
    // Base, braço de baixo e a aresta interna vertical definem: gera degrau de 1,50 m em (5,50; 4,50), permitido para fechamento opcional.
    const { roof } = build(L, [30, 30, null, 30, null, null]);
    expect(roof.problem).toBeUndefined();
    expect(roof.steps).toHaveLength(1);
    expect(roof.steps![0]!.dz).toBeCloseTo(1.5, 6);
    expect(roof.planes.length).toBeGreaterThan(0);
  });
});

describe('caso 5: inclinações diferentes = bissetor ponderado pela inclinação', () => {
  it('base 30 % e topo 60 %: a cumeeira sai mais perto do lado de 60 % (y = 4,833 no beiral de 8 m)', () => {
    // Beiral: y de -0,5 a 7,5. Igualar 0,30 (y + 0,5) = 0,60 (7,5 - y) dá y = 4,8333.
    const { roof, msg } = build(RECT, [30, null, 60, null]);
    expect(roof.problem).toBeUndefined();
    expect(roof.planes).toHaveLength(2);
    expect(msg).toBe('Telhado criado: 2 águas.');
    const [ridge] = ofKind(roof.lines, 'ridge');
    expect(ridge).toBeDefined();
    near(ridge!.a.y, 4.8333, 1e-3);
    near(ridge!.b.y, 4.8333, 1e-3);
  });
});
