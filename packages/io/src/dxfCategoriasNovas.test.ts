import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeBeam, makeColumn, makeFooting } from '@hestia/model';
import {
  DXF_CATEGORY_COLORS,
  DXF_LAYER_BEAM,
  DXF_LAYER_CEILING,
  DXF_LAYER_COLUMN,
  DXF_LAYER_CONTOUR,
  DXF_LAYER_FOOTING,
  DXF_LAYER_RAMP,
  DXF_LAYER_STAIR,
  DXF_LINE_WEIGHT_DEFAULT,
  dxfLayerStyleOf,
  dxfLineRoleOf,
} from './dxf.ts';
import { dxfSectionLayerOf, dxfSectionLayerStyleOf, dxfSectionLineRoleOf } from './dxfSection.ts';
import { structuralDxfShapes } from './dxfStructural.ts';

/*
 * Categorias gráficas novas no DXF (adendo 2 do ADR 0060, etapa 4.5b): pilar, viga, sapata, forro, rampa e componentes
 * apontam para a MESMA camada/estilo da categoria de origem, para a saída existente não mudar. Valores LITERAIS.
 */

describe('planta: camada/estilo das categorias novas é o da categoria de origem', () => {
  it('a cor ACI é a da origem (pilar=parde, viga/sapata=laje, forro=piso, rampa=escada, componentes=importado)', () => {
    expect(DXF_CATEGORY_COLORS.column).toBe(1); // parede
    expect(DXF_CATEGORY_COLORS.column).toBe(DXF_CATEGORY_COLORS.wall);
    expect(DXF_CATEGORY_COLORS.beam).toBe(4); // laje
    expect(DXF_CATEGORY_COLORS.beam).toBe(DXF_CATEGORY_COLORS.slab);
    expect(DXF_CATEGORY_COLORS.footing).toBe(DXF_CATEGORY_COLORS.slab);
    expect(DXF_CATEGORY_COLORS.ceiling).toBe(5); // piso
    expect(DXF_CATEGORY_COLORS.ceiling).toBe(DXF_CATEGORY_COLORS.floor);
    expect(DXF_CATEGORY_COLORS.ramp).toBe(6); // escada
    expect(DXF_CATEGORY_COLORS.ramp).toBe(DXF_CATEGORY_COLORS.stair);
    for (const c of ['component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment'] as const) {
      expect(DXF_CATEGORY_COLORS[c]).toBe(8); // importado
      expect(DXF_CATEGORY_COLORS[c]).toBe(DXF_CATEGORY_COLORS.generic);
    }
  });

  it('o papel de peso de linha das camadas estruturais é o da origem', () => {
    expect(dxfLineRoleOf(DXF_LAYER_COLUMN)).toEqual({ category: 'wall', view: 'cut' });
    expect(dxfLineRoleOf(DXF_LAYER_BEAM)).toEqual({ category: 'slab', view: 'projection' });
    expect(dxfLineRoleOf(DXF_LAYER_FOOTING)).toEqual({ category: 'slab', view: 'cut' });
    expect(dxfLineRoleOf(DXF_LAYER_CEILING)).toEqual({ category: 'floor', view: 'cut' });
    expect(dxfLineRoleOf(DXF_LAYER_RAMP)).toEqual({ category: 'stair', view: 'cut' });
  });

  it('o estilo efetivo da camada do pilar é o da parede; viga e sapata usam o da laje', () => {
    expect(dxfLayerStyleOf(DXF_LAYER_COLUMN)).toEqual(dxfLayerStyleOf(DXF_LAYER_CONTOUR));
    expect(dxfLayerStyleOf(DXF_LAYER_COLUMN)).toEqual({ color: 1, lineWeight: DXF_LINE_WEIGHT_DEFAULT, linetype: 'CONTINUOUS' });
    expect(dxfLayerStyleOf(DXF_LAYER_BEAM)).toEqual({ color: 4, lineWeight: DXF_LINE_WEIGHT_DEFAULT, linetype: 'DASHED' });
    expect(dxfLayerStyleOf(DXF_LAYER_FOOTING)).toEqual({ color: 4, lineWeight: DXF_LINE_WEIGHT_DEFAULT, linetype: 'CONTINUOUS' });
  });

  it('a camada da escada não é a da rampa (cada categoria tem a sua)', () => {
    expect(DXF_LAYER_RAMP).not.toBe(DXF_LAYER_STAIR);
    expect(dxfLineRoleOf(DXF_LAYER_RAMP)).toEqual(dxfLineRoleOf(DXF_LAYER_STAIR));
  });
});

describe('corte/elevação: as categorias novas usam a camada da categoria de origem', () => {
  it('cada categoria nova aponta para a camada/estilo da origem', () => {
    const pares = [
      ['column', 'wall'],
      ['beam', 'slab'],
      ['footing', 'slab'],
      ['ceiling', 'floor'],
      ['ramp', 'stair'],
      ['component', 'generic'],
      ['plumbingFixture', 'generic'],
      ['electricalFixture', 'generic'],
      ['mechanicalEquipment', 'generic'],
    ] as const;
    for (const [nova, origem] of pares) {
      expect(dxfSectionLayerOf(nova), nova).toBe(dxfSectionLayerOf(origem));
      expect(dxfSectionLayerOf(nova, 'projection'), nova).toBe(dxfSectionLayerOf(origem, 'projection'));
      expect(dxfSectionLayerStyleOf(dxfSectionLayerOf(nova)), nova).toEqual(dxfSectionLayerStyleOf(dxfSectionLayerOf(origem)));
    }
  });

  it('o papel da camada nova é o da origem (a cor/espessura não muda)', () => {
    expect(dxfSectionLineRoleOf(dxfSectionLayerOf('column'))).toEqual({ category: 'wall', view: 'cut' });
    expect(dxfSectionLineRoleOf(dxfSectionLayerOf('beam'))).toEqual({ category: 'slab', view: 'cut' });
    expect(dxfSectionLineRoleOf(dxfSectionLayerOf('ramp'))).toEqual({ category: 'stair', view: 'cut' });
    expect(dxfSectionLineRoleOf(dxfSectionLayerOf('component'))).toEqual({ category: 'generic', view: 'cut' });
  });
});

describe('estruturais ocultos na vista não saem no DXF', () => {
  function projeto() {
    const p = createEmptyProject();
    const c = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 2, y: 3 } });
    const b = makeBeam({ id: 'b1', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    const f = makeFooting({ id: 'f1', typeId: 'ft_iso_100x100', levelId: 'lv_0', at: { x: 5, y: 5 } });
    p.elements[c.id] = { ...c, order: 1 };
    p.elements[b.id] = { ...b, order: 2 };
    p.elements[f.id] = { ...f, order: 3 };
    return p;
  }

  it('ocultar só o pilar tira a camada PILARES e mantém VIGAS e FUNDACOES', () => {
    const p = projeto();
    const shapes = structuralDxfShapes(p, 'lv_0', new Set(['c1']));
    expect(shapes.map((s) => s.layer)).toEqual([DXF_LAYER_BEAM, DXF_LAYER_FOOTING]);
    expect(structuralDxfShapes(p, 'lv_0').map((s) => s.layer)).toEqual([DXF_LAYER_COLUMN, DXF_LAYER_BEAM, DXF_LAYER_FOOTING]);
  });
});

/** Todos os arquivos `.ts` de `dir` (recursivo), sem os testes. */
function fontes(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) out.push(...fontes(caminho));
    else if (nome.endsWith('.ts') && !nome.endsWith('.test.ts')) out.push(caminho);
  }
  return out;
}

describe('guarda de texto: nenhum case de column/beam/footing decide categoria fora do modelo', () => {
  it('packages/io não tem case de column/beam/footing', () => {
    const dir = join(import.meta.dirname, '.');
    const achados = fontes(dir).filter((f) => /\bcase\s+'(column|beam|footing)'/.test(readFileSync(f, 'utf8')));
    expect(achados).toEqual([]);
  });
});
