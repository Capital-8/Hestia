import { describe, expect, it } from 'vitest';
import { multiArea, union, type Vec2 } from '@hestia/geom';
import {
  DEFAULT_STAIR_TYPES,
  ProjectStore,
  createEmptyProject,
  defaultStairTypeId,
  makeStair,
  type Project,
  type StairCurve,
  type StairLanding,
  type StairRun,
  type StairType,
} from '@hestia/model';
import { computeSection, lineIntervals, resolveStairs, type SectionResult } from './index.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: v(ax, ay), b: v(bx, by), sag: 0 });

/**
 * Lance reto em +x: espelhos em `xs`, cada um com desvio lateral `slant[k]` (espelho inclinado: x ± s·y). Limites em
 * y = ±0,6 (largura 1,20 m), estendidos `ext0` antes do 1º espelho e `ext1` depois do último.
 */
function runAt(xs: number[], o: { slant?: number[]; ext0?: number; ext1?: number; width?: number } = {}): StairRun {
  const w = o.width ?? 1.2;
  const s = (k: number): number => o.slant?.[k] ?? 0;
  const a = xs[0]! - (o.ext0 ?? 0.3);
  const b = xs[xs.length - 1]! + (o.ext1 ?? 0.3);
  return {
    id: `run${xs[0]}`,
    kind: 'run',
    boundaryLeft: [ln(a, w / 2, b, w / 2)],
    boundaryRight: [ln(a, -w / 2, b, -w / 2)],
    risers: xs.map((x, k) => ln(x - s(k), -1, x + s(k), 1)),
    path: [],
  };
}

/** Patamar retangular x0..x1 × ±0,6 (laço fechado). */
function landingRect(x0: number, x1: number): StairLanding {
  return {
    id: 'landing',
    kind: 'landing',
    boundary: [ln(x0, -0.6, x1, -0.6), ln(x1, -0.6, x1, 0.6), ln(x1, 0.6, x0, 0.6), ln(x0, 0.6, x0, -0.6)],
  };
}

/** Térreo (0 m) e pavimento 2 a 2,80 m; escada `st1` no térreo com topo no pavimento 2. */
function build(components: Array<StairRun | StairLanding>, typeId = defaultStairTypeId, type?: StairType): Project {
  const base = createEmptyProject();
  const withType: Project = type ? { ...base, stairTypes: { ...base.stairTypes, [type.id]: type } } : base;
  const store = new ProjectStore({ ...withType, levels: withType.levels.map((l) => (l.id === 'lv_1' ? { ...l, elevation: 2.8 } : l)) });
  store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', components }) });
  return store.project;
}

/** Tipo monolítico com profundidade estrutural e face inferior dados (decisão 0012). */
const monolithicType = (structuralDepth: number, undersideStyle: 'smooth' | 'stepped'): StairType => ({
  ...DEFAULT_STAIR_TYPES[0]!,
  id: `stt_test_${structuralDepth}_${undersideStyle}`,
  structuralDepth,
  undersideStyle,
});

/** 16 espelhos a cada 0,28 m a partir de x = 0 (h = 2,80 ÷ 16 = 0,175 m; 15 degraus). */
const SIXTEEN = Array.from({ length: 16 }, (_, k) => k * 0.28);
const H = 0.175;
const P = 0.28;
/** Cosseno entre a rampa e a horizontal: cosθ = p / √(p² + h²). */
const COS = P / Math.hypot(P, H);
/** Espessura vertical equivalente de uma profundidade estrutural perpendicular à rampa: T = d / cosθ. */
const vertical = (structuralDepth: number): number => structuralDepth / COS;
/** Laje de cima (m): o espelho de chegada termina nesta distância abaixo do nível de topo. */
const CONCRETE = 'mat_concreto';

/** Intervalos de z (cota) em que o corte do material cobre a vertical de abscissa t (t = distância ao longo da linha). */
const zIntervalsAt = (r: SectionResult, materialId: string, t: number): Array<[number, number]> =>
  r.cut
    .filter((c) => c.materialId === materialId)
    .flatMap((c) => c.polygons.flatMap((poly) => lineIntervals(poly, v(t, 0), v(0, 1), v(1, 0))));

const coveredAt = (r: SectionResult, materialId: string, t: number, z: number): boolean =>
  zIntervalsAt(r, materialId, t).some(([z0, z1]) => z >= z0 - 1e-6 && z <= z1 + 1e-6);

/** Linha longitudinal sobre o eixo do lance: a = (−1, 0), b = (6, 0); t = x + 1. */
const LONG = { a: v(-1, 0), b: v(6, 0), depth: 2 };

/** Os polígonos de corte de um material, unidos: quantas partes e quantos furos há. */
const cutShape = (r: SectionResult, materialId: string) => {
  const shape = union(...r.cut.filter((c) => c.materialId === materialId).map((c) => c.polygons));
  return { parts: shape.length, holes: shape.map((poly) => poly.length - 1) };
};

describe('escada monolítica no corte longitudinal (liso, 16 espelhos, h 0,175, piso 0,28, estrutural 0,20)', () => {
  const p = build([runAt(SIXTEEN, { ext0: 0, ext1: 0 })]);

  it('o motor resolve a escada com 15 degraus e h = 0,175', () => {
    const [r] = resolveStairs(p);
    expect(r!.riserHeight).toBeCloseTo(H, 9);
    expect(r!.steps.filter((s) => s.kind === 'tread')).toHaveLength(15);
  });

  it('perfil superior: cada degrau k tem topo em k·0,175 e ocupa 0,28 m de passo', () => {
    const r = computeSection(p, LONG);
    for (let k = 1; k <= 15; k++) {
      const x0 = (k - 1) * 0.28;
      // amostras perto das duas bordas do degrau e uma já no degrau seguinte
      for (const dx of [0.02, 0.14, 0.26]) {
        const top = Math.max(...zIntervalsAt(r, CONCRETE, x0 + dx + 1).map(([, z1]) => z1));
        expect(top).toBeCloseTo(k * H, 6);
      }
    }
    // a borda entre degraus fica em múltiplos de 0,28: logo depois do espelho, o topo sobe um degrau
    const after = Math.max(...zIntervalsAt(r, CONCRETE, 0.28 + 0.02 + 1).map(([, z1]) => z1));
    expect(after).toBeCloseTo(2 * H, 6);
  });

  it('fundo liso: no meio de cada degrau a espessura vertical é h/2 + T (T = 0,20 / cosθ)', () => {
    const r = computeSection(p, LONG);
    for (let k = 2; k <= 15; k++) {
      const t = (k - 1) * 0.28 + 0.14 + 1;
      const hit = zIntervalsAt(r, CONCRETE, t).filter(([, hi]) => Math.abs(hi - k * H) < 1e-6);
      expect(hit).toHaveLength(1);
      const [z0, z1] = hit[0]!;
      expect(z1 - z0).toBeCloseTo(H / 2 + vertical(0.2), 6);
    }
  });

  it('o primeiro degrau tem o fundo no piso base (a rampa abaixo de 0 é cortada): espessura h', () => {
    const r = computeSection(p, LONG);
    const hit = zIntervalsAt(r, CONCRETE, 0.14 + 1).filter(([, hi]) => Math.abs(hi - H) < 1e-6);
    expect(hit).toHaveLength(1);
    expect(hit[0]![0]).toBeCloseTo(0, 6);
  });

  it('nada abaixo do piso base: a escada apoia no nível de base e o topo chega ao último degrau', () => {
    const r = computeSection(p, LONG);
    expect(r.zMin).toBeCloseTo(0, 6);
    expect(r.zMax).toBeGreaterThanOrEqual(15 * H - 1e-6);
    for (const c of r.cut.filter((x) => x.materialId === CONCRETE)) {
      for (const ring of c.polygons.flat()) for (const q of ring) expect(q.y).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('o corte longitudinal pelo eixo é UM polígono sem furos (sem fresta entre peças)', () => {
    const r = computeSection(p, LONG);
    expect(cutShape(r, CONCRETE)).toEqual({ parts: 1, holes: [0] });
  });

  it('a peça de chegada fecha o último espelho até o piso de cima (sem laje sobre ela, termina no topo da escada)', () => {
    const r = computeSection(p, LONG);
    const topZ = 2.8;
    // arrival: faixa de x = 4,20 a 4,48 (t = 5,20 a 5,48), termina em topZ
    expect(coveredAt(r, CONCRETE, 5.34, topZ - 0.01)).toBe(true);
    expect(coveredAt(r, CONCRETE, 5.34, topZ + 0.01)).toBe(false);
    const top = Math.max(...zIntervalsAt(r, CONCRETE, 5.34).map(([, z1]) => z1));
    expect(top).toBeCloseTo(topZ, 6);
  });
});

describe('corte transversal (monolítico)', () => {
  it('o degrau 5 corta como retângulo: largura do lance (1,20 m) × espessura média h/2 + T', () => {
    const p = build([runAt(SIXTEEN, { ext0: 0, ext1: 0 })]);
    // degrau 5: x de 1,12 a 1,40; a linha corta o lance no meio, de y = −1 a y = 1 (t = y + 1)
    const xc = 4 * 0.28 + 0.14;
    const r = computeSection(p, { a: v(xc, -1), b: v(xc, 1), depth: 2 });
    const cut = r.cut.filter((c) => c.materialId === CONCRETE);
    expect(cut).toHaveLength(1);
    const thickness = H / 2 + vertical(0.2);
    expect(multiArea(cut[0]!.polygons)).toBeCloseTo(1.2 * thickness, 6);
    const ts = cut[0]!.polygons.flat(2).map((q) => q.x);
    expect(Math.min(...ts)).toBeCloseTo(0.4, 6);
    expect(Math.max(...ts)).toBeCloseTo(1.6, 6);
    const zs = cut[0]!.polygons.flat(2).map((q) => q.y);
    expect(Math.min(...zs)).toBeCloseTo(5 * H - thickness, 6);
    expect(Math.max(...zs)).toBeCloseTo(5 * H, 6);
  });
});

describe('profundidade estrutural e face inferior (decisão 0012)', () => {
  const xc = 4 * 0.28 + 0.14;
  const transverse = { a: v(xc, -1), b: v(xc, 1), depth: 2 };

  it('0,15 m perpendicular à rampa: liso com T = 0,15 / cosθ', () => {
    const p = build([runAt(SIXTEEN, { ext0: 0, ext1: 0 })], 'stt_test_0.15_smooth', monolithicType(0.15, 'smooth'));
    const r = computeSection(p, transverse);
    const cut = r.cut.filter((c) => c.materialId === CONCRETE);
    const thickness = H / 2 + vertical(0.15);
    expect(multiArea(cut[0]!.polygons)).toBeCloseTo(1.2 * thickness, 6);
  });

  it('escalonado: cada degrau tem espessura vertical h + T, com fundo plano em zk − h − T', () => {
    const p = build([runAt(SIXTEEN, { ext0: 0, ext1: 0 })], 'stt_test_0.15_stepped', monolithicType(0.15, 'stepped'));
    const r = computeSection(p, transverse);
    const cut = r.cut.filter((c) => c.materialId === CONCRETE);
    const thickness = H + vertical(0.15);
    expect(multiArea(cut[0]!.polygons)).toBeCloseTo(1.2 * thickness, 6);
    const zs = cut[0]!.polygons.flat(2).map((q) => q.y);
    expect(Math.min(...zs)).toBeCloseTo(5 * H - thickness, 6);
    expect(Math.max(...zs)).toBeCloseTo(5 * H, 6);
  });

  it('escalonado no corte longitudinal: a banda é contínua, com faixas de espessura h + T', () => {
    const p = build([runAt(SIXTEEN, { ext0: 0, ext1: 0 })], 'stt_test_0.2_stepped', monolithicType(0.2, 'stepped'));
    const r = computeSection(p, LONG);
    expect(cutShape(r, CONCRETE)).toEqual({ parts: 1, holes: [0] });
    const t = 4 * 0.28 + 0.14 + 1;
    const hit = zIntervalsAt(r, CONCRETE, t).filter(([, hi]) => Math.abs(hi - 5 * H) < 1e-6);
    expect(hit).toHaveLength(1);
    expect(hit[0]![1] - hit[0]![0]).toBeCloseTo(H + vertical(0.2), 6);
  });
});

describe('patamar (L): patamar à cota certa e contínuo com as duas rampas', () => {
  // 8 espelhos em x = 0..1,96 (rampa 1); patamar de 1,96 a 3,00 (cota 8·h = 1,40); 8 espelhos em x = 3,00..4,96 (rampa 2)
  const run1 = SIXTEEN.slice(0, 8);
  const run2 = Array.from({ length: 8 }, (_, k) => 3.0 + k * 0.28);
  const p = build([runAt(run1, { ext0: 0, ext1: 0 }), landingRect(1.96, 3.0), runAt(run2, { ext0: 0, ext1: 0 })]);

  it('o patamar tem topo em 8·h = 1,40 e fundo plano em 1,40 − (h + T)', () => {
    const r = computeSection(p, LONG);
    const z = 8 * H;
    const bottom = z - (H + vertical(0.2));
    expect(coveredAt(r, CONCRETE, 2.5 + 1, z - 0.02)).toBe(true);
    expect(coveredAt(r, CONCRETE, 2.5 + 1, z + 0.01)).toBe(false);
    expect(coveredAt(r, CONCRETE, 2.5 + 1, bottom + 0.01)).toBe(true);
    expect(coveredAt(r, CONCRETE, 2.5 + 1, bottom - 0.01)).toBe(false);
  });

  it('o corte longitudinal com patamar é UM polígono sem furos (rampa, patamar e rampa)', () => {
    const r = computeSection(p, LONG);
    expect(cutShape(r, CONCRETE)).toEqual({ parts: 1, holes: [0] });
  });
});

describe('elevação (monolítico)', () => {
  it('sem corte: cada peça aparece além do plano, com o topo na cota da peça e depth = 2,40 m no degrau mais próximo', () => {
    const p = build([runAt(SIXTEEN, { ext0: 0, ext1: 0 })]);
    const r = computeSection(p, { a: v(-1, -3), b: v(6, -3), depth: 6 });
    expect(r.cut).toHaveLength(0);
    const beyond = r.beyond.filter((b) => b.stairId === 'st1');
    expect(beyond.every((b) => b.materialId === CONCRETE)).toBe(true);
    expect(Math.min(...beyond.map((b) => b.depth))).toBeCloseTo(2.4, 6);
    const tops = beyond.map((b) => Math.max(...b.polygons.flat(2).map((q) => q.y)));
    const hasTop = (z: number): boolean => tops.some((t) => Math.abs(t - z) < 1e-6);
    for (let k = 1; k <= 15; k++) expect(hasTop(k * H)).toBe(true);
    expect(hasTop(2.8)).toBe(true);
  });
});

describe('espelhos montados no corte longitudinal', () => {
  it('a lâmina do espelho fica atrás da linha de espelho, entre as cotas do próprio espelho', () => {
    const p = build([runAt(SIXTEEN)], 'stt_piso_espelho');
    const r = computeSection(p, LONG);
    // espelho 5 (x = 1,12), entre 0,70 e 0,875; a lâmina ocupa x de 1,10 a 1,12 (t = 2,10 a 2,12)
    expect(coveredAt(r, 'mat_madeira', 2.11, 0.8)).toBe(true);
    expect(coveredAt(r, 'mat_madeira', 2.09, 0.8)).toBe(false);
    // o piso sobre o degrau 4 tem 0,03 m de espessura
    expect(coveredAt(r, 'mat_madeira', 0.98 + 1, 0.7 - 0.02)).toBe(true);
    expect(coveredAt(r, 'mat_madeira', 0.98 + 1, 0.7 - 0.04)).toBe(false);
  });
});

describe('elevação do montado', () => {
  it('montado: os espelhos aparecem como lâminas finas (2 cm) além do plano', () => {
    const p = build([runAt(SIXTEEN)], 'stt_piso_espelho');
    const r = computeSection(p, { a: v(-1, -3), b: v(6, -3), depth: 6 });
    const beyond = r.beyond.filter((b) => b.stairId === 'st1');
    // 15 pisos (0,03 m de espessura) e 16 espelhos (0,02 m)
    expect(beyond).toHaveLength(31);
    const widths = beyond.map((b) => {
      const ts = b.polygons.flat(2).map((q) => q.x);
      return Math.max(...ts) - Math.min(...ts);
    });
    expect(widths.filter((w) => Math.abs(w - 0.02) < 1e-6)).toHaveLength(16);
  });
});

describe('sem escadas', () => {
  it('a seção de um projeto sem escada não ganha itens de escada', () => {
    const base = createEmptyProject();
    const store = new ProjectStore(base);
    const r = computeSection(store.project, LONG);
    expect(r.beyond.some((b) => b.stairId !== undefined)).toBe(false);
    expect(r.cut.some((c) => c.materialId === CONCRETE)).toBe(false);
  });
});

describe('escada monolítica com e sem acabamento no corte', () => {
  const xc = 4 * 0.28 + 0.14;
  const lineAlong = { a: v(-1, 0), b: v(5, 0), depth: 2 };
  const finished = { treadFinishEnabled: true, treadFinishThickness: 0.03, treadFinishMaterialId: 'mat_ceramica', riserFinishEnabled: true, riserFinishThickness: 0.02, riserFinishMaterialId: 'mat_ceramica', bocelEnabled: true, bocelProjection: 0.02 };
  const cutOf = (extra: Partial<StairType>, line = lineAlong) => {
    const t: StairType = { ...monolithicType(0.15, 'smooth'), id: 'stt_fin', ...extra };
    return computeSection(build([runAt(SIXTEEN, { ext0: 0, ext1: 0 })], 'stt_fin', t), line).cut;
  };
  for (const [nome, line] of [['longitudinal', lineAlong], ['transversal', { a: v(xc, -1), b: v(xc, 1), depth: 2 }]] as const) {
    it(`${nome}: sem acabamento tem só a estrutura`, () => {
      const cut = cutOf({}, line);
      expect(cut.some((c) => c.materialId === CONCRETE)).toBe(true);
      expect(cut.some((c) => c.materialId === 'mat_ceramica')).toBe(false);
    });
    it(`${nome}: com acabamento tem a estrutura e os acabamentos`, () => {
      const cut = cutOf(finished, line);
      expect(cut.some((c) => c.materialId === CONCRETE)).toBe(true);
      expect(cut.some((c) => c.materialId === 'mat_ceramica')).toBe(true);
    });
  }
});

describe('escada monolítica com erro de norma ainda desenha a estrutura', () => {
  it('espelho acima do máximo: o corte tem a estrutura e os acabamentos', () => {
    const t: StairType = { ...monolithicType(0.15, 'smooth'), id: 'stt_err', treadFinishEnabled: true, treadFinishThickness: 0.03, riserFinishEnabled: true, riserFinishThickness: 0.02, bocelEnabled: true, bocelProjection: 0.02, maxRiser: 0.15 };
    const p = build([runAt(SIXTEEN, { ext0: 0, ext1: 0 })], 'stt_err', t);
    const cut = computeSection(p, { a: v(-1, 0), b: v(5, 0), depth: 2 }).cut;
    expect(resolveStairs(p)[0]!.issues.some((i) => i.severity === 'error')).toBe(true);
    expect(cut.some((c) => c.materialId === CONCRETE)).toBe(true);
    expect(cut.some((c) => c.materialId === 'mat_ceramica')).toBe(true);
  });
});
