import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeTerrain, type Project } from '@hestia/model';
import { exportIfc } from './ifcExport.ts';
import type { IfcGeometry, IfcTerrenoGeo } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';
const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const linha = (text: string, type: string): string => text.split('\n').find((l) => l.includes(`=${type}(`)) ?? '';

/** Projeto vazio com um terreno `tn1` (nome "Lote real"); o conteúdo da malha vem do `IfcGeometry`. */
function projeto(localizacao?: Project['localizacao']): Project {
  const base = createEmptyProject('Teste');
  const tn = { ...makeTerrain({ id: 'tn1', levelId: 'lv_0', name: 'Lote real' }), order: 1 };
  return { ...base, ...(localizacao ? { localizacao } : {}), elements: { ...base.elements, tn1: tn } };
}

/** Duas faces triangulares do quadrado 20 x 20 a 10 m (a superfície proposta do terreno). */
const malha = (): IfcTerrenoGeo => ({
  terrenoId: 'tn1',
  mesh: { positions: [0, 0, 10, 20, 0, 10, 20, 20, 10, 0, 20, 10], indices: [0, 1, 2, 0, 2, 3] },
});
const geo = (terrenos?: IfcTerrenoGeo[]): IfcGeometry => ({ walls: [], openings: [], floors: [], slabs: [], roofs: [], stairs: [], ...(terrenos ? { terrenos } : {}) });

describe('exportIfc: terreno', () => {
  it('sai um IFCGEOGRAPHICELEMENT TERRAIN com a malha, contido no IFCSITE', () => {
    const avisos: string[] = [];
    const texto = exportIfc(projeto(), geo([malha()]), { timestamp: TS, avisos });
    expect(avisos).toEqual([]);
    expect(count(texto, 'IFCGEOGRAPHICELEMENT')).toBe(1);
    expect(linha(texto, 'IFCGEOGRAPHICELEMENT')).toContain('.TERRAIN.');
    expect(linha(texto, 'IFCGEOGRAPHICELEMENT')).toContain("'Lote real'");
    expect(count(texto, 'IFCTRIANGULATEDFACESET')).toBe(1);
    expect(linha(texto, 'IFCCARTESIANPOINTLIST3D')).toContain('(20.000000,20.000000,10.000000)');
    const idSite = /^#(\d+)=IFCSITE\(/m.exec(texto)![1]!;
    const idTerreno = /^#(\d+)=IFCGEOGRAPHICELEMENT\(/m.exec(texto)![1]!;
    const rel = texto.split('\n').find((l) => l.includes('IFCRELCONTAINEDINSPATIALSTRUCTURE') && l.includes(`#${idTerreno}`)) ?? '';
    expect(rel).toMatch(new RegExp(`#${idSite}\\);?$`));
  });

  it('é determinístico', () => {
    expect(exportIfc(projeto(), geo([malha()]), { timestamp: TS })).toBe(exportIfc(projeto(), geo([malha()]), { timestamp: TS }));
  });

  it('sem a malha do kernel o terreno não sai, avisa no idioma pedido e a exportação não falha', () => {
    const pt: string[] = [];
    const texto = exportIfc(projeto(), geo(), { timestamp: TS, avisos: pt });
    expect(count(texto, 'IFCGEOGRAPHICELEMENT')).toBe(0);
    expect(count(texto, 'IFCSITE')).toBe(1);
    expect(pt).toHaveLength(1);
    expect(pt[0]).toContain('Lote real');
    const en: string[] = [];
    exportIfc(projeto(), geo(), { timestamp: TS, lang: 'en', avisos: en });
    expect(en[0]).toContain('kernel mesh');
  });

  it('malha vazia ou sem o terreno na lista também só avisa', () => {
    const avisos: string[] = [];
    const vazia: IfcTerrenoGeo = { terrenoId: 'tn1', mesh: { positions: [], indices: [] } };
    expect(count(exportIfc(projeto(), geo([vazia]), { timestamp: TS, avisos }), 'IFCGEOGRAPHICELEMENT')).toBe(0);
    expect(avisos).toHaveLength(1);
  });

  it('projeto sem terreno: nada de terreno nem aviso', () => {
    const avisos: string[] = [];
    const texto = exportIfc(createEmptyProject('Vazio'), geo([]), { timestamp: TS, avisos });
    expect(count(texto, 'IFCGEOGRAPHICELEMENT')).toBe(0);
    expect(avisos).toEqual([]);
  });

  it('RefElevation do IFCSITE = cotaZero da localização; sem localização fica omitida', () => {
    const com = exportIfc(projeto({ origemE: 100, origemN: 200, cotaZero: 742.5, norteVerdadeiro: 0 }), geo([malha()]), { timestamp: TS });
    expect(linha(com, 'IFCSITE')).toMatch(/\.ELEMENT\.,\$,\$,742\.5\d*,\$,\$\);?$/);
    const sem = exportIfc(projeto(), geo([malha()]), { timestamp: TS });
    expect(linha(sem, 'IFCSITE')).toMatch(/\.ELEMENT\.,\$,\$,\$,\$,\$\);?$/);
  });
});
