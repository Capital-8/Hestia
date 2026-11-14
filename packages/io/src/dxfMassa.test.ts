import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { DXF_CATEGORY_COLORS, DXF_LAYER_MASS, dxfDocOf, dxfLayerStyleOf, dxfLayersOf, dxfLineRoleOf, dxfSectionLayerOf, dxfSectionLayerStyleOf, dxfSectionLineRoleOf, exportDxf, sectionDxfDocOf, type DxfLevelGeometry, type DxfSectionGeometry } from './index.ts';

const anel = (x: number, y: number, l: number): Array<{ x: number; y: number }> => [
  { x, y },
  { x: x + l, y },
  { x: x + l, y: y + l },
  { x, y: y + l },
];

const p = createEmptyProject('Massa DXF');
const VAZIA: DxfLevelGeometry = { clusters: [], openings: [] };
const COM_MASSA: DxfLevelGeometry = {
  clusters: [],
  openings: [],
  masses: [
    { pts: anel(0, 0, 8), closed: true },
    { pts: anel(-1, -1, 10), closed: true },
    { pts: anel(0, 0, 8), closed: true, dashed: true },
  ],
};

describe('DXF: camada MASSA na planta (ficha X1)', () => {
  it('sem massa resolvida, a camada não sai e o arquivo não muda', () => {
    expect(exportDxf(p, 'lv_0', VAZIA)).not.toContain('MASSA');
    expect(dxfLayersOf(p, VAZIA)).not.toContain(DXF_LAYER_MASS);
  });

  it('com massa resolvida, a camada entra na tabela LAYER, mesmo sem linhas', () => {
    expect(dxfDocOf(p, 'lv_0', { ...VAZIA, masses: [] }).layers.map((l) => l.name)).toContain('MASSA');
    expect(dxfLayersOf(p, { ...VAZIA, masses: [] })).toContain('MASSA');
  });

  it('cada linha sai como polilinha fechada na camada MASSA e só a seção acima do corte é tracejada', () => {
    const doc = dxfDocOf(p, 'lv_0', COM_MASSA);
    const polis = doc.entities.filter((e) => e.kind === 'polyline' && e.layer === 'MASSA') as Array<{ closed: boolean; dashed?: boolean }>;
    expect(polis).toHaveLength(3);
    expect(polis.every((e) => e.closed)).toBe(true);
    expect(polis.map((e) => e.dashed === true)).toEqual([false, false, true]);
  });

  it('o arquivo R2000 traz a camada, com a cor da categoria e o peso de corte', () => {
    const txt = exportDxf(p, 'lv_0', { ...COM_MASSA, lineWeights: { MASSA: 50 } });
    expect(txt).toContain('AC1015');
    expect(txt).toContain('MASSA');
    expect(dxfLayerStyleOf(DXF_LAYER_MASS).color).toBe(DXF_CATEGORY_COLORS.mass);
    expect(dxfLineRoleOf(DXF_LAYER_MASS)).toEqual({ category: 'mass', view: 'cut' });
  });

  it('em inglês o nome da camada se mantém (MASSA)', () => {
    expect(dxfDocOf(p, 'lv_0', COM_MASSA, 'en').layers.map((l) => l.name)).toContain('MASSA');
  });
});

describe('DXF: corte da massa (CORTE_MASSA, ficha X1)', () => {
  const retangulo = [[anel(0, 0, 9)]];
  const geo: DxfSectionGeometry = { cut: [{ category: 'mass', polygons: retangulo }], beyond: [{ category: 'mass', polygons: [[anel(1, 1, 3)]] }] };

  it('o cortado vai à CORTE_MASSA e o projetado à CORTE_MASSA_PROJECAO, nas cores e papéis da categoria', () => {
    expect(dxfSectionLayerOf('mass')).toBe('CORTE_MASSA');
    expect(dxfSectionLayerOf('mass', 'projection')).toBe('CORTE_MASSA_PROJECAO');
    expect(dxfSectionLineRoleOf('CORTE_MASSA')).toEqual({ category: 'mass', view: 'cut' });
    expect(dxfSectionLineRoleOf('CORTE_MASSA_PROJECAO')).toEqual({ category: 'mass', view: 'projection' });
    expect(dxfSectionLayerStyleOf('CORTE_MASSA').color).toBe(DXF_CATEGORY_COLORS.mass);
    const doc = sectionDxfDocOf(geo);
    expect(doc.entities.filter((e) => e.kind === 'polyline').map((e) => e.layer).sort()).toEqual(['CORTE_MASSA', 'CORTE_MASSA_PROJECAO']);
    expect(doc.layers.map((l) => l.name)).toEqual(expect.arrayContaining(['CORTE_MASSA', 'CORTE_MASSA_PROJECAO']));
  });
});
