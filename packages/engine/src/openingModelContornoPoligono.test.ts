import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, outline, openingShapeOf, validateOpeningShape, type Opening, type OpeningShape, type OpeningType, type OPt, type Project } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import { contornoDoModelo } from './openingModelContorno.ts';
import type { OpeningModel, OpeningPart } from './openingModelTypes.ts';
import { partQuantity } from './openingPartQuantities.ts';
import { openingShapeIssues } from './openingShapeIssues.ts';

function cena(base: string, shape?: OpeningShape, extra: Partial<OpeningType> = {}): { p: Project; m: OpeningModel } {
  const p0 = createEmptyProject();
  const t0 = p0.openingTypes[base]!;
  const s = new ProjectStore(p0);
  s.exec({ type: 'upsertOpeningType', openingType: { ...t0, id: 'ot_x', ...extra, ...(shape ? { shape } : {}) } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'v', kind: t0.kind, typeId: 'ot_x', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  const p = s.project;
  const f = frameOfWall(p, 'w')!;
  return { p, m: buildOpeningModel(p, p.elements.v as Opening, openingGeometry(p, p.elements.v as Opening, f), f) };
}

/** Ponto dentro do polígono (par-ímpar) ou na borda (tol). */
function dentro(ring: readonly OPt[], x: number, z: number, tol = 1e-6): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!;
    const [xj, zj] = ring[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  if (c) return true;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const l2 = (bx - ax) ** 2 + (bz - az) ** 2;
    const k = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
    if (Math.hypot(x - (ax + k * (bx - ax)), z - (az + k * (bz - az))) <= tol) return true;
  }
  return false;
}
const tzPts = (p: OpeningPart): OPt[] => p.profile!.pts.map((q): OPt => [q[0], q[1]]);
const tz = (m: OpeningModel): OpeningPart[] => m.parts.filter((q) => q.profile?.plane === 'tz' && q.role !== 'handle');

const poly = (...pts: Array<[number, number]>): Array<{ u: number; v: number }> => pts.map(([u, v]) => ({ u, v }));
const FORMAS: Array<[string, OpeningShape]> = [
  ['empena', { kind: 'gable', width: 0.9, height: 2.1, rise: 0.5 }],
  ['trapézio', { kind: 'trapezoid', width: 0.9, height: 2.1, topWidth: 0.6 }],
  ['ferradura', { kind: 'horseshoe', width: 0.9, height: 2.1, neck: 0.74 }],
  ['polígono', { kind: 'polygon', width: 0.9, height: 2.1, points: poly([0, 0], [0.9, 0], [0.9, 1.7], [0.45, 2.1], [0, 1.7]) }],
];

describe('vão de contorno reto e ferradura: peças seguem o contorno', () => {
  for (const [nome, forma] of FORMAS) {
    describe(`porta em ${nome}`, () => {
      const { m } = cena('ot_p90', forma);
      const shape = openingShapeOf({ ...cena('ot_p90').p.openingTypes.ot_p90!, roughOversize: undefined, shape: forma } as never)!;
      const contorno = outline(validateOpeningShape(shape).length === 0 ? { ...shape, width: m.width, height: m.height } : forma);
      it('o contorno fica válido e a esquadria cabe nele', () => {
        expect(validateOpeningShape({ ...forma, width: m.width, height: m.height } as OpeningShape)).toEqual([]);
      });
      it('há prismas tz (batente em faixas, folha e vidro) e todos ficam dentro do contorno', () => {
        const pecas = tz(m);
        expect(pecas.length).toBeGreaterThanOrEqual(3);
        for (const q of pecas) for (const [x, z] of tzPts(q)) expect(dentro(contorno, x, z, 2e-3)).toBe(true);
      });
      it('a caixa de cada prisma é a envolvente exata do polígono', () => {
        for (const q of tz(m)) {
          const xs = tzPts(q).map((p) => p[0]);
          const zs = tzPts(q).map((p) => p[1]);
          expect(q.box.t0).toBeCloseTo(Math.min(...xs), 12);
          expect(q.box.t1).toBeCloseTo(Math.max(...xs), 12);
          expect(q.box.z0).toBeCloseTo(Math.min(...zs), 12);
          expect(q.box.z1).toBeCloseTo(Math.max(...zs), 12);
        }
      });
      it('a folha segue o contorno (sem bandeira)', () => {
        const leaf = m.parts.find((q) => q.id === 'leaf-0')!;
        expect(leaf.profile?.plane).toBe('tz');
        expect(leaf.box.z1).toBeLessThan(m.height);
      });
      it('o batente cobre o contorno: faixas do mesmo grupo e volume > 0', () => {
        const frame = m.parts.filter((q) => (q.role === 'jamb' || q.role === 'head') && q.material === 'frame');
        expect(frame.length).toBeGreaterThan(2);
        expect(frame.reduce((s, q) => s + partQuantity(q).volume, 0)).toBeGreaterThan(0.001);
      });
    });
  }

  it('empena: faixas de ombreira (lados) e de topo (dois planos do telhado) no mesmo grupo do batente', () => {
    const { m } = cena('ot_p90', FORMAS[0]![1]);
    const faixas = m.parts.filter((q) => q.id.startsWith('head') && q.profile?.plane === 'tz');
    expect(faixas.filter((q) => q.role === 'head')).toHaveLength(4); // 2 planos x 2 fatias do rebaixo
    expect(faixas.filter((q) => q.role === 'jamb')).toHaveLength(4);
    expect(new Set(faixas.map((q) => q.group)).size).toBe(1);
  });

  it('janela com forma de trapézio e polígono côncavo: não lança e devolve peças', () => {
    const concavo: OpeningShape = { kind: 'polygon', width: 1.2, height: 1.2, points: poly([0, 0], [1.2, 0], [1.2, 0.5], [0.5, 0.5], [0.5, 1.2], [0, 1.2]) };
    for (const forma of [FORMAS[1]![1], concavo]) {
      const { m } = cena('ot_j120', forma);
      expect(m.parts.length).toBeGreaterThan(5);
    }
  });

  it('vão retangular ou forma inválida: o mesmo objeto', () => {
    const a = cena('ot_p90');
    expect(contornoDoModelo(a.m, undefined)).toBe(a.m);
    const ruim: OpeningShape = { kind: 'polygon', width: 0.9, height: 2.1, points: poly([0, 0], [0.9, 2.1], [0.9, 0], [0, 2.1]) };
    expect(contornoDoModelo(a.m, ruim)).toBe(a.m);
  });
});

describe('aviso de polígono côncavo', () => {
  it('forma-vao-poligono-concavo só para polígono côncavo', () => {
    const concavo: OpeningShape = { kind: 'polygon', width: 1.2, height: 1.2, points: poly([0, 0], [1.2, 0], [1.2, 0.5], [0.5, 0.5], [0.5, 1.2], [0, 1.2]) };
    const c = cena('ot_j120', concavo);
    expect(openingShapeIssues(c.p).map((i) => i.code)).toContain('forma-vao-poligono-concavo');
    expect(openingShapeIssues(c.p, 'en').find((i) => i.code === 'forma-vao-poligono-concavo')!.message).toContain('concave');
    const convexo = cena('ot_j120', { kind: 'polygon', width: 1.2, height: 1.2, points: poly([0, 0], [1.2, 0], [1.2, 0.8], [0.6, 1.2], [0, 0.8]) });
    expect(openingShapeIssues(convexo.p).map((i) => i.code)).not.toContain('forma-vao-poligono-concavo');
    const gable = cena('ot_j120', { kind: 'gable', width: 1.2, height: 1.2, rise: 0.4 });
    expect(openingShapeIssues(gable.p)).toEqual([]);
  });
  it('polígono com auto-interseção vira forma-vao-invalida com o código', () => {
    const c = cena('ot_j120', { kind: 'polygon', width: 1.2, height: 1.2, points: poly([0, 0], [1.2, 1.2], [1.2, 0], [0, 1.2]) });
    const i = openingShapeIssues(c.p).find((x) => x.code === 'forma-vao-invalida')!;
    expect(i.message).toContain('polygon-self-intersecting');
  });
});
