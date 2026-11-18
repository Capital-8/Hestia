import { describe, expect, it } from 'vitest';
import { resolverZoom } from './zoomOps.ts';
import { multiArea, pointInPolygon, type Vec2 } from '@hestia/geom';
import { resolveLevel, resolveSlabs } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeSlab, type DetailLevel, type Project, type Slab } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { mix } from './color.ts';
import { slabFills, slabSelectionOps, structuralLayer } from './slabs.ts';
import { defaultPaint } from './style.ts';
import { DARK, LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

const RECT: Vec2[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
const HOLE: Vec2[] = [{ x: 2, y: 1.5 }, { x: 4, y: 1.5 }, { x: 4, y: 2.5 }, { x: 2, y: 2.5 }];
const CONCRETE = '#8f9296';
const VIEW = (zoom: number): Viewport => ({ cx: 3, cy: 2, zoom, width: 800, height: 600 });

function slabProject(extra: Partial<Slab> = {}, settings: Partial<Project['settings']> = {}, typeId = 'ls_mac15'): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 's', typeId, levelId: 'lv_0', boundary: RECT, ...extra }) });
  if (Object.keys(settings).length) s.exec({ type: 'setSettings', patch: settings });
  return s.project;
}

const slabOps = (p: Project, detail: DetailLevel = 'medium', zoom = 100, dark = false) =>
  resolverZoom(slabFills(p, 'lv_0', dark ? DARK : LIGHT, dark, detail, VIEW(zoom)), zoom);

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

describe('laje na planta (D1)', () => {
  it('cor da camada estrutural misturada com o papel a 0,6 (um tom mais escura que a do piso)', () => {
    const fill = slabOps(slabProject()).fills[0]!;
    expect(fill.color).toBe(mix(CONCRETE, '#ffffff', 0.6));
    expect(fill.color).not.toBe(mix(CONCRETE, '#ffffff', 0.74));
  });

  it('escuro: mistura com o fundo a 0,38', () => {
    const fill = slabOps(slabProject(), 'medium', 100, true).fills[0]!;
    expect(fill.color).toBe(mix(CONCRETE, DARK.bg, 0.38));
  });

  it('a camada estrutural manda na cor, mesmo quando não é a de topo (cobertura: argamassa em cima)', () => {
    const p = slabProject({}, {}, 'ls_cobertura');
    const [s] = resolveSlabs(p, 'lv_0');
    expect(structuralLayer(p, s!)?.materialId).toBe('mat_concreto');
    expect(slabOps(p).fills[0]!.color).toBe(mix(CONCRETE, '#ffffff', 0.6));
  });

  it('hachura do material estrutural só com zoom a partir de 40 px/m (médio); no fino, sempre; no grosseiro, nunca', () => {
    expect(slabOps(slabProject(), 'medium', 10).fills[0]!.hatch).toBeUndefined();
    expect(slabOps(slabProject(), 'medium', 100).fills[0]!.hatch?.kind).toBe('cross');
    expect(slabOps(slabProject(), 'fine', 10).fills[0]!.hatch?.kind).toBe('cross');
    expect(slabOps(slabProject(), 'coarse', 100).fills[0]!.hatch).toBeUndefined();
  });

  it('grosseiro: só o preenchimento chapado, sem contorno nem seta', () => {
    const ops = slabOps(slabProject({ holes: [HOLE], slope: { origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, percent: 5 } }), 'coarse');
    expect(ops.fills).toHaveLength(1);
    expect(ops.strokes).toHaveLength(0);
    expect(ops.labels).toHaveLength(0);
  });

  it('contorno como faixa preenchida, com o furo também contornado; o único traço é o X do furo', () => {
    const ops = slabOps(slabProject({ holes: [HOLE] }));
    expect(ops.strokes).toHaveLength(2);
    expect(ops.fills).toHaveLength(2);
    const band = ops.fills[1]!.polygons;
    expect(band.length).toBeGreaterThan(0);
    expect(multiArea(band)).toBeLessThan(multiArea(ops.fills[0]!.polygons) * 0.1);
  });

  it('etiqueta com código e área só com etiquetas ligadas, descontando o furo', () => {
    expect(slabOps(slabProject()).labels).toHaveLength(0);
    const on = slabOps(slabProject({ holes: [HOLE] }, { showTags: true }));
    expect(on.labels.map((l) => l.text)).toEqual(['LJ-15 · 22,0 m²']);
    // o centroide (3, 2) cai no furo: a etiqueta vai para o trecho livre, dentro da laje
    expect(pointInPolygon(on.labels[0]!.at, resolveSlabs(slabProject({ holes: [HOLE] }), 'lv_0')[0]!.polygon[0]!)).toBe(true);
    const plain = slabOps(slabProject({}, { showTags: true }));
    expect(plain.labels.map((l) => l.text)).toEqual(['LJ-15 · 24,0 m²']);
  });

  it('laje inclinada: seta de caimento na direção da inclinação, no centro, e o percentual', () => {
    const p = slabProject({ slope: { origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, percent: 5 } });
    const ops = slabOps(p);
    const arrow = ops.strokes.filter((st) => st.widthPx === defaultPaint('slab', 100).cutPx);
    expect(arrow).toHaveLength(2);
    // haste: de x = 3 - 0,4 a x = 3 + 0,4 (40 px a 100 px/m), no centro (3, 2); a ponta aponta para +x
    const shaft = arrow[0]!.pts;
    expect(shaft[0]!.x).toBeCloseTo(2.6, 9);
    expect(shaft[1]!.x).toBeCloseTo(3.4, 9);
    expect(shaft[1]!.y).toBeCloseTo(2, 9);
    expect(ops.labels).toEqual([expect.objectContaining({ text: '5,0%' })]);
  });

  it('sem inclinação não há seta nem percentual', () => {
    const ops = slabOps(slabProject());
    expect(ops.strokes).toHaveLength(0);
    expect(ops.labels).toHaveLength(0);
  });

  it('a laje entra antes do piso e das paredes na lista completa', () => {
    const p = slabProject();
    const s = new ProjectStore(p);
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 3 }, { x: 1, y: 3 }] }) });
    const dl = buildPlanDrawList(input(s.project));
    expect(dl.fills[0]!.polygons).toEqual(resolveSlabs(p, 'lv_0')[0]!.polygon);
    expect(dl.fills[0]!.color).toBe(mix(CONCRETE, '#ffffff', 0.6));
    const floorIdx = dl.fills.findIndex((f) => f.color === mix('#e9e4da', '#ffffff', 0.74));
    expect(floorIdx).toBeGreaterThan(0);
  });
});

describe('seleção e hover de laje (D1)', () => {
  it('selecionada: azul translúcido, contorno de 2 px, quadradinhos nos vértices e área no centroide', () => {
    const p = slabProject({ holes: [HOLE] });
    const ops = slabSelectionOps(p, 'lv_0', ['s'], null, LIGHT, VIEW(100));
    expect(ops.fills[0]).toMatchObject({ color: LIGHT.select, alpha: 0.26 });
    expect(ops.strokes.filter((st) => st.widthPx === 2)).toHaveLength(2);
    expect(ops.fills.filter((f) => f.color === '#ffffff')).toHaveLength(8);
    expect(ops.labels).toEqual([expect.objectContaining({ text: '22,00 m²', tone: 'info' })]);
  });

  it('hover: só o azul translúcido, sem contorno nem área', () => {
    const ops = slabSelectionOps(slabProject(), 'lv_0', [], 's', LIGHT, VIEW(100));
    expect(ops.fills).toEqual([expect.objectContaining({ color: LIGHT.select, alpha: 0.16 })]);
    expect(ops.strokes).toHaveLength(0);
    expect(ops.labels).toHaveLength(0);
  });

  it('com etiquetas ligadas, a área do selecionado não se repete', () => {
    const ops = slabSelectionOps(slabProject({}, { showTags: true }), 'lv_0', ['s'], null, LIGHT, VIEW(100));
    expect(ops.labels).toHaveLength(0);
  });
});

describe('subpavimento com lajes (D1/D4)', () => {
  it('sem belowSlabs, nada da laje de baixo aparece além das paredes', () => {
    const p = slabProject();
    const dl = buildPlanDrawList(input(p, { below: resolveLevel(p, 'lv_0', new Map()) }));
    expect(dl.fills.some((f) => f.color === LIGHT.underlay && f.alpha === 0.22)).toBe(false);
  });

  it('com belowSlabs, as lajes do nível abaixo aparecem apagadas', () => {
    const p = slabProject();
    const below = resolveSlabs(p, 'lv_0');
    const dl = buildPlanDrawList(input(p, { below: resolveLevel(p, 'lv_0', new Map()), belowSlabs: below }));
    const i = dl.fills.findIndex((f) => f.color === LIGHT.underlay && f.alpha === 0.22);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(dl.fills[i]!.polygons).toEqual(below[0]!.polygon);
  });
});

describe('membrana de laje na planta (decisão 0023 §5)', () => {
  it('ls_cobertura: a membrana vira um contorno tracejado; sem membrana, nenhum traço tracejado', () => {
    const dashed = (ops: { strokes: Array<{ dash?: [number, number] }> }) => ops.strokes.filter((s) => s.dash);
    const withMembrane = dashed(slabOps(slabProject({}, {}, 'ls_cobertura')));
    expect(withMembrane).toHaveLength(1);
    expect(withMembrane[0]!.dash).toEqual([6, 3]);
    expect(dashed(slabOps(slabProject()))).toHaveLength(0);
  });

  it('a cor da laje vem da camada estrutural, nunca da membrana', () => {
    const p = slabProject({}, {}, 'ls_cobertura');
    const [s] = resolveSlabs(p, 'lv_0');
    expect(structuralLayer(p, s!)!.membrane).toBe(false);
  });
});
