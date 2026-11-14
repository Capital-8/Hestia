import { describe, expect, it } from 'vitest';
import type { Project, Wall } from '@hestia/model';
import { importIfc } from './index.ts';
import { ifcBoxes, ref, type TestBox } from './ifcTestKit.ts';

const paredes = (p: Project): Wall[] => Object.values(p.elements).filter((e): e is Wall => e.kind === 'wall');

const montante = (id: number, x: number): TestBox => ({ id, type: 'IFCMEMBER', name: 'M', x, y: 0, z: 0, dx: 0.05, dy: 0.1, dz: 3 });
const vidro = (id: number, x: number, w: number): TestBox => ({ id, type: 'IFCPLATE', name: 'Glazed', x, y: 0.045, z: 0.1, dx: w, dy: 0.01, dz: 2.8 });
/** Porta filha da cortina: caixa de x a x+w, do piso a 2,1 m (a célula vai até o topo, a porta cobre a célula inteira em z quando h = 3). */
const porta = (id: number, x: number, w: number, h = 3): TestBox => ({ id, type: 'IFCDOOR', name: 'Porta de vidro', x, y: 0.02, z: 0, dx: w, dy: 0.06, dz: h, tail: `${h},${w},$,$` });

/** Cortina sem geometria agregando as peças (ids 2..n). */
function cortina(boxes: TestBox[]): string {
  const extra = [
    "#8=IFCCURTAINWALL('00000000000000000000CW',$,'Fachada',$,$,#7,$,'CW1');",
    `#10=IFCRELAGGREGATES('000000000000000000REL1',$,$,$,#8,(${boxes.map((b) => ref(b.id)).join(',')}));`,
  ];
  return ifcBoxes(boxes, extra);
}

describe('portas e janelas filhas de IFCCURTAINWALL', () => {
  it('porta que ocupa uma célula da grade vira esquadria de célula, sem genérico', () => {
    // Montantes em 0, 3 e 5,95 m: duas colunas (0..3 e 3..6); a porta ocupa a segunda.
    const { project, report } = importIfc(cortina([montante(2, 0), montante(3, 3), montante(4, 5.95), vidro(5, 0.05, 2.95), porta(6, 3.05, 2.9)]));
    const w = paredes(project);
    expect(w).toHaveLength(1);
    const cells = w[0]!.curtain?.cells ?? [];
    expect(cells).toHaveLength(1);
    expect(cells[0]!.key).toMatchObject({ i: 1, j: 0, nu: 2, nv: 1 });
    expect(cells[0]!.override.kind).toBe('opening');
    expect(report.imported.portas).toBe(1);
    expect(report.generic.IFCDOOR).toBeUndefined();
  });

  it('porta que não coincide com nenhuma célula fica genérica, com aviso', () => {
    const { project, report } = importIfc(cortina([montante(2, 0), montante(3, 3), montante(4, 5.95), vidro(5, 0.05, 2.95), porta(6, 4, 0.8, 2.1)]));
    expect(paredes(project)[0]!.curtain?.cells ?? []).toHaveLength(0);
    expect(report.generic.IFCDOOR).toBe(1);
    expect(report.warnings.some((m) => m.includes('Porta de vidro'))).toBe(true);
  });
});
