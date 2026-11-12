import { describe, expect, it } from 'vitest';
import { pointInMulti, type Vec2 } from '@hestia/geom';
import { resolveLevel, viewRangeWarnings } from '@hestia/engine';
import { ProjectStore, projetoComCoberturaDeTeste, defaultStairTypeId, floorViewId, legacyRoofViewId as roofViewId, makeFloor, makeRoof, makeSlab, makeStair, makeWall, planViewRangeOf, type Id, type Opening, type Project, type ViewRange } from '@hestia/model';
import { straightStair } from '../stairFixture.helper.ts';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { stairFills } from './stairs.ts';
import { defaultPaint } from './style.ts';

/** Espessura de corte da escada no zoom dos testes (100 px/m, 1:100): antes, 1,4 px fixos. */
const RISER_PX = defaultPaint('stair', 100).cutPx;
import { hiddenSelectionOps, resolvedPlanViewOf } from './view.ts';
import { DARK, LIGHT, type PlanTheme, type StrokeOp } from './types.ts';
import type { Viewport } from '../viewport.ts';

const VIEW: Viewport = { cx: 8, cy: 6, zoom: 100, width: 800, height: 600 };
const P = (x: number, y: number): Vec2 => ({ x, y });

/*
 * Cena de planta (decisão 0013): quatro paredes de 2,80 m, de x = 0 a 3, em y = 0, 2, 4 e 6, cada uma com uma abertura
 * no meio (centro em x = 1,5): janela com peitoril 0,90 (altura 1,20), janela com peitoril 1,50, janela com peitoril
 * 2,40 e porta. Mais paredes baixas e altas (y = 8 a 14) e um telhado, uma laje e um piso fora da faixa de x de paredes.
 */
function scene(range: Partial<ViewRange> = {}): Project {
  const s = new ProjectStore(projetoComCoberturaDeTeste());
  const wall = (id: string, y: number, extra: Partial<Parameters<typeof makeWall>[0]> = {}) =>
    makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, y), b: P(3, y), height: 2.8, ...extra });
  const opening = (id: string, hostId: string, typeId: string, kind: 'door' | 'window', extra: Partial<Opening> = {}): Opening => ({
    id,
    kind,
    typeId,
    hostId,
    offset: 1.5,
    flipHand: false,
    flipFacing: false,
    sillOverride: null,
    mark: '',
    ...extra,
  });
  s.exec({ type: 'addWall', wall: wall('w_09', 0) });
  s.exec({ type: 'addOpening', opening: opening('j_09', 'w_09', 'ot_j120', 'window', { sillOverride: 0.9 }) });
  s.exec({ type: 'addWall', wall: wall('w_150', 2) });
  s.exec({ type: 'addOpening', opening: opening('j_150', 'w_150', 'ot_j120', 'window', { sillOverride: 1.5 }) });
  s.exec({ type: 'addWall', wall: wall('w_240', 4) });
  s.exec({ type: 'addOpening', opening: opening('j_240', 'w_240', 'ot_j120', 'window', { sillOverride: 2.4 }) });
  s.exec({ type: 'addWall', wall: wall('w_porta', 6) });
  s.exec({ type: 'addOpening', opening: opening('porta', 'w_porta', 'ot_p80', 'door') });
  // Parede baixa (topo a 0,90): projeção abaixo do corte.
  s.exec({ type: 'addWall', wall: wall('w_baixa', 8, { height: 0.9 }) });
  // Parede que começa a 1,50 (acima do corte, abaixo do topo): projeção tracejada.
  s.exec({ type: 'addWall', wall: wall('w_alta', 10, { baseOffset: 1.5, height: 1 }) });
  // Parede que começa a 2,50 (acima do topo): oculta.
  s.exec({ type: 'addWall', wall: wall('w_oculta', 12, { baseOffset: 2.5, height: 1 }) });
  // Verga abaixo do corte: janela de peitoril 0,10 e altura 0,60 (topo a 0,70).
  s.exec({ type: 'addWall', wall: wall('w_verga', 14) });
  s.exec({ type: 'addOpening', opening: opening('j_verga', 'w_verga', 'ot_j60', 'window', { sillOverride: 0.1 }) });
  // Telhado com beiral em 2,80 (acima do topo padrão), sobre x de 10 a 14.
  s.exec({
    type: 'addRoof',
    roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [P(10, 0), P(14, 0), P(14, 4), P(10, 4)], heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: P(1, 0) }),
  });
  // Laje com face superior em 2,80 (oculta) e laje rente ao piso (visível); piso abaixo da base (nunca some).
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'l_alta', typeId: 'ls_mac15', levelId: 'lv_0', boundary: [P(16, 0), P(19, 0), P(19, 3), P(16, 3)], heightOffset: 2.8 }) });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'l_rente', typeId: 'ls_mac15', levelId: 'lv_0', boundary: [P(16, 4), P(19, 4), P(19, 6), P(16, 6)] }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f_abaixo', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [P(16, 8), P(19, 8), P(19, 10), P(16, 10)], heightOffset: -1 }) });
  if (Object.keys(range).length) s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: range });
  return s.project;
}

function draw(p: Project, over: Partial<PlanInput> = {}) {
  const input: PlanInput = {
    project: p,
    levelId: 'lv_0',
    viewId: floorViewId('lv_0'),
    resolved: resolveLevel(p, 'lv_0', new Map()),
    below: null,
    viewport: VIEW,
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    ...over,
  };
  return buildPlanDrawList(input);
}
type DrawList = ReturnType<typeof draw>;

/** Há preenchimento de parede (ou de qualquer outro elemento) cobrindo o ponto? */
const filled = (dl: DrawList, x: number, y: number): boolean => dl.fills.some((f) => pointInMulti({ x, y }, f.polygons));
/** Só o preenchimento leve da projeção da cobertura cobre o ponto: translúcido e sem hachura (nunca o telhado opaco do corte). */
const soProjecaoLeve = (dl: DrawList, x: number, y: number): boolean => {
  const fs = dl.fills.filter((f) => pointInMulti({ x, y }, f.polygons));
  return fs.length > 0 && fs.every((f) => f.alpha <= 0.35 && !f.hatch);
};

/** Traços abertos de um símbolo de abertura: todos dentro de 0,7 m do centro (anéis fechados são outra coisa). */
const symbolAt = (dl: DrawList, x: number, y: number): StrokeOp[] => dl.strokes.filter((s) => !s.closed && s.pts.every((q) => Math.hypot(q.x - x, q.y - y) <= 0.7));

/** Anéis fechados de uma parede só de contorno (todos os vértices a menos de 0,5 m da linha y). */
const ringAt = (dl: DrawList, y: number): StrokeOp[] => dl.strokes.filter((s) => s.closed && s.pts.every((q) => Math.abs(q.y - y) < 0.5));

const solid = (ops: StrokeOp[]): StrokeOp[] => ops.filter((s) => !s.dash);
const dashed = (ops: StrokeOp[]): StrokeOp[] => ops.filter((s) => s.dash);

describe('corte da vista na planta: parede e abertura (decisão 0013 §4)', () => {
  it('corte 1,20 m (padrão): a janela de peitoril 0,90 fura a parede e o símbolo é cheio', () => {
    const dl = draw(scene());
    expect(filled(dl, 1.5, 0)).toBe(false);
    expect(solid(symbolAt(dl, 1.5, 0)).length).toBeGreaterThan(0);
    expect(dashed(symbolAt(dl, 1.5, 0))).toHaveLength(0);
  });

  it('corte 1,20 m: a janela de peitoril 1,50 não fura; a parede fica inteira e o símbolo é tracejado', () => {
    const dl = draw(scene());
    expect(filled(dl, 1.5, 2)).toBe(true);
    const sym = symbolAt(dl, 1.5, 2);
    expect(sym.length).toBeGreaterThan(0);
    expect(solid(sym)).toHaveLength(0);
  });

  it('corte 1,20 m: a janela de peitoril 2,40 está acima do topo, então a parede fica inteira e nada da janela aparece', () => {
    const dl = draw(scene());
    expect(filled(dl, 1.5, 4)).toBe(true);
    expect(symbolAt(dl, 1.5, 4)).toHaveLength(0);
  });

  it('corte 1,20 m: a porta fura a parede e o símbolo é cheio', () => {
    const dl = draw(scene());
    expect(filled(dl, 1.5, 6)).toBe(false);
    expect(dashed(symbolAt(dl, 1.5, 6))).toHaveLength(0);
  });

  it('corte 0,50 m: a janela de peitoril 0,90 passa a ficar acima do corte (parede inteira, símbolo tracejado) e a porta fura', () => {
    const dl = draw(scene({ cut: 0.5 }));
    expect(filled(dl, 1.5, 0)).toBe(true);
    expect(solid(symbolAt(dl, 1.5, 0))).toHaveLength(0);
    expect(symbolAt(dl, 1.5, 0).length).toBeGreaterThan(0);
    expect(filled(dl, 1.5, 2)).toBe(true);
    expect(solid(symbolAt(dl, 1.5, 2))).toHaveLength(0);
    expect(filled(dl, 1.5, 4)).toBe(true);
    expect(symbolAt(dl, 1.5, 4)).toHaveLength(0);
    expect(filled(dl, 1.5, 6)).toBe(false);
  });

  it('corte 1,60 m: as janelas de peitoril 0,90 e 1,50 cruzam o corte e furam; a de 2,40 segue oculta', () => {
    const dl = draw(scene({ cut: 1.6 }));
    expect(filled(dl, 1.5, 0)).toBe(false);
    expect(solid(symbolAt(dl, 1.5, 0)).length).toBeGreaterThan(0);
    expect(filled(dl, 1.5, 2)).toBe(false);
    expect(solid(symbolAt(dl, 1.5, 2)).length).toBeGreaterThan(0);
    expect(filled(dl, 1.5, 4)).toBe(true);
    expect(symbolAt(dl, 1.5, 4)).toHaveLength(0);
    expect(filled(dl, 1.5, 6)).toBe(false);
  });

  it('verga abaixo do corte: a janela de 0,10 a 0,70 não fura; o símbolo sai leve (cor secundária)', () => {
    const dl = draw(scene());
    expect(filled(dl, 1.5, 14)).toBe(true);
    const sym = symbolAt(dl, 1.5, 14);
    expect(sym.length).toBeGreaterThan(0);
    expect(sym.every((s) => s.color === LIGHT.inkSoft)).toBe(true);
  });
});

describe('paredes fora do corte: contorno, sem preenchimento (decisão 0013 §4)', () => {
  it('parede abaixo do corte (topo a 0,90): contorno fino claro, sem hachura nem preenchimento', () => {
    const dl = draw(scene());
    expect(filled(dl, 1.5, 8)).toBe(false);
    const ring = ringAt(dl, 8);
    expect(ring).toHaveLength(1);
    expect(ring[0]!.color).toBe(LIGHT.inkSoft);
    expect(ring[0]!.widthPx).toBe(defaultPaint('wall', 100).projPx);
    expect(ring[0]!.dash).toBeUndefined();
  });

  it('parede acima do corte e abaixo do topo (começa a 1,50): contorno tracejado fino', () => {
    const dl = draw(scene());
    expect(filled(dl, 1.5, 10)).toBe(false);
    const ring = ringAt(dl, 10);
    expect(ring).toHaveLength(1);
    expect(ring[0]!.dash).toEqual([6, 3]);
    expect(ring[0]!.widthPx).toBe(defaultPaint('wall', 100).projPx);
  });

  it('parede acima do topo (começa a 2,50): oculta, nem contorno nem preenchimento', () => {
    const dl = draw(scene());
    expect(filled(dl, 1.5, 12)).toBe(false);
    expect(ringAt(dl, 12)).toHaveLength(0);
  });

  it('"além" (abaixo da base, dentro da profundidade): contorno na cor clara de fundo', () => {
    // Parede de altura 1 começando a -2 m: fica abaixo da base (0 m) e acima da profundidade (-3 m).
    const s = new ProjectStore(scene({ depth: -3 }));
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w_alem', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 16), b: P(3, 16), height: 1, baseOffset: -2 }) });
    const dl = draw(s.project);
    const ring = ringAt(dl, 16);
    expect(ring).toHaveLength(1);
    expect(ring[0]!.color).toBe(LIGHT.underlay);
    expect(filled(dl, 1.5, 16)).toBe(false);
  });
});

describe('telhado, laje e piso no intervalo de vista', () => {
  it('telhado com beiral acima do topo: sai da planta (sem corte); a projeção tracejada e o preenchimento leve da cobertura ficam', () => {
    const p = scene();
    const dl = draw(p);
    expect(soProjecaoLeve(dl, 12, 2)).toBe(true);
    const proj = dl.strokes.filter((s) => s.closed && s.dash && s.pts.every((q) => q.x > 9.9 && q.x < 14.1 && q.y > -0.1 && q.y < 4.1));
    expect(proj.length).toBeGreaterThan(0);
  });

  it('projeção da cobertura desligada: o telhado oculto não deixa nenhum traço', () => {
    const dl = draw(scene(), { showRoofProjection: false });
    expect(filled(dl, 12, 2)).toBe(false);
    expect(dl.strokes.some((s) => s.closed && s.dash && s.pts.every((q) => q.x > 9.9 && q.x < 14.1))).toBe(false);
  });

  it('com o topo subido o telhado entra na vista e é preenchido', () => {
    const dl = draw(scene({ top: 3.5 }));
    expect(filled(dl, 12, 2)).toBe(true);
  });

  it('laje com face superior acima do topo (2,80) não aparece; laje rente ao piso aparece', () => {
    const dl = draw(scene());
    expect(filled(dl, 17.5, 1.5)).toBe(false);
    expect(filled(dl, 17.5, 5)).toBe(true);
  });

  it('piso com face abaixo da base continua visível (piso nunca some por estar abaixo)', () => {
    const dl = draw(scene());
    expect(filled(dl, 17.5, 9)).toBe(true);
  });

  it('planta de cobertura: o mesmo desenho com qualquer intervalo de vista (roofPlanMode não muda)', () => {
    const roofPlan = { viewId: roofViewId('lv_0') };
    const a = draw(scene(), roofPlan);
    const b = draw(scene({ top: 3.5, cut: 0.5 }), roofPlan);
    expect(b).toEqual(a);
    expect(filled(a, 12, 2)).toBe(true);
  });
});

describe('escada na vista (decisão 0013 §4): cota de corte e topo da vista', () => {
  const N = 10;
  const H = 0.175;
  const ZOOM = 100;
  const VZ: Viewport = { cx: 0.5, cy: 1.5, zoom: ZOOM, width: 800, height: 600 };
  const PROJECT = projetoComCoberturaDeTeste();
  const stair = () => straightStair({ risers: N, tread: 0.28, riserH: H, width: 1 });
  const ops = (view?: { cutZ: number; topZ: number }) => stairFills(PROJECT, [stair()], LIGHT, false, 'medium', VZ, view);
  const risers = (o: ReturnType<typeof ops>) => o.strokes.filter((s) => !s.closed && s.pts.length === 2 && !s.dash && s.widthPx === RISER_PX);
  const treads = (o: ReturnType<typeof ops>) => o.strokes.filter((s) => s.closed);

  it('corte baixo (0,50 m) e topo (1,00 m): a escada sai inteira (o topo da vista não corta o lance); acima do corte, tracejados', () => {
    const o = ops({ cutZ: 0.5, topZ: 1.0 });
    // Degraus com topo em k·H: k = 1..9 saem todos, mesmo os de 1,05 a 1,575 m acima do topo da vista.
    expect(treads(o)).toHaveLength(N);
    // Acima do corte (0,50 m): k = 3..10 (o 10 é a chegada) tracejados; k = 1 e 2 contínuos.
    expect(dashed(treads(o))).toHaveLength(8);
    expect(solid(treads(o))).toHaveLength(2);
    // Todos os espelhos (k = 1..10).
    expect(risers(o)).toHaveLength(N);
    // O plano de corte (0,50 m) cruza a escada: símbolo de corte presente.
    expect(o.strokes.some((s) => !s.closed && s.pts.length === 9)).toBe(true);
  });

  it('corte alto (3,00 m, acima de toda a escada): sem símbolo de corte e todos os degraus contínuos', () => {
    const o = ops({ cutZ: 3.0, topZ: 3.5 });
    expect(treads(o)).toHaveLength(N);
    expect(dashed(treads(o))).toHaveLength(0);
    expect(o.strokes.some((s) => !s.closed && s.pts.length === 9)).toBe(false);
  });

  it('sem vista: a cota de corte é 1,20 m acima da base (como antes), e não há topo', () => {
    const o = ops();
    expect(risers(o)).toHaveLength(N);
    expect(dashed(treads(o))).toHaveLength(4);
  });

  it('laje no nível de topo cobrindo o último espelho: a chegada não é degrau e não entra na planta', () => {
    const s = new ProjectStore(projetoComCoberturaDeTeste());
    s.exec({ type: 'addSlab', slab: makeSlab({ id: 'laje', typeId: 'ls_mac15', levelId: 'lv_1', boundary: [P(-1, -1), P(2, -1), P(2, 5), P(-1, 5)] }) });
    const o = stairFills(s.project, [stair()], LIGHT, false, 'medium', VZ, { cutZ: 0.5, topZ: 1.0 });
    // Só os N−1 degraus da escada (a chegada é o piso do nível): k = 3..9 acima do corte, k = 1 e 2 abaixo.
    expect(treads(o)).toHaveLength(N - 1);
    expect(dashed(treads(o))).toHaveLength(N - 3);
    expect(solid(treads(o))).toHaveLength(2);
    expect(risers(o)).toHaveLength(N);
  });
});

describe('seleção de elemento oculto: contorno fantasma (decisão 0013 §4)', () => {
  /** Planta como a tela a monta: a lista de desenho mais o contorno fantasma dos selecionados fora do intervalo. */
  const drawSel = (p: Project, sel: Id[], theme: PlanTheme = LIGHT) => {
    const dl = draw(p, { selection: sel, theme });
    return { ...dl, strokes: [...dl.strokes, ...hiddenSelectionOps(p, 'lv_0', resolvedPlanViewOf(p, 'lv_0'), sel, theme)] };
  };
  /** Traços do fantasma: tracejado de 5 px na cor de seleção (o destaque comum não é tracejado). */
  const ghosts = (dl: DrawList): StrokeOp[] => dl.strokes.filter((s) => s.closed && s.dash?.[0] === 5);
  const near = (ops: StrokeOp[], x: number, y: number, r: number): StrokeOp[] => ops.filter((s) => s.pts.every((q) => Math.hypot(q.x - x, q.y - y) <= r));
  const xs = (s: StrokeOp): number[] => s.pts.map((q) => q.x);

  /** Lance reto de 10 espelhos subindo em +x, como em stairsBuild.test.ts. */
  const run = () => {
    const ln = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });
    const N = 10;
    const P = 0.28;
    return {
      id: 'r1',
      kind: 'run' as const,
      boundaryLeft: [ln(0, 0.5, (N + 1) * P, 0.5)],
      boundaryRight: [ln(0, -0.5, (N + 1) * P, -0.5)],
      risers: Array.from({ length: N }, (_, i) => ln((i + 1) * P, -1, (i + 1) * P, 1)),
      path: [],
      generatedBy: 'straight' as const,
    };
  };

  it('parede oculta selecionada: contorno tracejado fino na cor de seleção, sem preenchimento', () => {
    const dl = drawSel(scene(), ['w_oculta']);
    const g = near(ghosts(dl), 1.5, 12, 2);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ closed: true, widthPx: 1, color: LIGHT.select, dash: [5, 3] });
    expect(filled(dl, 1.5, 12)).toBe(false);
  });

  it('sem seleção não há fantasma; a planta fica igual à de antes', () => {
    const p = scene();
    expect(ghosts(draw(p))).toHaveLength(0);
    expect(ghosts(drawSel(p, []))).toHaveLength(0);
  });

  it('abertura oculta (peitoril 2,40): o vão aparece tracejado sobre a parede; a parede segue inteira', () => {
    const dl = drawSel(scene(), ['j_240']);
    const g = near(ghosts(dl), 1.5, 4, 0.7);
    expect(g).toHaveLength(1);
    const w = Math.max(...xs(g[0]!)) - Math.min(...xs(g[0]!));
    expect(w).toBeGreaterThan(1);
    expect(w).toBeLessThan(1.4);
    expect(filled(dl, 1.5, 4)).toBe(true);
  });

  it('telhado oculto selecionado: pegada tracejada, só com o preenchimento leve da projeção sobre o telhado', () => {
    const dl = drawSel(scene(), ['r']);
    const g = near(ghosts(dl), 12, 2, 3);
    expect(g).toHaveLength(1);
    expect(soProjecaoLeve(dl, 12, 2)).toBe(true);
  });

  it('laje oculta selecionada: contorno tracejado da laje', () => {
    const dl = drawSel(scene(), ['l_alta']);
    expect(near(ghosts(dl), 17.5, 1.5, 2.5)).toHaveLength(1);
    expect(filled(dl, 17.5, 1.5)).toBe(false);
  });

  it('piso oculto (face superior a 3,00 m, acima do topo): contorno tracejado', () => {
    const s = new ProjectStore(scene());
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f_alta', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [P(16, 12), P(19, 12), P(19, 14), P(16, 14)], heightOffset: 3 }) });
    const dl = drawSel(s.project, ['f_alta']);
    expect(near(ghosts(dl), 17.5, 13, 2)).toHaveLength(1);
    expect(filled(dl, 17.5, 13)).toBe(false);
  });

  it('escada oculta (base a 2,50 m): pegada tracejada, sem preenchimento', () => {
    const s = new ProjectStore(projetoComCoberturaDeTeste());
    s.exec({ type: 'addStair', stair: makeStair({ id: 'st_alta', typeId: defaultStairTypeId, levelId: 'lv_0', baseOffset: 2.5, components: [run()] }) });
    const dl = drawSel(s.project, ['st_alta']);
    const g = ghosts(dl);
    expect(g.length).toBeGreaterThan(0);
    expect(g.every((st) => st.pts.every((q) => q.x >= -0.01 && q.x <= 3.2))).toBe(true);
  });

  it('visível ou de outro nível não ganha fantasma: a seleção comum continua como era', () => {
    const dl = drawSel(scene(), ['w_09', 'porta']);
    expect(ghosts(dl)).toHaveLength(0);
    expect(dl.fills.some((f) => f.color === LIGHT.select && f.alpha === 0.26)).toBe(true);
  });

  it('seleção mista: só o oculto ganha fantasma; o visível segue com o destaque próprio', () => {
    const dl = drawSel(scene(), ['w_oculta', 'w_09']);
    expect(ghosts(dl)).toHaveLength(1);
    expect(near(ghosts(dl), 1.5, 12, 2)).toHaveLength(1);
  });

  it('"Selecionar" do aviso: cada elemento oculto da vista ganha o seu contorno', () => {
    const p = scene();
    const hiddenIds = viewRangeWarnings(p, 'lv_0', planViewRangeOf(p, floorViewId('lv_0'))).filter((w) => w.kind === 'hidden').flatMap((w) => w.ids);
    expect(hiddenIds.sort()).toEqual(['j_240', 'l_alta', 'r', 'w_oculta']);
    expect(hiddenSelectionOps(p, 'lv_0', resolvedPlanViewOf(p, 'lv_0'), hiddenIds, LIGHT)).toHaveLength(hiddenIds.length);
  });

  it('tema escuro: o fantasma usa a cor de seleção do tema escuro', () => {
    const dl = drawSel(scene(), ['w_oculta'], DARK);
    expect(ghosts(dl).some((s) => s.color === DARK.select)).toBe(true);
  });

  it('redesenho com o mesmo projeto, vista e seleção: o contorno fantasma não é refeito (memo por vista)', () => {
    const p = scene();
    const view = resolvedPlanViewOf(p, 'lv_0');
    const first = hiddenSelectionOps(p, 'lv_0', view, ['w_oculta'], LIGHT);
    expect(hiddenSelectionOps(p, 'lv_0', view, ['w_oculta'], LIGHT)).toBe(first);
    // outra seleção ou outra cor é outro resultado; e uma edição (outro projeto, outra vista) não reaproveita
    expect(hiddenSelectionOps(p, 'lv_0', view, ['w_oculta', 'j_240'], LIGHT)).not.toBe(first);
    expect(hiddenSelectionOps(p, 'lv_0', view, ['w_oculta'], DARK)).not.toEqual(first);
    const edited = scene();
    expect(hiddenSelectionOps(edited, 'lv_0', resolvedPlanViewOf(edited, 'lv_0'), ['w_oculta'], LIGHT)).not.toBe(first);
  });
});
