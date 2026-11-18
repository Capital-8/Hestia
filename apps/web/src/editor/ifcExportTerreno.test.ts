import { describe, expect, it } from 'vitest';
import { projetoTerreno, type MalhaTerreno } from '@hestia/engine';
import { createEmptyProject } from '@hestia/model';
import { ifcGeometryOf, projectIfcComAvisos } from './ifcExport.ts';
import { terrenosOf } from './ifcExportTerreno.ts';

const count = (text: string, type: string): number => (text.match(new RegExp(`=${type}\\(`, 'g')) ?? []).length;
const NOW = new Date('2026-10-22T12:00:00Z');

/** Malha simulada de T5: superfície (base), superfície da região (offset de índices), saia e base (que não podem sair). */
const malhaT5 = (): MalhaTerreno[] => [
  {
    terrenoId: 'tn_t5',
    partes: [
      { regiaoId: null, papel: 'superficie', positions: [0, 0, 10, 20, 0, 10, 20, 20, 10], indices: [0, 1, 2] },
      { regiaoId: 'rg_t5', papel: 'superficie', positions: [5, 5, 8, 15, 5, 8, 15, 15, 8], indices: [0, 1, 2] },
      { regiaoId: null, papel: 'saia', positions: [0, 0, 10, 0, 0, 5, 20, 0, 5], indices: [0, 1, 2] },
      { regiaoId: null, papel: 'base', positions: [0, 0, 5, 20, 0, 5, 20, 20, 5], indices: [0, 1, 2] },
    ],
  },
];

describe('terrenosOf (malha do kernel para o IFC)', () => {
  it('junta só as partes de superfície e desloca os índices; saia e base ficam de fora', () => {
    const r = terrenosOf(projetoTerreno('T5'), { malha: () => malhaT5() })!;
    expect(r).toHaveLength(1);
    expect(r[0]!.terrenoId).toBe('tn_t5');
    expect(r[0]!.mesh.positions).toHaveLength(18);
    expect(r[0]!.mesh.indices).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Math.min(...r[0]!.mesh.positions.filter((_, i) => i % 3 === 2))).toBe(8);
  });

  it('pede a superfície proposta (1) de todos os níveis', () => {
    const chamadas: unknown[][] = [];
    terrenosOf(projetoTerreno('T1'), { malha: (...a: unknown[]) => (chamadas.push(a), []) as never });
    expect(chamadas[0]!.slice(1)).toEqual([1, null]);
  });

  it('sem terreno no projeto ou sem kernel: undefined', () => {
    expect(terrenosOf(createEmptyProject(), { malha: () => malhaT5() })).toBeUndefined();
    expect(terrenosOf(projetoTerreno('T1'), { malha: () => null })).toBeUndefined();
  });
});

describe('exportação IFC do terreno sem kernel (web)', () => {
  it('o terreno não sai, há um aviso, e a exportação não falha', () => {
    const p = projetoTerreno('T5');
    expect(ifcGeometryOf(p).terrenos).toBeUndefined();
    const { texto, avisos } = projectIfcComAvisos(p, NOW, 'pt');
    expect(count(texto, 'IFCGEOGRAPHICELEMENT')).toBe(0);
    expect(count(texto, 'IFCSITE')).toBe(1);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toContain('T5');
  });

  it('projeto sem terreno: nenhum aviso', () => {
    expect(projectIfcComAvisos(createEmptyProject(), NOW, 'pt').avisos).toEqual([]);
  });
});
