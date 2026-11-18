import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { resolveFloors, resolveLevel, resolveSlabs } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeSlab, type Project } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { floorAndSlabOps, contourMid } from './surfaces.ts';
import { defaultPaint } from './style.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

/** Piso no retângulo 0..6 × 0..4 (topo 0) e laje menor dentro dele, com topo em `slabTop`: sobreposição em planta. */
const FLOOR: Vec2[] = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
const SLAB: Vec2[] = [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 3 }, { x: 1, y: 3 }];
const VIEW: Viewport = { cx: 3, cy: 2, zoom: 100, width: 800, height: 600 };

function project(slabOffset: number, floorOffset = 0): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId: 'ft_ceram', levelId: 'lv_0', boundary: FLOOR, heightOffset: floorOffset }) });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 's', typeId: 'ls_mac12', levelId: 'lv_0', boundary: SLAB, heightOffset: slabOffset }) });
  return s.project;
}

const key = (v: Vec2[][][]): string => JSON.stringify(v);

function drawOf(p: Project) {
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
  };
  return buildPlanDrawList(input);
}

describe('planta: pisos e lajes pela cota da face superior (P6)', () => {
  it('laje acima do piso é pintada depois dele, então não fica escondida atrás do piso', () => {
    const p = project(0.5); // laje com topo em 0,5 e piso com topo em 0
    const fills = drawOf(p).fills.map((f) => key(f.polygons));
    const floorAt = fills.indexOf(key(resolveFloors(p, 'lv_0')[0]!.polygon));
    const slabAt = fills.indexOf(key(resolveSlabs(p, 'lv_0')[0]!.polygon));
    expect(floorAt).toBeGreaterThanOrEqual(0);
    expect(slabAt).toBeGreaterThan(floorAt);
  });

  it('piso acima da laje (laje com topo mais baixo): o piso é pintado por último', () => {
    const p = project(-0.2, 0.3);
    const ops = floorAndSlabOps(p, 'lv_0', LIGHT, false, 'medium', VIEW, undefined, { floor: defaultPaint('floor', 100), slab: defaultPaint('slab', 100) });
    expect(key(ops[ops.length - 1]!.ops.fills[0]!.polygons)).toBe(key(resolveFloors(p, 'lv_0')[0]!.polygon));
  });

  it('empate de topo: a ordem da lista desempata (lajes antes dos pisos, como antes)', () => {
    const p = project(0);
    const ops = floorAndSlabOps(p, 'lv_0', LIGHT, false, 'medium', VIEW, undefined, { floor: defaultPaint('floor', 100), slab: defaultPaint('slab', 100) });
    expect(ops).toHaveLength(2);
    expect(key(ops[0]!.ops.fills[0]!.polygons)).toBe(key(resolveSlabs(p, 'lv_0')[0]!.polygon));
  });

  it('o ponto médio do contorno é o centro da caixa envolvente', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addSlab', slab: makeSlab({ id: 's', typeId: 'ls_mac12', levelId: 'lv_0', boundary: FLOOR }) });
    expect(contourMid(resolveSlabs(s.project, 'lv_0')[0]!.polygon)).toEqual({ x: 3, y: 2 });
  });

  it('ocultos não entram na ordem', () => {
    const p = project(0.5);
    const ops = floorAndSlabOps(p, 'lv_0', LIGHT, false, 'medium', VIEW, new Set(['s']), { floor: defaultPaint('floor', 100), slab: defaultPaint('slab', 100) });
    expect(ops).toHaveLength(1);
  });
});
