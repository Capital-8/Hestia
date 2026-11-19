import { describe, expect, it } from 'vitest';
import { multiArea, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeRoof } from '@hestia/model';
import { resolveRoofs, roofTopAt, type ResolvedRoof, type ResolvedRoofPlane, type RoofLine } from './index.ts';
import { envelopePlanes } from './roofEnvelope.ts';
import { skeletonPlanes } from './roofSkeleton.ts';
import { planeHas } from './roofGeom.ts';
import { planeZ } from './roofs.ts';

const P = (x: number, y: number): Vec2 => ({ x, y });
/** L de 8 × 8 com o degrau de 4 × 4 no canto de cima à direita. Arestas: 0 base, 1 direita baixa, 2 degrau, 3 interna, 4 topo, 5 esquerda. */
const L: Vec2[] = [P(0, 0), P(8, 0), P(8, 4), P(4, 4), P(4, 8), P(0, 8)];
/** U de 9 × 6 com a abertura de 3 × 4 em cima. Arestas: 0 base, 1 direita, 2 topo direito, 3 interna direita, 4 base interna, 5 interna esquerda, 6 topo esquerdo, 7 esquerda. */
const U: Vec2[] = [P(0, 0), P(9, 0), P(9, 6), P(6, 6), P(6, 2), P(3, 2), P(3, 6), P(0, 6)];

/** Telhado por arestas no motor real (sem o esqueleto de teste), com beiral na cota 0. */
function roofOf(boundary: Vec2[], edgeSlopes: Array<number | null>): ResolvedRoof {
  const s = new ProjectStore(createEmptyProject());
  s.exec({
    type: 'addRoof',
    roof: makeRoof({ id: 'r1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary, shape: 'edges', edgeSlopes, edgeOverhangs: boundary.map(() => 0), heightOffset: 0 }),
  });
  return resolveRoofs(s.project, 'lv_0')[0]!;
}

/** Cota de uma lista de águas em p: a menor entre as que cobrem p (na divisa, todas valem a mesma cota). */
function zOf(planes: ResolvedRoofPlane[], p: Vec2): number | null {
  const zs = planes.filter((pl) => planeHas(pl.polygon, p)).map((pl) => planeZ(pl, p));
  return zs.length ? Math.min(...zs) : null;
}

const ofKind = (lines: RoofLine[], kind: RoofLine['kind']): RoofLine[] => lines.filter((l) => l.kind === kind);
const near = (v: number | null, want: number): void => {
  expect(v).not.toBeNull();
  expect(Math.abs((v ?? NaN) - want)).toBeLessThan(1e-6);
};

describe('L com as duas arestas internas sem inclinação (Revit: aceita)', () => {
  // 30 % nas quatro arestas externas; as internas (2 e 3) são empenas. Cada aba tem o seu plano, estendido até o outro.
  const r = roofOf(L, [30, 30, null, null, 30, 30]);

  it('cria as águas sem problema e sem degrau', () => {
    expect(r.problem).toBeUndefined();
    expect(r.planes).toHaveLength(4);
    expect(r.steps).toBeUndefined();
  });

  it('alturas conferidas: 0,6 m acima do beiral em (2;2), (6;2) e (2;6)', () => {
    near(roofTopAt(r, P(2, 2)), 0.6);
    near(roofTopAt(r, P(6, 2)), 0.6);
    near(roofTopAt(r, P(2, 6)), 0.6);
  });

  it('área real maior que a em planta (água inclinada a 30 %)', () => {
    const plan = r.planes.reduce((s, pl) => s + multiArea(pl.polygon), 0);
    const real = r.planes.reduce((s, pl) => s + multiArea(pl.polygon) * Math.sqrt(1 + (pl.percent / 100) ** 2), 0);
    expect(plan).toBeCloseTo(48, 6);
    expect(real).toBeGreaterThan(plan);
    expect(real).toBeCloseTo(48 * Math.sqrt(1.09), 6);
  });

  it('as duas arestas internas aparecem como empena (linha gable) em planta', () => {
    const gables = ofKind(r.lines, 'gable');
    expect(gables.some((l) => Math.abs(l.a.y - 4) < 1e-6 && Math.abs(l.b.y - 4) < 1e-6)).toBe(true);
    expect(gables.some((l) => Math.abs(l.a.x - 4) < 1e-6 && Math.abs(l.b.x - 4) < 1e-6)).toBe(true);
  });
});

describe('U com um braço sem inclinação', () => {
  // A ponta do braço da esquerda (aresta 6) é a empena; as demais definem.
  const r = roofOf(U, [30, 30, 30, 30, 30, 30, null, 30]);

  it('aceito, com as cotas dos dois braços e da base', () => {
    expect(r.problem).toBeUndefined();
    expect(r.planes.length).toBeGreaterThan(0);
    near(roofTopAt(r, P(1, 4)), 0.3);
    near(roofTopAt(r, P(7, 4)), 0.3);
    near(roofTopAt(r, P(4.5, 1)), 0.3);
  });

  it('a área das águas é a da pegada (U 9 × 6 menos a abertura 3 × 4 = 42 m²)', () => {
    const plan = r.planes.reduce((s, pl) => s + multiArea(pl.polygon), 0);
    expect(plan).toBeCloseTo(42, 6);
  });
});

describe('fallback = esqueleto quando o esqueleto fecha (nada que funciona muda)', () => {
  it('retângulo com 2 águas e 2 empenas: envoltória e esqueleto dão as mesmas cotas', () => {
    const R: Vec2[] = [P(0, 0), P(8, 0), P(8, 6), P(0, 6)];
    const slopes = [30, null, 30, null];
    const sk = skeletonPlanes(R, [], slopes, 2.8);
    const env = envelopePlanes(R, slopes, 2.8);
    expect(sk.problem).toBeUndefined();
    expect(env.problem).toBeUndefined();
    for (const p of [P(1, 1), P(4, 3), P(7, 5.5), P(0.5, 3), P(4, 0.2)]) near(zOf(env.planes, p), zOf(sk.planes, p)!);
  });

  it('retângulo com 4 águas: envoltória e esqueleto dão as mesmas cotas', () => {
    const R: Vec2[] = [P(0, 0), P(10, 0), P(10, 6), P(0, 6)];
    const slopes = [45, 45, 45, 45];
    const sk = skeletonPlanes(R, [], slopes, 0);
    const env = envelopePlanes(R, slopes, 0);
    for (const p of [P(1, 1), P(5, 3), P(9, 5), P(2, 4.5)]) near(zOf(env.planes, p), zOf(sk.planes, p)!);
  });
});

describe('telhado plano: nenhuma aresta com inclinação', () => {
  it('uma água horizontal sobre o contorno, na cota do beiral, sem caimento', () => {
    const r = roofOf(L, [null, null, null, null, null, null]);
    expect(r.problem).toBeUndefined();
    expect(r.planes).toHaveLength(1);
    expect(r.planes[0]!.percent).toBe(0);
    near(roofTopAt(r, P(2, 2)), 0);
    near(roofTopAt(r, P(6, 2)), 0);
    near(roofTopAt(r, P(2, 6)), 0);
  });

  it('área real igual à área em planta (48 m² no L), sem empena', () => {
    const r = roofOf(L, [null, null, null, null, null, null]);
    const plan = r.planes.reduce((s, pl) => s + multiArea(pl.polygon), 0);
    const real = r.planes.reduce((s, pl) => s + multiArea(pl.polygon) * Math.sqrt(1 + (pl.percent / 100) ** 2), 0);
    expect(plan).toBeCloseTo(48, 6);
    expect(real).toBeCloseTo(plan, 9);
    expect(ofKind(r.lines, 'gable')).toHaveLength(0);
  });

  it('o beiral é o contorno inteiro (linhas eave), para o desenho e os quantitativos', () => {
    const r = roofOf(L, [null, null, null, null, null, null]);
    expect(ofKind(r.lines, 'eave').length).toBeGreaterThanOrEqual(L.length);
  });
});

describe('recusa só quando sobra região sem aresta inclinada que a cubra', () => {
  it('U com só a base interna inclinada: os braços ficam fora do semiplano dela e nenhuma aresta os cobre', () => {
    const r = roofOf(U, [null, null, null, null, 30, null, null, null]);
    expect(r.planes).toHaveLength(0);
    expect(r.problem).toBe('o contorno tem uma região sem nenhuma aresta inclinada que a cubra');
  });
});

describe('aresta sem inclinação entre trechos de água (esqueleto com degrau preservado vs envoltória direta)', () => {
  it('L com degrau no vértice reentrante mantém o esqueleto limpo e preserva steps', () => {
    const r = roofOf(L, [30, 30, null, 30, 30, 30]);
    expect(r.problem).toBeUndefined();
    expect(r.steps?.length).toBeGreaterThan(0);
    near(roofTopAt(r, P(2, 2)), 0.6);
  });

  it('envelopePlanes continua sem degrau quando chamada diretamente', () => {
    const env = envelopePlanes(L, [30, 30, null, 30, 30, 30], 0);
    expect(env.problem).toBeUndefined();
    expect(env.steps).toBeUndefined();
    near(zOf(env.planes, P(2, 2)), 0.6);
  });
});
