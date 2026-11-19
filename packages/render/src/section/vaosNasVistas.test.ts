import { afterEach, describe, expect, it } from 'vitest';
import { clienteFuroContornoFalso, computeSection, definirClienteFuroContorno } from '@hestia/engine';
import { createEmptyProject, makeWall, ProjectStore, type Opening, type OpeningShape, type Project } from '@hestia/model';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';

/**
 * Regressão do relato "em cortes e elevações não aparecem os vãos nem as esquadrias" (docs/estudo-esquadrias/41): a lista de
 * desenho do corte e da elevação traz as peças de cada vão (caixilho, folha, vidro) tanto no retangular quanto no com contorno.
 */
const FORMA: OpeningShape = { kind: 'round', width: 0.9, height: 2.1 };

function projeto(): Project {
  const base = createEmptyProject();
  base.openingTypes.ot_arco = { ...base.openingTypes.ot_p90!, id: 'ot_arco', shape: FORMA };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }) });
  const add = (id: string, kind: 'door' | 'window', typeId: string, offset: number): void => {
    s.exec({ type: 'addOpening', opening: { id, kind, typeId, hostId: 'w1', offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  };
  add('o_p', 'door', 'ot_p90', 1.5);
  add('o_j', 'window', 'ot_j120', 4.5);
  add('o_a', 'door', 'ot_arco', 7.5);
  return s.project;
}

const entrada = (p: Project, a: { x: number; y: number }, b: { x: number; y: number }, depth: number): SectionInput => ({
  project: p,
  section: computeSection(p, { a, b, depth }),
  viewport: { cx: 5, cy: 1.5, zoom: 60, width: 800, height: 600 },
  theme: LIGHT,
  dark: false,
  showGrid: false,
});

/** Preenchimentos e traços dentro da caixa (t, z) de um vão (com folga de 5 cm). */
function pecasDentro(draw: ReturnType<typeof buildSectionDrawList>, o: { t0: number; t1: number; z0: number; z1: number }): { fills: number; strokes: number } {
  const f = 0.05;
  const dentro = (p: { x: number; y: number }): boolean => p.x >= o.t0 - f && p.x <= o.t1 + f && p.y >= o.z0 - f && p.y <= o.z1 + f;
  return {
    fills: draw.fills.filter((x) => !x.hatch && x.polygons.flat(2).every(dentro)).length,
    strokes: draw.strokes.filter((x) => x.pts.length > 0 && x.pts.every(dentro)).length,
  };
}

afterEach(() => definirClienteFuroContorno(null));

describe.each([
  ['retangular (sem cliente do furo)', false],
  ['com contorno (cliente do furo)', true],
])('vãos no corte e na elevação, %s', (_nome, comCliente) => {
  it.each([
    ['elevação', { x: -1, y: -3 }, { x: 11, y: -3 }, 5, ['o_p', 'o_j', 'o_a']],
    ['corte pela porta', { x: 1.5, y: -1 }, { x: 1.5, y: 1 }, 3, ['o_p']],
    ['corte pelo vão com forma', { x: 7.5, y: -1 }, { x: 7.5, y: 1 }, 3, ['o_a']],
  ] as const)('%s: cada vão sai com mais de um traço e o miolo preenchido', (_n, a, b, depth, ids) => {
    definirClienteFuroContorno(comCliente ? clienteFuroContornoFalso() : null);
    const input = entrada(projeto(), a, b, depth);
    const draw = buildSectionDrawList(input);
    for (const id of ids) {
      const o = input.section.openings.find((x) => x.openingId === id)!;
      const { fills, strokes } = pecasDentro(draw, o);
      expect(fills, `${id}: preenchimentos`).toBeGreaterThanOrEqual(1);
      expect(strokes, `${id}: traços (contorno e peças)`).toBeGreaterThanOrEqual(2);
    }
  });
});
