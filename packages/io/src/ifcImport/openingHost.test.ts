import { describe, expect, it } from 'vitest';
import { type Opening, type Project, type Wall } from '@hestia/model';
import { importIfc } from './index.ts';
import { ifcBoxes, ref, type TestBox } from './ifcTestKit.ts';

const parede: TestBox = { id: 1, type: 'IFCWALL', name: 'W', x: 0, y: -0.1, z: 0, dx: 6, dy: 0.2, dz: 3, tail: '$' };
const porta = (id: number, x: number, y: number, name = 'P1'): TestBox => ({ id, type: 'IFCDOOR', name, x, y, z: 0, dx: 1, dy: 0.2, dz: 2.1, tail: '2.1,1.,$,$' });
const lista = <T extends { kind: string }>(p: Project, kind: string): T[] => Object.values(p.elements).filter((e) => e.kind === kind) as unknown as T[];

describe('porta/janela sem IfcRelVoidsElement/IfcRelFillsElement', () => {
  it('porta dentro da espessura da parede é hospedada pela geometria', () => {
    const { project, report } = importIfc(ifcBoxes([parede, porta(2, 2, -0.1)]));
    const portas = lista<Opening>(project, 'door');
    expect(portas).toHaveLength(1);
    const w = lista<Wall>(project, 'wall')[0]!;
    expect(portas[0]!.hostId).toBe(w.id);
    expect(portas[0]!.offset).toBeCloseTo(2.5, 2);
    expect(project.openingTypes[portas[0]!.typeId]!.width).toBeCloseTo(1, 2);
    expect(report.generic.IFCDOOR).toBeUndefined();
  });

  it('porta solta (longe de qualquer parede) fica genérica, com aviso', () => {
    const { project, report } = importIfc(ifcBoxes([parede, porta(2, 2, 5)]));
    expect(report.warnings.length).toBeGreaterThan(0);
    expect(lista(project, 'door')).toHaveLength(0);
    expect(report.generic.IFCDOOR).toBe(1);
  });

  it('porta que atravessa a parede em ângulo (não paralela) não é hospedada', () => {
    const { project } = importIfc(ifcBoxes([parede, { ...porta(2, 2, -0.1), angle: 90 }]));
    expect(lista(project, 'door')).toHaveLength(0);
  });

  it('duas paredes sobrepostas igualmente plausíveis: não adivinha, genérico', () => {
    const { project } = importIfc(ifcBoxes([parede, { ...parede, id: 3, name: 'W2' }, porta(2, 2, -0.1)]));
    expect(lista(project, 'door')).toHaveLength(0);
  });

  it('com o vão declarado no arquivo, o caminho original continua valendo', () => {
    const vao: TestBox = { id: 4, type: 'IFCOPENINGELEMENT', name: 'V', x: 2, y: -0.1, z: 0, dx: 1, dy: 0.2, dz: 2.1 };
    const rels = [`#9001=IFCRELVOIDSELEMENT('0000000000000000009001',$,$,$,${ref(1)},${ref(4)});`, `#9002=IFCRELFILLSELEMENT('0000000000000000009002',$,$,$,${ref(4)},${ref(2)});`];
    const { project } = importIfc(ifcBoxes([parede, porta(2, 2, -0.1), vao], rels));
    expect(lista<Opening>(project, 'door')).toHaveLength(1);
  });
});

