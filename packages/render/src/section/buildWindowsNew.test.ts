import { describe, expect, it } from 'vitest';
import type { MultiPolygon, Vec2 } from '@hestia/geom';
import { computeSection } from '@hestia/engine';
import { createEmptyProject, makeWall, ProjectStore, type Opening } from '@hestia/model';
import { LIGHT, type FillOp } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });

function opening(id: string, typeId: string): Opening {
  return { id, kind: 'window', typeId, hostId: 'w', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
}

/** Parede de 6 m com o vão: linha fora da parede (elevação). */
function facade(typeId: string): SectionInput {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  store.exec({ type: 'addOpening', opening: opening('j', typeId) });
  const project = store.project;
  return { project, section: computeSection(project, { a: v(0, -2), b: v(6, -2), depth: 8 }), viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false };
}

/** Corte transversal à parede: a espessura corre no eixo da vista. */
function cross(typeId: string): SectionInput {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  store.exec({ type: 'addOpening', opening: opening('j', typeId) });
  const project = store.project;
  return { project, section: computeSection(project, { a: v(3, -1), b: v(3, 1), depth: 3 }), viewport: { cx: 0, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false };
}

const largura = (polys: MultiPolygon): number => {
  const x = polys.flat(2).map((q) => q.x);
  return Math.max(...x) - Math.min(...x);
};
const altura = (polys: MultiPolygon): number => {
  const y = polys.flat(2).map((q) => q.y);
  return Math.max(...y) - Math.min(...y);
};

/**
 * Preenchimentos que correspondem aos vidros do modelo (a cor já não distingue o vidro: na linha oculta tudo é papel).
 * `eixo` é o da largura na vista: 't' na elevação e 's' no corte transversal, como em `drawOpening`.
 */
const vidros = (input: SectionInput, eixo: 't' | 's'): FillOp[] => {
  const medidas = input.section.openings.flatMap((o) =>
    o.model.parts
      .filter((x) => x.role === 'glass')
      .map((x) => ({ w: eixo === 't' ? x.box.t1 - x.box.t0 : x.box.s1 - x.box.s0, h: x.box.z1 - x.box.z0 })),
  );
  return buildSectionDrawList(input).fills.filter((f) =>
    medidas.some((m) => Math.abs(largura(f.polygons) - m.w) < 1e-6 && Math.abs(altura(f.polygons) - m.h) < 1e-6),
  );
};

describe('elevação das janelas novas', () => {
  it('janela de abrir: dois vidros (uma folha cada) e batente', () => {
    expect(vidros(facade('ot_ja120'), 't')).toHaveLength(2);
  });

  it('guilhotina: dois vidros em alturas diferentes (pistas)', () => {
    const v = vidros(facade('ot_jg90'), 't');
    expect(v).toHaveLength(2);
    const centros = v.map((f) => {
      const y = f.polygons.flat(2).map((q) => q.y);
      return (Math.min(...y) + Math.max(...y)) / 2;
    });
    expect(Math.abs(centros[0]! - centros[1]!)).toBeGreaterThan(0.3);
  });

  it('pivotante: um vidro e a moldura da folha', () => {
    expect(vidros(facade('ot_jp80'), 't')).toHaveLength(1);
  });

  it('veneziana: as aletas aparecem como faixas horizontais, sem vidro', () => {
    const d = buildSectionDrawList(facade('ot_jv80'));
    expect(vidros(facade('ot_jv80'), 't')).toHaveLength(0);
    expect(d.fills.filter((f) => Math.abs(altura(f.polygons) - 0.04) < 1e-6).length).toBeGreaterThan(5);
  });
});

describe('corte transversal das janelas novas', () => {
  it('janela de abrir, pivotante e veneziana desenham sem erro', () => {
    for (const id of ['ot_ja120', 'ot_jp80', 'ot_jv80']) {
      const d = buildSectionDrawList(cross(id));
      expect(d.fills.length, id).toBeGreaterThan(0);
      expect(d.strokes.some((s) => s.closed), id).toBe(true);
    }
  });

  it('guilhotina: as duas folhas ficam em pistas distintas na profundidade', () => {
    const v = vidros(cross('ot_jg90'), 's');
    expect(v).toHaveLength(2);
    const centros = v.map((f) => {
      const x = f.polygons.flat(2).map((q) => q.x);
      return (Math.min(...x) + Math.max(...x)) / 2;
    });
    expect(Math.abs(centros[0]! - centros[1]!)).toBeGreaterThan(0.02);
  });

  it('veneziana: cada aleta cortada tem a altura e a espessura do modelo', () => {
    const d = buildSectionDrawList(cross('ot_jv80'));
    const aletas = d.fills.filter((f) => Math.abs(altura(f.polygons) - 0.04) < 1e-6 && Math.abs(largura(f.polygons) - 0.008) < 1e-6);
    expect(aletas.length).toBeGreaterThan(5);
  });
});
