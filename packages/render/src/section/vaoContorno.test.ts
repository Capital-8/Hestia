import { afterEach, describe, expect, it } from 'vitest';
import type { MultiPolygon, Vec2 } from '@hestia/geom';
import { clienteFuroContornoFalso, computeSection, definirClienteFuroContorno } from '@hestia/engine';
import { createEmptyProject, makeWall, ProjectStore, type Opening, type OpeningShape, type Project } from '@hestia/model';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';

/**
 * Corte e elevação com vão de contorno (docs/estudo-esquadrias/29): a hachura da parede abre pelo perfil do vão, e o vão aparece
 * com o próprio contorno (sem as peças do modelo, que são caixa retangular).
 */
const v = (x: number, y: number): Vec2 => ({ x, y });

function projeto(): Project {
  const base = createEmptyProject();
  // Base do ot_p90 (soleira zero): o arco de 2,4 m cabe na parede de 3 m (com ot_j120 a soleira de 1,10 m deixaria o topo fora).
  base.openingTypes.ot_arco = { ...base.openingTypes.ot_p90!, id: 'ot_arco', width: 0.9, height: 2.4, leaves: 0, closure: 'none', shape: { kind: 'round', width: 0.9, height: 2.4 } as OpeningShape };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  const janela: Opening = { id: 'o_arco', kind: 'window', typeId: 'ot_arco', hostId: 'w1', offset: 4, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
  s.exec({ type: 'addOpening', opening: janela });
  return s.project;
}

const entrada = (p: Project, a: Vec2, b: Vec2, depth: number): SectionInput => ({
  project: p,
  section: computeSection(p, { a, b, depth }),
  viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 },
  theme: LIGHT,
  dark: false,
  showGrid: false,
});

/** Ponto dentro de um multipolígono (regra par-ímpar; os furos contam). */
function dentro(m: MultiPolygon, [x, y]: [number, number]): boolean {
  let inside = false;
  for (const poly of m) {
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
    }
  }
  return inside;
}

afterEach(() => definirClienteFuroContorno(null));

describe('desenho do vão com contorno no corte e na elevação', () => {
  it('corte: a hachura da parede não cobre o vão (perfil em x = 4,35) e o vão sai como preenchimento próprio', () => {
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const draw = buildSectionDrawList(entrada(projeto(), v(4.35, -1), v(4.35, 1), 3));
    const hatched = draw.fills.filter((f) => f.hatch).flatMap((f) => f.polygons);
    // Dentro do arco, no fundo: sem hachura de parede. Acima da curva nesse corte: hachura de parede.
    expect(dentro(hatched, [1, 0.05])).toBe(false);
    expect(dentro(hatched, [1, 2.5])).toBe(true);
    // Vão livre (sem folha): como no retângulo, o miolo fica aberto (sem preenchimento sobre o furo); só o contorno do perfil é traçado.
    const vazio = draw.fills.filter((f) => !f.hatch).flatMap((f) => f.polygons);
    expect(dentro(vazio, [1, 0.05])).toBe(false);
    expect(draw.strokes.length).toBeGreaterThan(0);
  });

  it('elevação: a face da parede perde o furo do arco (vão livre: nada cobre o miolo)', () => {
    definirClienteFuroContorno(clienteFuroContornoFalso());
    const draw = buildSectionDrawList(entrada(projeto(), v(-1, -1), v(7, -1), 3));
    // Dentro do arco nada cobre (o furo da parede foi aberto e o vão livre não tem peça); fora do arco, a parede.
    const cobrem = (pt: [number, number]): number => draw.fills.filter((f) => dentro(f.polygons, pt)).length;
    expect(cobrem([5, 0.05])).toBe(0);
    expect(cobrem([5 + 0.6, 0.05])).toBeGreaterThanOrEqual(1);
  });
});
