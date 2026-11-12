import { describe, expect, it } from 'vitest';
import type { MultiPolygon, Vec2 } from '@hestia/geom';
import { computeSection } from '@hestia/engine';
import {
  DEFAULT_LINE_WEIGHTS,
  ProjectStore,
  createEmptyProject,
  defaultStairTypeId,
  lineWeightMm,
  makeStair,
  makeWall,
  paperMmToPx,
  type DeepPartial,
  type Opening,
  type OpeningType,
  type StairCurve,
  type StairRun,
  type ViewGraphics,
} from '@hestia/model';
import { LIGHT, type StrokeOp } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: v(ax, ay), b: v(bx, by), sag: 0 });

function stairProject() {
  const base = createEmptyProject();
  const store = new ProjectStore({ ...base, levels: base.levels.map((l) => (l.id === 'lv_1' ? { ...l, elevation: 2.8 } : l)) });
  const xs = Array.from({ length: 16 }, (_, k) => k * 0.28);
  const run: StairRun = {
    id: 'run',
    kind: 'run',
    boundaryLeft: [ln(-0.3, 0.6, 4.5, 0.6)],
    boundaryRight: [ln(-0.3, -0.6, 4.5, -0.6)],
    risers: xs.map((x) => ln(x, -1, x, 1)),
    path: [],
  };
  store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run] }) });
  return store.project;
}

const input = (line: { a: Vec2; b: Vec2; depth: number }, zoom = 60): SectionInput => {
  const project = stairProject();
  return {
    project,
    section: computeSection(project, line),
    viewport: { cx: 2, cy: 1.4, zoom, width: 800, height: 600 },
    theme: LIGHT,
    dark: false,
    showGrid: false,
  };
};

describe('desenho do corte com escada', () => {
  it('o degrau cortado leva a cor e a hachura do material do tipo, com contorno pesado', () => {
    const draw = buildSectionDrawList(input({ a: v(-1, 0), b: v(6, 0), depth: 2 }));
    const hatched = draw.fills.filter((f) => f.hatch);
    expect(hatched.length).toBeGreaterThan(0);
    expect(hatched.some((f) => f.hatch?.kind === 'cross')).toBe(true);
    expect(draw.strokes.some((s) => s.closed && s.widthPx === 2.2)).toBe(true);
  });

  it('a elevação mostra a estrutura da escada como um contorno único além do plano, sem hachura e sem linha entre degraus', () => {
    const draw = buildSectionDrawList(input({ a: v(-1, -3), b: v(6, -3), depth: 6 }));
    expect(draw.fills.filter((f) => f.hatch)).toHaveLength(0);
    // Os 15 degraus formam um só sólido: um preenchimento e um contorno fino fechado (o perfil dentado), sem linha vertical entre degraus.
    const thin = draw.strokes.filter((s) => s.closed && s.widthPx === 1);
    expect(thin).toHaveLength(1);
  });
});

/** Caixa de 6 × 4 m com janela em cada face e uma parede interna; vista de fora (y = −2). */
function boxProject() {
  const store = new ProjectStore(createEmptyProject());
  const walls = [
    ['frente', v(0, 0), v(6, 0)],
    ['fundo', v(6, 4), v(0, 4)],
    ['leste', v(6, 0), v(6, 4)],
    ['oeste', v(0, 4), v(0, 0)],
    ['interna', v(0, 2), v(6, 2)],
  ] as const;
  for (const [id, a, b] of walls) store.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a, b, height: 3 }) });
  for (const host of ['frente', 'fundo', 'interna']) {
    store.exec({ type: 'addOpening', opening: { id: `j_${host}`, kind: 'window', typeId: 'ot_j120', hostId: host, offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  }
  return store.project;
}

/** Vista de fora da caixa de 6 × 4 m (linha em y = −2), usada pelos testes de gráficos. */
function boxInput(): SectionInput {
  const project = boxProject();
  return { project, section: computeSection(project, { a: v(0, -2), b: v(6, -2), depth: 8 }), viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false };
}

describe('desenho do corte com linha oculta', () => {
  const GLASS = '#bfe3f5';
  it('a janela de trás e a da parede interna não são pintadas: só o vidro da face voltada ao observador', () => {
    const draw = buildSectionDrawList(boxInput());
    // A janela da frente é de correr com duas folhas: dois panos de vidro, e nada das janelas de trás/interna.
    expect(draw.fills.filter((f) => f.color === GLASS)).toHaveLength(2);
  });

  it('o corte é pintado por último, sobre o que está além', () => {
    const input = stairCut();
    const draw = buildSectionDrawList(input);
    const last = draw.fills.slice(-input.section.cut.length).map((f) => f.polygons);
    expect(last).toEqual(input.section.cut.map((c) => c.polygons));
  });
});

/** Corte transversal de uma escada: tem material cortado e itens além, para testar a ordem de pintura. */
function stairCut(): SectionInput {
  return input({ a: v(-1, 0), b: v(6, 0), depth: 2 });
}

/** Abreviação de abertura para os testes de esquadria. */
const op = (id: string, kind: 'door' | 'window', typeId: string, hostId: string, offset = 3, extra: Partial<Opening> = {}): Opening => ({
  id,
  kind,
  typeId,
  hostId,
  offset,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
  ...extra,
});

/** Parede 'frente' (6 m) com vãos; linha fora da parede (y = −2): vista face (elevação). */
function facade(openings: Opening[], type?: OpeningType): SectionInput {
  const store = new ProjectStore(createEmptyProject());
  if (type) store.exec({ type: 'upsertOpeningType', openingType: type });
  store.exec({ type: 'addWall', wall: makeWall({ id: 'frente', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  for (const o of openings) store.exec({ type: 'addOpening', opening: o });
  const project = store.project;
  return { project, section: computeSection(project, { a: v(0, -2), b: v(6, -2), depth: 8 }), viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false };
}

/** Corte transversal à parede (linha vertical em x = 3): a espessura da parede corre no eixo t. */
function cross(openings: Opening[], type?: OpeningType): SectionInput {
  const store = new ProjectStore(createEmptyProject());
  if (type) store.exec({ type: 'upsertOpeningType', openingType: type });
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  for (const o of openings) store.exec({ type: 'addOpening', opening: o });
  const project = store.project;
  return { project, section: computeSection(project, { a: v(3, -1), b: v(3, 1), depth: 3 }), viewport: { cx: 0, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false };
}

const GLASS_T = '#bfe3f5';
const DOOR_T = '#e6d2ae';
const largura = (polys: MultiPolygon): number => {
  const x = polys.flat(2).map((q) => q.x);
  return Math.max(...x) - Math.min(...x);
};
const altura = (polys: MultiPolygon): number => {
  const y = polys.flat(2).map((q) => q.y);
  return Math.max(...y) - Math.min(...y);
};
const meio = (polys: MultiPolygon): number => {
  const x = polys.flat(2).map((q) => q.x);
  return (Math.min(...x) + Math.max(...x)) / 2;
};
const comTipo = (base: OpeningType, patch: Partial<OpeningType>): OpeningType => ({ ...base, ...patch });

describe('portas novas no corte e na elevação (tarefa F1)', () => {
  it('embutir desenha a cavidade tracejada e a seccionada desenha os trilhos tracejados', () => {
    const pe = buildSectionDrawList(facade([op('p', 'door', 'ot_pe80', 'frente')]));
    expect(pe.strokes.some((s) => s.closed && s.dash?.[0] === 6)).toBe(true);
    const pg = buildSectionDrawList(facade([op('p', 'door', 'ot_pg300', 'frente')]));
    expect(pg.strokes.some((s) => s.closed && s.dash?.[0] === 6)).toBe(true);
  });

  it('as cinco famílias produzem contornos de folha na elevação', () => {
    for (const id of ['ot_pvv90', 'ot_pe80', 'ot_pd120', 'ot_ps90', 'ot_pg300']) {
      const d = buildSectionDrawList(facade([op('p', 'door', id, 'frente')]));
      expect(d.strokes.filter((s) => s.closed).length, id).toBeGreaterThan(0);
    }
  });
});

describe('esquadria no corte e na elevação (tipo e família)', () => {
  it('C1: o batente da janela tem a espessura do perfil (frameWidth) do tipo, dentro do vão', () => {
    const d = buildSectionDrawList(facade([op('j', 'window', 'ot_jfixa60', 'frente')]));
    const larguras = d.fills.map((f) => largura(f.polygons));
    // duas ombreiras com a espessura padrão do perfil (0,05 m)
    expect(larguras.filter((w) => Math.abs(w - 0.05) < 1e-6)).toHaveLength(2);
  });

  it('C1: a espessura do batente vem do tipo, não de um valor fixo', () => {
    const tipo = comTipo(createEmptyProject().openingTypes.ot_jfixa60!, { id: 'ot_jfixa80', width: 0.8, frameWidth: 0.08 });
    const d = buildSectionDrawList(facade([op('j', 'window', 'ot_jfixa80', 'frente')], tipo));
    const larguras = d.fills.map((f) => largura(f.polygons));
    expect(larguras.filter((w) => Math.abs(w - 0.08) < 1e-6)).toHaveLength(2);
    expect(larguras.some((w) => Math.abs(w - 0.05) < 1e-6)).toBe(false);
  });

  it('C1: no corte transversal, a verga e a soleira têm a profundidade do batente (frameDepth), centradas na parede', () => {
    const tipo = comTipo(createEmptyProject().openingTypes.ot_jfixa60!, { id: 'ot_jfd', frameDepthMode: 'fixed', frameDepth: 0.12 });
    const d = buildSectionDrawList(cross([op('j', 'window', 'ot_jfd', 'w')], tipo));
    const verga = d.fills.filter((f) => Math.abs(largura(f.polygons) - 0.12) < 1e-6 && Math.abs(altura(f.polygons) - 0.05) < 1e-6);
    expect(verga).toHaveLength(2); // verga e soleira
    expect(meio(verga[0]!.polygons)).toBeCloseTo(meio(verga[1]!.polygons), 9); // centradas na parede
  });

  it('C2: no corte face, o vidro ocupa a região interna do caixilho', () => {
    const d = buildSectionDrawList(facade([op('j', 'window', 'ot_jfixa60', 'frente')]));
    const vidro = d.fills.filter((f) => f.color === GLASS_T);
    expect(vidro).toHaveLength(1);
    expect(largura(vidro[0]!.polygons)).toBeCloseTo(0.5, 6); // 0,60 − 2 × 0,05
    expect(altura(vidro[0]!.polygons)).toBeCloseTo(0.5, 6);
  });

  it('C2: no corte transversal, o vidro tem a espessura do tipo (glassThickness)', () => {
    const tipo = comTipo(createEmptyProject().openingTypes.ot_jfixa60!, { id: 'ot_jg', glassThickness: 0.03 });
    const d = buildSectionDrawList(cross([op('j', 'window', 'ot_jg', 'w')], tipo));
    const vidro = d.fills.filter((f) => f.color === GLASS_T);
    expect(vidro).toHaveLength(1);
    expect(largura(vidro[0]!.polygons)).toBeCloseTo(0.03, 6);
  });

  it('espessuras do tipo: frameWidth, frameDepth e glassThickness vêm do tipo', () => {
    const tipo = comTipo(createEmptyProject().openingTypes.ot_jfixa60!, { id: 'ot_esp', width: 0.9, frameWidth: 0.07, frameDepthMode: 'fixed', frameDepth: 0.1, glassThickness: 0.02 });
    const face = buildSectionDrawList(facade([op('j', 'window', 'ot_esp', 'frente')], tipo));
    expect(face.fills.map((f) => largura(f.polygons)).filter((w) => Math.abs(w - 0.07) < 1e-6)).toHaveLength(2); // ombreiras
    expect(largura(face.fills.find((f) => f.color === GLASS_T)!.polygons)).toBeCloseTo(0.9 - 2 * 0.07, 6);
    const corte = buildSectionDrawList(cross([op('j', 'window', 'ot_esp', 'w')], tipo));
    expect(corte.fills.some((f) => Math.abs(largura(f.polygons) - 0.1) < 1e-6)).toBe(true); // verga/soleira
    expect(largura(corte.fills.find((f) => f.color === GLASS_T)!.polygons)).toBeCloseTo(0.02, 6); // vidro
  });

  it('C6: a linha central do vidro só aparece na janela de correr (2+ folhas)', () => {
    const montantes = (d: ReturnType<typeof buildSectionDrawList>): number => d.strokes.filter((s) => !s.closed && s.alpha === 0.7).length;
    expect(montantes(buildSectionDrawList(facade([op('jf', 'window', 'ot_jfixa60', 'frente')])))).toBe(0); // fixa, 1 folha
    expect(montantes(buildSectionDrawList(facade([op('jc', 'window', 'ot_j120', 'frente')])))).toBe(1); // correr, 2 folhas
    expect(montantes(buildSectionDrawList(facade([op('j3', 'window', 'ot_j240', 'frente')])))).toBe(2); // correr, 3 folhas
  });

  it('C5: o vão livre de porta não tem preenchimento; a porta com folha tem', () => {
    expect(buildSectionDrawList(facade([op('v', 'door', 'ot_vao90', 'frente')])).fills.filter((f) => f.color === DOOR_T)).toHaveLength(0);
    expect(buildSectionDrawList(facade([op('p', 'door', 'ot_p80', 'frente')])).fills.filter((f) => f.color === DOOR_T)).toHaveLength(1);
  });

  // Diagonal solta: traço reto de dois pontos que não é horizontal nem vertical (o X do vão saiu, decisão 0024 §3).
  const diagonais = (d: ReturnType<typeof buildSectionDrawList>): StrokeOp[] =>
    d.strokes.filter((s) => !s.closed && s.pts.length === 2 && s.pts[0]!.x !== s.pts[1]!.x && s.pts[0]!.y !== s.pts[1]!.y);

  it('vão livre no corte e na elevação: só o contorno, sem diagonais (sem X)', () => {
    const d = buildSectionDrawList(facade([op('v', 'door', 'ot_vao90', 'frente')]));
    expect(diagonais(d)).toHaveLength(0);
    expect(d.strokes.some((s) => s.closed && s.widthPx > 0)).toBe(true); // o contorno do vão continua
  });

  // V de giro (decisão 0024 §2): traço de três pontos cujas duas pontas ficam longe uma da outra. A seta de correr também tem
  // três pontos, mas as pontas ficam a 0,1 m; por isso a distância entre as pontas separa os dois.
  const isV = (s: StrokeOp): boolean => !s.closed && s.pts.length === 3 && Math.hypot(s.pts[0]!.x - s.pts[2]!.x, s.pts[0]!.y - s.pts[2]!.y) > 0.3;
  const vs = (d: ReturnType<typeof buildSectionDrawList>): StrokeOp[] => d.strokes.filter(isV);

  it('E1: a porta de giro tem um V com o vértice no trinco (meia altura) e as pontas nos cantos da dobradiça', () => {
    const input = facade([op('p', 'door', 'ot_p80', 'frente', 3, { flipHand: true })]);
    const o = input.section.openings[0]!;
    const a = o.model.openings[0]!;
    const cx = (o.t0 + o.t1) / 2;
    const [v1] = vs(buildSectionDrawList(input));
    // Convenção padrão: vértice no lado OPOSTO à dobradiça (trinco), a meia altura; pontas na dobradiça, no topo e na base.
    expect(v1!.pts[1]!.x).toBeCloseTo(cx + a.latchT, 6);
    expect(v1!.pts[1]!.y).toBeCloseTo((a.z0 + a.z1) / 2, 6);
    expect(v1!.pts[0]!.x).toBeCloseTo(cx + a.hingeT, 6);
    expect(v1!.pts[0]!.y).toBeCloseTo(a.z1, 6);
    expect(v1!.pts[2]!.x).toBeCloseTo(cx + a.hingeT, 6);
    expect(v1!.pts[2]!.y).toBeCloseTo(a.z0, 6);
  });

  it('E1: com a dobradiça à esquerda, o V se espelha (vértice no trinco à direita)', () => {
    const input = facade([op('p', 'door', 'ot_p80', 'frente')]);
    const o = input.section.openings[0]!;
    const a = o.model.openings[0]!;
    const cx = (o.t0 + o.t1) / 2;
    const [v1] = vs(buildSectionDrawList(input));
    expect(v1!.pts[1]!.x).toBeCloseTo(cx + a.latchT, 6);
    expect(v1!.pts[0]!.x).toBeCloseTo(cx + a.hingeT, 6);
    expect(v1!.pts[2]!.x).toBeCloseTo(cx + a.hingeT, 6);
  });

  it('E1 (traço): o V sai tracejado quando a folha abre para o observador e contínuo quando abre para o lado oposto', () => {
    // A fachada olha do sul (y = −2) para a parede em y = 0; com flipFacing falso a folha abre para +y (para dentro,
    // para longe do observador) → contínuo; com flipFacing verdadeiro abre para −y (para o observador) → tracejado.
    const dashOf = (flip: boolean): [number, number] | undefined => vs(buildSectionDrawList(facade([op('p', 'door', 'ot_p80', 'frente', 3, { flipFacing: flip })])))[0]!.dash;
    expect(dashOf(false)).toBeUndefined();
    expect(dashOf(true)).toEqual([4, 3]);
  });

  it('E1: a porta dupla tem um V por folha: vértice no trinco (centro) e pontas nas ombreiras', () => {
    const input = facade([op('p', 'door', 'ot_p160', 'frente')]);
    const o = input.section.openings[0]!;
    const cx = (o.t0 + o.t1) / 2;
    const [esq, dir] = vs(buildSectionDrawList(input));
    expect(vs(buildSectionDrawList(input))).toHaveLength(2);
    const aberturas = o.model.openings.filter((x) => x.kind === 'side');
    expect(aberturas).toHaveLength(2);
    for (const [v1, a] of [
      [esq!, aberturas[0]!],
      [dir!, aberturas[1]!],
    ] as const) {
      expect(v1.pts[1]!.x).toBeCloseTo(cx + a.latchT, 6);
      expect(v1.pts[0]!.x).toBeCloseTo(cx + a.hingeT, 6);
      expect(v1.pts[2]!.x).toBeCloseTo(cx + a.hingeT, 6);
      expect(v1.pts[1]!.y).toBeCloseTo((a.z0 + a.z1) / 2, 6);
      expect(v1.pts[0]!.y).toBeCloseTo(a.z1, 6);
      expect(v1.pts[2]!.y).toBeCloseTo(a.z0, 6);
    }
  });

  it('E1: a pivotante tem o eixo vertical a W/4 da ombreira da dobradiça e o vértice do V sobre ele', () => {
    const input = facade([op('p', 'door', 'ot_pp80', 'frente')]);
    const o = input.section.openings[0]!;
    const a = o.model.openings[0]!;
    const cx = (o.t0 + o.t1) / 2;
    const d = buildSectionDrawList(input);
    const [v1] = vs(d);
    expect(v1!.pts[1]!.x).toBeCloseTo(cx + a.hingeT, 6);
    expect(v1!.pts[1]!.y).toBeCloseTo((a.z0 + a.z1) / 2, 6);
    // As pontas do V ficam na borda oposta da folha (o lado mais distante do eixo).
    expect(Math.abs(v1!.pts[0]!.x - (cx + a.hingeT))).toBeGreaterThan(Math.abs(a.hingeT));
    expect(d.strokes.filter((s) => !s.closed && s.pts.length === 2 && s.pts[0]!.x === s.pts[1]!.x)).toHaveLength(1);
    // Com a dobradiça à direita, o eixo e o vértice vão para o outro lado.
    const [dir] = vs(buildSectionDrawList(facade([op('p', 'door', 'ot_pp80', 'frente', 3, { flipHand: true })])));
    expect(dir!.pts[1]!.x).toBeGreaterThan(cx);
  });

  it('E1: o maxim-ar tem o vértice embaixo, no meio, e as pontas em cima no eixo', () => {
    const input = facade([op('j', 'window', 'ot_j60', 'frente')]);
    const o = input.section.openings[0]!;
    const a = o.model.openings[0]!;
    const cx = (o.t0 + o.t1) / 2;
    const [v1] = vs(buildSectionDrawList(input));
    expect(v1!.pts[1]!.x).toBeCloseTo(cx, 6);
    expect(v1!.pts[1]!.y).toBeCloseTo(o.z0 + a.z0, 6);
    expect(v1!.pts[0]!.x).toBeLessThan(v1!.pts[1]!.x);
    expect(v1!.pts[2]!.x).toBeGreaterThan(v1!.pts[1]!.x);
    expect(v1!.pts[0]!.y).toBeCloseTo(o.z0 + a.z1, 6);
    expect(v1!.pts[2]!.y).toBeCloseTo(o.z0 + a.z1, 6);
  });

  it('E1: o basculante tem dois V com vértice no eixo central e pontas nos cantos de cima e de baixo', () => {
    const tilt = { ...createEmptyProject().openingTypes.ot_j60!, id: 'ot_bas60', plan: 'tilt' as const };
    const input = facade([op('b', 'window', 'ot_bas60', 'frente')], tilt);
    const o = input.section.openings[0]!;
    const a = o.model.openings[0]!;
    const vss = vs(buildSectionDrawList(input));
    expect(vss).toHaveLength(2);
    const eixo = o.z0 + a.axisZ!;
    for (const v1 of vss) expect(v1.pts[1]!.y).toBeCloseTo(eixo, 6);
    const superior = vss.find((x) => x.pts[0]!.y > eixo)!;
    const inferior = vss.find((x) => x.pts[0]!.y < eixo)!;
    expect(superior.pts[0]!.y).toBeCloseTo(o.z0 + a.z1, 6);
    expect(superior.pts[2]!.y).toBeCloseTo(o.z0 + a.z1, 6);
    expect(inferior.pts[0]!.y).toBeCloseTo(o.z0 + a.z0, 6);
    expect(inferior.pts[2]!.y).toBeCloseTo(o.z0 + a.z0, 6);
  });

  it('E1 (traço): a janela de abrir segue a regra da porta: tracejada se a folha abre para o observador', () => {
    const dashOf = (flip: boolean): [number, number] | undefined => vs(buildSectionDrawList(facade([op('j', 'window', 'ot_j60', 'frente', 3, { flipFacing: flip })])))[0]!.dash;
    expect(dashOf(false)).toBeUndefined();
    expect(dashOf(true)).toEqual([4, 3]);
  });

  it('E1: a janela de correr, a fixa e o vão livre não têm V; o vão livre também não tem X', () => {
    expect(vs(buildSectionDrawList(facade([op('j', 'window', 'ot_j120', 'frente')])))).toHaveLength(0);
    expect(vs(buildSectionDrawList(facade([op('jf', 'window', 'ot_jfixa60', 'frente')])))).toHaveLength(0);
    const vao = buildSectionDrawList(facade([op('v', 'door', 'ot_vao90', 'frente')]));
    expect(vs(vao)).toHaveLength(0);
    expect(diagonais(vao)).toHaveLength(0);
  });

  it('E1 (níveis): no grosso não sai V nem seta de correr; no médio saem', () => {
    const grosso = styledBox({ detail: 'coarse' }, () => facade([op('p', 'door', 'ot_p80', 'frente'), op('v', 'door', 'ot_vao90', 'frente', 4.5), op('j', 'window', 'ot_j120', 'frente', 1.2)]));
    expect(vs(buildSectionDrawList(grosso))).toHaveLength(0);
    expect(buildSectionDrawList(grosso).strokes.filter((s) => s.dash?.[0] === 4)).toHaveLength(0);
    expect(diagonais(buildSectionDrawList(grosso))).toHaveLength(0);
    const medio = buildSectionDrawList(facade([op('p', 'door', 'ot_p80', 'frente')]));
    expect(vs(medio)).toHaveLength(1);
  });

  it('E1 (linhas finas): o V sai com 1 px, como os demais traços', () => {
    const d = buildSectionDrawList({ ...facade([op('p', 'door', 'ot_p80', 'frente')]), thinLines: true });
    expect(vs(d)).toHaveLength(1);
    expect(d.strokes.every((s) => s.widthPx <= 1)).toBe(true);
  });

  it('E2: a janela e a porta de correr mostram a seta de correr; a fixa não', () => {
    expect(buildSectionDrawList(facade([op('j', 'window', 'ot_j120', 'frente')])).strokes.filter((s) => s.dash?.[0] === 4).length).toBeGreaterThanOrEqual(2);
    expect(buildSectionDrawList(facade([op('p', 'door', 'ot_pc160', 'frente')])).strokes.filter((s) => s.dash?.[0] === 4).length).toBeGreaterThanOrEqual(2);
    expect(buildSectionDrawList(facade([op('jf', 'window', 'ot_jfixa60', 'frente')])).strokes.filter((s) => s.dash?.[0] === 4)).toHaveLength(0);
  });
});


/** Corte transversal da caixa (linha em x = 3): as paredes perpendiculares à linha entram cortadas, com o peso de corte. */
function cutInput(): SectionInput {
  const project = boxProject();
  return { ...boxInput(), section: computeSection(project, { a: v(3, -1), b: v(3, 5), depth: 8 }) };
}

/** A vista de fora de uma caixa com uma janela em cada face, com os gráficos do corte salvos pelo comando real. */
function styledBox(patch: DeepPartial<ViewGraphics>, base: () => SectionInput = boxInput): SectionInput {
  const i = base();
  const store = new ProjectStore(i.project);
  store.exec({ type: 'setSectionGraphics', patch });
  return { ...i, project: store.project };
}

/** Larguras fechadas do desenho (sem repetição), para achar o peso de cada categoria. */
const closedWidths = (d: ReturnType<typeof buildSectionDrawList>): number[] =>
  [...new Set(d.strokes.filter((s) => s.closed).map((s) => s.widthPx))];

const weightPx = (weight: number, scale: number): number => paperMmToPx(lineWeightMm(DEFAULT_LINE_WEIGHTS, weight, scale), 60, scale);

describe('gráficos do corte/elevação (decisão 0015)', () => {
  it('a escala muda a largura da parede cortada (peso 5): 3 px em 1:100 e 2,1 px em 1:50 (espessura em papel)', () => {
    const at100 = closedWidths(buildSectionDrawList(styledBox({ scale: 100 }, cutInput)));
    const at50 = closedWidths(buildSectionDrawList(styledBox({ scale: 50 }, cutInput)));
    expect(at100.some((w) => Math.abs(w - weightPx(5, 100)) < 1e-9)).toBe(true);
    expect(at50.some((w) => Math.abs(w - weightPx(5, 50)) < 1e-9)).toBe(true);
    expect(weightPx(5, 100)).toBeGreaterThan(weightPx(5, 50));
  });

  it('o que está além leva o peso de projeção da categoria (parede 2), não o de corte', () => {
    const widths = closedWidths(buildSectionDrawList(styledBox({ scale: 100 })));
    expect(widths.some((w) => Math.abs(w - weightPx(2, 100)) < 1e-9)).toBe(true);
  });

  it('categoria oculta some: janela oculta não pinta vidro; parede oculta não deixa o corte nem a hachura', () => {
    const semJanela = buildSectionDrawList(styledBox({ overrides: { window: { visible: false } } }));
    expect(semJanela.fills.filter((f) => f.color === '#bfe3f5')).toHaveLength(0);
    const semParede = buildSectionDrawList(styledBox({ overrides: { wall: { visible: false } } }, cutInput));
    // A esquadria visível pode ter a hachura das próprias peças; o que sai é a hachura do corte da parede (peças largas).
    expect(semParede.fills.filter((f) => f.hatch && largura(f.polygons) > 1)).toHaveLength(0);
    expect(closedWidths(semParede)).not.toContain(weightPx(5, 100));
  });

  it('arame não preenche (nem hachura); grosso fica só com os contornos', () => {
    const arame = buildSectionDrawList(styledBox({ style: 'wireframe' }));
    expect(arame.fills).toHaveLength(0);
    const grosso = buildSectionDrawList(styledBox({ detail: 'coarse' }));
    expect(grosso.fills).toHaveLength(0);
  });

  it('sem gráficos salvos o hiddenLine continua com os traços fixos de antes (silhueta 2,2 e além 1)', () => {
    const d = buildSectionDrawList(boxInput());
    expect(d.strokes.filter((s) => s.closed).some((s) => s.widthPx === 2.2)).toBe(true);
    expect(d.strokes.filter((s) => s.closed && s.widthPx === 1).length).toBeGreaterThan(0);
  });
});

describe('acabamento e vergas da esquadria no corte e na elevação', () => {
  const fixa = createEmptyProject().openingTypes.ot_jfixa60!;
  const com = (id: string, patch: Partial<OpeningType>): OpeningType => comTipo(fixa, { id, ...patch });
  const pecas = (d: ReturnType<typeof buildSectionDrawList>, l: number, a: number): number =>
    d.fills.filter((f) => Math.abs(largura(f.polygons) - l) < 1e-6 && Math.abs(altura(f.polygons) - a) < 1e-6).length;

  it('verga: peça de concreto na elevação com transpasse de 0,30 m para cada lado (vão de 0,60 m)', () => {
    const d = buildSectionDrawList(facade([op('j', 'window', 'ot_vg', 'frente')], com('ot_vg', { lintel: {} })));
    expect(pecas(d, 1.2, 0.2)).toBe(1);
    expect(pecas(buildSectionDrawList(facade([op('j', 'window', 'ot_vg0', 'frente')], com('ot_vg0', {}))), 1.2, 0.2)).toBe(0);
  });

  it('contraverga: peça de concreto sob o vão com a altura do tipo; sem o campo, nenhuma', () => {
    const d = buildSectionDrawList(facade([op('j', 'window', 'ot_cv', 'frente')], com('ot_cv', { sillBeam: { over: 0, height: 0.25 } })));
    expect(pecas(d, 0.6, 0.25)).toBe(1);
  });

  it('peitoril saliente: na elevação, faixa com a largura do vão sob ele; no corte, projeta além das duas faces', () => {
    const tipo = com('ot_pt', { sillBoard: { projection: 0.03, thickness: 0.02 } });
    // O modelo projeta o peitoril 0,03 m além de cada ombreira: 0,60 + 0,06.
    expect(pecas(buildSectionDrawList(facade([op('j', 'window', 'ot_pt', 'frente')], tipo)), 0.66, 0.02)).toBe(1);
    // A parede wt_alv14 tem 0,184 m de espessura; o peitoril sobra 0,03 m de cada lado.
    expect(pecas(buildSectionDrawList(cross([op('j', 'window', 'ot_pt', 'w')], tipo)), 0.184 + 0.06, 0.02)).toBe(1);
  });

  it('alizar: contorno a mais em volta do vão (quatro linhas fechadas numa janela) na elevação', () => {
    const fechados = (d: ReturnType<typeof buildSectionDrawList>): number => d.strokes.filter((s) => s.closed).length;
    const base = fechados(buildSectionDrawList(facade([op('j', 'window', 'ot_al0', 'frente')], com('ot_al0', {}))));
    const alizado = fechados(buildSectionDrawList(facade([op('j', 'window', 'ot_al', 'frente')], com('ot_al', { casing: { width: 0.05, thickness: 0.015 } }))));
    // v3 (decisão 0035 §3): o alizar é uma silhueta única por face (contorno externo e do vão), nas duas faces: 4 contornos.
    expect(alizado - base).toBe(4);
  });
});

describe('elevação e corte a partir do modelo único', () => {
  const centroY = (polys: MultiPolygon): number => {
    const y = polys.flat(2).map((q) => q.y);
    return (Math.min(...y) + Math.max(...y)) / 2;
  };
  const centroX = (polys: MultiPolygon): number => meio(polys);
  const fixa = createEmptyProject().openingTypes.ot_jfixa60!;
  const tipo = (id: string, patch: Partial<OpeningType>): OpeningType => comTipo(fixa, { id, ...patch });

  it('a elevação da porta com leafStyle panel contém as quatro almofadas do modelo', () => {
    const input = facade([op('p', 'door', 'ot_pp', 'frente')], comTipo(createEmptyProject().openingTypes.ot_p90!, { id: 'ot_pp', leafStyle: 'panel' }));
    const o = input.section.openings[0]!;
    const almofadas = o.model.parts.filter((x) => x.role === 'leafPanel').map((x) => ({ w: x.box.t1 - x.box.t0, h: x.box.z1 - x.box.z0 }));
    expect(almofadas).toHaveLength(4);
    const d = buildSectionDrawList(input);
    const preenchidas = d.fills.map((f) => ({ w: largura(f.polygons), h: altura(f.polygons) }));
    for (const a of almofadas) expect(preenchidas.some((f) => Math.abs(f.w - a.w) < 1e-6 && Math.abs(f.h - a.h) < 1e-6)).toBe(true);
  });

  it('a elevação da porta com leafStyle glass contém o vidro do modelo', () => {
    const input = facade([op('p', 'door', 'ot_pg', 'frente')], comTipo(createEmptyProject().openingTypes.ot_p90!, { id: 'ot_pg', leafStyle: 'glass' }));
    const o = input.section.openings[0]!;
    const vidro = o.model.parts.find((x) => x.role === 'glass')!;
    const d = buildSectionDrawList(input);
    const f = d.fills.find((x) => x.color === GLASS_T);
    expect(f).toBeDefined();
    expect(largura(f!.polygons)).toBeCloseTo(vidro.box.t1 - vidro.box.t0, 6);
    expect(altura(f!.polygons)).toBeCloseTo(vidro.box.z1 - vidro.box.z0, 6);
  });

  it('a elevação da porta com handle lever desenha a maçaneta no lado do trinco, a z ≈ 1,0', () => {
    const input = facade([op('p', 'door', 'ot_p90', 'frente')]);
    const o = input.section.openings[0]!;
    const cx = (o.t0 + o.t1) / 2;
    const roseta = o.model.parts.find((x) => x.role === 'handle' && x.id.includes('rosette'))!;
    const x = cx + (roseta.box.t0 + roseta.box.t1) / 2;
    const z = o.z0 + (roseta.box.z0 + roseta.box.z1) / 2;
    expect(z).toBeCloseTo(o.z0 + 1, 6);
    const d = buildSectionDrawList(input);
    const achou = d.fills.some((f) => Math.abs(centroX(f.polygons) - x) < 1e-6 && Math.abs(centroY(f.polygons) - z) < 1e-6 && Math.abs(largura(f.polygons) - 0.052) < 1e-6);
    expect(achou).toBe(true);
  });

  it('corte transversal da janela: verga de concreto com hachura, batente centrado no núcleo e vidro com a espessura do tipo', () => {
    const t = tipo('ot_cx', { lintel: { height: 0.2 }, sillBoard: { projection: 0.03, thickness: 0.02 } });
    const input = cross([op('j', 'window', 'ot_cx', 'w')], t);
    const o = input.section.openings[0]!;
    const d = buildSectionDrawList(input);
    const coreW = o.model.core.s1 - o.model.core.s0;
    const hatched = d.fills.filter((f) => f.hatch?.kind === 'cross');
    expect(hatched.some((f) => Math.abs(largura(f.polygons) - coreW) < 1e-6 && Math.abs(altura(f.polygons) - 0.2) < 1e-6)).toBe(true);
    const cx = (o.t0 + o.t1) / 2;
    const jamb = o.model.parts.find((x) => x.role === 'jamb')!;
    const larg = jamb.box.s1 - jamb.box.s0;
    const centro = (o.model.core.s0 + o.model.core.s1) / 2;
    expect(d.fills.some((f) => Math.abs(largura(f.polygons) - larg) < 1e-6 && Math.abs(centroX(f.polygons) - (cx + o.sSign * centro)) < 1e-6)).toBe(true);
    const vidro = o.model.parts.find((x) => x.role === 'glass')!;
    const f = d.fills.find((x) => x.color === GLASS_T)!;
    expect(largura(f.polygons)).toBeCloseTo(vidro.box.s1 - vidro.box.s0, 6);
    // Peitoril saliente projetado além das duas faces no corte.
    expect(d.fills.some((x) => Math.abs(largura(x.polygons) - (o.model.thickness + 0.06)) < 1e-6)).toBe(true);
  });
});

describe('linhas finas só na tela (decisão 0015)', () => {
  it('com a opção, todo traço do modelo sai com 1 px; a parede cortada não mantém o peso 5', () => {
    const fina = buildSectionDrawList({ ...styledBox({ scale: 100 }, cutInput), thinLines: true });
    expect(fina.strokes.every((s) => s.widthPx <= 1)).toBe(true);
    expect(closedWidths(fina)).not.toContain(weightPx(5, 100));
  });

  it('sem a opção (ou com ela falsa), o desenho é o de antes: a parede cortada mantém o peso real', () => {
    const base = styledBox({ scale: 100 }, cutInput);
    const padrao = buildSectionDrawList(base);
    expect(buildSectionDrawList({ ...base, thinLines: false })).toEqual(padrao);
    expect(closedWidths(padrao)).toContain(weightPx(5, 100));
  });

  it('o realce de seleção mantém a largura própria (2 px) mesmo com linhas finas', () => {
    const draw = buildSectionDrawList({ ...styledBox({ scale: 100 }, cutInput), thinLines: true, highlight: { selection: ['frente'], hover: null } });
    expect(draw.strokes.some((s) => s.color === LIGHT.select && s.widthPx === 2)).toBe(true);
  });
});
