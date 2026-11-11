import { describe, expect, it } from 'vitest';
import type { MultiPolygon, Vec2 } from '@hestia/geom';
import { computeSection, type SectionBeyond, type SectionOpening, type SectionOrigin, type SectionRegion, type SectionResult } from '@hestia/engine';
import { createEmptyProject, makeWall, ProjectStore, type Id } from '@hestia/model';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';

/**
 * Hide in View/Reveal nos cortes e elevações. Os testes usam um `SectionResult` sintético — o filtro é do desenho, não da
 * geometria — e um caso real de `computeSection` para fechar parede + vão.
 */

const v = (x: number, y: number): Vec2 => ({ x, y });
const REVEAL = '#2563eb';

const rect = (x0: number, y0: number, x1: number, y1: number): MultiPolygon => [[[v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)]]];

const project = createEmptyProject();

const sectionResult = (patch: Partial<SectionResult> = {}): SectionResult => ({
  length: 10,
  zMin: 0,
  zMax: 3,
  cut: [],
  silhouette: [],
  beyond: [],
  openings: [],
  membranes: [],
  levels: [],
  ...patch,
});

const input = (section: SectionResult, extra: Partial<SectionInput> = {}): SectionInput => ({
  project,
  section,
  viewport: { cx: 5, cy: 1.5, zoom: 60, width: 800, height: 600 },
  theme: LIGHT,
  dark: false,
  showGrid: false,
  ...extra,
});

const beyond = (origin: SectionOrigin, polygons = rect(0, 0, 1, 3)): SectionBeyond => ({
  ...origin,
  materialId: 'mat_concreto',
  layerIndex: 0,
  depth: 2,
  polygons,
});

const region = (origin: SectionOrigin, polygons = rect(0, 0, 1, 3)): SectionRegion => ({
  materialId: 'mat_concreto',
  polygons,
  sources: [origin],
  parts: [{ origin, polygons }],
});

const windowOpening = (id: Id): SectionOpening => ({
  openingId: id,
  kind: 'window',
  t0: 0,
  t1: 1,
  z0: 1,
  z1: 2,
  depth: 1,
  cut: false,
  polygons: rect(0, 1, 1, 2),
  // Lista sintética: `drawOpening` cai no retângulo de antes quando não há modelo único.
  model: null as unknown as SectionOpening['model'],
  openingLine: { apex: 'latch', dashed: 'toward' },
  viewSide: 1,
  sSign: 1,
  cutT: 0,
  frameMaterialId: 'mat_concreto',
  glassMaterialId: 'mat_vidro',
});

const boundsX = (m: MultiPolygon): [number, number] => {
  const xs = m.flat(2).map((q) => q.x);
  return [Math.min(...xs), Math.max(...xs)];
};

const boundsPts = (pts: Vec2[]): [number, number] => {
  const xs = pts.map((q) => q.x);
  return [Math.min(...xs), Math.max(...xs)];
};

describe('Hide in View no corte/elevação', () => {
  const cases: Array<{ name: string; id: Id; patch: () => Partial<SectionResult> }> = [
    { name: 'parede', id: 'w1', patch: () => ({ beyond: [beyond({ wallId: 'w1' })] }) },
    { name: 'piso', id: 'f1', patch: () => ({ beyond: [beyond({ floorId: 'f1' })] }) },
    { name: 'telhado', id: 'r1', patch: () => ({ beyond: [beyond({ roofId: 'r1' })] }) },
    { name: 'escada', id: 'st1', patch: () => ({ beyond: [beyond({ stairId: 'st1' })] }) },
    { name: 'vão', id: 'o1', patch: () => ({ openings: [windowOpening('o1')] }) },
    { name: 'parede cortada', id: 'w2', patch: () => ({ cut: [region({ wallId: 'w2' })] }) },
  ];

  for (const c of cases) {
    it(`${c.name} oculto não é desenhado`, () => {
      const s = sectionResult(c.patch());
      const normal = buildSectionDrawList(input(s));
      expect(normal.fills.length + normal.strokes.length).toBeGreaterThan(0);
      const draw = buildSectionDrawList(input(s, { hidden: new Set([c.id]) }));
      expect(draw.fills).toHaveLength(0);
      // Sem itens visíveis e sem silhueta do motor, nada sobra: nem contorno.
      expect(draw.strokes).toHaveLength(0);
    });
  }

  it('corte unido por material: ocultar uma origem remove só a peça dela', () => {
    const r: SectionRegion = {
      materialId: 'mat_concreto',
      polygons: rect(0, 0, 2, 3),
      sources: [{ wallId: 'w1' }, { wallId: 'w2' }],
      parts: [
        { origin: { wallId: 'w1' }, polygons: rect(0, 0, 1, 3) },
        { origin: { wallId: 'w2' }, polygons: rect(1, 0, 2, 3) },
      ],
    };
    const draw = buildSectionDrawList(input(sectionResult({ cut: [r] }), { hidden: new Set(['w1']) }));
    expect(draw.fills).toHaveLength(1);
    expect(boundsX(draw.fills[0]!.polygons)[0]).toBeCloseTo(1, 9);
    expect(boundsX(draw.fills[0]!.polygons)[1]).toBeCloseTo(2, 9);
  });

  it('corte unido sem parts: só some quando todas as origens estão ocultas (limitação)', () => {
    const r: SectionRegion = { materialId: 'mat_concreto', polygons: rect(0, 0, 2, 3), sources: [{ wallId: 'w1' }, { wallId: 'w2' }] };
    const parcial = buildSectionDrawList(input(sectionResult({ cut: [r] }), { hidden: new Set(['w1']) }));
    expect(parcial.fills).toHaveLength(1);
    const total = buildSectionDrawList(input(sectionResult({ cut: [r] }), { hidden: new Set(['w1', 'w2']) }));
    expect(total.fills).toHaveLength(0);
  });

  it('membrana de piso oculta não desenha a linha tracejada', () => {
    const s = sectionResult({ membranes: [{ floorId: 'f1', materialId: 'mat_concreto', pts: [v(0, 0), v(2, 0)] }] });
    expect(buildSectionDrawList(input(s)).strokes).toHaveLength(1);
    expect(buildSectionDrawList(input(s, { hidden: new Set(['f1']) })).strokes).toHaveLength(0);
  });

  it('é por vista: o mesmo corte sem hidden continua igual', () => {
    const s = sectionResult({ beyond: [beyond({ wallId: 'w1' })], openings: [windowOpening('o1')] });
    const base = buildSectionDrawList(input(s));
    const comHidden = buildSectionDrawList(input(s, { hidden: new Set(['w1', 'o1']) }));
    expect(comHidden.fills).toHaveLength(0);
    expect(buildSectionDrawList(input(s))).toEqual(base);
  });
});

describe('Reveal no corte/elevação', () => {
  it('revelado mantém o desenho normal e ganha contorno azul de 2 px', () => {
    const s = sectionResult({
      beyond: [beyond({ wallId: 'w1' })],
      cut: [region({ wallId: 'w2' })],
      openings: [windowOpening('o1')],
      membranes: [{ floorId: 'f1', materialId: 'mat_concreto', pts: [v(0, 0), v(2, 0)] }],
    });
    const base = buildSectionDrawList(input(s));
    expect(base.strokes.filter((x) => x.color === REVEAL)).toHaveLength(0);

    const reveal = buildSectionDrawList(input(s, { revealed: new Set(['w1', 'w2', 'o1', 'f1']) }));
    // Nada do desenho normal mudou; a borda azul entra por cima.
    expect(reveal.fills).toEqual(base.fills);
    expect(reveal.strokes.slice(0, base.strokes.length)).toEqual(base.strokes);
    const azuis = reveal.strokes.filter((x) => x.color === REVEAL);
    expect(azuis).toHaveLength(4); // parede além, corte, vão e membrana
    expect(azuis.every((x) => x.widthPx === 2 && x.closed !== undefined)).toBe(true);
  });

  it('no corte unido, só as peças reveladas ganham a borda azul', () => {
    const r: SectionRegion = {
      materialId: 'mat_concreto',
      polygons: rect(0, 0, 2, 3),
      sources: [{ wallId: 'w1' }, { wallId: 'w2' }],
      parts: [
        { origin: { wallId: 'w1' }, polygons: rect(0, 0, 1, 3) },
        { origin: { wallId: 'w2' }, polygons: rect(1, 0, 2, 3) },
      ],
    };
    const draw = buildSectionDrawList(input(sectionResult({ cut: [r] }), { revealed: new Set(['w2']) }));
    const azuis = draw.strokes.filter((x) => x.color === REVEAL);
    expect(azuis).toHaveLength(1);
    expect(boundsPts(azuis[0]!.pts)[0]).toBeCloseTo(1, 9);
  });

  it('com hidden vazio e revealed vazio a lista é idêntica à de sempre', () => {
    const s = sectionResult({
      beyond: [beyond({ wallId: 'w1' })],
      cut: [region({ wallId: 'w2' })],
      openings: [windowOpening('o1')],
    });
    const base = buildSectionDrawList(input(s));
    expect(buildSectionDrawList(input(s, { hidden: new Set(), revealed: new Set() }))).toEqual(base);
  });
});

describe('Hide in View com o motor real', () => {
  it('parede e vão ocultos somem da elevação', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'frente', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
    store.exec({ type: 'addOpening', opening: { id: 'j1', kind: 'window', typeId: 'ot_j120', hostId: 'frente', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const p = store.project;
    const section = computeSection(p, { a: v(0, -2), b: v(6, -2), depth: 8 });
    const base: SectionInput = { project: p, section, viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false };
    const normal = buildSectionDrawList(base);
    expect(normal.fills.length).toBeGreaterThan(0);
    const semNada = buildSectionDrawList({ ...base, hidden: new Set(['frente', 'j1']) });
    expect(semNada.fills).toHaveLength(0);
  });
});

describe('Elemento hospedado tem visibilidade própria (corte/elevação)', () => {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'frente', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  store.exec({ type: 'addOpening', opening: { id: 'j1', kind: 'window', typeId: 'ot_j120', hostId: 'frente', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  const p = store.project;
  const section = computeSection(p, { a: v(0, -2), b: v(6, -2), depth: 8 });
  const base: SectionInput = { project: p, section, viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false };
  const normal = buildSectionDrawList(base);

  it('ocultar a parede mantém a janela', () => {
    const d = buildSectionDrawList({ ...base, hidden: new Set(['frente']) });
    expect(d.strokes.length).toBeGreaterThan(0);
    expect(d.fills.length).toBeLessThan(normal.fills.length);
  });

  it('isolar a janela mostra só a janela; isolar a parede mostra a parede sem a janela', () => {
    const soJanela = buildSectionDrawList({ ...base, hidden: new Set(['frente']) });
    const soParede = buildSectionDrawList({ ...base, hidden: new Set(['j1']) });
    const nada = buildSectionDrawList({ ...base, hidden: new Set(['frente', 'j1']) });
    expect(nada.fills).toHaveLength(0);
    expect(soJanela.strokes.length + soJanela.fills.length).toBeGreaterThan(0);
    expect(soParede.fills.length).toBeGreaterThan(0);
    expect(soJanela.strokes).not.toEqual(soParede.strokes);
  });

  it('tipo hospedado genérico (abertura sintética de outro id) segue a mesma regra', () => {
    const s = sectionResult({ beyond: [beyond({ wallId: 'w1' })], openings: [windowOpening('hospedado_novo')] });
    const soHospedado = buildSectionDrawList(input(s, { hidden: new Set(['w1']) }));
    expect(soHospedado.fills.length + soHospedado.strokes.length).toBeGreaterThan(0);
    const soHospedeiro = buildSectionDrawList(input(s, { hidden: new Set(['hospedado_novo']) }));
    expect(soHospedeiro.fills.length).toBeGreaterThan(0);
    expect(buildSectionDrawList(input(s, { hidden: new Set(['w1', 'hospedado_novo']) })).fills).toHaveLength(0);
  });
});
