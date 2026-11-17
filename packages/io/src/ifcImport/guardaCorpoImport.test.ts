import { describe, expect, it } from 'vitest';
import { isGuardaCorpo, type GuardaCorpo, type Project } from '@hestia/model';
import { importIfc } from './index.ts';
import { ifcBoxes, type TestBox } from './ifcTestKit.ts';

const guardas = (p: Project): GuardaCorpo[] => Object.values(p.elements).filter(isGuardaCorpo);
const genericos = (p: Project): string[] => Object.values(p.elements).filter((e) => e.kind === 'generic').map((e) => (e as { name: string }).name);

const barra = (name: string, o: Partial<TestBox> = {}): TestBox => ({ id: 1, type: 'IFCRAILING', name, x: 1, y: 2, z: 0, dx: 3, dy: 0.05, dz: 1.05, tail: '.GUARDRAIL.', ...o });

describe('addGuardaCorpos: IFCRAILING', () => {
  it('GUARDRAIL reto de piso a topo vira guarda-corpo de caminho manual', () => {
    const { project, report } = importIfc(ifcBoxes([barra('Guarda-corpo varanda')]));
    const g = guardas(project);
    expect(g).toHaveLength(1);
    expect(g[0]!.hospedeiro.tipo).toBe('manual');
    if (g[0]!.hospedeiro.tipo !== 'manual') throw new Error('manual esperado');
    const [a, b] = g[0]!.hospedeiro.caminho;
    expect(Math.hypot(b!.x - a!.x, b!.y - a!.y)).toBeCloseTo(3, 3);
    expect(a!.y).toBeCloseTo(2.025, 3);
    expect(g[0]!.altura).toBeCloseTo(1.05, 3);
    expect(report.imported['guarda-corpos']).toBe(1);
    expect(genericos(project)).toEqual([]);
  });

  it('HANDRAIL usa o tipo de corrimão de parede', () => {
    const { project } = importIfc(ifcBoxes([barra('Corrimão', { tail: '.HANDRAIL.', dz: 0.92 })]));
    expect(guardas(project)[0]!.typeId).toBe('gct_corrimao_parede');
  });

  it('IFC2X3 sem PredefinedType: o nome decide; "suporte metálico" segue genérico', () => {
    const { project } = importIfc(ifcBoxes([barra('Corrimão tubular', { tail: undefined }), barra('LM-SUPORTE METALICO', { id: 2, y: 8, tail: undefined })], [], 'IFC2X3'));
    expect(guardas(project)).toHaveLength(1);
    expect(genericos(project)).toEqual(['LM-SUPORTE METALICO']);
  });

  it('suporte com PredefinedType GUARDRAIL no nome de suporte continua genérico', () => {
    const { project } = importIfc(ifcBoxes([barra('Suporte do corrimão')]));
    expect(guardas(project)).toHaveLength(0);
    expect(genericos(project)).toEqual(['Suporte do corrimão']);
  });

  it('só a barra (altura < 0,6 m): genérico, com aviso', () => {
    const { project, report } = importIfc(ifcBoxes([barra('Barra solta', { dz: 0.08 })]));
    expect(guardas(project)).toHaveLength(0);
    expect(genericos(project)).toEqual(['Barra solta']);
    expect(report.warnings.some((w) => w.includes('Barra solta'))).toBe(true);
  });

  it('planta curta e larga (não é trecho reto): genérico', () => {
    const { project } = importIfc(ifcBoxes([barra('Quadrado', { dx: 0.8, dy: 0.7 })]));
    expect(guardas(project)).toHaveLength(0);
  });
});
