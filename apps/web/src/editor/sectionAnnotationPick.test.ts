import { beforeEach, describe, expect, it } from 'vitest';
import { worldToScreen } from '@hestia/render';
import { ProjectStore, createEmptyProject, makeWall, type SectionAnnotations } from '@hestia/model';
import { editor } from './controller.ts';
import { sectionDimensionGripAt, sectionDimensionGripCommand } from './sectionHandles.ts';
import { sectionPickAt } from './sectionPick.ts';
import { clickSelect3d, useUi } from './state.ts';

/** Tecla sem modificadores, como o `KeyboardEvent` que o App entrega ao controlador. */
const tecla = (key: string): KeyboardEvent => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }) as unknown as KeyboardEvent;

/** Zoom de 100 px por metro: 6 px = 0,06 m na linha e 10 px = 0,10 m no texto. */
const ZOOM = 100;

/** Anotações da elevação: cota acima da parede (linha em z = 4,5) e cota sobre a parede (linha em z = 2). */
function anotacoes(): SectionAnnotations {
  return {
    dimensions: [
      { id: 'dim1', a: { x: 0, y: 4 }, b: { x: 2, y: 4 }, offset: 0.5, textAt: { x: 3, y: 5 } },
      { id: 'dimSobre', a: { x: 0, y: 2 }, b: { x: 4, y: 2 }, offset: 0 },
    ],
    texts: [],
    detailLines: [],
    detailRegions: [],
    tags: [],
  };
}

/** Ponto de mundo (t,z) como ponto da tela, na vista aberta. */
function tela(x: number, y: number): { x: number; y: number } {
  const v = editor.viewport()!;
  return worldToScreen(v, { x, y });
}

describe('seleção de cota no corte e na elevação (sectionPickAt, alças e exclusão)', () => {
  beforeEach(() => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
    store.exec({ type: 'addView', view: { id: 'elev', name: 'Elevação Sul', kind: 'elevation', a: { x: -1, y: -2 }, b: { x: 7, y: -2 }, depth: 20 } });
    store.exec({ type: 'setSectionAnnotations', sectionId: 'elev', annotations: anotacoes() });
    editor.load(store.project, 'teste.hestia.json');
    editor.openSection('elev');
    editor.ensureViewport(800, 600);
    editor.setViewport({ ...editor.viewport()!, cx: 3, cy: 2.5, zoom: ZOOM });
  });

  it('a cota sobre a parede ganha o clique; fora da cota, o elemento', () => {
    expect(sectionPickAt(tela(2, 2))?.id).toBe('dimSobre');
    expect(sectionPickAt(tela(5, 1))?.id).toBe('w1');
    expect(sectionPickAt(tela(5, 8))).toBeNull();
  });

  it('linha da cota: 6 px de tolerância', () => {
    expect(sectionPickAt(tela(1, 4.5 + 0.05))?.id).toBe('dim1');
    expect(sectionPickAt(tela(1, 4.5 + 0.09))).toBeNull();
  });

  it('texto da cota: 10 px de tolerância, mais larga que a linha', () => {
    expect(sectionPickAt(tela(3, 5 + 0.08))?.id).toBe('dim1');
    expect(sectionPickAt(tela(3, 5 + 0.15))).toBeNull();
  });

  it('a alça do meio da cota selecionada muda o offset num único comando', () => {
    const p = editor.project;
    const grip = sectionDimensionGripAt(p, 'elev', ['dim1'], { x: 1, y: 4.5 }, 0.06, 0.1);
    expect(grip).toMatchObject({ id: 'dim1', kind: 'offset' });
    const cmd = sectionDimensionGripCommand(p, 'elev', grip!, { x: 1, y: 5.2 });
    expect(cmd?.type).toBe('setSectionAnnotations');
    editor.applyCommand(cmd!);
    const dim = editor.project.views.find((v) => v.id === 'elev')!.annotations!.dimensions.find((d) => d.id === 'dim1')!;
    expect(dim.offset).toBeCloseTo(1.2, 9);
    editor.undo();
    expect(editor.project.views.find((v) => v.id === 'elev')!.annotations!.dimensions.find((d) => d.id === 'dim1')!.offset).toBe(0.5);
  });

  it('a alça do texto muda o textAt e não o offset', () => {
    const p = editor.project;
    const grip = sectionDimensionGripAt(p, 'elev', ['dim1'], { x: 3, y: 5 }, 0.06, 0.1);
    expect(grip).toMatchObject({ id: 'dim1', kind: 'text' });
    editor.applyCommand(sectionDimensionGripCommand(p, 'elev', grip!, { x: 4, y: 6 })!);
    const dim = editor.project.views.find((v) => v.id === 'elev')!.annotations!.dimensions.find((d) => d.id === 'dim1')!;
    expect(dim.textAt).toEqual({ x: 4, y: 6 });
    expect(dim.offset).toBe(0.5);
  });

  it('a alça só existe com uma única cota selecionada', () => {
    expect(sectionDimensionGripAt(editor.project, 'elev', ['dim1', 'dimSobre'], { x: 1, y: 4.5 }, 0.06, 0.1)).toBeNull();
    expect(sectionDimensionGripAt(editor.project, 'elev', [], { x: 1, y: 4.5 }, 0.06, 0.1)).toBeNull();
  });

  it('clicar na cota a seleciona pelo id, e Delete a tira da vista (um passo de desfazer)', () => {
    clickSelect3d(sectionPickAt(tela(1, 4.5))!.id, false);
    expect(useUi.getState().selection).toEqual(['dim1']);
    expect(editor.key(tecla('Delete'))).toBe(true);
    const restantes = editor.project.views.find((v) => v.id === 'elev')!.annotations!.dimensions.map((d) => d.id);
    expect(restantes).toEqual(['dimSobre']);
    expect(useUi.getState().selection).toEqual([]);
    editor.undo();
    expect(editor.project.views.find((v) => v.id === 'elev')!.annotations!.dimensions.map((d) => d.id)).toEqual(['dim1', 'dimSobre']);
  });

  it('a seleção de cota sobrevive às mudanças do projeto (não é podada como id inexistente)', () => {
    useUi.setState({ selection: ['dim1'] });
    editor.applyCommand({ type: 'setSectionAnnotations', sectionId: 'elev', annotations: anotacoes() });
    expect(useUi.getState().selection).toEqual(['dim1']);
  });
});
