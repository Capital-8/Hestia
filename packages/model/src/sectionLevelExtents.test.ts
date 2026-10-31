import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  sectionLevelExtentIssue,
  sectionLevelExtentOf,
  sectionViewIssue,
  type SectionView,
} from './index.ts';

const view = (patch: Partial<SectionView> = {}): SectionView => ({
  id: 'sv1',
  name: 'Corte A',
  kind: 'section',
  a: { x: 0, y: 0 },
  b: { x: 8, y: 0 },
  depth: 6,
  ...patch,
});

function projectWithView(patch: Partial<SectionView> = {}) {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addView', view: view(patch) });
  return store;
}

describe('extensões das linhas de nível no corte', () => {
  it('grava, troca e limpa a extensão do nível na vista', () => {
    const store = projectWithView();
    store.exec({ type: 'setSectionLevelExtent', sectionId: 'sv1', levelId: 'lv_0', extent: { a: 1, b: 5 } });

    expect(sectionLevelExtentOf(store.project.views[0], 'lv_0')).toEqual({ a: 1, b: 5 });

    store.exec({ type: 'setSectionLevelExtent', sectionId: 'sv1', levelId: 'lv_0', extent: { a: 2, b: 6 } });
    expect(sectionLevelExtentOf(store.project.views[0], 'lv_0')).toEqual({ a: 2, b: 6 });

    store.exec({ type: 'setSectionLevelExtent', sectionId: 'sv1', levelId: 'lv_0', extent: undefined });
    expect(store.project.views[0]!.levelExtents).toBeUndefined();
  });

  it('recusa vista, nível e geometria inválidos', () => {
    const store = projectWithView();
    expect(() => store.exec({ type: 'setSectionLevelExtent', sectionId: 'sv_x', levelId: 'lv_0', extent: { a: 0, b: 1 } })).toThrow('Vista de corte/elevação inexistente');
    expect(() => store.exec({ type: 'setSectionLevelExtent', sectionId: 'sv1', levelId: 'lv_x', extent: { a: 0, b: 1 } })).toThrow('Nível inexistente');
    expect(() => store.exec({ type: 'setSectionLevelExtent', sectionId: 'sv1', levelId: 'lv_0', extent: { a: Number.NaN, b: 1 } })).toThrow('finitos');
    expect(() => store.exec({ type: 'setSectionLevelExtent', sectionId: 'sv1', levelId: 'lv_0', extent: { a: 2, b: 2 } })).toThrow('extremidades');
    expect(store.project.views[0]!.levelExtents).toBeUndefined();
  });

  it('a validação da vista cobre as extensões e o desfazer restaura a anterior', () => {
    expect(sectionViewIssue(view({ levelExtents: { lv_0: { a: 0, b: 4 } } }))).toBeNull();
    expect(sectionViewIssue(view({ levelExtents: { lv_0: { a: 0, b: Number.POSITIVE_INFINITY } } }))).toContain('finitos');

    const store = projectWithView();
    store.exec({ type: 'setSectionLevelExtent', sectionId: 'sv1', levelId: 'lv_0', extent: { a: 0, b: 4 } });
    expect(store.undoLabel).toBe('Criar/editar nível');
    store.exec({ type: 'setSectionLevelExtent', sectionId: 'sv1', levelId: 'lv_0', extent: { a: 1, b: 5 } });
    store.undo();
    expect(sectionLevelExtentOf(store.project.views[0], 'lv_0')).toEqual({ a: 0, b: 4 });
  });

  it('a extensão isolada valida números finitos e comprimento', () => {
    expect(sectionLevelExtentIssue({ a: 0, b: 4 })).toBeNull();
    expect(sectionLevelExtentIssue({ a: 0, b: Number.NaN })).toContain('finitos');
    expect(sectionLevelExtentIssue({ a: 3, b: 3 })).toContain('distintas');
  });
});
