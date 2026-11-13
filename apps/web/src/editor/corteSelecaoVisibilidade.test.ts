import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type SectionAnnotations } from '@hestia/model';
import { worldToScreen } from '@hestia/render';
import { abrirMenuDeContexto, executaComandoDoMenu, useCanvasMenu } from '../ui/useCanvasContextMenu.ts';
import { editor } from './controller.ts';
import { anotacoesNaCaixaDoCorte, idsNaCaixaDoCorte } from './sectionBoxSelect.ts';
import { sectionPickAt } from './sectionPick.ts';
import { useUi } from './state.ts';
import { visibilityOf } from './viewVisibility.ts';

const camera = { fit: () => {}, orbit: { zoom: () => {} } };
const centro = { x: 0, y: 0 };

/** Cotas e textos do corte, em (t,z): uma cota (linha em z=4,5) e um texto longe dela. */
function anotacoes(): SectionAnnotations {
  return {
    dimensions: [{ id: 'dim1', a: { x: 0, y: 4 }, b: { x: 2, y: 4 }, offset: 0.5 }],
    texts: [{ id: 'txt1', at: { x: 8, y: 6 }, text: 'Nota', height: 2.5, rotation: 0 }],
    detailLines: [],
    detailRegions: [],
    tags: [],
  } as unknown as SectionAnnotations;
}

const ids = (xs: string[]): string[] => [...xs].sort();

/** Corte e elevação com a mesma geometria: w1 e w2 do mesmo tipo (alvenaria), w3 de outro tipo. */
describe.each(['section', 'elevation'] as const)('vista de %s: seleção e visibilidade como na planta', (kind) => {
  beforeEach(async () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, height: 3 }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 4, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w3', typeId: 'wt_ext19', levelId: 'lv_0', a: { x: 8, y: 0 }, b: { x: 10, y: 0 }, height: 3 }) });
    store.exec({ type: 'addView', view: { id: 'v1', name: 'Vista', kind, a: { x: -1, y: -2 }, b: { x: 11, y: -2 }, depth: 20 } });
    store.exec({ type: 'setSectionAnnotations', sectionId: 'v1', annotations: anotacoes() });
    editor.load(store.project, 'teste.hestia.json');
    editor.openSection('v1');
    await editor.sectionReady('v1');
    editor.ensureViewport(800, 600);
    editor.setViewport({ ...editor.viewport()!, cx: 5, cy: 2.5, zoom: 60 });
    useUi.setState({ viewTemp: {}, selection: [], tool: 'select' });
  });

  const hiddenNow = (): ReadonlySet<string> => visibilityOf(editor.project, useUi.getState()).hidden;
  const tudo = (): string[] => idsNaCaixaDoCorte(editor.sectionOf('v1')!, { x: -50, y: -50 }, { x: 50, y: 50 }, hiddenNow());
  const notas = (a: { x: number; y: number }, b: { x: number; y: number }): string[] =>
    anotacoesNaCaixaDoCorte(editor.project.views.find((v) => v.id === 'v1')!.annotations!, a, b, 100);

  it('1. a caixa seleciona cotas e demais anotações, com a regra janela x cruzamento da planta', () => {
    // Janela (esquerda para direita): só o que está inteiro dentro.
    expect(ids(notas({ x: -1, y: 3 }, { x: 3, y: 5.5 }))).toEqual(['dim1']);
    expect(ids(notas({ x: -1, y: 1 }, { x: 3, y: 3.5 }))).toEqual([]);
    expect(ids(notas({ x: -1, y: 3 }, { x: 20, y: 9 }))).toEqual(['dim1', 'txt1']);
    // Cruzamento (direita para esquerda): basta tocar.
    expect(ids(notas({ x: 1, y: 5.5 }, { x: -1, y: 3 }))).toEqual(['dim1']);
    expect(ids(notas({ x: 30, y: 9 }, { x: 7.9, y: 5.9 }))).toEqual(['txt1']);
    expect(ids(notas({ x: 30, y: -9 }, { x: 20, y: -5 }))).toEqual([]);
    // Elementos continuam entrando na mesma caixa.
    expect(tudo()).toEqual(expect.arrayContaining(['w1', 'w2', 'w3']));
  });

  it('2. "Visíveis na vista" seleciona o mesmo tipo, sem os ocultos', () => {
    useUi.setState({ selection: ['w1'] });
    expect(editor.selectAllVisibleOfSelectedType()).toBe(true);
    expect(ids(useUi.getState().selection)).toEqual(['w1', 'w2']);
    // Oculta w2 na vista: ele deixa de entrar.
    useUi.setState({ selection: ['w2'] });
    executaComandoDoMenu('hideElements', 'section', camera, centro);
    useUi.setState({ selection: ['w1'] });
    executaComandoDoMenu('selectAllVisible', 'section', camera, centro);
    expect(ids(useUi.getState().selection)).toEqual(['w1']);
  });

  it('3. ocultar na vista por elemento e por categoria, com o mesmo estado da vista', () => {
    useUi.setState({ selection: ['w1'] });
    executaComandoDoMenu('hideElements', 'section', camera, centro);
    expect(editor.project.views.find((v) => v.id === 'v1')!.hidden?.elements).toEqual(['w1']);
    expect(hiddenNow().has('w1')).toBe(true);
    // O oculto não é selecionável: nem pela caixa, nem pelo clique.
    expect(tudo()).not.toContain('w1');
    expect(tudo()).toEqual(expect.arrayContaining(['w2', 'w3']));
    const noW1 = sectionPickAt(worldToScreen(editor.viewport()!, { x: 1.5, y: 1 }));
    expect(noW1?.id).not.toBe('w1');

    useUi.setState({ selection: ['w2'] });
    executaComandoDoMenu('hideCategory', 'section', camera, centro);
    expect(editor.project.views.find((v) => v.id === 'v1')!.hidden?.categories).toEqual(['wall']);
    expect(tudo()).not.toContain('w3');
    expect(hiddenNow().has('w3')).toBe(true);

    // Reexibir tudo limpa a vista.
    executaComandoDoMenu('unhideAll', 'section', camera, centro);
    expect(hiddenNow().size).toBe(0);
    expect(tudo()).toEqual(expect.arrayContaining(['w1', 'w2', 'w3']));
  });

  it('3. isolar e revelar ocultos funcionam na vista', () => {
    useUi.setState({ selection: ['w1'] });
    executaComandoDoMenu('isolateElements', 'section', camera, centro);
    expect(tudo()).toContain('w1');
    expect(tudo()).not.toContain('w2');
    // Revelar: o que estava fora da vista aparece (com borda) e volta a ser selecionável.
    executaComandoDoMenu('revealHidden', 'section', camera, centro);
    expect(visibilityOf(editor.project, useUi.getState()).reveal).toBe(true);
    expect(hiddenNow().size).toBe(0);
    expect(tudo()).toContain('w2');
    executaComandoDoMenu('revealHidden', 'section', camera, centro);
    executaComandoDoMenu('unhideAll', 'section', camera, centro);
    expect(tudo()).toContain('w2');
  });

  it('o menu de contexto traz Ocultar na vista e Visíveis na vista', () => {
    abrirMenuDeContexto(10, 10, 'w1', 'section');
    const itens = useCanvasMenu.getState().menu!.items;
    const ocultar = itens.find((i) => i.id === 'hide')!;
    expect(ocultar.children?.map((c) => c.id)).toEqual(expect.arrayContaining(['hideElements', 'hideCategory']));
    const todas = itens.find((i) => i.id === 'selectAll')!;
    expect(todas.children?.map((c) => c.id)).toEqual(expect.arrayContaining(['selectAllView', 'selectAllVisible']));
    expect(todas.children?.find((c) => c.id === 'selectAllVisible')?.disabled).toBeFalsy();
  });
});
