import { describe, expect, it } from 'vitest';
import fzkHaus from '../../../../tests/ifc/fixtures/fzk-haus.ifc?raw';
import { importIfc } from './index.ts';
import { isGeneric } from '@hestia/model';

describe('objetos importados (elemento genérico)', () => {
  const { project, report } = importIfc(fzkHaus);

  it('vigas, pilares, escada (sem lance reto) e mobiliário entram como genérico, com a classe IFC de origem', () => {
    const generics = Object.values(project.elements).filter(isGeneric);
    expect(generics.length).toBeGreaterThan(50);
    const classes = new Set(generics.map((g) => g.sourceClass));
    expect(classes.has('IFCBEAM')).toBe(true);
    // Corrimãos retos de piso a topo (HANDRAIL horizontal) viram guarda-corpo nativo (guardaCorpoImport.ts).
    expect(classes.has('IFCRAILING')).toBe(false);
    expect(report.imported['guarda-corpos']).toBeGreaterThan(0);
    expect(report.generic.IFCBEAM).toBeGreaterThan(0);
  });

  it('cada genérico tem malha triangular finita e contorno em planta', () => {
    for (const g of Object.values(project.elements).filter(isGeneric)) {
      expect(g.mesh.positions.length).toBeGreaterThan(0);
      expect(g.mesh.positions.length % 3).toBe(0);
      expect(g.mesh.indices.length % 3).toBe(0);
      expect(g.mesh.positions.every((n) => Number.isFinite(n))).toBe(true);
      expect(g.outline?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it('o genérico tem nível e id determinístico, e não entra em skipped', () => {
    const g = Object.values(project.elements).find(isGeneric)!;
    expect(project.levels.some((l) => l.id === g.levelId)).toBe(true);
    expect(g.id.startsWith('g_')).toBe(true);
    expect(report.skipped.IFCBEAM ?? 0).toBe(0);
  });

  it('a cor do IFC vira material do projeto (im_<hex>) para pintar o 3D', () => {
    const colored = Object.values(project.elements).filter(isGeneric).filter((g) => g.color);
    expect(colored.length).toBeGreaterThan(0);
    for (const g of colored.slice(0, 10)) {
      const id = `im_${g.color!.replace('#', '').toLowerCase()}`;
      expect(project.materials[id]?.color).toBe(g.color);
    }
  });
});
