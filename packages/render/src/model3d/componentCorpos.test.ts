import { FAMILIA_ARMARIO, createEmptyProject, levelElevation, type Component, type Corpo, type Familia, type Project } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { buildComponentSolids } from './componentSolids.ts';

/*
 * Montagem da cena dos corpos no projeto (ficha B2): um tubo Ø100 × 1000 mm (cilindro de 32 lados) de uma família SEM peças, instanciado
 * inclinado 90° (`inclinacao[0] = π/2`: o eixo Z local vai para o X do mundo) e em pé.
 */

const tubo = (): Corpo => ({
  id: 'tubo',
  nome: 'Tubo',
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '100' }, comprimento: '1000' },
  quadro: { origem: ['0', '0', '0'] },
});

const familiaTubo = (): Familia => ({ ...structuredClone(FAMILIA_ARMARIO), id: 'tubo-l', pecas: [], corpos: [tubo()] });

const projetoCom = (c: Partial<Component>): { p: Project; comp: Component } => {
  const p = createEmptyProject('t');
  p.componentFamilies = { 'tubo-l': familiaTubo() };
  const levelId = p.levels[0]!.id;
  const comp: Component = {
    id: 'c1', kind: 'component', familyId: 'tubo-l', typeId: null, levelId, order: 1, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: 'c1', ...c,
  };
  p.elements[comp.id] = comp;
  return { p, comp };
};

/** Intervalo [min, max] de cada eixo dos vértices de todos os lotes de sólidos. */
function caixaDosLotes(p: Project, levelId: string): { min: [number, number, number]; max: [number, number, number]; vertices: number } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  for (const lote of buildComponentSolids(p, levelId)) {
    for (let i = 0; i < lote.positions.length; i += 3) {
      vertices++;
      for (let k = 0; k < 3; k++) {
        const v = lote.positions[i + k]!;
        if (v < min[k]!) min[k] = v;
        if (v > max[k]!) max[k] = v;
      }
    }
  }
  return { min, max, vertices };
}

describe('corpos na cena do projeto (ficha B2)', () => {
  it('tubo em pé (sem inclinação): eixo Z do mundo, 1 m de altura, diâmetro 100 mm', () => {
    const { p, comp } = projetoCom({});
    const z0 = levelElevation(p, comp.levelId);
    const caixa = caixaDosLotes(p, comp.levelId);
    expect(caixa.vertices).toBeGreaterThan(0);
    expect(caixa.min[2]).toBeCloseTo(z0, 6);
    expect(caixa.max[2]).toBeCloseTo(z0 + 1, 6);
    expect(caixa.min[0]).toBeCloseTo(-0.05, 6);
    expect(caixa.max[0]).toBeCloseTo(0.05, 6);
  });

  it('tubo inclinado 90° (inclinacao[0] = π/2): o eixo vai para o X do mundo, 1 m de comprimento', () => {
    const { p, comp } = projetoCom({ inclinacao: [Math.PI / 2, 0] });
    const z0 = levelElevation(p, comp.levelId);
    const caixa = caixaDosLotes(p, comp.levelId);
    expect(caixa.min[0]).toBeCloseTo(0, 6);
    expect(caixa.max[0]).toBeCloseTo(1, 6);
    expect(caixa.min[1]).toBeCloseTo(-0.05, 6);
    expect(caixa.max[1]).toBeCloseTo(0.05, 6);
    expect(caixa.min[2] - z0).toBeCloseTo(-0.05, 6);
    expect(caixa.max[2] - z0).toBeCloseTo(0.05, 6);
  });

  it('a posição da instância soma à caixa; corpo vazio não entra no projeto', () => {
    const { p, comp } = projetoCom({ x: 2, y: 3, inclinacao: [Math.PI / 2, 0] });
    const caixa = caixaDosLotes(p, comp.levelId);
    expect(caixa.min[0]).toBeCloseTo(2, 6);
    expect(caixa.max[1] - 3).toBeCloseTo(0.05, 6);

    const vazio = structuredClone(p);
    vazio.componentFamilies = { 'tubo-l': { ...familiaTubo(), corpos: [{ ...tubo(), vazio: true }] } };
    expect(caixaDosLotes(vazio, comp.levelId).vertices).toBe(0);
  });
});
