import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { difference, multiArea, pointInMulti, ringArea, intersection, unionClipper, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeFloor, makeSlab, makeWall, migrateProject, type Project } from '@hestia/model';
import { computeSection, type SectionLine, type SectionResult } from './index.ts';

const REAL = '/home/dennylson/Documents/Projetos/Projeto sem título (5)/projeto.hestia.json';
const EPS = 1e-6;
const T_LAYERS = [0.002, 0.02, 0.14, 0.02, 0.002];
const T_WALL = T_LAYERS.reduce((a, b) => a + b, 0);

const fresh = () => new ProjectStore(createEmptyProject());
const addWall = (s: ProjectStore, id: string, a: Vec2, b: Vec2, h: number, extra: object = {}) =>
  s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a, b, height: h, ...extra }) });
const rectB = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

/** Todos os polígonos (t, z) de um resultado, com um rótulo. */
function allPolys(r: SectionResult): Array<{ label: string; mp: MultiPolygon }> {
  return [
    ...r.cut.map((c, i) => ({ label: `cut[${i}] ${c.materialId}`, mp: c.polygons })),
    { label: 'silhouette', mp: r.silhouette },
    // Águas de perfil (`passive`) não escondem nada e não têm preenchimento: só linhas; não entram na regra de dono único por ponto.
    ...r.beyond.map((b, i) => ({ b, i })).filter(({ b }) => !b.passive).map(({ b, i }) => ({ label: `beyond[${i}] ${b.materialId}`, mp: b.polygons })),
    ...r.openings.map((o, i) => ({ label: `opening[${i}] ${o.openingId}`, mp: o.polygons })),
  ];
}

const segCross = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
  const o = (p: Vec2, q: Vec2, r: Vec2): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c);
  const d2 = o(a, b, d);
  const d3 = o(c, d, a);
  const d4 = o(c, d, b);
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12; // cruzamento próprio (toque em vértice não conta)
};

function ringProblems(ring: Ring): string[] {
  const out: string[] = [];
  if (ring.length < 3) return ['anel com menos de 3 vértices'];
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-9) out.push('anel repete o primeiro vértice no fim (fechado explicitamente)');
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) out.push('vértice não finito');
    if (Math.hypot(p.x - q.x, p.y - q.y) < 1e-9) out.push('vértices consecutivos coincidentes');
  }
  if (Math.abs(ringArea(ring)) < 1e-9) out.push('anel degenerado (área ~ 0)');
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 2; j < ring.length; j++) {
      if (i === 0 && j === ring.length - 1) continue;
      if (segCross(ring[i]!, ring[(i + 1) % ring.length]!, ring[j]!, ring[(j + 1) % ring.length]!)) out.push('auto-interseção');
    }
  }
  return out;
}

function problemsOf(r: SectionResult, length: number): string[] {
  const out: string[] = [];
  for (const { label, mp } of allPolys(r)) {
    const area = multiArea(mp);
    if (area < -EPS) out.push(`${label}: área negativa ${area}`);
    mp.forEach((poly, pi) =>
      poly.forEach((ring, ri) => {
        for (const v of ring) {
          if (v.x < -1e-6 || v.x > length + 1e-6) out.push(`${label}: t = ${v.x.toFixed(4)} fora de [0, ${length.toFixed(3)}]`);
        }
        for (const pr of ringProblems(ring)) out.push(`${label} poly ${pi} anel ${ri}: ${pr}`);
      }),
    );
  }
  return [...new Set(out)];
}

/** Itens visíveis (beyond e vãos) não podem se sobrepor: a linha oculta deixa um dono por ponto. */
function overlapPairs(r: SectionResult, tol = 1e-4): string[] {
  const items = [
    // Águas de perfil (`passive`) não escondem nada e não têm preenchimento, só linhas: ficam fora da regra de um dono por ponto.
    ...r.beyond.map((b, i) => ({ b, i })).filter(({ b }) => !b.passive).map(({ b, i }) => ({ label: `beyond[${i}] ${b.wallId ?? b.floorId ?? b.slabId ?? b.roofId ?? b.stairId ?? '?'}:${b.layerIndex}`, mp: b.polygons })),
    ...r.openings.map((o) => ({ label: `opening ${o.openingId}`, mp: o.polygons })),
  ];
  const out: string[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = multiArea(intersection(items[i]!.mp, items[j]!.mp));
      if (a > tol) out.push(`${items[i]!.label} x ${items[j]!.label} = ${a.toFixed(4)} m2`);
    }
  }
  return out;
}

describe('corte (depth 0): invariantes em cenas pequenas', () => {
  it('corte perpendicular à parede: área de cada camada = espessura × altura, total = 0,184 × 2,8', () => {
    const s = fresh();
    addWall(s, 'w', { x: 0, y: 0 }, { x: 6, y: 0 }, 2.8);
    const r = computeSection(s.project, { a: { x: 3, y: -1 }, b: { x: 3, y: 1 }, depth: 3 });
    expect(multiArea(r.silhouette)).toBeCloseTo(T_WALL * 2.8, 6);
    const areas = r.cut.map((c) => multiArea(c.polygons)).sort((a, b) => a - b);
    const expected = [0.002 * 2.8 * 2, 0.02 * 2.8 * 2, 0.14 * 2.8].sort((a, b) => a - b); // tinta e reboco aparecem duas vezes (unidos por material)
    expect(areas).toHaveLength(3);
    areas.forEach((a, i) => expect(a).toBeCloseTo(expected[i]!, 6));
    expect(problemsOf(r, 2)).toEqual([]);
  });

  it('corte oblíquo (45°): a espessura aparente é espessura/sen 45° e a área é essa × altura', () => {
    const s = fresh();
    addWall(s, 'w', { x: 0, y: 0 }, { x: 8, y: 0 }, 2.8);
    const L = Math.SQRT2 * 2;
    const r = computeSection(s.project, { a: { x: 3, y: -1 }, b: { x: 5, y: 1 }, depth: 3 });
    expect(multiArea(unionClipper(...r.cut.map((c) => c.polygons)))).toBeCloseTo((T_WALL / Math.SQRT1_2) * 2.8, 5);
    expect(problemsOf(r, L)).toEqual([]);
  });

  it('porta e janela recortam o vão no corte longitudinal (pontos dentro do vão fora da silhueta, acima/abaixo dentro)', () => {
    const s = fresh();
    addWall(s, 'w', { x: 0, y: 0 }, { x: 10, y: 0 }, 3);
    s.exec({ type: 'addOpening', opening: { id: 'p', kind: 'door', typeId: 'ot_p80', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    s.exec({ type: 'addOpening', opening: { id: 'j', kind: 'window', typeId: 'ot_j120', hostId: 'w', offset: 6, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const r = computeSection(s.project, { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, depth: 2 });
    const inside = (t: number, z: number) => pointInMulti({ x: t, y: z }, r.silhouette);
    expect(inside(2, 1)).toBe(false); // porta (80 × 210)
    expect(inside(2, 2.5)).toBe(true); // verga acima da porta
    expect(inside(1.2, 1)).toBe(true); // ao lado da porta
    expect(inside(6, 1.7)).toBe(false); // janela (peitoril 1,10, altura 1,20)
    expect(inside(6, 0.5)).toBe(true); // peitoril
    expect(inside(6, 2.6)).toBe(true); // verga
    expect(problemsOf(r, 10)).toEqual([]);
  });

  it('laje inclinada: base e topo são lineares em t (a 10 %: 0,1 m por metro)', () => {
    const s = fresh();
    s.exec({ type: 'addSlab', slab: makeSlab({ id: 'L', typeId: 'ls_mac15', levelId: 'lv_0', boundary: rectB(0, 0, 8, 4), slope: { origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, percent: 10 } }) });
    const r = computeSection(s.project, { a: { x: -1, y: 2 }, b: { x: 9, y: 2 }, depth: 2 });
    for (let t = 1.3; t < 8.9; t += 0.7) {
      const top = (t - 1) * 0.1;
      const base = top - 0.17;
      const q = (z: number) => pointInMulti({ x: t, y: z }, r.silhouette);
      expect(q(top - 0.005), `topo em t=${t}`).toBe(true);
      expect(q(top + 0.005), `topo+ em t=${t}`).toBe(false);
      expect(q(base + 0.005), `base em t=${t}`).toBe(true);
      expect(q(base - 0.005), `base- em t=${t}`).toBe(false);
    }
    expect(problemsOf(r, 10)).toEqual([]);
  });

  it('piso e parede cruzando o piso: as camadas seguem a regra de junção sem contar a zona comum duas vezes (soma das peças = união)', () => {
    const s = fresh();
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId: 'ft_ceram', levelId: 'lv_0', boundary: rectB(0, 0, 6, 4) }) });
    addWall(s, 'w', { x: 0, y: 2 }, { x: 6, y: 2 }, 2.8, { baseOffset: -0.19 }); // topo em 2,61, mais alto que o piso (0)
    const r = computeSection(s.project, { a: { x: 3, y: -1 }, b: { x: 3, y: 5 }, depth: 2 });
    const parts = r.cut.flatMap((c) => c.parts ?? []);
    const sum = parts.reduce((a, p) => a + multiArea(p.polygons), 0);
    const uni = multiArea(unionClipper(...r.cut.map((c) => c.polygons)));
    expect(sum).toBeCloseTo(uni, 6);
    // piso 4 m × 0,19 mais a parede acima da cota 0 (0,184 × 2,61)
    expect(uni).toBeCloseTo(4 * 0.19 + T_WALL * 2.61, 4);
    // o miolo da parede (bloco) acima do piso é da parede
    const wallParts = parts.filter((p) => p.origin?.wallId === 'w');
    expect(wallParts.length).toBeGreaterThan(0);
    expect(multiArea(unionClipper(...wallParts.map((p) => p.polygons)))).toBeGreaterThanOrEqual(T_WALL * 2.61 - 1e-6);
  });

  it('elementos além do plano de corte não entram em `cut`; os atrás do observador ou além da profundidade não aparecem em lugar nenhum', () => {
    const s = fresh();
    addWall(s, 'cruza', { x: 0, y: 0 }, { x: 8, y: 0 }, 3);
    addWall(s, 'alem', { x: 0, y: 2 }, { x: 8, y: 2 }, 3);
    addWall(s, 'longe', { x: 0, y: 6 }, { x: 8, y: 6 }, 3); // além da profundidade 3
    addWall(s, 'atras', { x: 0, y: -2 }, { x: 8, y: -2 }, 3); // atrás do plano
    const r = computeSection(s.project, { a: { x: 0, y: 0 }, b: { x: 8, y: 0 }, depth: 3 });
    const cutIds = new Set(r.cut.flatMap((c) => c.sources.map((o) => o.wallId)));
    expect(cutIds).toEqual(new Set(['cruza']));
    const beyondIds = new Set(r.beyond.map((b) => b.wallId));
    expect(beyondIds.has('longe')).toBe(false);
    expect(beyondIds.has('atras')).toBe(false);
    // a parede cortada, de 0,184 de espessura e z de 0 a 3, esconde tudo o que está além (profundidade 0 manda)
    expect(r.beyond.every((b) => b.wallId !== 'alem' || multiArea(b.polygons) < 1e-3)).toBe(true);
    expect(problemsOf(r, 8)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ projeto real */

function loadReal(): Project {
  return migrateProject(JSON.parse(readFileSync(REAL, 'utf8')));
}
const real = loadReal();
const view = (name: string): SectionLine & { role?: string } => {
  const v = real.views.find((x) => x.name === name)!;
  return { a: v.a, b: v.b, depth: v.depth };
};

describe('projeto real: Corte A', () => {
  const line = view('Corte A');
  const L = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
  const r = computeSection(real, line);

  it('nenhum polígono sai de [0, comprimento] nem tem área negativa', () => {
    expect(problemsOf(r, L).filter((p) => /fora de|negativa/.test(p))).toEqual([]);
  });

  // beyond[2] (madeira do telhado) traz um anel de área ~0 com vértice repetido (4,4735;3,0542)(4,5384;3,0541)(4,5384;3,0541);
  // beyond[3] (telha) traz um anel com vértice repetido (3,6599;3,3652)x2 e um anel que se auto-toca/cruza no beiral.
  it.fails('anéis do telhado além do plano: sem anel degenerado, sem vértice repetido e sem auto-interseção', () => {
    expect(problemsOf(r, L)).toEqual([]);
  });

  it('as duas paredes cortadas (x ≈ 0,97 e x ≈ 5,30) têm área = 0,184 × 2,8 cada e o corte não tem sobreposição entre camadas', () => {
    const parts = r.cut.flatMap((c) => c.parts ?? []);
    const byWall = (id: string) => parts.filter((p) => p.origin?.wallId === id).reduce((a, p) => a + multiArea(p.polygons), 0);
    expect(byWall('w_710ee7ab1')).toBeCloseTo(T_WALL * 2.8, 2); // parede oeste, vertical
    expect(byWall('w_3fbc40715')).toBeCloseTo(T_WALL * 2.8, 2); // parede leste, quase vertical
    const sum = r.cut.reduce((a, c) => a + multiArea(c.polygons), 0);
    const uni = multiArea(unionClipper(...r.cut.map((c) => c.polygons)));
    expect(sum).toBeCloseTo(uni, 4); // camadas do corte não se sobrepõem
  });

  it('a silhueta do corte contém só cotas entre o piso (z >= zMin) e o topo da cobertura; o telhado cortado existe', () => {
    expect(r.cut.some((c) => c.sources.some((o) => o.roofId))).toBe(true);
    expect(r.zMax).toBeGreaterThan(2.8);
    expect(r.zMin).toBeLessThanOrEqual(0);
  });
});

/** Projeção de pontos em t → x (ou y) do mundo, para espelhar as elevações opostas. */
const worldAlong = (line: SectionLine, t: number): Vec2 => {
  const L = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
  return { x: line.a.x + ((line.b.x - line.a.x) / L) * t, y: line.a.y + ((line.b.y - line.a.y) / L) * t };
};

describe('projeto real: elevações', () => {
  const names = ['Norte', 'Sul', 'Leste', 'Oeste'] as const;
  const lines = Object.fromEntries(names.map((n) => [n, view(n)])) as Record<(typeof names)[number], SectionLine>;
  const res = Object.fromEntries(names.map((n) => [n, computeSection(real, lines[n])])) as Record<(typeof names)[number], SectionResult>;

  for (const n of names) {
    it(`${n}: polígonos válidos (dentro de [0, L], sem área negativa, anel fechado, sem auto-interseção)`, () => {
      const L = Math.hypot(lines[n].b.x - lines[n].a.x, lines[n].b.y - lines[n].a.y);
      expect(problemsOf(res[n], L)).toEqual([]);
    });
    it(`${n}: nada é cortado e nenhum item visível se sobrepõe a outro (nada de trás aparece na frente)`, () => {
      expect(res[n].cut).toHaveLength(0);
      expect(overlapPairs(res[n])).toEqual([]);
    });
  }

  /** Silhueta convertida para um sistema de coordenadas comum: coordenada ao longo da fachada (x ou y do mundo) e z. */
  // a silhueta do motor não inclui os vãos (porta/janela): a projeção completa é silhueta ∪ vãos
  const sil = (n: (typeof names)[number], axis: 'x' | 'y'): MultiPolygon =>
    unionClipper(res[n].silhouette, ...res[n].openings.map((o) => o.polygons)).map((poly) => poly.map((ring) => ring.map((v) => ({ x: worldAlong(lines[n], v.x)[axis], y: v.y }))));
  const symDiff = (a: MultiPolygon, b: MultiPolygon): number => multiArea(difference(a, b)) + multiArea(difference(b, a));

  it('Norte × Sul: a silhueta (projeção ortogonal) é a mesma, espelhada: diferença simétrica ~ 0', () => {
    const n = sil('Norte', 'x');
    const s = sil('Sul', 'x');
    expect(multiArea(n)).toBeCloseTo(multiArea(s), 3);
    expect(symDiff(n, s)).toBeLessThan(1e-3);
  });

  it('Leste × Oeste: a silhueta (projeção ortogonal) é a mesma, espelhada: diferença simétrica ~ 0', () => {
    const e = sil('Leste', 'y');
    const o = sil('Oeste', 'y');
    expect(multiArea(e)).toBeCloseTo(multiArea(o), 3);
    expect(symDiff(e, o)).toBeLessThan(1e-3);
  });

  it('janela e porta (parede sul, y ≈ 2,48) aparecem inteiras na elevação Sul e ficam ocultas na Norte', () => {
    const area = (r: SectionResult, id: string) => r.openings.filter((o) => o.openingId === id).reduce((a, o) => a + multiArea(o.polygons), 0);
    expect(area(res.Sul, 'j_da84b05a8')).toBeCloseTo(1.2 * 1.2, 2);
    expect(area(res.Sul, 'd_61961d627')).toBeCloseTo(0.8 * 2.1, 2);
    expect(area(res.Norte, 'j_da84b05a8')).toBeLessThan(1e-4);
    expect(area(res.Norte, 'd_61961d627')).toBeLessThan(1e-4);
  });

  it('janela e porta numa parede de topo (paralela à visão): Leste e Oeste não as desenham', () => {
    for (const n of ['Leste', 'Oeste'] as const) {
      for (const id of ['j_da84b05a8', 'd_61961d627']) {
        const a = res[n].openings.filter((o) => o.openingId === id).reduce((s, o) => s + multiArea(o.polygons), 0);
        expect(a, `${n} ${id}`).toBeLessThan(1e-4);
      }
    }
  });

  it('posição do vão: janela e porta na elevação Sul caem no x do mundo certo (offset medido a partir de a da parede)', () => {
    // parede w_4b7cc5106 vai de x = 5,2989 (a) a x = 1,0617 (b): offset 1,705 → x = 3,594 (janela) e 3,601 → x = 1,698 (porta)
    const L = lines.Sul;
    const centre = (id: string) => {
      const o = res.Sul.openings.find((q) => q.openingId === id)!;
      return worldAlong(L, (o.t0 + o.t1) / 2).x;
    };
    expect(centre('j_da84b05a8')).toBeCloseTo(5.298850366733119 - 1.7054085942721822, 2);
    expect(centre('d_61961d627')).toBeCloseTo(5.298850366733119 - 3.6009947352227027, 2);
  });
});
