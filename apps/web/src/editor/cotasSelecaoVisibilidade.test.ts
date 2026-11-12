import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Dimension, type SectionAnnotations } from '@hestia/model';
import { abrirMenuDeContexto, executaComandoDoMenu, useCanvasMenu } from '../ui/useCanvasContextMenu.ts';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { visibilityOf } from './viewVisibility.ts';

const camera = { fit: () => {}, orbit: { zoom: () => {} } };
const centro = { x: 0, y: 0 };
const ids = (xs: string[]): string[] => [...xs].sort();

/** Três cotas: duas da família padrão e uma da família `fam_a`; mais um texto (outro tipo de anotação). */
const cota = (id: string, y: number, familyId?: string): Dimension => ({ id, a: { x: 0, y }, b: { x: 2, y }, offset: 0.5, ...(familyId ? { familyId } : {}) });

function anotacoesDoCorte(): SectionAnnotations {
  return {
    dimensions: [cota('d1', 4), cota('d2', 5), cota('d3', 6, 'fam_a')],
    texts: [{ id: 't1', at: { x: 8, y: 6 }, text: 'Nota', height: 2.5, rotation: 0 }],
    detailLines: [],
    detailRegions: [],
    tags: [],
  } as unknown as SectionAnnotations;
}

function novoProjeto(): ProjectStore {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, height: 3 }) });
  store.exec({ type: 'addView', view: { id: 'v1', name: 'Corte', kind: 'section', a: { x: -1, y: -2 }, b: { x: 11, y: -2 }, depth: 20 } });
  store.exec({ type: 'setSectionAnnotations', sectionId: 'v1', annotations: anotacoesDoCorte() });
  for (const d of [cota('d1', 4), cota('d2', 5), cota('d3', 6, 'fam_a')]) store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: d });
  store.exec({ type: 'addText', levelId: 'lv_0', text: { id: 't1', at: { x: 8, y: 6 }, text: 'Nota', height: 2.5, rotation: 0 } });
  return store;
}

const hiddenNow = (): ReadonlySet<string> => visibilityOf(editor.project, useUi.getState()).hidden;
const selecao = (): string[] => ids(useUi.getState().selection);

describe.each(['plan', 'section'] as const)('cotas e anotações na vista (%s): mesmo tipo, categoria e visibilidade', (vista) => {
  beforeEach(async () => {
    editor.load(novoProjeto().project, 'teste.hestia.json');
    if (vista === 'section') {
      editor.openSection('v1');
      await editor.sectionReady('v1');
    } else {
      editor.closeSection();
      useUi.setState({ view: 'plan', planViewId: 'pv_lv_0', levelId: 'lv_0' });
    }
    editor.ensureViewport(800, 600);
    useUi.setState({ viewTemp: {}, selection: [], tool: 'select' });
  });

  const menu = (id: string) => {
    useUi.setState({ selection: [id] });
    abrirMenuDeContexto(10, 10, id, vista);
    return useCanvasMenu.getState().menu!.items;
  };

  it('selecionar uma cota habilita "Selecionar todas as instâncias" e "Ocultar por categoria"', () => {
    const itens = menu('d1');
    const todas = itens.find((i) => i.id === 'selectAll')!;
    expect(todas.disabled).toBeFalsy();
    expect(todas.children?.find((c) => c.id === 'selectAllView')?.disabled).toBeFalsy();
    expect(todas.children?.find((c) => c.id === 'selectAllVisible')?.disabled).toBeFalsy();
    const ocultar = itens.find((i) => i.id === 'hide')!;
    expect(ocultar.children?.find((c) => c.id === 'hideCategory')?.disabled).toBeFalsy();
  });

  it('"Mesmo tipo" e "Visíveis" selecionam só as cotas da mesma família', () => {
    useUi.setState({ selection: ['d1'] });
    executaComandoDoMenu('selectAllView', vista, camera, centro);
    expect(selecao()).toEqual(['d1', 'd2']);
    useUi.setState({ selection: ['d3'] });
    executaComandoDoMenu('selectAllVisible', vista, camera, centro);
    expect(selecao()).toEqual(['d3']);
    // Oculta d2: "Visíveis" deixa de trazê-la; "Mesmo tipo" ainda a inclui.
    useUi.setState({ selection: ['d2'] });
    executaComandoDoMenu('hideElements', vista, camera, centro);
    useUi.setState({ selection: ['d1'] });
    executaComandoDoMenu('selectAllVisible', vista, camera, centro);
    expect(selecao()).toEqual(['d1']);
    useUi.setState({ selection: ['d1'] });
    executaComandoDoMenu('selectAllView', vista, camera, centro);
    expect(selecao()).toEqual(['d1', 'd2']);
  });

  it('cota e texto juntos não formam um tipo único', () => {
    useUi.setState({ selection: ['d1', 't1'] });
    abrirMenuDeContexto(10, 10, 'd1', vista);
    const todas = useCanvasMenu.getState().menu!.items.find((i) => i.id === 'selectAll')!;
    expect(todas.disabled).toBe(true);
  });

  it('ocultar a categoria de cotas esconde as anotações da vista e reexibir as traz de volta', () => {
    useUi.setState({ selection: ['d1'] });
    executaComandoDoMenu('hideCategory', vista, camera, centro);
    for (const id of ['d1', 'd2', 'd3']) expect(hiddenNow().has(id)).toBe(true);
    expect(hiddenNow().has('w1')).toBe(false);
    executaComandoDoMenu('unhideAll', vista, camera, centro);
    expect(hiddenNow().size).toBe(0);
  });

  it('isolar a categoria deixa só as anotações, e revelar traz os ocultos de volta', () => {
    useUi.setState({ selection: ['d1'] });
    executaComandoDoMenu('isolateCategory', vista, camera, centro);
    expect(hiddenNow().has('d1')).toBe(false);
    expect(hiddenNow().has('w1')).toBe(true);
    executaComandoDoMenu('revealHidden', vista, camera, centro);
    expect(hiddenNow().size).toBe(0);
    executaComandoDoMenu('revealHidden', vista, camera, centro);
    executaComandoDoMenu('unhideAll', vista, camera, centro);
    expect(hiddenNow().size).toBe(0);
  });
});
