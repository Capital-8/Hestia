import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, paperMmToPx, graphicsOf, lineWeightMm } from '@hestia/model';
import { sectionStyleOf } from './style.ts';

describe('sectionStyleOf (gráficos do corte/elevação)', () => {
  it('sem gráficos salvos: saved é sempre verdadeiro e o detalhe continua sendo o do projeto', () => {
    const p = createEmptyProject();
    const s = sectionStyleOf(p, 60);
    expect(s.saved).toBe(true);
    expect(s.visual).toBe('hiddenLine');
    expect(s.detail).toBe(p.settings.detail ?? 'medium');
  });

  it('com gráficos salvos: a escala e as larguras em px saem da tabela da categoria no zoom corrente', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'setSectionGraphics', patch: { scale: 50 } });
    const s = sectionStyleOf(store.project, 60);
    const gp = graphicsOf(store.project);
    expect(s.saved).toBe(true);
    expect(s.scale).toBe(50);
    expect(s.paint.wall.cutPx).toBeCloseTo(paperMmToPx(lineWeightMm(gp.lineWeights, gp.categories.wall.cutWeight, 50), 60, 50), 9);
    expect(s.paint.wall.projPx).toBeCloseTo(paperMmToPx(lineWeightMm(gp.lineWeights, gp.categories.wall.projectionWeight, 50), 60, 50), 9);
  });

  it('substituição da categoria na vista vale sobre o peso do projeto; visibilidade e transparência chegam ao paint', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'setSectionGraphics', patch: { overrides: { door: { visible: false, transparency: 0.4, cutWeight: 1 } } } });
    const s = sectionStyleOf(store.project, 60);
    expect(s.paint.door.visible).toBe(false);
    expect(s.paint.door.alpha).toBeCloseTo(0.6, 9);
    const gp = graphicsOf(store.project);
    expect(s.paint.door.cutPx).toBeCloseTo(paperMmToPx(lineWeightMm(gp.lineWeights, 1, 100), 60, 100), 9);
  });

  it('visual e detalhe gravados valem na vista', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'setSectionGraphics', patch: { style: 'wireframe', detail: 'coarse' } });
    const s = sectionStyleOf(store.project, 60);
    expect(s.visual).toBe('wireframe');
    expect(s.detail).toBe('coarse');
  });

  it('meio-tom por categoria: o paint da parede continua visível e fica em meio-tom', () => {
    const p = createEmptyProject();
    const s = sectionStyleOf(p, 60, { wall: 'halftone' });
    expect(s.paint.wall.halftone).toBe(true);
    expect(s.paint.wall.visible).toBe(true);
  });

  it('tom oculto por categoria: o paint da parede deixa de ser visível', () => {
    const p = createEmptyProject();
    const s = sectionStyleOf(p, 60, { wall: 'hidden' });
    expect(s.paint.wall.visible).toBe(false);
  });

  it('sem o mapa de tons (ou com tom normal) o resultado é o de antes', () => {
    const p = createEmptyProject();
    const antes = sectionStyleOf(p, 60);
    expect(sectionStyleOf(p, 60, { wall: 'normal' })).toEqual(antes);
    expect(antes.paint.wall.visible).toBe(true);
    expect(antes.paint.wall.halftone).toBe(false);
  });
});
