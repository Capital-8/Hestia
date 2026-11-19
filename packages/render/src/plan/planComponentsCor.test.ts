import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, familiaDaBiblioteca, type Component, type Project } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

const VIEW: Viewport = { cx: 3, cy: 2, zoom: 100, width: 800, height: 600 };

function cena(estilo: 'wireframe' | 'hiddenLine' | 'shaded', values?: Component['values']): Project {
  const p = createEmptyProject('t');
  aplicar(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  aplicar(p, { type: 'setLevelGraphics', levelId: p.levels[0]!.id, patch: { style: estilo } });
  p.elements.c1 = { id: 'c1', kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 2, z: 0, rotation: 0, mirrored: false, mark: 'c1', ...(values ? { values } : {}) };
  return p;
}

function planta(p: Project) {
  return buildPlanGeometry({
    project: p, levelId: p.levels[0]!.id, resolved: resolveLevel(p, p.levels[0]!.id, new Map()), below: null, viewport: VIEW, theme: LIGHT, dark: false,
    selection: [], hover: null, preview: [], inference: null, showGrid: false,
  } satisfies PlanInput);
}

const cores = (p: Project): string[] => planta(p).fills.map((f) => f.color);
const box = (f: { polygons: ReadonlyArray<ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>> }): number[] => {
  const pts = f.polygons.flat(2);
  return [Math.min(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.y))].map((n) => Math.round(n * 1e4) / 1e4);
};

describe('cor dos móveis na planta', () => {
  it('shaded: corpo, porta e tampo levam a cor literal do acabamento (A80 em 1,2: pegada 1..1,8 x 1,98..2,56)', () => {
    const p = cena('shaded', { acabCorpo: 'comp_carvalho', acabPorta: 'comp_sage', acabTampo: 'comp_calacatta' });
    const fills = planta(p).fills.filter((f) => ['#c9a176', '#7d8f82', '#f0ede6'].includes(f.color));
    const corpo = fills.find((f) => f.color === '#c9a176')!;
    expect(box(corpo)).toEqual([1, 1.98, 1.8, 2.56]);
    const portas = fills.filter((f) => f.color === '#7d8f82');
    expect(portas).toHaveLength(2);
    expect(box(portas[0]!)).toEqual([1.002, 1.982, 1.398, 2]);
    expect(box(portas[1]!)).toEqual([1.402, 1.982, 1.798, 2]);
    expect(box(fills.find((f) => f.color === '#f0ede6')!)).toEqual([1, 1.98, 1.8, 2.56]);
  });

  it('shaded sem escolha usa o padrão por papel: corpo #c9a176, porta #ede7dc, tampo #e9e5dc', () => {
    const c = cores(cena('shaded'));
    expect(c).toContain('#c9a176');
    expect(c).toContain('#ede7dc');
    expect(c).toContain('#e9e5dc');
  });

  it('hiddenLine mantém o cinza de antes e wireframe não tem preenchimento', () => {
    const c = cores(cena('hiddenLine', { acabCorpo: 'comp_grafite' }));
    expect(c).not.toContain('#3c4046');
    expect(planta(cena('wireframe', { acabCorpo: 'comp_grafite' })).fills).toHaveLength(0);
  });

  it('aéreo shaded: tracejado, véu leve (alpha 0,25) na cor do corpo e emitido antes dos fills de piso', () => {
    const p = createEmptyProject('t');
    const aereo = familiaDaBiblioteca('fam_aereo')!;
    aplicar(p, { type: 'upsertFamily', family: structuredClone(aereo) });
    aplicar(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
    aplicar(p, { type: 'setLevelGraphics', levelId: p.levels[0]!.id, patch: { style: 'shaded' } });
    const base = { kind: 'component' as const, levelId: p.levels[0]!.id, order: 1, x: 1, y: 2, z: 0, rotation: 0, mirrored: false };
    p.elements.piso = { ...base, id: 'piso', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', mark: 'piso' };
    p.elements.aer = { ...base, id: 'aer', order: 2, familyId: aereo.id, typeId: 'A80', mark: 'aer', values: { acabCorpo: 'comp_cobre' } };
    const g = planta(p);
    expect(g.strokes.some((s) => s.closed && s.dash?.[0] === 4 && s.dash[1] === 3)).toBe(true);
    const iAereo = g.fills.findIndex((f) => f.color === '#b47a4c' && f.alpha === 0.25);
    const iPiso = g.fills.findIndex((f) => f.color === '#c9a176');
    expect(iAereo).toBeGreaterThanOrEqual(0);
    expect(iAereo).toBeLessThan(iPiso);
  });
});
