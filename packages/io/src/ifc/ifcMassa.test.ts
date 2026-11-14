import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeMass, type Mass, type Project } from '@hestia/model';
import { exportIfc } from './ifcExport.ts';
import { importIfc } from '../ifcImport/index.ts';
import type { IfcGeometry, IfcMassaGeo } from './ifcTypes.ts';

const TS = '2026-01-01T00:00:00';
const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const VAZIA: IfcGeometry = { walls: [], openings: [], floors: [], slabs: [], roofs: [], stairs: [] };

/** Caixa fechada `dx` × `dy` × `dz` com 8 vértices e 12 triângulos, normais para fora (a malha de uma extrusão simples). */
function caixa(dx: number, dy: number, dz: number, x0 = 0): IfcMassaGeo['mesh'] {
  const v = [
    [0, 0, 0], [dx, 0, 0], [dx, dy, 0], [0, dy, 0],
    [0, 0, dz], [dx, 0, dz], [dx, dy, dz], [0, dy, dz],
  ];
  return {
    positions: v.flatMap(([x, y, z]) => [x! + x0, y!, z!]),
    indices: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7],
  };
}

function projetoCom(...massas: Mass[]): Project {
  const s = new ProjectStore(createEmptyProject('Massa IFC'));
  for (const m of massas) s.exec({ type: 'addMass', mass: m });
  return s.project;
}

const massa = (id: string, name: string): Mass => ({
  ...makeMass({
    id,
    levelId: 'lv_0',
    name,
    secoes: [
      { z: 0, perfil: { forma: 'poligono', lados: 4, raio: 1 }, rotacao: 0, escala: 1, dx: 0, dy: 0 },
      { z: 3, perfil: { forma: 'poligono', lados: 4, raio: 1 }, rotacao: 0, escala: 1, dx: 0, dy: 0 },
    ],
  }),
  order: 0,
});

describe('exportIfc: massa conceitual (ficha X1)', () => {
  it('cada massa com malha sai como um IFCBUILDINGELEMENTPROXY no pavimento, com o nome em Name e a malha em IFCTRIANGULATEDFACESET', () => {
    const p = projetoCom(massa('ma', 'Torre A'), massa('mb', 'Torre B'));
    const geo: IfcGeometry = { ...VAZIA, masses: [{ massaId: 'ma', mesh: caixa(2, 3, 9), copias: 1 }, { massaId: 'mb', mesh: caixa(1, 1, 1, 10), copias: 12 }] };
    const avisos: string[] = [];
    const text = exportIfc(p, geo, { timestamp: TS, avisos });
    expect(avisos).toEqual([]);
    expect(count(text, 'IFCBUILDINGELEMENTPROXY')).toBe(2);
    expect(count(text, 'IFCTRIANGULATEDFACESET')).toBe(2);
    expect(text).toMatch(/=IFCBUILDINGELEMENTPROXY\('[^']+',\$,'Torre A',\$,'MASSA',#\d+,#\d+,\$,\.ELEMENT\.\);/);
    expect(text).toContain("'Torre B'");
    expect(count(text, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')).toBe(1);
  });

  it('o pset Pset_Hestia_Massa leva seções, cópias e as quantidades do kernel quando existem', () => {
    const p = projetoCom(massa('ma', 'Torre A'));
    const quantidades = { volume: 18, areaLateral: 36, areaBase: 6, areaTopo: 6, altura: 3 };
    const text = exportIfc(p, { ...VAZIA, masses: [{ massaId: 'ma', mesh: caixa(2, 3, 3), copias: 1, quantidades }] }, { timestamp: TS });
    expect(text).toContain("'Pset_Hestia_Massa'");
    expect(text).toContain("'Volume',$,IFCINTEGER(18)");
    expect(text).toContain("'Altura'");
    expect(text).toContain("'Volume'");
    const semQuant = exportIfc(p, { ...VAZIA, masses: [{ massaId: 'ma', mesh: caixa(2, 3, 3), copias: 1 }] }, { timestamp: TS });
    expect(semQuant).toContain("'Copias'");
    expect(semQuant).not.toContain("'Volume'");
  });

  it('o produto da massa ganha o Pset_Hestia_Element (o registro nativo viaja no arquivo)', () => {
    const p = projetoCom(massa('ma', 'Torre A'));
    const text = exportIfc(p, { ...VAZIA, masses: [{ massaId: 'ma', mesh: caixa(2, 3, 3), copias: 1 }] }, { timestamp: TS });
    expect(text).toContain("'HestiaKind',$,IFCLABEL('mass')");
    expect(text).toContain("'HestiaId',$,IFCLABEL('ma')");
  });

  it('sem geometria do kernel a massa não sai e o aviso aparece, por massa e no idioma pedido; não lança', () => {
    const p = projetoCom(massa('ma', 'Torre A'), massa('mb', 'Torre B'));
    const pt: string[] = [];
    const text = exportIfc(p, VAZIA, { timestamp: TS, avisos: pt });
    expect(count(text, 'IFCBUILDINGELEMENTPROXY')).toBe(0);
    expect(text).not.toContain('Pset_Hestia_Massa');
    expect(pt).toHaveLength(2);
    expect(pt[0]).toContain('Torre A');
    const en: string[] = [];
    exportIfc(p, VAZIA, { timestamp: TS, avisos: en, lang: 'en' });
    expect(en[0]).toContain('no kernel geometry');
  });

  it('massa que o kernel não devolve (só a outra veio) sai sem a que falta e avisa só dela', () => {
    const p = projetoCom(massa('ma', 'Torre A'), massa('mb', 'Torre B'));
    const avisos: string[] = [];
    const text = exportIfc(p, { ...VAZIA, masses: [{ massaId: 'ma', mesh: caixa(2, 3, 3), copias: 1 }] }, { timestamp: TS, avisos });
    expect(count(text, 'IFCBUILDINGELEMENTPROXY')).toBe(1);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('Torre B');
  });

  it('malha vazia ou inválida não gera produto sem forma: a massa conta como sem geometria', () => {
    const p = projetoCom(massa('ma', 'Torre A'));
    const avisos: string[] = [];
    const text = exportIfc(p, { ...VAZIA, masses: [{ massaId: 'ma', mesh: { positions: [], indices: [] }, copias: 1 }] }, { timestamp: TS, avisos });
    expect(count(text, 'IFCBUILDINGELEMENTPROXY')).toBe(0);
    expect(avisos).toHaveLength(1);
  });

  it('é determinístico e sem referência solta', () => {
    const p = projetoCom(massa('ma', 'Torre A'));
    const geo: IfcGeometry = { ...VAZIA, masses: [{ massaId: 'ma', mesh: caixa(2, 3, 3), copias: 1 }] };
    const a = exportIfc(p, geo, { timestamp: TS });
    expect(exportIfc(p, geo, { timestamp: TS })).toBe(a);
    const definidos = new Set([...a.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1])));
    expect([...a.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((id) => !definidos.has(id))).toEqual([]);
  });

  it('ida e volta: o arquivo com a massa reimporta sem erro e a massa volta como objeto genérico com a malha (o importador não conhece o kind `mass`)', () => {
    const p = projetoCom(massa('ma', 'Torre A'));
    const text = exportIfc(p, { ...VAZIA, masses: [{ massaId: 'ma', mesh: caixa(2, 3, 9), copias: 1 }] }, { timestamp: TS });
    const { project } = importIfc(text);
    const volta = Object.values(project.elements).filter((e) => e.kind === 'generic' || e.kind === 'mass');
    expect(volta).toHaveLength(1);
    expect(volta[0]!.kind).toBe('generic');
    expect((volta[0] as { mesh: { positions: number[] } }).mesh.positions.length).toBeGreaterThanOrEqual(24);
  });
});
