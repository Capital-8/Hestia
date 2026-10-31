import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  makeWall,
  openingHeight,
  openingType,
  type Opening,
  type Project,
} from '@hestia/model';
import { computeSection, frameOfWall, openingGeometry, quantifyLevel, resolveLevel } from './index.ts';

/**
 * Parede de 4 m no térreo com uma janela `ot_j120` (vão 1,2 × 1,2, peitoril 1,1). A instância pode ter altura
 * própria; o tipo ganha uma folga de vão bruto de 8 cm em altura para o furo acompanhar a altura efetiva.
 */
function cena(heightOverride?: number | null, roughOversize?: { w: number; h: number }): Project {
  const s = new ProjectStore(createEmptyProject());
  if (roughOversize) {
    const base = s.project.openingTypes.ot_j120!;
    s.exec({ type: 'upsertOpeningType', openingType: { ...base, id: 'ot_j_bruto', roughOversize } });
  }
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, height: 3 }) });
  s.exec({
    type: 'addOpening',
    opening: {
      id: 'j',
      kind: 'window',
      typeId: roughOversize ? 'ot_j_bruto' : 'ot_j120',
      hostId: 'w',
      offset: 2,
      flipHand: false,
      flipFacing: false,
      sillOverride: null,
      heightOverride,
      mark: '',
    },
  });
  return s.project;
}

const abertura = (p: Project): Opening => p.elements.j as Opening;

describe('altura efetiva por instância (Opening.heightOverride)', () => {
  it('geometria usa a altura da instância e volta ao tipo quando o override é nulo', () => {
    const propria = cena(1.8);
    const g = openingGeometry(propria, abertura(propria), frameOfWall(propria, 'w')!);
    expect(g.height).toBeCloseTo(1.8, 9);
    expect(g.roughHeight).toBeCloseTo(1.8, 9); // sem folga no tipo, o furo é a altura efetiva

    const tipo = cena(null);
    const gt = openingGeometry(tipo, abertura(tipo), frameOfWall(tipo, 'w')!);
    expect(gt.height).toBeCloseTo(openingType(tipo, abertura(tipo)).height, 9);
  });

  it('vão bruto cresce sobre a altura efetiva, não sobre a altura do tipo', () => {
    const p = cena(1.7, { w: 0.04, h: 0.08 });
    const g = openingGeometry(p, abertura(p), frameOfWall(p, 'w')!);
    expect(g.height).toBeCloseTo(1.7, 9);
    expect(g.roughHeight).toBeCloseTo(1.78, 9);
  });

  it('corte/elevação e quantitativos usam a altura efetiva', () => {
    const p = cena(1.8);
    const corte = computeSection(p, { a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 2 });
    const o = corte.openings.find((x) => x.openingId === 'j')!;
    expect(o.z1 - o.z0).toBeCloseTo(1.8, 9);

    const q = quantifyLevel(p, resolveLevel(p, 'lv_0', new Map()));
    expect(q.walls[0]!.openingsArea).toBeCloseTo(1.2 * 1.8, 9);
  });

  it('override inválido ou não positivo cai para a altura do tipo', () => {
    const p = cena(-1);
    const t = openingType(p, abertura(p));
    expect(openingHeight(t, abertura(p))).toBeCloseTo(t.height, 9);
    const g = openingGeometry(p, abertura(p), frameOfWall(p, 'w')!);
    expect(g.height).toBeCloseTo(t.height, 9);
  });
});
