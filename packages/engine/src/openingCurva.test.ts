import { describe, expect, it } from 'vitest';
import { intersection, multiArea } from '@hestia/geom';
import { coreRange, createEmptyProject, makeWall, ProjectStore, type Opening, type OpeningType } from '@hestia/model';
import { openingBandRing } from './openingCut.ts';
import { frameOfWall, openingGeometry, resolveLevel } from './resolve.ts';

/**
 * Parede curva (raio 5 m: corda 6 m, flecha 1 m): o furo e o retorno do acabamento usam a MESMA geometria radial
 * (acompanhando o batente/alizar na curva). Nenhuma camada pode invadir o vão e o retorno tem a área equivalente à reta.
 */
function cena(base: string, extra: Partial<OpeningType>, sag = 1) {
  const s = new ProjectStore(createEmptyProject());
  const t = s.project.openingTypes[base]!;
  s.exec({ type: 'upsertOpeningType', openingType: { ...t, id: 'ot_x', ...extra } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, sag }) });
  s.exec({
    type: 'addOpening',
    opening: { id: 'v', kind: t.kind, typeId: 'ot_x', hostId: 'w', offset: 3.1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' },
  });
  return s.project;
}

/**
 * Área das camadas dentro do vão. `recuo` encolhe o vão nas ombreiras: com o retorno (que ocupa a faixa de cada lado) o
 * vão encolhido tem de ficar limpo; sem retorno, o vão inteiro.
 */
function invasao(base: string, extra: Partial<OpeningType>, sag = 1, recuo = 0, folga = 0): number {
  const p = cena(base, extra, sag);
  const g = openingGeometry(p, p.elements.v as Opening, frameOfWall(p, 'w')!);
  const vao = [[openingBandRing(g, g.roughWidth / 2 - recuo, g.thickness / 2 + folga)]];
  const res = resolveLevel(p, 'lv_0', new Map());
  let area = 0;
  for (const w of Object.values(res.walls)) for (const l of w.layers) area += multiArea(intersection(l.cut, vao));
  return area;
}

describe('parede curva com vão', () => {
  const casos: Array<[string, string, Partial<OpeningType>]> = [
    ['janela, vão livre de retorno', 'ot_j120', {}],
    ['janela com retorno opt-in (both)', 'ot_j120', { closure: 'both' }],
    ['porta com retorno opt-in (both)', 'ot_p80', { closure: 'both' }],
    ['vão livre com retorno do tipo de parede', 'ot_vao90', { closure: 'both' }],
    ['porta', 'ot_p80', {}],
  ];
  // Espessura total das camadas que envolvem (o retorno ocupa essa faixa em cada ombreira).
  const wrapTotal = (): number => {
    const t = createEmptyProject().wallTypes.wt_alv14!;
    const c = coreRange(t);
    return t.layers.reduce((s, l, i) => s + (l.wraps && (i < c.first || i > c.last) ? l.thickness : 0), 0) / 2;
  };
  for (const [nome, base, extra] of casos) {
    const retorno = extra.closure !== undefined;
    it(`${nome}: nenhuma camada invade o vão (R = 5 m)`, () => {
      const recuo = retorno ? wrapTotal() + 1e-6 : 0;
      for (const sag of [1, -1]) expect(invasao(base, extra, sag, recuo), `sag ${sag}`).toBeLessThan(1e-7);
    });
    if (retorno) {
      it(`${nome}: o retorno da parede curva tem a mesma área de retorno da parede reta`, () => {
        for (const sag of [1, -1]) expect(Math.abs(invasao(base, extra, sag, 0, 0.15) - invasao(base, extra, 0, 0, 0.15))).toBeLessThan(2e-4);
      });
    }
  }
});
