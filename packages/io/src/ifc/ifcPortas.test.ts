import { describe, expect, it } from 'vitest';
import { BIBLIOTECA_MEP, createEmptyProject, type Component, type Familia, type Project } from '@hestia/model';
import { exportIfc } from './ifcExport.ts';
import { chaveDaPorta } from './ifcPortas.ts';
import type { IfcGeometry } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';
const EMPTY: IfcGeometry = { walls: [], openings: [], floors: [], slabs: [], roofs: [], stairs: [] };

/** Família da biblioteca MEP pelo id; cópia, para cada teste poder mudá-la. */
function familiaMep(id: string): Familia {
  const f = BIBLIOTECA_MEP.find((x) => x.id === id);
  if (!f) throw new Error(`Família ${id} não está na biblioteca MEP.`);
  return structuredClone(f);
}

/** Instância de família MEP no nível `lv_0`. */
function instancia(id: string, familyId: string, extra: Partial<Component> = {}): Component {
  return { id, kind: 'component', familyId, typeId: null, levelId: 'lv_0', order: 1, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: id, ...extra };
}

function projeto(familias: Familia[], ...components: Component[]): Project {
  const p = createEmptyProject('Portas');
  p.componentFamilies = Object.fromEntries(familias.map((f) => [f.id, f]));
  for (const comp of components) p.elements[comp.id] = comp;
  return p;
}

const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;

describe('ifcPortas: chave da porta', () => {
  it('separa componente e ligação com "|"', () => {
    expect(chaveDaPorta('t1', 'a')).toBe('t1|a');
  });
});

describe('ifcPortas: portas de ligação', () => {
  it('fluxo de entrada vira FlowDirection SINK e a porta carrega o diâmetro em mm', () => {
    const tubo = familiaMep('fam_tubo_esgoto');
    tubo.ligacoes = tubo.ligacoes?.map((l) => (l.id === 'a' ? { ...l, fluxo: 'entrada' as const } : l));
    const text = exportIfc(projeto([tubo], instancia('t1', tubo.id)), EMPTY, { timestamp: TS });
    expect(count(text, 'IFCDISTRIBUTIONPORT')).toBe(2);
    expect(text).toMatch(/=IFCDISTRIBUTIONPORT\(.*\.SINK\..*\.SEWAGE\.\);/);
    expect(text).toMatch(/IFCPROPERTYSINGLEVALUE\('Diametro',\$,IFC(REAL|INTEGER)\(/);
  });

  it('o produto com ligações ganha Pset_HestiaFamilia com categoria, número de portas e de conexões', () => {
    const t1 = instancia('t1', 'fam_tubo_esgoto', { ligacoes: { b: { componenteId: 'k1', ligacaoId: 'a' } } });
    const k1 = instancia('k1', 'fam_esgoto_curva90', { ligacoes: { a: { componenteId: 't1', ligacaoId: 'b' } } });
    const text = exportIfc(projeto([familiaMep('fam_tubo_esgoto'), familiaMep('fam_esgoto_curva90')], t1, k1), EMPTY, { timestamp: TS });
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Categoria',$,IFCLABEL('tubulacao'),$)");
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Conexoes',$,IFCINTEGER(1),$)");
    expect(text).toContain("IFCPROPERTYSINGLEVALUE('Ligacoes',$,IFCINTEGER(2),$)");
  });

  it('família sem ligações não ganha porta nem Pset_HestiaFamilia no produto', () => {
    const tubo = familiaMep('fam_tubo_esgoto');
    delete tubo.ligacoes;
    const text = exportIfc(projeto([tubo], instancia('t1', tubo.id)), EMPTY, { timestamp: TS });
    expect(count(text, 'IFCDISTRIBUTIONPORT')).toBe(0);
    expect(count(text, 'IFCRELCONNECTSPORTTOELEMENT')).toBe(0);
    expect(text).not.toContain('Pset_HestiaFamilia');
  });
});
