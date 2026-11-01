import { computeSection } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';
import { isResolvedLabel, labelFontPxAt, sectionLabelsAt } from './labels.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });

/** Corte vertical numa parede de 6 m, com uma cota na vista em (t,z). */
function entrada(): SectionInput {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v(0, 0), b: v(6, 0), height: 3 }) });
  return {
    project: store.project,
    section: computeSection(store.project, { a: v(0, -2), b: v(6, -2), depth: 8 }),
    viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 },
    theme: LIGHT,
    dark: false,
    showGrid: false,
    annotations: { dimensions: [{ id: 'd1', a: v(0, 0.2), b: v(3, 0.2), offset: 0.4 }], texts: [], detailLines: [], detailRegions: [], tags: [] },
  };
}

describe('rótulos do corte/elevação resolvidos para pixels', () => {
  it('o valor da cota sai como texto de papel (mm × escala) e não como rótulo de interface', () => {
    const base = buildSectionDrawList(entrada());
    const cota = base.labels.find((l) => l.text === '3,00 m');
    expect(cota).toBeDefined();
    // Antes da resolução: medida em papel, sem fonte em pixels (era o que fazia a cota sair em caixa na tela).
    expect(cota!.papel).toBeDefined();
    expect(cota!.fontPx).toBeUndefined();
    const resolvidos = sectionLabelsAt(base.labels, 60);
    const depois = resolvidos.find((l) => l.text === '3,00 m')!;
    expect(isResolvedLabel(depois)).toBe(true);
    // 2,5 mm de papel na escala 1:100 num zoom de 60 px/m = 15 px.
    expect(depois.fontPx).toBeCloseTo(labelFontPxAt(2.5, 100, 60), 9);
    expect(depois.fontPx).toBeCloseTo(15, 9);
    expect(depois.center).toBe(true);
    expect(depois.papel).toBeUndefined();
  });

  it('a resolução é por zoom: o corpo da fonte acompanha o zoom', () => {
    const base = buildSectionDrawList(entrada());
    const a = sectionLabelsAt(base.labels, 60).find((l) => l.text === '3,00 m')!;
    const b = sectionLabelsAt(base.labels, 120).find((l) => l.text === '3,00 m')!;
    expect(b.fontPx!).toBeCloseTo(a.fontPx! * 2, 9);
  });

  it('o nome/cota do nível também sai como texto de papel (sem chip de interface)', () => {
    const base = buildSectionDrawList(entrada());
    const nivel = base.labels.find((l) => l.text.includes('Térreo') || l.text.includes('Pavimento'));
    expect(nivel).toBeDefined();
    expect(nivel!.papel).toBeDefined();
    expect(nivel!.tone).toBeUndefined();
    const resolved = sectionLabelsAt(base.labels, 60).find((l) => l.at === nivel!.at && l.text === nivel!.text);
    expect(resolved).toBeDefined();
    expect(isResolvedLabel(resolved!)).toBe(true);
  });
});
