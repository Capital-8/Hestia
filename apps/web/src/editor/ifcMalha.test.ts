import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall } from '@hestia/model';
import { desempacotarProjetoIfc, empacotarProjetoIfc } from './ifcMalha.ts';

/** Projeto mínimo com uma parede e um genérico de malha, para conferir o transporte dos buffers. */
function projeto() {
  const p = createEmptyProject();
  p.elements = {
    w1: { ...makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: p.levels[0]!.id, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), order: 1 },
    g1: {
      id: 'g1',
      kind: 'generic',
      levelId: p.levels[0]!.id,
      name: 'Viga',
      sourceClass: 'IFCBEAM',
      mesh: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] },
      order: 2,
    },
    g2: {
      id: 'g2',
      kind: 'generic',
      levelId: p.levels[0]!.id,
      name: 'Pilar',
      sourceClass: 'IFCCOLUMN',
      mesh: { positions: [2, 0, 0, 2, 0, 1, 2, 1, 0], indices: [0, 2, 1] },
      order: 3,
    },
  };
  return p;
}

describe('transporte das malhas entre o worker e a janela', () => {
  it('ida e volta devolve o mesmo projeto', () => {
    const original = projeto();
    const empacotado = empacotarProjetoIfc(original);
    expect(empacotado.posicoes).toBeInstanceOf(Float64Array);
    expect(empacotado.posicoes).toHaveLength(18);
    expect(empacotado.indices).toHaveLength(6);
    expect(desempacotarProjetoIfc(empacotado)).toEqual(original);
  });

  it('elementos sem malha atravessam sem alteração', () => {
    const original = projeto();
    const volta = desempacotarProjetoIfc(empacotarProjetoIfc(original));
    expect(volta.elements.w1).toBe(original.elements.w1);
  });

  it('as faixas de cada malha não se misturam', () => {
    const volta = desempacotarProjetoIfc(empacotarProjetoIfc(projeto()));
    const g1 = volta.elements.g1 as { mesh: { positions: number[]; indices: number[] } };
    const g2 = volta.elements.g2 as { mesh: { positions: number[]; indices: number[] } };
    expect(g1.mesh.positions).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(g1.mesh.indices).toEqual([0, 1, 2]);
    expect(g2.mesh.positions).toEqual([2, 0, 0, 2, 0, 1, 2, 1, 0]);
    expect(g2.mesh.indices).toEqual([0, 2, 1]);
  });
});
