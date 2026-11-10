import { describe, expect, it } from 'vitest';
import { asMulti, multiArea, pointInRing, ringArea, type Ring, type Vec2 } from '@hestia/geom';
import { DEFAULT_STAIR_TYPES, ProjectStore, createEmptyProject, makeStair, stairFinishOf, type StairCurve, type StairLanding, type StairRun, type StairType } from '@hestia/model';
import {
  DEFAULT_STAIR_NORMS,
  generateLShape,
  generateSpiralRun,
  pieceBottomZ,
  resolveStairs,
  sectionOfStairs,
  stairBody,
  stairFinishModel,
  stairFinishQuantities,
  stairNormIssues,
  stairQuantities,
  type ResolvedStair,
  type StairComponentSketch,
  type StairFinishSolid,
} from './index.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: v(ax, ay), b: v(bx, by), sag: 0 });

/** Referência: w = 1,20; p = 0,28; H = 2,80 m; N = 16 espelhos (h = 0,175). */
const W = 1.2;
const P = 0.28;
const N = 16;
const TOP = 2.8;
const H = TOP / N;

function straight(n: number, spacing: number, width = W): StairRun {
  const b = (n - 1) * spacing + 0.5;
  return {
    id: 'run',
    kind: 'run',
    boundaryLeft: [ln(-0.5, width / 2, b, width / 2)],
    boundaryRight: [ln(-0.5, -width / 2, b, -width / 2)],
    risers: Array.from({ length: n }, (_, k) => ln(k * spacing, -1, k * spacing, 1)),
    path: [],
  };
}

const fromSketch = (list: StairComponentSketch[]): Array<StairRun | StairLanding> =>
  list.map((c, i) => (c.kind === 'run' ? { id: `run${i}`, kind: 'run' as const, ...c.run } : { id: `land${i}`, kind: 'landing' as const, boundary: c.landing.boundary }));

function resolve(components: Array<StairRun | StairLanding>, extra?: Partial<StairType>, baseType = 'stt_monolitica'): ResolvedStair {
  const s = new ProjectStore(createEmptyProject());
  let id = baseType;
  if (extra) {
    id = 'stt_teste';
    const base = DEFAULT_STAIR_TYPES.find((t) => t.id === baseType)!;
    s.exec({ type: 'upsertStairType', stairType: { ...base, id, ...extra } as StairType });
  }
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: id, levelId: 'lv_0', components, topOffset: -0.2 }) });
  return resolveStairs(s.project)[0]!;
}

const FIN_ON = { treadFinishEnabled: true, treadFinishThickness: 0.015, riserFinishEnabled: true, riserFinishThickness: 0.01, bocelEnabled: true, bocelProjection: 0.02 } as const;
const bbox = (r: Ring): { x0: number; x1: number; y0: number; y1: number } => ({
  x0: Math.min(...r.map((p) => p.x)),
  x1: Math.max(...r.map((p) => p.x)),
  y0: Math.min(...r.map((p) => p.y)),
  y1: Math.max(...r.map((p) => p.y)),
});
/** Primeira peça de cada degrau (o piso base pode partir o 1º degrau em duas, com o mesmo `index`). */
const firstPerStep = <T extends { index: number }>(l: T[]): T[] => l.filter((p, i) => l.findIndex((q) => q.index === p.index) === i);
const treads = (m: StairFinishSolid[]): StairFinishSolid[] => m.filter((s) => s.kind === 'tread').sort((a, b) => a.number - b.number);
const risers = (m: StairFinishSolid[]): StairFinishSolid[] => m.filter((s) => s.kind === 'riser').sort((a, b) => a.number - b.number);

describe('acabamentos da escada: padrões e migração', () => {
  it('tipo sem os campos (projeto antigo) = tudo desligado; tipos novos nascem desligados com bocel de 2 cm', () => {
    const antigo = { ...DEFAULT_STAIR_TYPES[0]! } as StairType;
    for (const k of ['treadFinishEnabled', 'riserFinishEnabled', 'bocelEnabled', 'bocelProjection'] as const) delete antigo[k];
    expect(stairFinishOf(antigo)).toMatchObject({ treadOn: false, riserOn: false, bocel: 0 });
    for (const t of DEFAULT_STAIR_TYPES) {
      expect(t).toMatchObject({ treadFinishEnabled: false, riserFinishEnabled: false, bocelEnabled: true, bocelProjection: 0.02 });
      expect(stairFinishOf(t).treadOn).toBe(false);
    }
    // O bocel só vale com o piso acabado ligado.
    expect(stairFinishOf({ ...antigo, treadFinishEnabled: true }).bocel).toBeCloseTo(0.02, 12);
    expect(stairFinishOf({ ...antigo, riserFinishEnabled: true }).bocel).toBe(0);
  });

  it('estilo montado ignora os acabamentos (piso e espelho do tipo já são o acabamento); poste só tem piso', () => {
    expect(stairFinishOf({ ...DEFAULT_STAIR_TYPES[1]!, ...FIN_ON })).toMatchObject({ treadOn: false, riserOn: false });
    expect(stairFinishOf({ ...DEFAULT_STAIR_TYPES[3]!, ...FIN_ON })).toMatchObject({ treadOn: true, riserOn: false });
  });
});

describe('escada sem acabamento: geometria idêntica à atual', () => {
  it('sem campos, ou ligados em zero, não há modelo de acabamento e as peças são as do degrau resolvido', () => {
    const a = resolve([straight(N, P)]);
    const b = resolve([straight(N, P)], { treadFinishEnabled: false, riserFinishEnabled: false });
    const c = resolve([straight(N, P)], { treadFinishEnabled: true, treadFinishThickness: 0, riserFinishEnabled: true, riserFinishThickness: 0 });
    for (const s of [a, b, c]) {
      expect(stairFinishModel(s)).toBeNull();
      // O piso base pode partir o 1º degrau em duas peças (mesmo `index`): a planta do degrau é a soma delas.
      const all = stairBody(s).pieces.filter((p) => p.kind === 'tread');
      expect(firstPerStep(all)).toHaveLength(N - 1);
      s.steps.forEach((st) => {
        const mine = all.filter((p) => p.index === st.index);
        expect(mine.length).toBeGreaterThan(0);
        for (const p of mine) expect(p.zTop).toBe(st.z);
        expect(mine.reduce((a, p) => a + Math.abs(ringArea(p.polygon)), 0)).toBeCloseTo(Math.abs(ringArea(st.polygon)), 9);
      });
      expect(stairQuantities(s)).toMatchObject({ treadFinishArea: 0, riserFinishArea: 0, bocelLength: 0, volumeFinish: 0 });
    }
    expect(stairBody(b).pieces).toEqual(stairBody(a).pieces);
    expect(stairBody(c).pieces).toEqual(stairBody(a).pieces);
    expect(stairQuantities(b).volume).toBe(stairQuantities(a).volume);
  });
});

describe('acabamentos: alturas acabadas', () => {
  const casos: Array<[string, Partial<StairType>]> = [
    ['piso e espelho', FIN_ON],
    ['só piso', { ...FIN_ON, riserFinishEnabled: false }],
    ['só espelho', { ...FIN_ON, treadFinishEnabled: false }],
  ];
  for (const [nome, extra] of casos) {
    it(`${nome}: espelhos acabados iguais, soma = altura total e último piso acabado = nível de cima`, () => {
      const s = resolve([straight(N, P)], extra);
      const m = stairFinishModel(s)!;
      // Cotas acabadas (topo dos pisos acabados): base, z1..z(N−1), nível de cima.
      const tops = [s.baseZ, ...s.steps.map((st) => st.z), s.topZ];
      const alturas = tops.slice(1).map((z, i) => z - tops[i]!);
      expect(alturas).toHaveLength(N);
      for (const a of alturas) expect(a).toBeCloseTo(H, 12);
      expect(alturas.reduce((x, y) => x + y, 0)).toBeCloseTo(TOP, 12);
      expect(s.steps[s.steps.length - 1]!.z + H).toBeCloseTo(s.topZ, 12);
      if (extra.treadFinishEnabled) {
        // O topo de cada piso acabado é a cota acabada do degrau.
        treads(m.solids).forEach((t, i) => expect(t.z1).toBeCloseTo(s.steps[i]!.z, 12));
      }
      if (extra.riserFinishEnabled) {
        const r = risers(m.solids);
        expect(r).toHaveLength(N);
        expect(r[0]!.z0).toBe(s.baseZ);
        expect(r[N - 1]!.z1).toBeCloseTo(s.topZ, 12);
      }
    });
  }

  it('o espelho apoia sobre o fundo do piso de baixo; o piso apoia no topo do espelho', () => {
    const s = resolve([straight(N, P)], FIN_ON);
    const m = stairFinishModel(s)!;
    const t = treads(m.solids);
    const r = risers(m.solids);
    for (let k = 2; k <= N; k++) expect(r[k - 1]!.z0).toBeCloseTo(t[k - 2]!.z0, 12);
    for (let k = 1; k <= N - 1; k++) {
      expect(t[k - 1]!.z0).toBeCloseTo(r[k - 1]!.z1, 12);
      expect(t[k - 1]!.z1 - t[k - 1]!.z0).toBeCloseTo(0.015, 12);
    }
    // Estrutura: o topo de cada degrau é o fundo do piso acabado.
    const body = firstPerStep(stairBody(s).pieces.filter((p) => p.kind === 'tread'));
    body.forEach((p, i) => expect(p.zTop).toBeCloseTo(t[i]!.z0, 12));
  });

  it('degraus compensados: primeiro e último espelho (material) diferem do acabado pela espessura do piso', () => {
    const tp = 0.015;
    const s = resolve([straight(N, P)], FIN_ON);
    const r = risers(stairFinishModel(s)!.solids);
    expect(r[0]!.z1 - r[0]!.z0).toBeCloseTo(H - tp, 12);
    expect(r[N - 1]!.z1 - r[N - 1]!.z0).toBeCloseTo(H + tp, 12);
    for (let k = 1; k < N - 1; k++) expect(r[k]!.z1 - r[k]!.z0).toBeCloseTo(H, 12);
    // A soma das alturas dos espelhos acabados (material) é a altura total.
    expect(r.reduce((a, x) => a + (x.z1 - x.z0), 0)).toBeCloseTo(TOP, 12);
  });
});

describe('acabamentos: piso + bocel em um sólido e alinhamento lateral', () => {
  it('piso e bocel são UM sólido por degrau; o ressalto fica à frente da face do espelho; a pisada não muda', () => {
    const s = resolve([straight(N, P)], FIN_ON);
    const m = stairFinishModel(s)!;
    const t = treads(m.solids);
    expect(t).toHaveLength(N - 1);
    t.forEach((p, i) => {
      const x = i * P; // linha do espelho de trás do degrau i+1 (espelho 1 em x = 0)
      const b = bbox(p.polygon);
      // Um anel só, com o ressalto de 2 cm antes da face do espelho e o fim na face do espelho da frente.
      expect(b.x0).toBeCloseTo(x - 0.02, 6);
      expect(b.x1).toBeCloseTo(x + P, 6);
      expect(multiArea(asMulti(p.polygon))).toBeCloseTo(W * (P + 0.02), 6);
      expect(p.edgeLength).toBeCloseTo(W, 6);
    });
    // Planta (degraus resolvidos) intacta: medida entre as faces acabadas dos espelhos.
    s.steps.forEach((st) => expect(multiArea(asMulti(st.polygon))).toBeCloseTo(W * P, 6));
  });

  it('bocel desligado ou projeção zero: o piso é só a planta do degrau', () => {
    for (const extra of [{ ...FIN_ON, bocelEnabled: false }, { ...FIN_ON, bocelProjection: 0 }]) {
      const m = stairFinishModel(resolve([straight(N, P)], extra))!;
      treads(m.solids).forEach((p) => {
        expect(multiArea(asMulti(p.polygon))).toBeCloseTo(W * P, 6);
        expect(p.edgeLength).toBe(0);
      });
    }
  });

  it('piso e espelho terminam alinhados à lateral do degrau (nenhum passa por cima do outro)', () => {
    const s = resolve([straight(N, P)], FIN_ON);
    for (const f of stairFinishModel(s)!.solids) {
      const b = bbox(f.polygon);
      expect(b.y0).toBeCloseTo(-W / 2, 6);
      expect(b.y1).toBeCloseTo(W / 2, 6);
    }
  });

  it('o acabamento do espelho fica atrás da face (no degrau de cima) e a estrutura não o invade', () => {
    const s = resolve([straight(N, P)], FIN_ON);
    const m = stairFinishModel(s)!;
    const r = risers(m.solids);
    r.slice(0, N - 1).forEach((f, i) => {
      const b = bbox(f.polygon);
      expect(b.x0).toBeCloseTo(i * P, 6);
      expect(b.x1).toBeCloseTo(i * P + 0.01, 6);
    });
    // Nenhum ponto do espelho acabado está dentro do miolo de uma peça da estrutura (mesma planta, mesma cota).
    const pieces = stairBody(s).pieces;
    for (const f of r) {
      const c = f.polygon.reduce((a, p) => ({ x: a.x + p.x / f.polygon.length, y: a.y + p.y / f.polygon.length }), v(0, 0));
      const z = (f.z0 + f.z1) / 2;
      for (const p of pieces) {
        if (!pointInRing(c, p.polygon)) continue;
        const bottom = pieceBottomZ(p, c.x, c.y);
        expect(z >= p.zTop - 1e-9 || z <= bottom + 1e-9).toBe(true);
      }
    }
  });

  it('L com patamar: um piso por degrau e patamar, e espelhos acabados iguais nas duas direções', () => {
    const comp = fromSketch(generateLShape({ start: v(0, 0), dir: v(1, 0), width: W, risersFirst: 8, risersSecond: 9, tread: P, turn: 'left' }));
    const s = resolve(comp, FIN_ON);
    expect(s.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const t = treads(stairFinishModel(s)!.solids);
    expect(t.length).toBe(s.steps.length);
    expect(t.filter((f) => f.stepKind === 'landing')).toHaveLength(1);
    const zs = [s.baseZ, ...s.steps.map((st) => st.z), s.topZ].sort((a, b) => a - b);
    const hs = zs.slice(1).map((z, i) => z - zs[i]!).filter((x) => x > 1e-9);
    for (const a of hs) expect(a).toBeCloseTo(s.riserHeight, 9);
    expect(hs.reduce((a, x) => a + x, 0)).toBeCloseTo(s.topZ - s.baseZ, 9);
  });
});

describe('acabamentos: quantidades e avisos', () => {
  it('quantidades separadas: área de piso (com bocel), área de espelho e metros de bocel', () => {
    const s = resolve([straight(N, P)], FIN_ON);
    const q = stairFinishQuantities(s);
    expect(q.treadArea).toBeCloseTo((N - 1) * W * (P + 0.02), 6);
    expect(q.bocelLength).toBeCloseTo((N - 1) * W, 6);
    const r = risers(stairFinishModel(s)!.solids);
    expect(q.riserArea).toBeCloseTo(W * r.reduce((a, x) => a + (x.z1 - x.z0), 0), 6);
    const full = stairQuantities(s);
    expect(full.treadFinishArea).toBeCloseTo(q.treadArea, 12);
    expect(full.riserFinishArea).toBeCloseTo(q.riserArea, 12);
    expect(full.bocelLength).toBeCloseTo(q.bocelLength, 12);
    const vol = Object.values(q.volumeByMaterial).reduce((a, x) => a + x, 0);
    expect(full.volumeFinish).toBeCloseTo(vol, 12);
    expect(full.volumeByMaterial['mat_ceramica']).toBeCloseTo(vol, 12);
  });

  it('a estrutura desconta o acabamento: sem espelho e sem bocel o volume total não muda, só troca de material', () => {
    const off = stairQuantities(resolve([straight(N, P)]));
    const on = stairQuantities(resolve([straight(N, P)], { ...FIN_ON, riserFinishEnabled: false, bocelEnabled: false }));
    expect(on.volume).toBeCloseTo(off.volume, 9);
    expect(on.volumeFinish).toBeCloseTo((N - 1) * W * P * 0.015, 9);
  });

  it('aviso do bocel acima de 1,5 cm (configurável, não bloqueia); espelho e pisada acabados dentro da norma', () => {
    const codes = (s: ResolvedStair): string[] => s.issues.map((i) => i.code);
    expect(codes(resolve([straight(N, P)], { ...FIN_ON, bocelProjection: 0.02 }))).toContain('stair-bocel-projection');
    expect(codes(resolve([straight(N, P)], { ...FIN_ON, bocelProjection: 0.015 }))).not.toContain('stair-bocel-projection');
    expect(codes(resolve([straight(N, P)], { ...FIN_ON, treadFinishEnabled: false, bocelProjection: 0.05 }))).not.toContain('stair-bocel-projection');
    const s = resolve([straight(N, P)], { ...FIN_ON, bocelProjection: 0.02 });
    const folgado = stairNormIssues(s, { ...DEFAULT_STAIR_NORMS, nosingProjectionMax: 0.03 }).map((i) => i.code);
    expect(folgado).not.toContain('stair-bocel-projection');
    expect(s.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(codes(s)).not.toContain('stair-riser-range');
    expect(codes(s)).not.toContain('stair-tread-range');
  });

  it('acabamento mais espesso que a estrutura avisa', () => {
    const s = resolve([straight(N, P)], { ...FIN_ON, treadFinishThickness: 0.25 });
    expect(s.issues.map((i) => i.code)).toContain('stair-finish-structure');
  });
});

describe('acabamentos: caracol (espelhos radiais) e poste', () => {
  function spiral(typeId: string, extra: Partial<StairType>): ResolvedStair {
    const store = new ProjectStore(createEmptyProject());
    const t = DEFAULT_STAIR_TYPES.find((x) => x.id === typeId)!;
    store.exec({ type: 'upsertStairType', stairType: { ...t, id: 'stt_teste', ...extra } as StairType });
    const run = generateSpiralRun({ center: v(0, 0), rInner: 0.1, rOuter: 1, startAngle: 0.3, sweep: (270 * Math.PI) / 180, risers: 16 });
    store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: 'stt_teste', levelId: 'lv_0', topOffset: 2.8 - 3, height: 2.8, components: [{ id: 'run', kind: 'run', ...run } as StairRun], openingMargin: 0 }) });
    return resolveStairs(store.project)[0]!;
  }

  it('monolítico: todo degrau leva piso+bocel em um sólido e a estrutura fica sem sobreposição com o espelho', () => {
    const s = spiral('stt_caracol_monolitica', FIN_ON);
    const m = stairFinishModel(s)!;
    const t = treads(m.solids);
    expect(t).toHaveLength(15);
    for (const f of t) {
      expect(f.edgeLength).toBeGreaterThan(0.5);
      expect(multiArea(asMulti(f.polygon))).toBeGreaterThan(0);
    }
    const zs = [s.baseZ, ...s.steps.map((st) => st.z), s.topZ];
    for (let i = 1; i < zs.length; i++) expect(zs[i]! - zs[i - 1]!).toBeCloseTo(H, 9);
    const q = stairQuantities(s);
    expect(q.bocelLength).toBeGreaterThan(8);
    expect(q.volume).toBeGreaterThan(0);
  });

  it('poste: só piso acabado (sem espelho), estrutura do degrau perde a espessura do piso no topo', () => {
    const s = spiral('stt_caracol_poste', { ...FIN_ON, treadThickness: 0.05 });
    const m = stairFinishModel(s)!;
    expect(risers(m.solids)).toHaveLength(0);
    const t = treads(m.solids);
    expect(t).toHaveLength(15);
    const body = stairBody(s).pieces.filter((p) => p.kind === 'tread');
    for (const p of body) expect(p.zTop).toBeLessThan(s.steps.find((st) => st.index === p.index)!.z);
  });
});

describe('acabamentos: corte', () => {
  it('o corte longitudinal traz piso+bocel e espelho nos materiais próprios, com a área do motor', () => {
    const store = new ProjectStore(createEmptyProject());
    const t = DEFAULT_STAIR_TYPES[0]!;
    store.exec({ type: 'upsertStairType', stairType: { ...t, id: 'stt_teste', ...FIN_ON, riserFinishMaterialId: 'mat_madeira' } as StairType });
    store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: 'stt_teste', levelId: 'lv_0', components: [straight(N, P)], topOffset: -0.2 }) });
    const s = resolveStairs(store.project)[0]!;
    // Linha ao longo da subida (eixo x), pelo meio do lance.
    const sec = sectionOfStairs([s], { a: v(-0.2, 0), b: v(N * P, 0), depth: 2 }, store.project);
    const area = (m: string): number => sec.cut.filter((c) => c.materialId === m).reduce((a, c) => a + Math.abs(ringArea(c.polygon[0]!)), 0);
    // Piso: (N−1) faixas de (pisada + bocel) × espessura; espelho: espessura × soma das alturas (= altura total).
    expect(area('mat_ceramica')).toBeCloseTo((N - 1) * (P + 0.02) * 0.015, 9);
    expect(area('mat_madeira')).toBeCloseTo(0.01 * TOP, 9);
  });
});
