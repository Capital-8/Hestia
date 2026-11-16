import { describe, expect, it } from 'vitest';
import { pointInMulti, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeFloor, makeRoof, makeSlab, makeWall, slabRiseAt, type Project } from '@hestia/model';
import { computeSection, resolveFloors, resolveRoofs, resolveSlabs, type SectionResult } from './index.ts';

/**
 * Oráculo independente de oclusão por amostragem (validação de corte/elevação). Elevação de 2 lados: a linha (0,-3)→(10,-3)
 * olha para +y (t = x, profundidade = y + 3). A verdade de cada ponto (t, z) é o sólido de MENOR profundidade que o contém,
 * calculada por marcha do raio com predicados analíticos (prismas e águas planas). Pontos vizinhos de uma fronteira (a
 * verdade muda num raio de 4 cm) são descartados. `it.fails` = comportamento correto que hoje falha.
 */
const LINE = { a: { x: 0, y: -3 }, b: { x: 10, y: -3 }, depth: 12 };
const STEP = 0.02;
const T_WALL = 0.184; // wt_alv14: 0,002·2 + 0,02·2 + 0,14

interface Solid {
  id: string;
  has: (x: number, y: number, z: number) => boolean;
}

const box = (id: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Solid => ({
  id,
  has: (x, y, z) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1,
});

/** Parede paralela a x no eixo y = yc. */
const wallBox = (id: string, x0: number, x1: number, yc: number, h: number): Solid => box(id, x0, x1, yc - T_WALL / 2, yc + T_WALL / 2, 0, h);

/** Vão (caixa em t, z) cravado na parede: o sólido do vão ocupa a espessura da parede inteira. */
const holeIn = (wall: Solid, id: string, x0: number, x1: number, z0: number, z1: number, yc: number): { wall: Solid; opening: Solid } => ({
  wall: { id: wall.id, has: (x, y, z) => wall.has(x, y, z) && !(x >= x0 && x <= x1 && z >= z0 && z <= z1) },
  opening: box(id, x0, x1, yc - T_WALL / 2, yc + T_WALL / 2, z0, z1),
});

function firstHit(solids: Solid[], x: number, z: number, maxDepth = LINE.depth): string | undefined {
  let best: string | undefined;
  for (let s = 0; s <= maxDepth; s += STEP) {
    const y = LINE.a.y + s;
    for (const so of solids) if (so.has(x, y, z)) return so.id;
  }
  return best;
}

const ownerOf = (b: { wallId?: string; floorId?: string; slabId?: string; roofId?: string; stairId?: string; columnId?: string }): string =>
  (b.wallId ?? b.floorId ?? b.slabId ?? b.roofId ?? b.stairId ?? b.columnId)!;

/** Quem a elevação desenha em (t, z): todos os itens visíveis que contêm o ponto (mais de um = sobreposição). */
function engineOwners(r: SectionResult, pt: Vec2): string[] {
  const out = new Set<string>();
  for (const b of r.beyond) if (pointInMulti(pt, b.polygons)) out.add(ownerOf(b));
  for (const o of r.openings) if (pointInMulti(pt, o.polygons)) out.add(o.openingId);
  return [...out];
}

interface Diff {
  t: number;
  z: number;
  truth: string | undefined;
  engine: string[];
}

function compare(r: SectionResult, solids: Solid[], zMax: number, dt = 0.2, dz = 0.17): { diffs: Diff[]; total: number } {
  const diffs: Diff[] = [];
  let total = 0;
  const e = 0.04;
  for (let t = 0.031; t < 10; t += dt) {
    for (let z = 0.013; z < zMax; z += dz) {
      const c = firstHit(solids, t, z);
      const nb = [firstHit(solids, t + e, z), firstHit(solids, t - e, z), firstHit(solids, t, z + e), firstHit(solids, t, z - e)];
      if (nb.some((n) => n !== c)) continue;
      total++;
      const eng = engineOwners(r, { x: t, y: z });
      const ok = c === undefined ? eng.length === 0 : eng.length === 1 && eng[0] === c;
      if (!ok) diffs.push({ t: +t.toFixed(3), z: +z.toFixed(3), truth: c, engine: eng });
    }
  }
  return { diffs, total };
}

const addOpening = (s: ProjectStore, id: string, kind: 'door' | 'window', typeId: string, hostId: string, offset: number) =>
  s.exec({ type: 'addOpening', opening: { id, kind, typeId, hostId, offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });

const fresh = () => new ProjectStore(createEmptyProject());
const addWall = (s: ProjectStore, id: string, x0: number, x1: number, y: number, h: number) =>
  s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: x0, y }, b: { x: x1, y }, height: h }) });
const rectB = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

describe('oráculo de oclusão: paredes e vãos', () => {
  it('três paredes escalonadas em profundidade (alturas e extensões diferentes): dono de cada ponto = a mais próxima', () => {
    const s = fresh();
    addWall(s, 'A', 1, 5, 0, 3);
    addWall(s, 'B', 3, 8, 2, 4);
    addWall(s, 'C', 0, 9, 4, 2);
    const r = computeSection(s.project, LINE);
    const { diffs, total } = compare(r, [wallBox('A', 1, 5, 0, 3), wallBox('B', 3, 8, 2, 4), wallBox('C', 0, 9, 4, 2)], 4.5);
    expect(total).toBeGreaterThan(300);
    expect(diffs).toEqual([]);
  });

  it('janela na parede da frente e porta na parede de trás: o vão esconde o que está atrás e é escondido pelo que está na frente', () => {
    const s = fresh();
    addWall(s, 'A', 1, 6, 0, 3);
    addWall(s, 'B', 4, 9, 2, 3);
    addOpening(s, 'jan', 'window', 'ot_j120', 'A', 2.5); // x 1,9..3,1... centro em x = 3,5; vão = offset ± 0,6
    addOpening(s, 'por', 'door', 'ot_p80', 'B', 2.5); // centro em x = 6,5
    const r = computeSection(s.project, LINE);
    const jan = r.openings.find((o) => o.openingId === 'jan')!;
    const por = r.openings.find((o) => o.openingId === 'por')!;
    expect(jan.t1 - jan.t0).toBeCloseTo(1.2, 6);
    expect(por.t1 - por.t0).toBeCloseTo(0.8, 6);
    const wa = holeIn(wallBox('A', 1, 6, 0, 3), 'jan', jan.t0, jan.t1, jan.z0, jan.z1, 0);
    const wb = holeIn(wallBox('B', 4, 9, 2, 3), 'por', por.t0, por.t1, por.z0, por.z1, 2);
    const { diffs, total } = compare(r, [wa.wall, wa.opening, wb.wall, wb.opening], 3.4);
    expect(total).toBeGreaterThan(300);
    expect(diffs).toEqual([]);
  });

  it('parede sem vão atrás de uma janela: a janela da frente cobre a parede de trás (vidro opaco)', () => {
    const s = fresh();
    addWall(s, 'A', 1, 6, 0, 3);
    addWall(s, 'B', 0, 9, 3, 3.5);
    addOpening(s, 'jan', 'window', 'ot_j120', 'A', 2.5);
    const r = computeSection(s.project, LINE);
    const jan = r.openings.find((o) => o.openingId === 'jan')!;
    const mid = { x: (jan.t0 + jan.t1) / 2, y: (jan.z0 + jan.z1) / 2 };
    expect(engineOwners(r, mid)).toEqual(['jan']);
  });
});

describe('oráculo de oclusão: piso e laje', () => {
  it('piso, laje plana atrás e laje inclinada 10 % mais atrás, com parede no meio', () => {
    const s = fresh();
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'F', typeId: 'ft_ceram', levelId: 'lv_0', boundary: rectB(0, 0, 6, 2) }) });
    s.exec({ type: 'addSlab', slab: makeSlab({ id: 'L', typeId: 'ls_mac15', levelId: 'lv_0', boundary: rectB(2, 3, 9, 5) }) });
    s.exec({
      type: 'addSlab',
      slab: makeSlab({ id: 'I', typeId: 'ls_mac15', levelId: 'lv_0', boundary: rectB(0, 6, 8, 8), slope: { origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, percent: 10 } }),
    });
    addWall(s, 'W', 2, 4, 2.5, 1);
    const p = s.project;
    const fl = resolveFloors(p, 'lv_0')[0]!;
    const zf = [Math.min(...fl.layers.map((l) => l.z0)), Math.max(...fl.layers.map((l) => l.z1))] as const;
    const sl = resolveSlabs(p, 'lv_0');
    const flat = sl.find((x) => x.slabId === 'L')!;
    const inc = sl.find((x) => x.slabId === 'I')!;
    const zr = (q: typeof flat) => [Math.min(...q.layers.map((l) => l.z0)), Math.max(...q.layers.map((l) => l.z1))] as const;
    const slabSolid = (id: string, q: typeof flat, b: [number, number, number, number]): Solid => ({
      id,
      has: (x, y, z) => {
        if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
        const rise = slabRiseAt(q.slope, { x, y });
        return z >= zr(q)[0] + rise && z <= zr(q)[1] + rise;
      },
    });
    const solids = [box('F', 0, 6, 0, 2, zf[0], zf[1]), wallBox('W', 2, 4, 2.5, 1), slabSolid('L', flat, [2, 3, 9, 5]), slabSolid('I', inc, [0, 6, 8, 8])];
    const r = computeSection(p, LINE);
    const { diffs, total } = compare(r, solids, 1.1);
    expect(total).toBeGreaterThan(100);
    expect(diffs).toEqual([]);
  });
  it.fails('laje inclinada 30 % ao longo de y (sobe afastando-se do observador) com parede baixa no meio dela: a parede na frente da parte alta deve aparecer (mesmo defeito 1, em laje)', () => {
    const s = fresh();
    s.exec({
      type: 'addSlab',
      slab: makeSlab({ id: 'I', typeId: 'ls_mac15', levelId: 'lv_0', boundary: rectB(0, 0, 8, 6), slope: { origin: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, percent: 30 } }),
    });
    addWall(s, 'W', 1, 7, 3, 1.5);
    const p = s.project;
    const inc = resolveSlabs(p, 'lv_0')[0]!;
    const z0 = Math.min(...inc.layers.map((l) => l.z0));
    const z1 = Math.max(...inc.layers.map((l) => l.z1));
    const slab: Solid = {
      id: 'I',
      has: (x, y, z) => x >= 0 && x <= 8 && y >= 0 && y <= 6 && z >= z0 + slabRiseAt(inc.slope, { x, y }) && z <= z1 + slabRiseAt(inc.slope, { x, y }),
    };
    const r = computeSection(p, LINE);
    const { diffs, total } = compare(r, [slab, wallBox('W', 1, 7, 3, 1.5)], 2);
    expect(total).toBeGreaterThan(80);
    expect(diffs).toEqual([]);
  });
});

describe('oráculo de oclusão: telhados', () => {
  const roofProject = (shape: 'shed' | 'gable' | 'hip', extraWalls: Array<[string, number, number, number, number]> = []): Project => {
    const s = fresh();
    s.exec({
      type: 'addRoof',
      roof: makeRoof({ id: 'R', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: rectB(1, 0, 8, 6), shape, heightOffset: 2.8, dir: { x: 0, y: 1 } }),
    });
    for (const [id, x0, x1, y, h] of extraWalls) addWall(s, id, x0, x1, y, h);
    return s.project;
  };
  const roofSolid = (p: Project): Solid => {
    const rf = resolveRoofs(p, 'lv_0')[0]!;
    const total = rf.layers.reduce((a, l) => a + l.thickness, 0);
    return {
      id: 'R',
      has: (x, y, z) =>
        rf.planes.some((pl) => {
          if (!pointInMulti({ x, y }, pl.polygon)) return false;
          const zt = pl.z0 + (pl.percent / 100) * ((x - pl.origin.x) * pl.up.x + (y - pl.origin.y) * pl.up.y);
          return z <= zt && z >= zt - total;
        }),
    };
  };

  for (const shape of ['shed', 'gable', 'hip'] as const) {
    it(`telhado ${shape} com paredes baixas (abaixo do beiral) na frente e atrás: dono de cada ponto confere`, () => {
      const p = roofProject(shape, [['W1', 1, 8, 0.1, 2.8], ['W2', 1, 8, 5.9, 2.8]]);
      const r = computeSection(p, LINE);
      const { diffs, total } = compare(r, [roofSolid(p), wallBox('W1', 1, 8, 0.1, 2.8), wallBox('W2', 1, 8, 5.9, 2.8)], 5.5);
      expect(total).toBeGreaterThan(200);
      expect(diffs).toEqual([]);
    });
  }

  it('visto da empena (linha em x = -2 olhando +x): telhado de duas águas e de quatro águas confere', () => {
    for (const shape of ['gable', 'hip'] as const) {
      const p = roofProject(shape);
      const line = { a: { x: -2, y: 10 }, b: { x: -2, y: -2 }, depth: 14 }; // t = 10 − y ; n = +x
      const r = computeSection(p, line);
      const solid = roofSolid(p);
      // verdade para a vista lateral: o raio caminha em x
      let bad = 0;
      let n = 0;
      for (let t = 4.1; t < 10.2; t += 0.25) {
        for (let z = 2.7; z < 4.9; z += 0.07) {
          const hit = (tt: number, zz: number): boolean => {
            for (let s = 0; s <= 14; s += STEP) if (solid.has(-2 + s, 10 - tt, zz)) return true;
            return false;
          };
          const c = hit(t, z);
          if ([hit(t + 0.04, z), hit(t - 0.04, z), hit(t, z + 0.04), hit(t, z - 0.04)].some((v) => v !== c)) continue;
          n++;
          const eng = engineOwners(r, { x: t, y: z }).length > 0;
          if (eng !== c) bad++;
        }
      }
      expect(n).toBeGreaterThan(100);
      expect(bad, shape).toBe(0);
    }
  });

  it('parede mais alta que a água (2 m acima do beiral) atravessando um telhado inclinado: aparece inteira onde está na frente do telhado (defeito 1 conhecido)', () => {
    const p = roofProject('shed', [['P', 3, 4.5, 1.5, 6]]);
    const r = computeSection(p, LINE);
    const { diffs, total } = compare(r, [roofSolid(p), wallBox('P', 3, 4.5, 1.5, 6)], 6);
    expect(total).toBeGreaterThan(100);
    expect(diffs).toEqual([]);
  });
});
