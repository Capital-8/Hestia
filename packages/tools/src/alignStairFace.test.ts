import { describe, expect, it } from 'vitest';
import { arcFromSagitta, arcPointAt, arcTangentAt, cross, dist, norm, sub, type Vec2 } from '@hestia/geom';
import {
  defaultRampTypeId,
  defaultStairTypeId,
  makeRamp,
  makeStair,
  type StairCurve,
  type StairRun,
} from '@hestia/model';
import { alignFeaturesAt, type AlignFeature } from './alignFeatures.ts';
import { distToCurve } from './stairPickLines.ts';
import { P, makeEnv, tool } from './testEnv.ts';
import type { PreviewItem } from './types.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const curve = (ax: number, ay: number, bx: number, by: number, sag = 0): StairCurve => ({
  a: v(ax, ay),
  b: v(bx, by),
  sag,
});
const near = (a: Vec2, b: Vec2, tol = 1e-9): boolean => dist(a, b) <= tol;

/** Lance reto: limite esquerdo de (0,0) a (0,4), direito de (1,0) a (1,4) e um espelho em y = 0. */
const straightRun = (id = 'r1'): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [curve(0, 0, 0, 4)],
  boundaryRight: [curve(1, 0, 1, 4)],
  risers: [curve(0, 0, 1, 0)],
  path: [],
});

/** Lance com o limite esquerdo em arco (flecha 0,4 m). */
const arcRun = (id = 'r1'): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [curve(0, 0, 0, 4, 0.4)],
  boundaryRight: [curve(1, 0, 1, 4)],
  risers: [curve(0, 0, 1, 0)],
  path: [],
});

function ctxComEscada(run: StairRun = straightRun(), topLevelId: string | null = null) {
  const ctx = makeEnv();
  ctx.store.exec({
    type: 'addStair',
    stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId, components: [run] }),
  });
  return ctx;
}

const arestas = (features: AlignFeature[]): AlignFeature[] => features.filter((f) => f.kind === 'arestaEscada');

const linhas = (items: PreviewItem[]): Array<{ a: Vec2; b: Vec2 }> =>
  items.filter((i): i is { kind: 'line'; a: Vec2; b: Vec2 } => i.kind === 'line');

describe('Alinhar: a aresta inteira de escada/rampa', () => {
  it('a prévia desenha o limite inteiro (0,0)-(0,4), não o risco fixo de 2,4 m', () => {
    const ctx = ctxComEscada();
    const t = tool('align', ctx.env);
    t.move(P(0, 2));

    const linhasPreview = linhas(t.preview());
    expect(linhasPreview.some((l) => near(l.a, v(0, 0)) && near(l.b, v(0, 4)))).toBe(true);
    // O marcador antigo ia de (0, 0,8) a (0, 3,2).
    expect(linhasPreview.some((l) => near(l.a, v(0, 0.8)) && near(l.b, v(0, 3.2)))).toBe(false);

    const rotulos = t.preview().filter((i): i is { kind: 'label'; at: Vec2; text: string } => i.kind === 'label');
    expect(rotulos.some((r) => near(r.at, v(0, 2)))).toBe(true);
  });

  it('alignFeaturesAt devolve uma feição por curva lógica no lance reto', () => {
    const ctx = ctxComEscada();
    const p = ctx.store.project;

    const noLimite = alignFeaturesAt({ project: p, levelId: 'lv_0', at: v(0, 2), metersPerPixel: 0.01 });
    const limite = arestas(noLimite);
    expect(limite).toHaveLength(1);
    expect(limite[0]!.seg).toEqual({ a: v(0, 0), b: v(0, 4) });
    expect(limite[0]!.curve).toBeUndefined();
    expect(limite[0]!.label).toBe('limite da escada');
    expect(limite[0]!.distance).toBeCloseTo(0, 9);

    // Na ponta, o limite e o espelho convivem: duas curvas lógicas, com chaves distintas.
    const naPonta = arestas(alignFeaturesAt({ project: p, levelId: 'lv_0', at: v(0, 0), metersPerPixel: 0.01 }));
    expect(naPonta).toHaveLength(2);
    expect(new Set(naPonta.map((f) => f.key)).size).toBe(2);
  });

  it('arco: uma feição com a curva inteira e a tangente no ponto clicado', () => {
    const ctx = ctxComEscada(arcRun());
    const p = ctx.store.project;
    const c = arcRun().boundaryLeft[0]!;
    const arc = arcFromSagitta(c.a, c.b, c.sag)!;
    const at = arcPointAt(arc, arc.length * 0.3);

    const encontradas = arestas(alignFeaturesAt({ project: p, levelId: 'lv_0', at, metersPerPixel: 0.01 }));
    expect(encontradas).toHaveLength(1);
    const feira = encontradas[0]!;
    expect(feira.curve).toEqual({ a: v(0, 0), b: v(0, 4), sag: 0.4 });
    expect(feira.seg).toEqual({ a: v(0, 0), b: v(0, 4) });

    // Tangente do arco (não a corda, que é vertical em x = 0).
    const tangente = arcTangentAt(arc, arc.length * 0.3);
    expect(feira.line.d.x).toBeCloseTo(tangente.x, 9);
    expect(feira.line.d.y).toBeCloseTo(tangente.y, 9);
    expect(Math.abs(cross(feira.line.d, norm(sub(c.b, c.a))))).toBeGreaterThan(0.1);

    // A prévia acompanha o arco em vários segmentos, todos sobre a curva.
    const t = tool('align', ctx.env);
    t.move(P(at.x, at.y));
    const linhasPreview = linhas(t.preview());
    expect(linhasPreview.length).toBeGreaterThan(2);
    expect(linhasPreview.every((l) => distToCurve(c, l.a) < 1e-3 && distToCurve(c, l.b) < 1e-3)).toBe(true);
  });

  it('rampa: feição arestaRampa com a aresta inteira na prévia', () => {
    const ctx = makeEnv();
    ctx.store.exec({
      type: 'addRamp',
      ramp: makeRamp({ id: 'rp1', typeId: defaultRampTypeId, levelId: 'lv_0', components: [straightRun('rc1')] }),
    });
    const p = ctx.store.project;
    const feira = alignFeaturesAt({ project: p, levelId: 'lv_0', at: v(0, 2), metersPerPixel: 0.01 }).find(
      (f) => f.kind === 'arestaRampa',
    );
    expect(feira).toBeDefined();
    expect(feira!.label).toBe('limite da rampa');
    expect(feira!.seg).toEqual({ a: v(0, 0), b: v(0, 4) });
    expect(feira!.move).toEqual({ policy: 'transladar', target: 'rampa', id: 'rp1' });

    const t = tool('align', ctx.env);
    t.move(P(0, 2));
    expect(linhas(t.preview()).some((l) => near(l.a, v(0, 0)) && near(l.b, v(0, 4)))).toBe(true);
  });

  it('chegada: a escada que topa em lv_1 é reconhecida na planta de lv_1', () => {
    const ctx = ctxComEscada(straightRun(), 'lv_1');
    const feira = arestas(
      alignFeaturesAt({ project: ctx.store.project, levelId: 'lv_1', at: v(0, 2), metersPerPixel: 0.01 }),
    );
    expect(feira).toHaveLength(1);
    expect(feira[0]!.ownerId).toBe('st1');
    expect(feira[0]!.seg).toEqual({ a: v(0, 0), b: v(0, 4) });
  });
});
