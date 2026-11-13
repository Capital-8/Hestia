import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import {
  DXF_CATEGORY_COLORS,
  DXF_LAYER_CURTAIN_GLASS,
  DXF_LAYER_CURTAIN_MULLION,
  DXF_LAYER_CURTAIN_OPENING,
  DXF_LAYER_CURTAIN_SOLID,
  dxfDocOf,
  dxfLayerStyleOf,
  dxfLayersOf,
  exportDxf,
  type DxfLevelGeometry,
} from './dxf.ts';

const quadro = (x: number): Array<{ x: number; y: number }> => [
  { x, y: 0 },
  { x: x + 0.05, y: 0 },
  { x: x + 0.05, y: 0.1 },
  { x, y: 0.1 },
];

/** Planta vazia (sem paredes): só o que a cortina põe. */
const VAZIA: DxfLevelGeometry = { clusters: [], openings: [] };
const COM_CORTINA: DxfLevelGeometry = {
  clusters: [],
  openings: [],
  curtains: [
    { layer: DXF_LAYER_CURTAIN_MULLION, pts: quadro(0), closed: true },
    { layer: DXF_LAYER_CURTAIN_GLASS, pts: [{ x: 0.05, y: 0.05 }, { x: 3, y: 0.05 }], closed: false },
    { layer: DXF_LAYER_CURTAIN_SOLID, pts: quadro(4), closed: true, dashed: true },
  ],
};

const p = createEmptyProject('Cortina DXF');

describe('DXF: camadas da parede cortina', () => {
  it('sem cortina resolvida pelo kernel, nenhuma camada CORTINA-* e o arquivo não muda', () => {
    const txt = exportDxf(p, 'lv_0', VAZIA);
    expect(txt).not.toContain('CORTINA-');
    expect(dxfLayersOf(p, VAZIA)).not.toContain(DXF_LAYER_CURTAIN_OPENING);
  });

  it('com cortina resolvida, as quatro camadas entram na tabela LAYER, mesmo a ESQUADRIA vazia', () => {
    const names = dxfDocOf(p, 'lv_0', { ...VAZIA, curtains: [] }).layers.map((l) => l.name);
    expect(names).toEqual(expect.arrayContaining(['CORTINA-MONTANTE', 'CORTINA-VIDRO', 'CORTINA-SOLIDO', 'CORTINA-ESQUADRIA']));
    expect(dxfLayersOf(p, { ...VAZIA, curtains: [] })).toEqual(expect.arrayContaining(['CORTINA-ESQUADRIA']));
  });

  it('cada peça sai na sua camada: montante, vidro e sólido; a polilinha fechada é fechada e o oculto é tracejado', () => {
    const doc = dxfDocOf(p, 'lv_0', COM_CORTINA);
    const polis = doc.entities.filter((e) => e.kind === 'polyline' && e.layer.startsWith('CORTINA-'));
    expect(polis.map((e) => e.layer)).toEqual(['CORTINA-MONTANTE', 'CORTINA-VIDRO', 'CORTINA-SOLIDO']);
    const [montante, vidro, solido] = polis as Array<{ closed: boolean; dashed?: boolean }>;
    expect(montante!.closed).toBe(true);
    expect(vidro!.closed).toBe(false);
    expect(solido!.dashed).toBe(true);
  });

  it('o arquivo R2000 traz as camadas e as peças', () => {
    const txt = exportDxf(p, 'lv_0', COM_CORTINA);
    expect(txt).toContain('AC1015');
    expect(txt).toContain('CORTINA-MONTANTE');
    expect(txt).toContain('CORTINA-VIDRO');
    expect(txt).toContain('CORTINA-SOLIDO');
    expect(txt).toContain('CORTINA-ESQUADRIA');
  });

  it('as cores seguem a categoria: montante e sólido na cor da parede, vidro e esquadria na do vão', () => {
    expect(dxfLayerStyleOf(DXF_LAYER_CURTAIN_MULLION).color).toBe(DXF_CATEGORY_COLORS.wall);
    expect(dxfLayerStyleOf(DXF_LAYER_CURTAIN_SOLID).color).toBe(DXF_CATEGORY_COLORS.wall);
    expect(dxfLayerStyleOf(DXF_LAYER_CURTAIN_GLASS).color).toBe(DXF_CATEGORY_COLORS.window);
    expect(dxfLayerStyleOf(DXF_LAYER_CURTAIN_OPENING).color).toBe(DXF_CATEGORY_COLORS.window);
  });

  it('em inglês, as camadas saem com o nome do idioma (CURTAIN_MULLION etc.)', () => {
    const names = dxfDocOf(p, 'lv_0', COM_CORTINA, 'en').layers.map((l) => l.name);
    expect(names).toEqual(expect.arrayContaining(['CURTAIN_MULLION', 'CURTAIN_GLASS', 'CURTAIN_SOLID', 'CURTAIN_OPENING']));
  });
});
