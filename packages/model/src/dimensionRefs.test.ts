import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIMENSION_STYLE,
  ProjectStore,
  createEmptyProject,
  defaultStairTypeId,
  dimRefAt,
  dimensionGeometry,
  dimensionPoints,
  dimensionStyleOf,
  dimensionValue,
  effectiveDimStyle,
  formatDimension,
  makeFloor,
  makeStair,
  makeWall,
  openingType,
  resolveDimRef,
  type Dimension,
  type DimensionElementRef,
} from './index.ts';

const LV = 'lv_0';
const T = 0.184; // wt_alv14

function cena(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: LV, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: Object.keys(s.project.floorTypes)[0]!, levelId: LV, boundary: [{ x: 0, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 3 }, { x: 0, y: 3 }] }) });
  s.exec({
    type: 'addStair',
    stair: makeStair({
      id: 'st1', typeId: defaultStairTypeId, levelId: LV,
      components: [{ id: 'r1', kind: 'run', boundaryLeft: [{ a: { x: 6, y: 0 }, b: { x: 6, y: 3 }, sag: 0 }], boundaryRight: [{ a: { x: 7, y: 0 }, b: { x: 7, y: 3 }, sag: 0 }], risers: [], path: [] }],
    }),
  });
  return s;
}
const ref = (elementId: string, feature: DimensionElementRef['feature'], index?: number): DimensionElementRef => ({ elementId, feature, ...(index === undefined ? {} : { index }) });
const near = (p: { x: number; y: number } | null, x: number, y: number) => {
  expect(p).not.toBeNull();
  expect(p!.x).toBeCloseTo(x, 6);
  expect(p!.y).toBeCloseTo(y, 6);
};

describe('resolveDimRef', () => {
  it('parede: eixo e faces', () => {
    const p = cena().project;
    near(resolveDimRef(p, ref('w1', 'wall-axis-a')), 0, 0);
    near(resolveDimRef(p, ref('w1', 'wall-axis-b')), 4, 0);
    near(resolveDimRef(p, ref('w1', 'wall-face-hi')), 0, T / 2);
    near(resolveDimRef(p, ref('w1', 'wall-face-lo', 1)), 4, -T / 2);
    near(resolveDimRef(p, { wallId: 'w1', end: 'b' }), 4, 0);
  });
  it('esquadria: bordas e centro', () => {
    const p = cena().project;
    const half = openingType(p, p.elements.d1 as never).width / 2;
    expect(half).toBeGreaterThan(0.3);
    near(resolveDimRef(p, ref('d1', 'opening-center')), 2, 0);
    near(resolveDimRef(p, ref('d1', 'opening-edge-a')), 2 - half, 0);
    near(resolveDimRef(p, ref('d1', 'opening-edge-b')), 2 + half, 0);
  });
  it('laje/piso e escada: vértice e aresta', () => {
    const p = cena().project;
    near(resolveDimRef(p, ref('f1', 'vertex', 2)), 5, 3);
    near(resolveDimRef(p, ref('f1', 'edge', 3)), 0, 2);
    near(resolveDimRef(p, ref('st1', 'vertex', 1)), 6, 3);
    near(resolveDimRef(p, ref('st1', 'vertex', 3)), 7, 0);
  });
  it('elemento ausente ou feição incompatível: null', () => {
    const p = cena().project;
    expect(resolveDimRef(p, ref('nope', 'vertex', 0))).toBeNull();
    expect(resolveDimRef(p, ref('f1', 'wall-axis-a'))).toBeNull();
    expect(resolveDimRef(p, ref('f1', 'vertex', 9))).toBeNull();
  });
});

describe('associatividade', () => {
  const d: Dimension = { id: 'c', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1, refs: { a: ref('w1', 'wall-axis-a'), b: ref('w1', 'wall-axis-b') } };
  it('mover a parede move os pontos e o valor', () => {
    const s = cena();
    s.exec({ type: 'setWallEnds', id: 'w1', b: { x: 6, y: 0 } });
    expect(dimensionPoints(s.project, d).b).toEqual({ x: 6, y: 0 });
    expect(dimensionValue(s.project, d)).toBe(6);
  });
  it('sem o elemento cai nos pontos guardados', () => {
    const p = cena().project;
    const { w1: _w, ...rest } = p.elements;
    expect(dimensionPoints({ elements: rest }, d)).toEqual({ a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  });
  it('refs antigas com axis continuam valendo', () => {
    const s = cena();
    const legacy: Dimension = { ...d, a: { x: 0, y: 5 }, refs: { a: { wallId: 'w1', end: 'b', axis: 'x' } } };
    expect(dimensionPoints(s.project, legacy).a).toEqual({ x: 4, y: 5 });
  });
  it('projeção horizontal com ref de elemento', () => {
    const s = cena();
    const h: Dimension = { id: 'h', a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, offset: 1, mode: 'horizontal', refs: { a: ref('d1', 'opening-center'), b: ref('f1', 'vertex', 2) } };
    const pts = dimensionPoints(s.project, h);
    expect(pts.a).toEqual({ x: 2, y: 0 });
    expect(pts.b).toEqual({ x: 5, y: 0 });
  });
});

describe('dimRefAt', () => {
  it('acha a feição mais próxima, ou null', () => {
    const p = cena().project;
    expect(dimRefAt(p, LV, { x: 4.01, y: 0.01 }, 0.05)?.ref).toEqual(ref('w1', 'wall-axis-b'));
    expect(dimRefAt(p, LV, { x: 5.01, y: 2.99 }, 0.05)?.ref).toEqual(ref('f1', 'vertex', 2));
    expect(dimRefAt(p, LV, { x: 2.0, y: 0.0 }, 0.05)?.ref).toEqual(ref('d1', 'opening-center'));
    expect(dimRefAt(p, LV, { x: 3, y: 5 }, 0.05)).toBeNull();
    expect(dimRefAt(p, 'outro', { x: 4, y: 0 }, 0.05)).toBeNull();
  });
});

describe('estilo', () => {
  it('effectiveDimStyle: campos da cota sobrepõem o estilo', () => {
    const s = dimensionStyleOf(undefined);
    expect(effectiveDimStyle(s, {})).toEqual(DEFAULT_DIMENSION_STYLE);
    expect(effectiveDimStyle(s, { tickStyle: 'dot', textHeight: 4, precision: 1, prefix: 'L=', suffix: 'x', unit: 'cm' })).toMatchObject({ tick: 'dot', textHeight: 4, precision: 1, prefix: 'L=', suffix: 'x', unit: 'cm' });
  });
  it('dimensionGeometry usa o estilo (default = constantes antigas)', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 4, y: 0 };
    const base = dimensionGeometry(a, b, 1, 0.1);
    expect(dimensionGeometry(a, b, 1, 0.1, 2.5, undefined, DEFAULT_DIMENSION_STYLE)).toEqual(base);
    const wide = dimensionGeometry(a, b, 1, 0.1, 2.5, undefined, { ...DEFAULT_DIMENSION_STYLE, extensionGap: 3 });
    expect(Math.abs(wide.extensions[0][0].y)).toBeCloseTo(0.3, 9);
    expect(Math.abs(base.extensions[0][0].y)).toBeCloseTo(0.15, 9);
  });
  it('formatDimension com estilo: precisão e sufixo do estilo, mas a cota vence', () => {
    const style = { ...DEFAULT_DIMENSION_STYLE, precision: 1 as const, suffix: ' m!' };
    const d: Dimension = { id: 'x', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, offset: 1 };
    expect(formatDimension(d, 1.234, undefined, style)).toContain('1,2');
    expect(formatDimension({ ...d, suffix: '' }, 1.234, undefined, style)).not.toContain('!');
  });
  it('setDimensionStyle mescla no projeto e desfaz', () => {
    const s = cena();
    s.exec({ type: 'setDimensionStyle', patch: { tick: 'arrow', textHeight: 3 } });
    s.exec({ type: 'setDimensionStyle', patch: { textHeight: 4 } });
    expect(dimensionStyleOf(s.project.settings)).toMatchObject({ tick: 'arrow', textHeight: 4, precision: 2 });
    s.undo();
    expect(s.project.settings.dimensionStyle).toEqual({ tick: 'arrow', textHeight: 3 });
    s.undo();
    expect(s.project.settings.dimensionStyle).toBeUndefined();
  });
});
