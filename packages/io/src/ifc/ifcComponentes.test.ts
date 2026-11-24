import { describe, expect, it } from 'vitest';
import { createEmptyProject, FAMILIA_ARMARIO, type Component, type Project } from '@hestia/model';
import { resolverComponente } from '@hestia/engine';
import { exportIfc } from './ifcExport.ts';
import { ifcGuid } from './ifcGuid.ts';
import type { IfcGeometry } from './ifcTypes.ts';
import { BIBLIOTECA_MEP, type Familia } from '@hestia/model';

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

/** Todo `#n` referenciado tem de existir como entidade definida (texto entre aspas não conta: uma cor `#222426` não é referência). */
function danglingRefs(text: string): number[] {
  const defined = new Set([...text.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1])));
  const semTextos = text.replace(/'(?:[^']|'')*'/g, "''");
  return [...semTextos.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((id) => !defined.has(id));
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

/*
 * Ficha E2: classe por categoria, portas de ligação e malha dos corpos. Famílias antigas (sem corpos nem ligações, categoria de
 * marcenaria) seguem idênticas; a comparação byte a byte com o texto anterior foi feita sobre a biblioteca inteira.
 */

/** Família da biblioteca MEP (tubulação e conexões de esgoto) pelo id. */
function familiaMep(id: string): Familia {
  const f = BIBLIOTECA_MEP.find((x) => x.id === id);
  if (!f) throw new Error(`Família ${id} não está na biblioteca MEP.`);
  return structuredClone(f);
}

/** Projeto com as famílias dadas (biblioteca do projeto) e as instâncias. */
function projetoComFamilias(familias: Familia[], ...components: Component[]): Project {
  const p = createEmptyProject('Portas');
  p.componentFamilies = Object.fromEntries(familias.map((f) => [f.id, f]));
  for (const comp of components) p.elements[comp.id] = comp;
  return p;
}

/** Instância de família MEP no nível `lv_0`, com o tipo padrão da família. */
function instanciaMep(id: string, familyId: string, extra: Partial<Component> = {}): Component {
  return { id, kind: 'component', familyId, typeId: null, levelId: 'lv_0', order: 1, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id, ...extra };
}

describe('exportIfc: classe por categoria, portas e corpos (ficha E2)', () => {
  it('tubo de esgoto sai como IFCPIPESEGMENT com duas portas, cada uma ligada ao produto', () => {
    const text = exportIfc(projetoComFamilias([familiaMep('fam_tubo_esgoto')], instanciaMep('t1', 'fam_tubo_esgoto')), EMPTY, { timestamp: TS });
    expect(count(text, 'IFCPIPESEGMENT')).toBe(1);
    expect(count(text, 'IFCFURNITURE')).toBe(0);
    expect(count(text, 'IFCDISTRIBUTIONPORT')).toBe(2);
    expect(count(text, 'IFCRELCONNECTSPORTTOELEMENT')).toBe(2);
    expect(count(text, 'IFCRELCONNECTSPORTS')).toBe(0);
    expect(text).toContain('.SOURCEANDSINK.');
    expect(text).toContain('.SEWAGE.');
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Dominio',$,IFCLABEL('esgoto'),$)");
    expect(danglingRefs(text)).toEqual([]);
  });

  it('curva de 90° sai como IFCPIPEFITTING com PredefinedType BEND', () => {
    const text = exportIfc(projetoComFamilias([familiaMep('fam_esgoto_curva90')], instanciaMep('k1', 'fam_esgoto_curva90')), EMPTY, { timestamp: TS });
    expect(count(text, 'IFCPIPEFITTING')).toBe(1);
    expect(text).toMatch(/=IFCPIPEFITTING\(.*,\.BEND\.\);/);
    expect(count(text, 'IFCDISTRIBUTIONPORT')).toBe(2);
    expect(danglingRefs(text)).toEqual([]);
  });

  it('par conectado gera uma única IFCRELCONNECTSPORTS, mesmo com a conexão escrita nos dois lados', () => {
    const t1 = instanciaMep('t1', 'fam_tubo_esgoto', { ligacoes: { b: { componenteId: 'k1', ligacaoId: 'a' } } });
    const k1 = instanciaMep('k1', 'fam_esgoto_curva90', { ligacoes: { a: { componenteId: 't1', ligacaoId: 'b' } } });
    const familias = [familiaMep('fam_tubo_esgoto'), familiaMep('fam_esgoto_curva90')];
    const text = exportIfc(projetoComFamilias(familias, t1, k1), EMPTY, { timestamp: TS });
    expect(count(text, 'IFCRELCONNECTSPORTS')).toBe(1);
    expect(count(text, 'IFCDISTRIBUTIONPORT')).toBe(4);
    expect(danglingRefs(text)).toEqual([]);
  });

  it('conexão com instância sem pavimento não gera relação', () => {
    const t1 = instanciaMep('t1', 'fam_tubo_esgoto', { ligacoes: { b: { componenteId: 'k1', ligacaoId: 'a' } } });
    const k1 = instanciaMep('k1', 'fam_esgoto_curva90', { levelId: 'lv_fora', ligacoes: { a: { componenteId: 't1', ligacaoId: 'b' } } });
    const text = exportIfc(projetoComFamilias([familiaMep('fam_tubo_esgoto'), familiaMep('fam_esgoto_curva90')], t1, k1), EMPTY, { timestamp: TS });
    expect(count(text, 'IFCRELCONNECTSPORTS')).toBe(0);
    expect(count(text, 'IFCPIPEFITTING')).toBe(0);
    expect(danglingRefs(text)).toEqual([]);
  });

  it('categoria decide a classe: louça sai como IFCSANITARYTERMINAL, marcenaria segue IFCFURNITURE', () => {
    const louca: Familia = { ...structuredClone(FAMILIA_ARMARIO), categoria: 'loucas' };
    const text = exportIfc(projetoComFamilias([louca], component('c1', 'lv_0', { familyId: louca.id })), EMPTY, { timestamp: TS });
    expect(count(text, 'IFCSANITARYTERMINAL')).toBe(1);
    expect(count(text, 'IFCFURNITURE')).toBe(0);
    const armario = exportIfc(projetoComFamilias([FAMILIA_ARMARIO], component('c1', 'lv_0')), EMPTY, { timestamp: TS });
    expect(count(armario, 'IFCFURNITURE')).toBe(1);
    expect(armario).not.toContain('Pset_HestiaFamilia');
  });

  it('PredefinedType vem de Familia.ifc só quando é um enum IFC; texto livre sai omitido', () => {
    const armario: Familia = { ...structuredClone(FAMILIA_ARMARIO), ifc: { classe: 'IFCFURNITURE', tipoPredefinido: 'livre com espaço' } };
    const text = exportIfc(projetoComFamilias([armario], component('c1', 'lv_0')), EMPTY, { timestamp: TS });
    expect(text).not.toMatch(/IFCFURNITURE\(.*\.\);/);
    expect(danglingRefs(text)).toEqual([]);
  });

  it('a malha dos corpos entra no IFCTRIANGULATEDFACESET do produto', () => {
    const text = exportIfc(projetoComFamilias([familiaMep('fam_tubo_esgoto')], instanciaMep('t1', 'fam_tubo_esgoto')), EMPTY, { timestamp: TS });
    expect(count(text, 'IFCTRIANGULATEDFACESET')).toBe(1);
    expect(text).toMatch(/IFCPIPESEGMENT\(.*#\d+,#\d+,.*\);/);
  });
});
