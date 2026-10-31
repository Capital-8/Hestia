import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  type SectionAnnotations,
  type SectionView,
} from './index.ts';

const view = (): SectionView => ({
  id: 'v1',
  name: 'Corte A',
  kind: 'section',
  a: { x: 0, y: 0 },
  b: { x: 4, y: 0 },
  depth: 5,
});

const anotacoes = (): SectionAnnotations => ({
  dimensions: [{ id: 'dim1', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, offset: 0.3 }],
  texts: [{ id: 'txt1', at: { x: 1, y: 1 }, text: 'Corte A', height: 2.5, rotation: 0 }],
  detailLines: [{ id: 'ln1', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }],
  detailRegions: [{ id: 'rg1', boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }],
  tags: [{ id: 'tag1', hostId: 'w1', at: { x: 2, y: 1 }, property: 'type' }],
});

const vazio = (): SectionAnnotations => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] });

function storeComVista(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addView', view: view() });
  return s;
}

describe('setSectionAnnotations', () => {
  it('grava o conjunto na vista e o desfazer volta ao estado anterior', () => {
    const s = storeComVista();
    s.exec({ type: 'setSectionAnnotations', sectionId: 'v1', annotations: anotacoes() });
    expect(s.project.views[0]!.annotations).toEqual(anotacoes());

    s.undo();
    expect(s.project.views[0]!.annotations).toBeUndefined();
  });

  it('lista vazia remove o campo e o desfazer o restaura', () => {
    const s = storeComVista();
    s.exec({ type: 'setSectionAnnotations', sectionId: 'v1', annotations: anotacoes() });
    s.exec({ type: 'setSectionAnnotations', sectionId: 'v1', annotations: vazio() });
    expect('annotations' in s.project.views[0]!).toBe(false);

    s.undo();
    expect(s.project.views[0]!.annotations).toEqual(anotacoes());
  });

  it('normaliza ids repetidos ao gravar', () => {
    const s = storeComVista();
    const a = anotacoes();
    a.dimensions.push({ ...a.dimensions[0]! });
    s.exec({ type: 'setSectionAnnotations', sectionId: 'v1', annotations: a });
    expect(s.project.views[0]!.annotations!.dimensions).toHaveLength(1);
  });

  it('vista inexistente é recusada sem alterar o projeto', () => {
    const s = storeComVista();
    expect(() => s.exec({ type: 'setSectionAnnotations', sectionId: 'nao_existe', annotations: anotacoes() })).toThrow(/inexistente/);
    expect(s.project.views[0]!.annotations).toBeUndefined();
  });
});
