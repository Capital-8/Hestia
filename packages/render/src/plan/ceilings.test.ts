import { describe, expect, it } from 'vitest';
import { pointInMulti, type Vec2 } from '@hestia/geom';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeCeiling, makeFloor, makeWall, type Project } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { ceilingFillMaterial, ceilingFills, ceilingSelectionOps } from './ceilings.ts';
import { defaultPaint } from './style.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';
import { resolveCeilings } from '@hestia/engine';

const VIEW: Viewport = { cx: 4, cy: 2.5, zoom: 100, width: 800, height: 600 };
const P = (x: number, y: number): Vec2 => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];

/** Sala de 4 × 5 m com forro de gesso a 2,60 m e um piso ao lado (x de 6 a 9), para ver o que cada direção mostra. */
function project(direction: 'down' | 'up'): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 0), b: P(4, 0), height: 2.8 }) });
  s.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c', typeId: 'ct_gesso', levelId: 'lv_0', boundary: rect(0, 0, 4, 5), heightOffset: 2.6 }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId: 'ft_laje12', levelId: 'lv_0', boundary: rect(6, 0, 9, 5) }) });
  if (direction === 'up') s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { direction: 'up' } });
  return s.project;
}

function draw(p: Project, over: Partial<PlanInput> = {}) {
  const input: PlanInput = {
    project: p,
    levelId: 'lv_0',
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

const filled = (dl: ReturnType<typeof draw>, x: number, y: number): boolean => dl.fills.some((f) => pointInMulti({ x, y }, f.polygons));

describe('planta de forro (direção para cima)', () => {
  it('o forro aparece na planta de forro e não aparece na planta baixa', () => {
    expect(filled(draw(project('up')), 2, 2.5)).toBe(true);
    expect(filled(draw(project('down')), 2, 2.5)).toBe(false);
  });

  it('o piso, que fica abaixo do corte, sai da planta de forro e aparece na planta baixa', () => {
    expect(filled(draw(project('up')), 7.5, 2.5)).toBe(false);
    expect(filled(draw(project('down')), 7.5, 2.5)).toBe(true);
  });

  it('a parede continua cortada na planta de forro', () => {
    expect(filled(draw(project('up')), 2, 0)).toBe(true);
  });

  it('a seleção de forro destaca o contorno na planta de forro', () => {
    const p = project('up');
    const dl = draw(p, { selection: ['c'] });
    expect(dl.fills.length).toBeGreaterThan(draw(p).fills.length);
  });

  it('a cor do forro vem do material da primeira camada', () => {
    const p = project('up');
    const [c] = resolveCeilings(p, 'lv_0');
    expect(ceilingFillMaterial(c!)).toBe('mat_perfil');
  });

  it('ceilingFills e ceilingSelectionOps funcionam com forro oculto e sem forros', () => {
    const p = project('up');
    const paint = defaultPaint('floor', VIEW.zoom);
    expect(ceilingFills(p, 'lv_0', LIGHT, false, 'medium', VIEW, new Set(['c']), paint).fills).toHaveLength(0);
    expect(ceilingFills(p, 'lv_1', LIGHT, false, 'medium', VIEW).fills).toHaveLength(0);
    expect(ceilingSelectionOps(p, 'lv_0', [], null, LIGHT, VIEW).fills).toHaveLength(0);
  });
});
