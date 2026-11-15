import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { dxfDocOf, dxfLayerStyleOf, dxfLayersOf, dxfLineRoleOf, DXF_CATEGORY_COLORS, type DxfLevelGeometry } from './dxf.ts';
import { writeDxf2000 } from './dxfDoc.ts';
import { DXF_LAYERS_LOTE, DXF_LAYERS_TERRENO, type DxfTerrenoPath } from './dxfPlantaTerreno.ts';
import { dxfSectionLayerOf, sectionDxfDocOf, type DxfSectionGeometry } from './dxfSection.ts';
import { dxfLayerCanonical, dxfLayerName } from './i18n.ts';

const quadrado = (x: number, y: number, l: number) => [{ x, y }, { x: x + l, y }, { x: x + l, y: y + l }, { x, y: y + l }];

const terreno: DxfTerrenoPath[] = [
  { layer: 'TERRENO_CURVAS', pts: quadrado(2, 2, 16), closed: true, elevation: 1 },
  { layer: 'TERRENO_CURVAS_MESTRAS', pts: quadrado(4, 4, 12), closed: true, elevation: 2.5 },
  { layer: 'TERRENO_CURVAS', pts: [{ x: 0, y: 5 }, { x: 20, y: 5 }], closed: false, elevation: 742.75 },
  { layer: 'TERRENO_BORDA', pts: quadrado(0, 0, 20), closed: true },
  { layer: 'TERRENO_REGIAO', pts: quadrado(5, 5, 10), closed: true },
  { layer: 'LOTE', pts: quadrado(0, 0, 12), closed: true },
  { layer: 'LOTE_EDIFICAVEL', pts: quadrado(1, 1, 8), closed: true, dashed: true },
];
const geo = (extra: Partial<DxfLevelGeometry> = {}): DxfLevelGeometry => ({ clusters: [], openings: [], terreno, ...extra });
const proj = createEmptyProject('T');

/** Pares (código, valor) do arquivo. */
const pares = (texto: string): Array<[string, string]> => {
  const l = texto.split('\r\n');
  const out: Array<[string, string]> = [];
  for (let i = 0; i + 1 < l.length; i += 2) out.push([l[i]!.trim(), l[i + 1]!]);
  return out;
};

/** Entidades LWPOLYLINE: camada, flag de fechada, elevação (38) e número de vértices. */
function lwpolylines(texto: string): Array<{ layer: string; closed: number; elevacao: number; vertices: number }> {
  const out: Array<{ layer: string; closed: number; elevacao: number; vertices: number }> = [];
  const ps = pares(texto);
  const iniEnt = ps.findIndex(([c, v]) => c === '2' && v === 'ENTITIES');
  for (let i = iniEnt; i < ps.length; i++) {
    if (ps[i]![0] !== '0' || ps[i]![1] !== 'LWPOLYLINE') continue;
    let j = i + 1;
    const e = { layer: '', closed: -1, elevacao: NaN, vertices: 0 };
    for (; j < ps.length && ps[j]![0] !== '0'; j++) {
      const [c, v] = ps[j]!;
      if (c === '8') e.layer = v;
      else if (c === '70') e.closed = Number(v);
      else if (c === '38') e.elevacao = Number(v);
      else if (c === '90') e.vertices = Number(v);
    }
    out.push(e);
  }
  return out;
}

describe('DXF da planta com terreno e lote', () => {
  it('as seis camadas da planta entram na tabela LAYER, com a cor da categoria site e lot', () => {
    const doc = dxfDocOf(proj, 'lv_0', geo());
    const nomes = doc.layers.map((l) => l.name);
    for (const n of [...DXF_LAYERS_TERRENO, ...DXF_LAYERS_LOTE]) expect(nomes).toContain(n);
    expect(doc.layers.find((l) => l.name === 'TERRENO_CURVAS')!.color).toBe(DXF_CATEGORY_COLORS.site);
    expect(doc.layers.find((l) => l.name === 'TERRENO_BORDA')!.color).toBe(34);
    expect(doc.layers.find((l) => l.name === 'LOTE')!.color).toBe(DXF_CATEGORY_COLORS.lot);
    expect(doc.layers.find((l) => l.name === 'LOTE_EDIFICAVEL')!.color).toBe(1);
    expect(dxfLayersOf(proj, geo())).toContain('TERRENO_CURVAS_MESTRAS');
  });

  it('cada camada tem o papel da categoria (largura de linha)', () => {
    for (const n of DXF_LAYERS_TERRENO) expect(dxfLineRoleOf(n)).toEqual({ category: 'site', view: 'cut' });
    for (const n of DXF_LAYERS_LOTE) expect(dxfLineRoleOf(n)).toEqual({ category: 'lot', view: 'cut' });
    expect(dxfLayerStyleOf('TERRENO_BORDA').color).toBe(34);
  });

  it('as curvas saem como LWPOLYLINE com a elevação (código 38) igual à cota dada; borda, região e lote saem sem elevação', () => {
    const texto = writeDxf2000(dxfDocOf(proj, 'lv_0', geo()));
    const lw = lwpolylines(texto);
    expect(lw).toHaveLength(3);
    expect(lw.map((e) => [e.layer, e.elevacao])).toEqual([['TERRENO_CURVAS', 1], ['TERRENO_CURVAS_MESTRAS', 2.5], ['TERRENO_CURVAS', 742.75]]);
    expect(lw.map((e) => e.closed)).toEqual([1, 1, 0]);
    expect(lw.map((e) => e.vertices)).toEqual([4, 4, 2]);
    const comPolyline = (camada: string): number => (texto.match(new RegExp(`\\r\\nPOLYLINE\\r\\n[^]*?\\r\\n8\\r\\n${camada}\\r\\n`, 'g')) ?? []).length;
    expect(comPolyline('TERRENO_BORDA')).toBeGreaterThanOrEqual(1);
    expect(comPolyline('TERRENO_REGIAO')).toBeGreaterThanOrEqual(1);
    expect(comPolyline('LOTE_EDIFICAVEL')).toBeGreaterThanOrEqual(1);
    expect(texto).toContain('\r\nLOTE\r\n');
  });

  it('em unidades de saída a elevação acompanha a escala (mm)', () => {
    const texto = writeDxf2000(dxfDocOf(proj, 'lv_0', geo({ units: 'mm' })));
    expect(lwpolylines(texto)[0]!.elevacao).toBe(1000);
  });

  it('sem `terreno` nenhuma camada do terreno aparece', () => {
    const doc = dxfDocOf(proj, 'lv_0', { clusters: [], openings: [] });
    expect(doc.layers.map((l) => l.name).filter((n) => n.startsWith('TERRENO') || n.startsWith('LOTE'))).toEqual([]);
  });

  it('em inglês as camadas são traduzidas e voltam ao nome canônico', () => {
    const doc = dxfDocOf(proj, 'lv_0', geo(), 'en');
    const nomes = doc.layers.map((l) => l.name);
    expect(nomes).toContain('TERRAIN_CONTOURS');
    expect(nomes).toContain('TERRAIN_MAJOR_CONTOURS');
    expect(nomes).toContain('LOT_BUILDABLE');
    for (const n of [...DXF_LAYERS_TERRENO, ...DXF_LAYERS_LOTE]) expect(dxfLayerCanonical(dxfLayerName(n, 'en'))).toBe(n);
  });
});

describe('DXF do corte com terreno', () => {
  const secao: DxfSectionGeometry = {
    cut: [],
    beyond: [],
    terrain: [
      { pts: [{ x: 0, y: 8 }, { x: 20, y: 8 }, { x: 20, y: 5 }, { x: 0, y: 5 }], closed: true },
      { pts: [{ x: 0, y: 10 }, { x: 20, y: 10 }], closed: false, dashed: true },
    ],
  };

  it('o terreno sai na camada CORTE_TERRENO: solo fechado e perfil existente aberto e tracejado', () => {
    expect(dxfSectionLayerOf('site')).toBe('CORTE_TERRENO');
    const doc = sectionDxfDocOf(secao);
    expect(doc.layers.map((l) => l.name)).toContain('CORTE_TERRENO');
    const poli = doc.entities.filter((e) => e.kind === 'polyline' && e.layer === 'CORTE_TERRENO');
    expect(poli).toHaveLength(2);
    expect(poli.map((e) => e.kind === 'polyline' && e.closed)).toEqual([true, false]);
    expect(poli.map((e) => e.kind === 'polyline' && e.dashed === true)).toEqual([false, true]);
  });

  it('em inglês vira SECTION_TERRAIN', () => {
    expect(sectionDxfDocOf(secao, 'en').layers.map((l) => l.name)).toContain('SECTION_TERRAIN');
  });
});
