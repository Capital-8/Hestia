import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeLevel, type Project } from '@hestia/model';
import { draggableViews, PREFETCH_MAX_VIEWS } from './useSheetPrefetch.ts';

describe('vistas preparadas durante a prancha parada', () => {
  it('lista a planta de cada nível e cada corte/elevação, nessa ordem', () => {
    const p: Project = createEmptyProject();
    p.levels = [makeLevel({ id: 'lv_0', name: 'T', elevation: 0 }), makeLevel({ id: 'lv_1', name: '1', elevation: 3 })];
    p.views = [
      { id: 'c1', name: 'Corte', kind: 'section', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, depth: 5 },
      { id: 'e1', name: 'Elev', kind: 'elevation', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, depth: 5 },
    ];
    expect(draggableViews(p)).toEqual([
      { kind: 'plan', levelId: 'lv_0' },
      { kind: 'plan', levelId: 'lv_1' },
      { kind: 'section', sectionId: 'c1' },
      { kind: 'section', sectionId: 'e1' },
    ]);
  });

  it('limita a fila a 32 vistas', () => {
    const p: Project = createEmptyProject();
    p.levels = Array.from({ length: 40 }, (_, i) => makeLevel({ id: `lv_${i}`, name: `${i}`, elevation: i * 3 }));
    expect(draggableViews(p)).toHaveLength(PREFETCH_MAX_VIEWS);
    expect(PREFETCH_MAX_VIEWS).toBe(32);
  });
});
