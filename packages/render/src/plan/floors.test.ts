import { describe, expect, it } from 'vitest';
import { resolverZoom } from './zoomOps.ts';
import { multiArea, pointInPolygon, type Vec2 } from '@hestia/geom';
import { resolveFloors, resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeWall, type DetailLevel, type Project } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { belowFloorOps, floorFills, floorSelectionOps, labelPoint } from './floors.ts';
import { mix } from './color.ts';
import { DARK, LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

const RECT: Vec2[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
const HOLE: Vec2[] = [{ x: 2, y: 1.5 }, { x: 4, y: 1.5 }, { x: 4, y: 2.5 }, { x: 2, y: 2.5 }];
const L_SHAPE: Vec2[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 4 }, { x: 0, y: 4 }];

function floorProject(typeId: string, extra: Partial<{ holes: Vec2[][]; boundary: Vec2[] }> = {}, settings: Partial<Project['settings']> = {}): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId, levelId: 'lv_0', boundary: extra.boundary ?? RECT, holes: extra.holes ?? [] }) });
  if (Object.keys(settings).length) s.exec({ type: 'setSettings', patch: settings });
  return s.project;
}

const VIEW = (zoom: number): Viewport => ({ cx: 3, cy: 2, zoom, width: 800, height: 600 });

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

const floorFill = (p: Project, detail: DetailLevel, zoom = 100) => resolverZoom(floorFills(p, 'lv_0', LIGHT, false, detail, VIEW(zoom)), zoom);

describe('piso na planta (D1)', () => {
  it('é desenhado antes das paredes: o primeiro preenchimento é o do piso', () => {
    const p = floorProject('ft_ceram');
    const s = new ProjectStore(p);
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
    const dl = buildPlanDrawList(input(s.project));
    expect(dl.fills[0]!.polygons).toEqual(resolveFloors(p, 'lv_0')[0]!.polygon);
    expect(dl.fills.length).toBeGreaterThan(1);
  });

  it('cor da camada de topo, misturada com o papel e mais clara que a da parede', () => {
    const p = floorProject('ft_ceram');
    const fill = floorFill(p, 'medium').fills[0]!;
    expect(fill.color).toBe(mix('#e9e4da', '#ffffff', 0.74));
    expect(fill.hatch).toBeUndefined();
    const wallT = mix('#e9e4da', '#ffffff', 0.58);
    expect(fill.color).not.toBe(wallT);
  });

  it('grosseiro: só o preenchimento chapado, sem contorno nem hachura', () => {
    const p = floorProject('ft_madeira', { holes: [HOLE] });
    const coarse = floorFill(p, 'coarse', 100);
    expect(coarse.fills).toHaveLength(1);
    expect(coarse.fills[0]!.hatch).toBeUndefined();
    expect(coarse.strokes).toHaveLength(0);
  });

  it('médio: hachura do material da camada de topo só com zoom a partir de 40 px/m', () => {
    const p = floorProject('ft_madeira');
    expect(floorFill(p, 'medium', 10).fills[0]!.hatch).toBeUndefined();
    expect(floorFill(p, 'medium', 100).fills[0]!.hatch?.kind).toBe('diagonal');
  });

  it('fino: hachura mesmo em zoom baixo', () => {
    const p = floorProject('ft_madeira');
    expect(floorFill(p, 'fine', 10).fills[0]!.hatch?.kind).toBe('diagonal');
  });

  it('contorno como faixa preenchida (fica atrás das paredes), com o furo também contornado', () => {
    const p = floorProject('ft_ceram', { holes: [HOLE] });
    const ops = floorFill(p, 'medium');
    expect(ops.strokes).toHaveLength(2); // só o X do furo (decisão 0024 §3); o contorno não é traço (ver faixa abaixo)
    expect(ops.fills).toHaveLength(2); // preenchimento + faixa do contorno
    const band = ops.fills[1]!.polygons;
    expect(band.length).toBeGreaterThan(0);
    // A faixa é fina: bem menos área que o piso.
    expect(multiArea(band)).toBeLessThan(multiArea(ops.fills[0]!.polygons) * 0.1);
  });

  it('etiqueta com código e área só com etiquetas ligadas, no centroide', () => {
    expect(floorFill(floorProject('ft_ceram'), 'medium').labels).toHaveLength(0);
    const on = floorFills(floorProject('ft_ceram', {}, { showTags: true }), 'lv_0', LIGHT, false, 'medium', VIEW(100)).labels;
    expect(on.map((l) => l.text)).toEqual(['PS-01 · 24,0 m²']);
    expect(on[0]!.at).toEqual({ x: 3, y: 2 });
  });

  it('piso em L: a etiqueta cai dentro do piso', () => {
    const at = labelPoint([[L_SHAPE]])!;
    expect(pointInPolygon(at, [L_SHAPE])).toBe(true);
  });
});

describe('seleção e hover de piso (D1)', () => {
  it('selecionado: azul translúcido, contorno de 2 px, quadradinhos nos vértices e área no centroide', () => {
    const p = floorProject('ft_ceram', { holes: [HOLE] });
    const ops = floorSelectionOps(p, 'lv_0', ['f'], null, LIGHT, VIEW(100));
    expect(ops.fills[0]).toMatchObject({ color: LIGHT.select, alpha: 0.26 });
    expect(ops.strokes.filter((s) => s.widthPx === 2)).toHaveLength(2);
    // 4 vértices do contorno + 4 do furo, cada um com quadradinho (fill branco + contorno)
    expect(ops.fills.filter((f) => f.color === '#ffffff')).toHaveLength(8);
    expect(ops.labels).toEqual([expect.objectContaining({ text: '22,00 m²', tone: 'info' })]);
  });

  it('hover: só o azul translúcido, sem contorno nem área', () => {
    const p = floorProject('ft_ceram');
    const ops = floorSelectionOps(p, 'lv_0', [], 'f', LIGHT, VIEW(100));
    expect(ops.fills).toEqual([expect.objectContaining({ color: LIGHT.select, alpha: 0.16 })]);
    expect(ops.strokes).toHaveLength(0);
    expect(ops.labels).toHaveLength(0);
  });

  it('com etiquetas ligadas, a área do selecionado não se repete (já vai na etiqueta)', () => {
    const p = floorProject('ft_ceram', {}, { showTags: true });
    expect(floorSelectionOps(p, 'lv_0', ['f'], null, LIGHT, VIEW(100)).labels).toHaveLength(0);
  });

  it('a seleção entra na lista completa, depois das paredes', () => {
    const p = floorProject('ft_ceram');
    const dl = buildPlanDrawList(input(p, { selection: ['f'] }));
    const sel = dl.fills.findIndex((f) => f.color === LIGHT.select);
    expect(sel).toBeGreaterThan(0);
    expect(dl.labels.some((l) => l.text === '24,00 m²')).toBe(true);
  });
});

describe('subpavimento com pisos (D4)', () => {
  it('sem belowFloors nada aparece do pavimento de baixo além das paredes', () => {
    const p = floorProject('ft_ceram');
    const below = resolveLevel(p, 'lv_0', new Map());
    const dl = buildPlanDrawList(input(p, { below: { ...below, levelId: 'lv_0' } }));
    expect(dl.fills.some((f) => f.color === LIGHT.underlay && f.alpha === 0.22)).toBe(false);
  });

  it('com belowFloors, os pisos do nível abaixo aparecem apagados, antes do piso atual', () => {
    const p = floorProject('ft_ceram');
    const below = resolveLevel(p, 'lv_0', new Map());
    const floors = resolveFloors(p, 'lv_0');
    const dl = buildPlanDrawList(input(p, { below: { ...below, levelId: 'lv_0' }, belowFloors: floors }));
    const i = dl.fills.findIndex((f) => f.color === LIGHT.underlay && f.alpha === 0.22);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(dl.fills[i]!.polygons).toEqual(floors[0]!.polygon);
  });

  it('belowFloorOps: um preenchimento e um contorno por anel', () => {
    const p = floorProject('ft_ceram', { holes: [HOLE] });
    const ops = belowFloorOps(resolveFloors(p, 'lv_0'), DARK);
    expect(ops.fills).toHaveLength(1);
    expect(ops.strokes).toHaveLength(2);
    expect(ops.strokes[0]!.color).toBe(DARK.underlay);
  });
});
