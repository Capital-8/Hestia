import { describe, expect, it } from 'vitest';
import { createEmptyProject, type Generic, type Project } from '@hestia/model';
import { exportIfc } from './ifcExport.ts';
import { ifcGuid } from './ifcGuid.ts';
import type { IfcGeometry } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';
const EMPTY: IfcGeometry = { walls: [], openings: [], floors: [], slabs: [], roofs: [], stairs: [] };

/** Doze triplas de um cubo: base, topo e as quatro faces laterais. */
const CUBE_TRIS = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];

/** Viga importada de 1 m³, em coordenadas de mundo, com a base na cota `z0`. */
function cube(id: string, levelId: string, z0: number): Generic {
  const z1 = z0 + 1;
  return {
    id,
    kind: 'generic',
    levelId,
    name: 'Viga importada',
    sourceClass: 'IFCBEAM',
    mesh: {
      positions: [0, 0, z0, 1, 0, z0, 1, 1, z0, 0, 1, z0, 0, 0, z1, 1, 0, z1, 1, 1, z1, 0, 1, z1],
      indices: CUBE_TRIS,
    },
    outline: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
    order: 1,
  };
}

/** Projeto vazio (dois níveis: `lv_0` em 0 m e `lv_1` em 3 m) com os genéricos dados. */
function projectWith(...generics: Generic[]): Project {
  const p = createEmptyProject('Genéricos');
  for (const g of generics) p.elements[g.id] = g;
  return p;
}

const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const entityCount = (text: string): number => (text.match(/^#\d+=/gm) ?? []).length;

/** Todo `#n` referenciado tem de existir como entidade definida. */
function danglingRefs(text: string): number[] {
  const defined = new Set([...text.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1])));
  return [...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((id) => !defined.has(id));
}

/** Argumento `CoordIndex` do único `IFCTRIANGULATEDFACESET` do arquivo. */
function coordIndexArg(text: string): string {
  const m = /IFCTRIANGULATEDFACESET\(#\d+,\$,\$,(\(.*?\)),\$\);/s.exec(text);
  return m?.[1] ?? '';
}

describe('exportIfc: objeto genérico (IFCBUILDINGELEMENTPROXY)', () => {
  const p = projectWith(cube('g_viga', 'lv_0', 0));
  const text = exportIfc(p, EMPTY, { timestamp: TS });

  it('sai como IFCBUILDINGELEMENTPROXY com ObjectType = classe IFC de origem', () => {
    expect(text).toContain('=IFCBUILDINGELEMENTPROXY(');
    expect(count(text, 'IFCBUILDINGELEMENTPROXY')).toBe(1);
    expect(text).toMatch(/IFCBUILDINGELEMENTPROXY\('[^']*',\$,'Viga importada',\$,'IFCBEAM',#\d+,#\d+,\$,\.ELEMENT\.\);/);
    expect(text).toContain('IFCTRIANGULATEDFACESET(');
    expect(text).toContain('IFCCARTESIANPOINTLIST3D(');
    expect(danglingRefs(text)).toEqual([]);
  });

  it('a malha sai em triplas 1-based e o objeto fica contido no pavimento', () => {
    const index = coordIndexArg(text);
    expect((index.match(/\),\(/g) ?? []).length + 1).toBe(12);
    expect(index.startsWith('((1,3,2),')).toBe(true);
    expect(index.includes('(0,')).toBe(false);
    expect(count(text, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')).toBe(1);
  });

  it('coordenadas em metros e na cota local do nível (mundo menos a elevação)', () => {
    const out = exportIfc(projectWith(cube('g_viga', 'lv_1', 3)), EMPTY, { timestamp: TS });
    expect(out).toContain('(0.000000,0.000000,0.000000)');
    expect(out).toContain('(1.000000,1.000000,0.000000)');
    expect(out).toContain('(0.000000,0.000000,1.000000)');
  });

  it('GlobalId derivado de `generic:<id>` e determinístico entre duas chamadas', () => {
    expect(text).toContain(`'${ifcGuid('generic:g_viga')}'`);
    const again = exportIfc(projectWith(cube('g_viga', 'lv_0', 0)), EMPTY, { timestamp: TS });
    expect(again).toBe(text);
  });

  it('property sets de `ifcProperties` saem como IFCPROPERTYSET ligado ao proxy', () => {
    const g: Generic = {
      ...cube('g_viga', 'lv_0', 0),
      ifcProperties: [
        { name: 'Referência', value: 'V1' },
        { name: 'Carga', value: 12.5 },
        { name: 'Estrutural', value: true },
        { name: 'Pavimentos', value: 2 },
      ],
    };
    const out = exportIfc(projectWith(g), EMPTY, { timestamp: TS });
    // O exportador também escreve os psets privados do Hestia (`Pset_Hestia_Element`/`_Project`); aqui interessa o
    // pset do usuário, que mantém o nome curto `Pset_Hestia`.
    expect((out.match(/'Pset_Hestia'/g) ?? []).length).toBe(1);
    expect(out).toContain("'Pset_Hestia'");
    expect(out).toContain("IFCLABEL('V1')");
    expect(out).toContain('IFCREAL(12.500000)');
    expect(out).toContain('IFCBOOLEAN(.T.)');
    expect(out).toContain('IFCINTEGER(2)');
    expect(danglingRefs(out)).toEqual([]);
  });

  it('objeto sem propriedades não ganha property set do usuário', () => {
    const g: Generic = { ...cube('g_viga', 'lv_0', 0), ifcProperties: [] };
    const out = exportIfc(projectWith(g), EMPTY, { timestamp: TS });
    expect(out).not.toContain("'Pset_Hestia'");
  });

  it('genérico sem malha válida ainda sai, sem representação', () => {
    const g: Generic = { ...cube('g_viga', 'lv_0', 0), mesh: { positions: [], indices: [] } };
    const out = exportIfc(projectWith(g), EMPTY, { timestamp: TS });
    expect(out).toMatch(/IFCBUILDINGELEMENTPROXY\('[^']*',\$,'Viga importada',\$,'IFCBEAM',#\d+,\$,/);
    expect(count(out, 'IFCTRIANGULATEDFACESET')).toBe(0);
    expect(danglingRefs(out)).toEqual([]);
  });

  it('genérico de nível inexistente não sai', () => {
    const out = exportIfc(projectWith(cube('g_viga', 'lv_fora', 0)), EMPTY, { timestamp: TS });
    expect(count(out, 'IFCBUILDINGELEMENTPROXY')).toBe(0);
  });
});

describe('exportIfc: projeto sem genérico', () => {
  it('o texto não muda em relação à exportação atual (mesmas entidades e linhas)', () => {
    const p = createEmptyProject('Sem genérico');
    const before = exportIfc(p, EMPTY, { timestamp: TS });
    p.elements['g_viga'] = cube('g_viga', 'lv_0', 0);
    const withOne = exportIfc(p, EMPTY, { timestamp: TS });
    delete p.elements['g_viga'];
    const restored = exportIfc(p, EMPTY, { timestamp: TS });

    expect(restored).toBe(before);
    expect(count(before, 'IFCBUILDINGELEMENTPROXY')).toBe(0);
    expect(entityCount(restored)).toBe(entityCount(before));
    expect(entityCount(withOne)).toBeGreaterThan(entityCount(before));
  });
});
