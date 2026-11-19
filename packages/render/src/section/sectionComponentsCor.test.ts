import { describe, expect, it } from 'vitest';
import { computeSection } from '@hestia/engine';
import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Project } from '@hestia/model';
import { LIGHT, type FillOp } from '../plan/types.ts';
import { buildSectionDrawList } from './build.ts';

/** Armário A80 em (1, 1) com a porta em "sage" e o corpo em grafite; corte em x = 1,2 olhando para +y (t = y, z = cota). */
function lista(estilo: 'wireframe' | 'hiddenLine' | 'shaded') {
  const p: Project = createEmptyProject('t');
  aplicar(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  aplicar(p, { type: 'setSectionGraphics', patch: { style: estilo } });
  p.elements.c1 = { id: 'c1', kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 1, z: 0, rotation: 0, mirrored: false, mark: 'c1', values: { acabCorpo: 'comp_grafite', acabPorta: 'comp_sage', acabTampo: 'comp_calacatta' } };
  const section = computeSection(p, { a: { x: 1.2, y: 0 }, b: { x: 1.2, y: 3 }, depth: 2 });
  return buildSectionDrawList({ project: p, section, viewport: { cx: 1.5, cy: 0.4, zoom: 200, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false });
}

const box = (f: FillOp): number[] => {
  const pts = f.polygons.flat(2);
  return [Math.min(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.y))].map((n) => Math.round(n * 1e4) / 1e4);
};

describe('cor dos móveis no corte', () => {
  it('shaded: a região cortada da porta (t 0,982..1, z 0,102..0,693) leva a cor literal do acabamento', () => {
    const fills = lista('shaded').fills;
    const porta = fills.filter((f) => f.color === '#7d8f82' && box(f).join() === '0.982,0.102,1,0.693');
    expect(porta).toHaveLength(1);
    // Tampo cortado (z 0,695..0,72) e corpo (lateral não cortada em x = 1,2; base/travessa/prateleira em grafite).
    expect(fills.some((f) => f.color === '#f0ede6' && box(f)[1] === 0.695 && box(f)[3] === 0.72)).toBe(true);
    expect(fills.some((f) => f.color === '#3c4046')).toBe(true);
  });

  it('hiddenLine: o corte leva a cor do acabamento esmaecida em direção ao papel (vermelho 125 -> 200)', () => {
    const porta = lista('hiddenLine').fills.filter((f) => box(f).join() === '0.982,0.102,1,0.693');
    expect(porta).toHaveLength(1);
    expect(porta[0]!.color).not.toBe('#7d8f82');
    expect(parseInt(porta[0]!.color.slice(1, 3), 16)).toBe(200);
  });

  it('wireframe: sem preenchimento do móvel, só contornos', () => {
    const d = lista('wireframe');
    expect(d.fills).toHaveLength(0);
    expect(d.strokes.some((s) => s.closed)).toBe(true);
  });

  it('projeção além do corte (beyond) em shaded usa a cor do acabamento da lateral (grafite)', () => {
    const fills = lista('shaded').fills;
    // Lateral esquerda em x 1..1,018 fica atrás do plano x = 1,2: aparece como retângulo t 1..1,56, z 0,118..0,695.
    expect(fills.some((f) => f.color === '#3c4046' && box(f).join() === '1,0.118,1.56,0.695')).toBe(true);
  });
});
