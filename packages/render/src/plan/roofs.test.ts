import { describe, expect, it } from 'vitest';
import { resolverZoom } from './zoomOps.ts';
import { multiArea, type Vec2 } from '@hestia/geom';
import { resolveLevel, resolveRoofs, type ResolvedRoof, type ResolvedRoofLayer, type ViewClass } from '@hestia/engine';
import { DEFAULT_VIEW_3D, ProjectStore, createEmptyProject, makeRoof, makeWall, type DetailLevel, type Id, type Project } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { mix } from './color.ts';
import { labelPoint } from './floors.ts';
import { roofFills, roofFootprint, roofOps, roofRealArea, roofSelectionOps, highestRidge } from './roofs.ts';
import { corDaAresta, DEFAULT_SUN_AZIMUTH, direcaoDoSol, TONE_45, tomDaAgua } from './roofsAgua.ts';
import { caixaDoRotulo, caixasSobrepostas } from './roofsRotulos.ts';
import { espessurasDoTelhado } from './roofsTracos.ts';
import { defaultPaint } from './style.ts';
import { DARK, LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

const TILE = '#b5522d';
const LAYERS: ResolvedRoofLayer[] = [
  { layerIndex: 0, materialId: 'mat_telha_ceramica', thickness: 0.015, below: 0 },
  { layerIndex: 1, materialId: 'mat_madeira', thickness: 0.03, below: 0.015 },
  { layerIndex: 2, materialId: 'mat_madeira', thickness: 0.05, below: 0.045 },
];
const VIEW = (zoom: number): Viewport => ({ cx: 4, cy: 3, zoom, width: 800, height: 600 });
const P = (x: number, y: number): Vec2 => ({ x, y });

/** Duas águas 8 × 6 a 30 %, cumeeira em y = 3; linhas: cumeeira, espigões e rincão de teste. */
function gable(extra: Partial<ResolvedRoof> = {}): ResolvedRoof {
  return {
    roofId: 'r',
    typeId: 'rt_ceramica',
    levelId: 'lv_0',
    eaveZ: 2.8,
    joinedArea: 0,
    layers: LAYERS,
    planes: [
      { polygon: [[[P(0, 0), P(8, 0), P(8, 3), P(0, 3)]]], origin: P(0, 0), up: P(0, 1), percent: 30, z0: 2.8 },
      { polygon: [[[P(0, 3), P(8, 3), P(8, 6), P(0, 6)]]], origin: P(0, 6), up: P(0, -1), percent: 30, z0: 2.8 },
    ],
    lines: [
      { kind: 'ridge', a: P(0, 3), b: P(8, 3) },
      { kind: 'hip', a: P(0, 0), b: P(2, 2) },
      { kind: 'valley', a: P(8, 3), b: P(6, 4) },
      { kind: 'eave', a: P(0, 0), b: P(8, 0) },
    ],
    ...extra,
  };
}

const ops = (rs: ResolvedRoof[], detail: DetailLevel = 'medium', zoom = 100, dark = false, p: Project = createEmptyProject()) =>
  resolverZoom(roofOps(rs, p, dark ? DARK : LIGHT, dark, detail, VIEW(zoom)), zoom);

function projectWithRoof(showTags = false): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({
    type: 'addRoof',
    roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [P(-0.3, -0.3), P(8.3, -0.3), P(8.3, 6.3), P(-0.3, 6.3)], heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: P(1, 0) }),
  });
  if (showTags) s.exec({ type: 'setSettings', patch: { showTags: true } });
  return s.project;
}

function input(p: Project, over: Partial<PlanInput> = {}): PlanInput {
  return {
    project: p,
    levelId: 'lv_0',
    resolved: resolveLevel(p, 'lv_0', new Map()),
    below: null,
    viewport: VIEW(100),
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    ...over,
  };
}

describe('telhado na planta (D1)', () => {
  it('cada água: cor da camada de topo misturada com o papel a 0,25 e tom por orientação e inclinação', () => {
    const r = gable();
    const fills = ops([r]).fills.filter((f) => f.alpha === 0.98);
    const base = mix(TILE, '#ffffff', 0.25);
    expect(fills).toHaveLength(2);
    expect(fills[0]!.color).toBe(tomDaAgua(base, P(0, 1), 30));
    expect(fills[1]!.color).toBe(tomDaAgua(base, P(0, -1), 30));
  });

  it('o sol padrão do 3D deixa mais clara a água que desce na direção dele e a oposta mais escura', () => {
    // O azimute padrão (324,46°) vem de sudeste: a água que sobe para noroeste desce para o sol.
    const luz = direcaoDoSol(DEFAULT_SUN_AZIMUTH);
    const base = mix(TILE, '#ffffff', 0.25);
    expect(tomDaAgua(base, P(-luz.x, -luz.y), 100)).toBe(mix(base, '#ffffff', TONE_45));
    expect(tomDaAgua(base, P(luz.x, luz.y), 100)).toBe(mix(base, '#000000', TONE_45));
    expect(tomDaAgua(base, P(0, 1), 30)).not.toBe(tomDaAgua(base, P(0, -1), 30));
  });

  it('o azimute do sol pode vir da vista 3D do projeto (contexto da planta)', () => {
    const r = gable();
    const p = { ...createEmptyProject(), view3d: { ...DEFAULT_VIEW_3D, sunAzimuth: 0 } };
    const base = mix(TILE, '#ffffff', 0.25);
    const fills = ops([r], 'medium', 100, false, p).fills.filter((f) => f.alpha === 0.98);
    expect(fills[0]!.color).toBe(tomDaAgua(base, P(0, 1), 30, 0));
    expect(fills[0]!.color).not.toBe(tomDaAgua(base, P(0, 1), 30));
  });

  it('escuro: mistura com o fundo a 0,2', () => {
    const fills = ops([gable()], 'medium', 100, true).fills.filter((f) => f.alpha === 0.98);
    expect(fills[0]!.color).toBe(tomDaAgua(mix(TILE, DARK.bg, 0.2), P(0, 1), 30));
  });

  it('quase opaco: 0,98 no médio e no fino, para a grade não aparecer através da água', () => {
    expect(ops([gable()], 'medium').fills.every((f) => f.alpha === 0.98 || f.alpha === 1)).toBe(true);
    const coarse = ops([gable()], 'coarse');
    expect(coarse.fills.map((f) => f.alpha)).toEqual([0.98, 0.98]);
  });

  it('hachura do material só com zoom a partir de 40 px/m (médio), discreta mas visível; no grosseiro, nunca', () => {
    // rt_ceramica: telha com hachura diagonal
    expect(ops([gable()], 'medium', 10).fills[0]!.hatch).toBeUndefined();
    // O zoom mínimo vai na hachura (o shader e o `resolverZoom` escondem abaixo dele): a geometria não muda com o zoom.
    const media = roofOps([gable()], createEmptyProject(), LIGHT, false, 'medium', VIEW(10));
    expect(media.fills[0]!.hatch?.zoomMin).toBe(40);
    const fina = roofOps([gable()], createEmptyProject(), LIGHT, false, 'fine', VIEW(10));
    expect(fina.fills[0]!.hatch?.zoomMin).toBeUndefined();
    expect(ops([gable()], 'medium', 100).fills[0]!.hatch?.kind).toBe('diagonal');
    expect(ops([gable()], 'medium', 100).fills[0]!.hatch?.alpha).toBeGreaterThanOrEqual(0.22);
    expect(ops([gable()], 'medium', 100).fills[0]!.hatch?.alpha).toBeLessThanOrEqual(0.3);
    expect(ops([gable()], 'coarse', 100).fills[0]!.hatch).toBeUndefined();
  });

  it('contorno do beiral como faixa preenchida de 1,5 px (não traço)', () => {
    const ops1 = ops([gable()]);
    const band = ops1.fills.find((f) => f.alpha === 1)!;
    expect(band.color).toBe(mix(LIGHT.ink, '#ffffff', 0.35));
    expect(multiArea(band.polygons)).toBeLessThan(multiArea(roofFootprint(gable())) * 0.2);
  });

  it('linhas notáveis: cumeeira, espigão e rincão como arestas finas na cor um pouco mais escura que o preenchimento; rincão tracejado', () => {
    // Linhas do telhado têm alpha 1; as setas de caimento têm 0,9 (ver o teste das setas).
    const PROJ = defaultPaint('roof', 100).projPx;
    const base = mix(TILE, '#ffffff', 0.25);
    const strokes = ops([gable()]).strokes.filter((s) => s.alpha === 1 && !s.closed);
    expect(strokes).toHaveLength(3);
    const ridge = strokes.find((s) => s.pts.length === 2 && s.pts[0]!.y === 3 && s.pts[1]!.y === 3)!;
    expect(ridge.widthPx).toBeCloseTo(PROJ, 9);
    expect(ridge.color).toBe(corDaAresta(base));
    expect(ridge.pts).toEqual([P(0, 3), P(8, 3)]);
    const hip = strokes.find((s) => !s.dash && s.pts[0]!.x === 0 && s.pts[0]!.y === 0)!;
    expect(hip.pts).toEqual([P(0, 0), P(2, 2)]);
    expect(hip.widthPx).toBeCloseTo(PROJ, 9);
    const valley = strokes.find((s) => s.dash)!;
    expect(valley.widthPx).toBe(PROJ);
    expect(valley.dash).toEqual([6, 3]);
    expect(ridge.color).toBe(hip.color);
    expect(hip.color).toBe(valley.color);
  });

  it('seta de caimento por água, da subida para a descida, com o percentual', () => {
    const o = ops([gable()]);
    const arrows = o.strokes.filter((s) => s.alpha === 0.9 && !s.closed);
    expect(arrows).toHaveLength(4);
    // Verde do caimento (não a tinta), na espessura de projeção (1 px na proposta).
    expect(arrows.every((a) => a.color === LIGHT.roofSlope)).toBe(true);
    expect(arrows[0]!.widthPx).toBeCloseTo(defaultPaint('roof', 100).projPx, 9);
    // água de baixo (sobe para +y): a ponta fica para −y, no centroide (4, 1,5)
    const shaft = arrows[0]!.pts;
    expect(shaft[1]!.y).toBeLessThan(1.5);
    expect(shaft[1]!.x).toBeCloseTo(4, 9);
    const labels = o.labels.map((l) => l.text);
    expect(labels).toEqual(['30 %', '30 %']);
  });

  it('percentual com vírgula quando não é inteiro', () => {
    const r = gable({ planes: [{ ...gable().planes[0]!, percent: 27.5 }] });
    expect(ops([r]).labels.map((l) => l.text)).toEqual(['27,5 %']);
  });

  it('coarse: só preenchimento, sem contorno, linhas, setas nem etiqueta de percentual', () => {
    const o = ops([gable()], 'coarse');
    expect(o.strokes).toHaveLength(0);
    expect(o.labels).toHaveLength(0);
    expect(o.fills).toHaveLength(2);
  });

  it('área real: planta × √(1 + i²); com etiquetas, código e área real no centroide', () => {
    const r = gable();
    expect(roofRealArea(r)).toBeCloseTo(48 * Math.sqrt(1.09), 9);
    expect(ops([r]).labels.some((l) => l.text === 'TL-01 · 50,1 m²')).toBe(false);
    const p = projectWithRoof(true);
    const tagged = roofOps([gable()], p, LIGHT, false, 'medium', VIEW(100)).labels.map((l) => l.text);
    expect(tagged).toContain('TL-01 · 50,1 m²');
  });
});

describe('seleção e hover de telhado (D1)', () => {
  it('selecionado: azul translúcido, contorno de 2 px e área real com duas casas decimais', () => {
    const p = projectWithRoof();
    const real = resolveRoofs(p, 'lv_0');
    const ops1 = roofSelectionOps(p, 'lv_0', [real[0]!.roofId], null, LIGHT, VIEW(100));
    expect(ops1.fills[0]).toMatchObject({ color: LIGHT.select, alpha: 0.26 });
    expect(ops1.strokes.some((s) => s.widthPx === 2)).toBe(true);
    // área real e, com o telhado selecionado, o percentual de cada aresta que define inclinação (A11): forma gable, só as 2 beiradas
    expect(ops1.labels.map((l) => l.text)).toEqual([`${(roofRealArea(real[0]!)).toFixed(2).replace('.', ',')} m²`, '30 %', '30 %']);
  });

  it('hover: só o azul translúcido', () => {
    const p = projectWithRoof();
    const o = roofSelectionOps(p, 'lv_0', [], 'r', LIGHT, VIEW(100));
    expect(o.fills).toEqual([expect.objectContaining({ color: LIGHT.select, alpha: 0.16 })]);
    expect(o.strokes).toHaveLength(0);
  });
});

describe('integração com o motor (resolveRoofs real)', () => {
  it('telhado de duas águas real: duas águas, cumeeira e espigões na planta, rótulos de 30 %', () => {
    const p = projectWithRoof();
    const [r] = resolveRoofs(p, 'lv_0');
    expect(r).toBeDefined();
    expect(r!.planes).toHaveLength(2);
    expect(r!.lines.some((l) => l.kind === 'ridge')).toBe(true);
    const fills = roofFills(p, 'lv_0', LIGHT, false, 'medium', VIEW(100));
    expect(fills.labels.map((l) => l.text)).toEqual(['30 %', '30 %']);
  });

  it('a lista completa desenha o telhado depois das paredes e pisos, e o subpavimento apagado vem antes', () => {
    // O beiral está em 2,80 m, acima do topo padrão (2,30 m): com o topo subido, o telhado entra na vista (decisão 0013).
    const s = new ProjectStore(projectWithRoof());
    s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { top: 3.5 } });
    const p = s.project;
    const dl = buildPlanDrawList(input(p, { belowRoofs: [gable()], below: resolveLevel(p, 'lv_0', new Map()) }));
    const roofIdx = dl.fills.findIndex((f) => f.alpha === 0.98);
    const underIdx = dl.fills.findIndex((f) => f.color === LIGHT.underlay && f.alpha === 0.22);
    expect(roofIdx).toBeGreaterThan(-1);
    expect(underIdx).toBeGreaterThan(-1);
    expect(underIdx).toBeLessThan(roofIdx);
  });
});

describe('subpavimento com telhados (D4)', () => {
  it('sem belowRoofs, nenhum telhado de baixo aparece', () => {
    const p = projectWithRoof();
    const dl = buildPlanDrawList(input(p, { below: resolveLevel(p, 'lv_0', new Map()) }));
    expect(dl.fills.some((f) => f.color === LIGHT.underlay && f.alpha === 0.22)).toBe(false);
  });

  it('com belowRoofs, a pegada do telhado de baixo aparece apagada, como as lajes', () => {
    const p = projectWithRoof();
    const below = gable();
    const dl = buildPlanDrawList(input(p, { below: resolveLevel(p, 'lv_0', new Map()), belowRoofs: [below] }));
    const i = dl.fills.findIndex((f) => f.color === LIGHT.underlay && f.alpha === 0.22);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(dl.fills[i]!.polygons).toEqual(roofFootprint(below));
  });
});

/** Telhado por contorno (forma 'edges') com as inclinações por aresta, resolvido pelo motor real. */
function edgesProject(boundary: Vec2[], edgeSlopes: Array<number | null>): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary, heightOffset: 2.8, shape: 'edges', edgeSlopes }) });
  return s.project;
}
const L_BOUNDARY = [P(-0.3, -0.3), P(8.3, -0.3), P(8.3, 3.3), P(4.3, 3.3), P(4.3, 6.3), P(-0.3, 6.3)];
const RECT_BOUNDARY = [P(-0.3, -0.3), P(8.3, -0.3), P(8.3, 6.3), P(-0.3, 6.3)];

describe('aresta de empena e símbolo "define inclinação" (A10/A11)', () => {
  it('empena (kind gable): traço cheio e mais escuro que as arestas internas, sem tracejado', () => {
    const o = ops([gable({ lines: [{ kind: 'gable', a: P(0, 0), b: P(8, 0) }] })]);
    const linha = o.strokes.find((s) => !s.closed && s.pts.length === 2 && s.color === LIGHT.ink)!;
    expect(linha.pts).toEqual([P(0, 0), P(8, 0)]);
    expect(linha.dash).toBeUndefined();
    expect(o.strokes.filter((s) => s.dash && s.color === LIGHT.ink)).toHaveLength(0);
  });

  it('selecionado em L com as 6 arestas definindo inclinação: 6 triângulos cheios na cor de destaque, cada um com "30 %"', () => {
    const p = edgesProject(L_BOUNDARY, [30, 30, 30, 30, 30, 30]);
    const o = roofSelectionOps(p, 'lv_0', ['r'], null, LIGHT, VIEW(100));
    const filled = o.fills.filter((f) => f.color === LIGHT.accent);
    expect(filled).toHaveLength(6);
    for (const f of filled) expect(f.polygons[0]![0]!).toHaveLength(3);
    expect(o.labels.filter((l) => l.text === '30 %')).toHaveLength(6);
  });

  it('aresta sem inclinação (null): triângulo vazado e cinza, sem triângulo cheio; a empena fica tracejada no contorno', () => {
    const p = edgesProject(RECT_BOUNDARY, [30, null, 30, null]);
    const o = roofSelectionOps(p, 'lv_0', ['r'], null, LIGHT, VIEW(100));
    expect(o.fills.filter((f) => f.color === LIGHT.accent)).toHaveLength(2);
    expect(o.strokes.filter((s) => s.closed && s.pts.length === 3 && s.color === LIGHT.inkSoft)).toHaveLength(2);
    expect(o.strokes.some((s) => s.dash && s.color === LIGHT.select)).toBe(true);
  });

  it('o símbolo só aparece com o telhado selecionado', () => {
    const p = edgesProject(L_BOUNDARY, [30, 30, 30, 30, 30, 30]);
    const o = roofSelectionOps(p, 'lv_0', [], null, LIGHT, VIEW(100));
    expect(o.fills.some((f) => f.color === LIGHT.accent)).toBe(false);
    expect(o.labels.some((l) => l.text === '30 %')).toBe(false);
  });
});

describe('cota da cumeeira e planta de cobertura (D6)', () => {
  it('cota absoluta da cumeeira no ponto médio, só com etiquetas ligadas', () => {
    expect(ops([gable()]).labels.some((l) => l.text.startsWith('▲'))).toBe(false);
    const o = roofOps([gable()], projectWithRoof(true), LIGHT, false, 'medium', VIEW(100));
    const rd = o.labels.find((l) => l.text.startsWith('▲'))!;
    expect(rd.text).toBe('▲ +3,70');
    expect(rd.at).toEqual(P(4, 3));
  });

  it('planta de cobertura: água opaca (alpha 1) e cota da cumeeira mesmo sem etiquetas', () => {
    const o = roofOps([gable()], createEmptyProject(), LIGHT, false, 'medium', VIEW(100), { planMode: true });
    expect(o.fills.filter((f) => f.alpha !== 1)).toHaveLength(0);
    expect(o.labels.map((l) => l.text)).toContain('▲ +3,70');
  });

  it('roofPlanMode na lista: telhado opaco, paredes só como contorno fino por cima, sem traços de piso por baixo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'a', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 0), b: P(8, 0) }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'b', typeId: 'wt_alv14', levelId: 'lv_0', a: P(8, 0), b: P(8, 6) }) });
    s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: [P(-0.3, -0.3), P(8.3, -0.3), P(8.3, 6.3), P(-0.3, 6.3)], heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: P(1, 0) }) });
    const p = s.project;
    const dl = buildPlanDrawList(input(p, { roofPlanMode: true }));
    expect(dl.fills.filter((f) => f.alpha < 1)).toHaveLength(0);
    expect(dl.labels.some((l) => /^▲ \+\d,\d\d$/.test(l.text))).toBe(true);
    // paredes: contorno fino de 1 px, e nenhum contorno grosso de parede (2,2 px fechado) sobra
    expect(dl.strokes.some((st) => st.widthPx === defaultPaint('wall', 100).projPx && st.closed && st.color === LIGHT.inkSoft && st.alpha === 0.8)).toBe(true);
    expect(dl.strokes.some((st) => st.widthPx === defaultPaint('wall', 100).cutPx && st.closed)).toBe(false);
  });

  it('roofPlanMode: os telhados de baixo entram opacos, só o preenchimento (sem a faixa apagada)', () => {
    const p = projectWithRoof();
    const below = gable();
    const dl = buildPlanDrawList(input(p, { roofPlanMode: true, below: resolveLevel(p, 'lv_0', new Map()), belowRoofs: [below] }));
    const planeFill = dl.fills.find((f) => JSON.stringify(f.polygons) === JSON.stringify(below.planes[0]!.polygon));
    expect(planeFill?.alpha).toBe(1);
    expect(dl.fills.some((f) => f.color === LIGHT.underlay && f.alpha === 0.22)).toBe(false);
  });
});

/** Contorno com trecho em arco (semicírculo de raio 3 m à direita de (8,3)), amostrado em `n` lados, e as demais arestas. */
function arcBoundary(n: number): Vec2[] {
  const arc = Array.from({ length: n + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    return P(8 + 3 * Math.cos(a), 3 + 3 * Math.sin(a));
  });
  return [P(0, 0), P(8, 0), ...arc.slice(1, -1), P(8, 6), P(0, 6)];
}

describe('beiral e pegada pelo intervalo de vista', () => {
  const FOOT = [P(0, 0), P(4, 0), P(4, 2), P(0, 2)];
  const EAVE = [P(-0.5, -0.5), P(4.5, -0.5), P(4.5, 2.5), P(-0.5, 2.5)];
  function comBalanco(): { p: Project; r: ResolvedRoof } {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: EAVE, footprint: FOOT, edgeOverhangs: [0.5, 0.5, 0.5, 0.5], heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: P(1, 0) }) });
    const p = s.project;
    return { p, r: resolveRoofs(p, 'lv_0')[0]! };
  }
  const base = mix(TILE, '#ffffff', 0.25);
  const aresta = corDaAresta(base);

  it('totalmente acima do corte: beiral tracejado na cor da aresta e nenhuma pegada rosa', () => {
    const { p, r } = comBalanco();
    const o = roofOps([r], p, LIGHT, false, 'medium', VIEW(100), { classes: new Map<Id, ViewClass>([['r', 'projection-above']]) });
    expect(o.strokes.filter((s) => s.color === LIGHT.roofFootprint)).toHaveLength(0);
    const beiral = o.strokes.find((s) => s.closed && s.dash?.join(',') === '6,3')!;
    expect(beiral.color).toBe(aresta);
    expect(o.fills.some((f) => f.contour)).toBe(false);
  });

  it('cortado pelo plano: contorno cheio no peso de corte e nenhum rosa', () => {
    const { p, r } = comBalanco();
    const o = roofOps([r], p, LIGHT, false, 'medium', VIEW(100), { classes: new Map<Id, ViewClass>([['r', 'cut']]) });
    const contorno = o.fills.find((f) => f.contour)!;
    expect(contorno.faixa).toEqual(espessurasDoTelhado(defaultPaint('roof', 100)).beiral);
    expect(o.strokes.filter((s) => s.color === LIGHT.roofFootprint)).toHaveLength(0);
  });

  it('abaixo do corte: contorno contínuo de projeção, sem faixa de corte nem rosa', () => {
    const { p, r } = comBalanco();
    const o = roofOps([r], p, LIGHT, false, 'medium', VIEW(100), { classes: new Map<Id, ViewClass>([['r', 'projection-below']]) });
    expect(o.fills.some((f) => f.contour)).toBe(false);
    expect(o.strokes.some((s) => s.closed && !s.dash && s.color === aresta)).toBe(true);
    expect(o.strokes.some((s) => s.color === LIGHT.roofFootprint)).toBe(false);
  });

  it('acima do corte, no tema escuro, também sem rosa', () => {
    const { p, r } = comBalanco();
    const o = roofOps([r], p, DARK, true, 'medium', VIEW(100), { classes: new Map<Id, ViewClass>([['r', 'projection-above']]) });
    expect(o.strokes.some((s) => s.color === DARK.roofFootprint)).toBe(false);
    expect(o.strokes.some((s) => s.closed && s.dash)).toBe(true);
  });

  it('sem balanço não há pegada rosa; a projeção tracejada do beiral continua', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: EAVE, edgeOverhangs: [0, 0, 0, 0], heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: P(1, 0) }) });
    const p = s.project;
    const o = roofOps(resolveRoofs(p, 'lv_0'), p, LIGHT, false, 'medium', VIEW(100), { classes: new Map<Id, ViewClass>([['r', 'projection-above']]) });
    expect(o.strokes.filter((s) => s.color === LIGHT.roofFootprint)).toHaveLength(0);
    expect(o.strokes.some((s) => s.closed && s.dash && s.color === aresta)).toBe(true);
  });

  it('a planta real usa o plano de corte: nunca há rosa; cortando o telhado, o contorno é de corte', () => {
    const { p } = comBalanco();
    const acima = new ProjectStore(p);
    acima.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { top: 20 } });
    const semRosa = buildPlanDrawList(input(acima.project));
    expect(semRosa.strokes.some((s) => s.color === LIGHT.roofFootprint)).toBe(false);
    expect(semRosa.strokes.some((s) => s.closed && s.dash && s.color === aresta)).toBe(true);

    const cortado = new ProjectStore(p);
    cortado.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { cut: 3.0, top: 20 } });
    const comRosa = buildPlanDrawList(input(cortado.project));
    expect(comRosa.strokes.some((s) => s.color === LIGHT.roofFootprint)).toBe(false);
    expect(comRosa.fills.some((f) => f.contour)).toBe(true);
  });
});

describe('anotações numa só camada, sem sobreposição', () => {
  function quatroAguas(): { p: Project; r: ResolvedRoof } {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: RECT_BOUNDARY, heightOffset: 2.8, shape: 'hip', slopePercent: 30 }) });
    s.exec({ type: 'setSettings', patch: { showTags: true } });
    const p = s.project;
    return { p, r: resolveRoofs(p, 'lv_0')[0]! };
  }

  it('setas, cota e área sem caixas de texto sobrepostas', () => {
    const { p, r } = quatroAguas();
    const o = roofOps([r], p, LIGHT, false, 'medium', VIEW(100));
    expect(o.labels.length).toBeGreaterThanOrEqual(6);
    const caixas = o.labels.map(caixaDoRotulo).filter((c) => c !== null);
    expect(caixas).toHaveLength(o.labels.length);
    for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) expect(caixasSobrepostas(caixas[i]!, caixas[j]!)).toBe(false);
  });

  it('a cota da cumeeira sai deslocada na normal da linha', () => {
    const { p, r } = quatroAguas();
    const o = roofOps([r], p, LIGHT, false, 'medium', VIEW(100));
    const cota = o.labels.find((l) => l.text.startsWith('▲'))!;
    const rd = highestRidge(r)!;
    expect(cota.at).toEqual(rd.at);
    expect(cota.papel!.desvio!.mm).toBeGreaterThanOrEqual(3);
    expect(Math.hypot(cota.papel!.desvio!.ux ?? 0, cota.papel!.desvio!.uy ?? 1)).toBeCloseTo(1, 9);
  });

  it('o rótulo da área fica no centroide da água maior', () => {
    const { p, r } = quatroAguas();
    const o = roofOps([r], p, LIGHT, false, 'medium', VIEW(100));
    const maior = r.planes.reduce((a, pl) => (multiArea(pl.polygon) > multiArea(a.polygon) ? pl : a));
    const area = o.labels.find((l) => l.text.includes('m²'))!;
    expect(area.at).toEqual(labelPoint(maior.polygon));
  });
});

describe('telhado com trecho em arco (pegada amostrada)', () => {
  it('as geratrizes entre facetas do mesmo arco não viram espigão; a cumeeira entre as águas do arco e a divisa com a outra água fica', () => {
    const boundary = arcBoundary(24);
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary, heightOffset: 2.8, shape: 'edges', edgeSlopes: boundary.map(() => 30), edgeOverhangs: boundary.map(() => 0) }) });
    const p = s.project;
    const [r] = resolveRoofs(p, 'lv_0');
    const raw = r!.lines.filter((l) => l.kind === 'hip' || l.kind === 'ridge' || l.kind === 'valley');
    const aresta = corDaAresta(mix(TILE, '#ffffff', 0.25));
    const drawn = ops([r!], 'medium', 100, false, p).strokes.filter((s) => s.alpha === 1 && !s.closed && s.color === aresta);
    // O motor gera uma divisa por faceta do arco; o desenho guarda só as que não são amostragem do arco.
    expect(raw.length).toBeGreaterThan(24);
    expect(drawn.length).toBeLessThan(raw.length / 4);
    // A cumeeira horizontal que separa a água de cima da de baixo (ambas do arco e dos lados retos) segue desenhada.
    expect(drawn.some((s) => s.pts.length === 2 && s.pts[0]!.y === 3 && s.pts[1]!.y === 3)).toBe(true);
  });

  it('o contorno de um arco não gera cumeeira nem espigão para cada lado amostrado (o beiral sai como faixa suave)', () => {
    const boundary = arcBoundary(24);
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r', typeId: 'rt_ceramica', levelId: 'lv_0', boundary, heightOffset: 2.8, shape: 'edges', edgeSlopes: boundary.map(() => 30), edgeOverhangs: boundary.map(() => 0) }) });
    const o = roofFills(s.project, 'lv_0', LIGHT, false, 'medium', VIEW(100));
    const beiral = o.fills.filter((f) => f.contour);
    expect(beiral).toHaveLength(1);
    const aresta = corDaAresta(mix(TILE, '#ffffff', 0.25));
    expect(o.strokes.filter((st) => st.alpha === 1 && !st.closed && st.color === aresta).length).toBeLessThan(12);
  });

  it('selecionado: alças só nos cantos lógicos, não em cada vértice amostrado do arco', () => {
    const boundary = arcBoundary(24);
    expect(boundary.length).toBe(27);
    const p = edgesProject(boundary, boundary.map(() => 30));
    const o = roofSelectionOps(p, 'lv_0', ['r'], null, LIGHT, VIEW(100));
    // Quadradinhos de alça são preenchimentos brancos; o arco tem 23 pontos internos que não os recebem.
    expect(o.fills.filter((f) => f.color === '#ffffff' && f.alpha === 1)).toHaveLength(4);
  });
});
