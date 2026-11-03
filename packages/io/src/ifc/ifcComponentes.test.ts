import { describe, expect, it } from 'vitest';
import { createEmptyProject, FAMILIA_ARMARIO, type Component, type Project } from '@hestia/model';
import { resolverComponente } from '@hestia/engine';
import { exportIfc } from './ifcExport.ts';
import { ifcGuid } from './ifcGuid.ts';
import type { IfcGeometry } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';
const EMPTY: IfcGeometry = { walls: [], openings: [], floors: [], slabs: [], roofs: [], stairs: [] };

/** Componente mínimo: a família de exemplo do model e o tipo padrão A80. */
function component(id: string, levelId: string, extra: Partial<Component> = {}): Component {
  return {
    id,
    kind: 'component',
    familyId: FAMILIA_ARMARIO.id,
    typeId: 'A80',
    levelId,
    order: 1,
    x: 1,
    y: 2,
    z: 0,
    rotation: 0,
    mirrored: false,
    mark: 'M-01',
    ...extra,
  };
}

/** Projeto vazio (dois níveis: `lv_0` em 0 m e `lv_1` em 3 m) com a biblioteca e os componentes dados. */
function projectWith(...components: Component[]): Project {
  const p = createEmptyProject('Componentes');
  p.componentFamilies = { [FAMILIA_ARMARIO.id]: structuredClone(FAMILIA_ARMARIO) };
  for (const comp of components) p.elements[comp.id] = comp;
  return p;
}

const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const entityCount = (text: string): number => (text.match(/^#\d+=/gm) ?? []).length;

/** Todo `#n` referenciado tem de existir como entidade definida. */
function danglingRefs(text: string): number[] {
  const defined = new Set([...text.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1])));
  return [...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((id) => !defined.has(id));
}

describe('exportIfc: componente (IFCFURNITURE)', () => {
  const p = projectWith(component('c1', 'lv_0'));
  const text = exportIfc(p, EMPTY, { timestamp: TS });

  it('sai como IFCFURNITURE com ObjectType = família, Name com a marca e PredefinedType omitido', () => {
    expect(text).toContain('=IFCFURNITURE(');
    expect(count(text, 'IFCFURNITURE')).toBe(1);
    expect(text).toMatch(/IFCFURNITURE\('[^']*',\$,'[^']*',\$,'fam_armario_baixo',#\d+,#\d+,'M-01',\$\);/);
    expect(text).toContain('IFCTRIANGULATEDFACESET(');
    expect(text).toContain('IFCCARTESIANPOINTLIST3D(');
    expect(danglingRefs(text)).toEqual([]);
  });

  it('a malha sai em triplas 1-based e o componente fica contido no pavimento', () => {
    const index = /IFCTRIANGULATEDFACESET\(#\d+,\$,\$,(\(.*?\))\);/s.exec(text)?.[1] ?? '';
    expect(index.startsWith('((1,')).toBe(true);
    expect(index.includes('(0,')).toBe(false);
    expect(count(text, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')).toBe(1);
  });

  it('GlobalId derivado de `component:<id>` e determinístico entre duas chamadas', () => {
    expect(text).toContain(`'${ifcGuid('component:c1')}'`);
    const again = exportIfc(projectWith(component('c1', 'lv_0')), EMPTY, { timestamp: TS });
    expect(again).toBe(text);
  });

  it('property set Pset_Hestia_Componente com família, tipo, marca, medidas e peças', () => {
    expect(text).toContain("'Pset_Hestia_Componente'");
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Familia',$,IFCLABEL('fam_armario_baixo'),$)");
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Tipo',$,IFCLABEL('A80'),$)");
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Marca',$,IFCLABEL('M-01'),$)");
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Largura',");
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Altura',");
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Profundidade',");
    const pecas = resolverComponente(p, component('c1', 'lv_0')).pecas.filter((q) => !q.vazio).length;
    expect(text).toContain(`IFCPROPERTYSINGLEVALUE('Pecas',$,IFCINTEGER(${pecas}),$)`);
    expect(danglingRefs(text)).toEqual([]);
  });

  it('componente sem malha sai, sem representação', () => {
    const out = exportIfc(projectWith(component('c1', 'lv_0', { familyId: 'familia_ausente' })), EMPTY, { timestamp: TS });
    expect(out).toMatch(/IFCFURNITURE\('[^']*',\$,'[^']*',\$,'familia_ausente',#\d+,\$,/);
    expect(count(out, 'IFCTRIANGULATEDFACESET')).toBe(0);
    expect(danglingRefs(out)).toEqual([]);
  });

  it('componente de nível inexistente não sai', () => {
    const out = exportIfc(projectWith(component('c1', 'lv_fora')), EMPTY, { timestamp: TS });
    expect(count(out, 'IFCFURNITURE')).toBe(0);
  });
});

describe('exportIfc: projeto sem componente', () => {
  it('o texto não muda em relação à exportação atual (mesmas entidades e linhas)', () => {
    const p = createEmptyProject('Sem componente');
    const before = exportIfc(p, EMPTY, { timestamp: TS });
    p.componentFamilies = { [FAMILIA_ARMARIO.id]: structuredClone(FAMILIA_ARMARIO) };
    const withFamily = exportIfc(p, EMPTY, { timestamp: TS });
    p.elements.c1 = component('c1', 'lv_0');
    const withOne = exportIfc(p, EMPTY, { timestamp: TS });
    delete p.elements.c1;
    const restored = exportIfc(p, EMPTY, { timestamp: TS });

    expect(withFamily).toBe(before);
    expect(restored).toBe(before);
    expect(count(before, 'IFCFURNITURE')).toBe(0);
    expect(entityCount(restored)).toBe(entityCount(before));
    expect(entityCount(withOne)).toBeGreaterThan(entityCount(before));
  });
});
