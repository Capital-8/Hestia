import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeMass, type Mass, type Project } from '@hestia/model';
import type { MalhaMassaProjeto, QuantMassaProjeto } from '@hestia/engine';
import { ifcGeometryOf, projectIfcComAvisos } from './ifcExport.ts';
import { massesOf, type FonteMassaIfc } from './ifcExportMassa.ts';

const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const NOW = new Date('2026-10-22T12:00:00Z');

const massa = (id: string): Mass => ({
  ...makeMass({
    id,
    levelId: 'lv_0',
    name: `Massa ${id}`,
    secoes: [
      { z: 0, perfil: { forma: 'circulo', raio: 1 }, rotacao: 0, escala: 1, dx: 0, dy: 0 },
      { z: 3, perfil: { forma: 'circulo', raio: 1 }, rotacao: 0, escala: 1, dx: 0, dy: 0 },
    ],
  }),
  order: 0,
});

function projetoCom(...ids: string[]): Project {
  const s = new ProjectStore(createEmptyProject('Massa'));
  for (const id of ids) s.exec({ type: 'addMass', mass: massa(id) });
  return s.project;
}

/** Malha simulada do kernel: uma pirâmide por massa, a da massa `b` em duas cópias (cascas), com vértices compartilhados entre os grupos do projeto. */
function malhaSimulada(): MalhaMassaProjeto {
  const piramide = (x: number): number[] => [x, 0, 0, x + 1, 0, 0, x, 1, 0, x, 0, 1];
  const vertices = Float64Array.from([...piramide(0), ...piramide(5), ...piramide(10)]);
  const tri = (o: number): number[] => [o, o + 2, o + 1, o, o + 1, o + 3, o + 1, o + 2, o + 3, o, o + 3, o + 2];
  const indices = Uint32Array.from([...tri(0), ...tri(4), ...tri(8)]);
  return {
    vertices,
    indices,
    grupos: [
      { massaId: 'a', copia: 0, papel: 0, primeiro: 0, n: 12 },
      { massaId: 'b', copia: 0, papel: 0, primeiro: 12, n: 12 },
      { massaId: 'b', copia: 1, papel: 0, primeiro: 24, n: 12 },
    ],
  };
}

const quant = (massaId: string, volume: number): QuantMassaProjeto => ({ massaId, volume, areaLateral: 1, areaBase: 2, areaTopo: 3, altura: 4 });

const fonte = (over: Partial<FonteMassaIfc> = {}): FonteMassaIfc => ({
  pronto: () => true,
  malha: () => malhaSimulada(),
  quantidades: () => [quant('a', 1), quant('b', 2)],
  ...over,
});

describe('massesOf: massas do projeto para o IFC (serviço simulado)', () => {
  it('uma entrada por massa, só com os vértices dela e as cascas das cópias juntas na mesma malha', () => {
    const r = massesOf(projetoCom('a', 'b'), fonte())!;
    expect(r.map((g) => g.massaId)).toEqual(['a', 'b']);
    const [a, b] = [r[0]!, r[1]!];
    expect(a.mesh.positions).toHaveLength(12);
    expect(a.mesh.indices).toHaveLength(12);
    expect(a.copias).toBe(1);
    // `b` tem duas cópias: duas cascas na mesma malha, índices renumerados a partir de 0.
    expect(b.copias).toBe(2);
    expect(b.mesh.indices).toHaveLength(24);
    expect(Math.max(...b.mesh.indices)).toBe(b.mesh.positions.length / 3 - 1);
    expect(b.mesh.positions.slice(0, 3)).toEqual([5, 0, 0]);
  });

  it('as quantidades do motor acompanham a massa', () => {
    const r = massesOf(projetoCom('a', 'b'), fonte())!;
    expect(r[1]!.quantidades).toEqual({ volume: 2, areaLateral: 1, areaBase: 2, areaTopo: 3, altura: 4 });
    expect(massesOf(projetoCom('a'), fonte({ quantidades: () => null }))![0]!.quantidades).toBeUndefined();
  });

  it('a malha é pedida em lod 2, de todos os níveis', () => {
    const pedidos: Array<[unknown, unknown]> = [];
    massesOf(projetoCom('a'), fonte({ malha: (_p, nivel, lod) => (pedidos.push([nivel, lod]), malhaSimulada()) }));
    expect(pedidos).toEqual([[null, 2]]);
  });

  it('sem massa, sem kernel pronto ou com erro dele: undefined, sem lançar', () => {
    expect(massesOf(createEmptyProject('Vazio'), fonte())).toBeUndefined();
    expect(massesOf(projetoCom('a'), fonte({ pronto: () => false }))).toBeUndefined();
    expect(massesOf(projetoCom('a'), fonte({ malha: () => null }))).toBeUndefined();
  });
});

describe('exportação IFC da massa sem kernel (web)', () => {
  it('a massa fica de fora da geometria, o texto sai sem proxy e há um aviso por massa', () => {
    const p = projetoCom('a', 'b');
    expect(ifcGeometryOf(p).masses).toBeUndefined();
    const { texto, avisos } = projectIfcComAvisos(p, NOW, 'pt');
    expect(count(texto, 'IFCBUILDINGELEMENTPROXY')).toBe(0);
    expect(avisos).toHaveLength(2);
    expect(projectIfcComAvisos(p, NOW, 'en').avisos[0]).toContain('no kernel geometry');
  });

  it('projeto sem massa não ganha aviso nem proxy', () => {
    const { texto, avisos } = projectIfcComAvisos(createEmptyProject('Vazio'), NOW, 'pt');
    expect(avisos).toEqual([]);
    expect(count(texto, 'IFCBUILDINGELEMENTPROXY')).toBe(0);
  });
});
