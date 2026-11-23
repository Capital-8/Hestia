import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { computeSection } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';
import { sectionStyleOf } from './style.ts';

/**
 * Apresentação da disciplina no corte (plano de UX de 2026-11-23): o `PlanPaint` ganha clareamento/opacidade e o desenho
 * aplica `alpha × opacidade` nos preenchimentos e `max(0,3; opacidade)` nas linhas. Valores literais da ficha.
 */

const v = (x: number, y: number): Vec2 => ({ x, y });

/** Parede de 6 m cortada ao meio (corte transversal em x = 3). */
function cross(): SectionInput {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  const project = store.project;
  return { project, section: computeSection(project, { a: v(3, -1), b: v(3, 1), depth: 3 }), viewport: { cx: 0, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false };
}

describe('sectionStyleOf com apresentação por categoria', () => {
  it('halftone com clareamento 0,2 e opacidade 0,5 chega ao paint e continua visível', () => {
    const pt = sectionStyleOf(cross().project, 60, undefined, { wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } }).paint.wall;
    expect(pt.halftone).toBe(true);
    expect(pt.visible).toBe(true);
    expect(pt.clareamento).toBe(0.2);
    expect(pt.opacidade).toBe(0.5);
  });

  it('normal com clareamento 0,5 não vira halftone', () => {
    const pt = sectionStyleOf(cross().project, 60, undefined, { wall: { tone: 'normal', clareamento: 0.5 } }).paint.wall;
    expect(pt.halftone).toBe(false);
    expect(pt.clareamento).toBe(0.5);
    expect(pt.opacidade).toBe(1);
  });

  it('sem o mapa, o resultado é o de hoje', () => {
    const p = cross().project;
    const antes = sectionStyleOf(p, 60);
    expect(sectionStyleOf(p, 60, undefined, { wall: { tone: 'normal' } })).toEqual(antes);
    expect(antes.paint.wall.clareamento).toBe(0);
    expect(antes.paint.wall.opacidade).toBe(1);
  });
});

describe('desenho do corte com apresentação', () => {
  it('halftone/0,2/0,5: o preenchimento e o traço da parede saem com alpha 0,5', () => {
    const base = cross();
    const draw = buildSectionDrawList({ ...base, apresentacoes: { wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } } });
    // O corte é o preenchimento do material da parede (concreto) com a cor clareada e alpha 1 × 0,5.
    const fill = draw.fills.find((f) => f.alpha === 0.5 && f.color !== undefined && !f.hatch);
    expect(fill).toBeDefined();
    // O contorno do corte da parede usa a cor da tinta clareada e a alpha máxima (0,5).
    expect(draw.strokes.some((s) => s.closed && s.alpha === 0.5)).toBe(true);
  });

  it('normal com opacidade 0,5 também reduz as linhas para 0,5', () => {
    const base = cross();
    const draw = buildSectionDrawList({ ...base, apresentacoes: { wall: { tone: 'normal', opacidade: 0.5 } } });
    expect(draw.strokes.some((s) => s.closed && s.alpha === 0.5)).toBe(true);
    expect(draw.fills.some((f) => f.alpha === 0.5)).toBe(true);
  });

  it('sem apresentação, o corte sai opaco (alpha 1)', () => {
    const draw = buildSectionDrawList(cross());
    expect(draw.fills.some((f) => f.alpha === 1)).toBe(true);
    expect(draw.strokes.some((s) => s.alpha === 1)).toBe(true);
    expect(draw.strokes.every((s) => s.alpha !== 0.5)).toBe(true);
  });
});
