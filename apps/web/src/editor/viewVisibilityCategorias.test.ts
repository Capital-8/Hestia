import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, createEmptyProject, type Element, type Familia, type GraphicsCategory } from '@hestia/model';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { hideSelectedCategoryInView, unhideSelectedCategoryInView, visibilityOf } from './viewVisibility.ts';
import { executaComandoDoMenu } from '../ui/useCanvasContextMenu.ts';

const camera = { fit: () => {}, orbit: { zoom: () => {} } };
const centro = { x: 0, y: 0 };

const elemento = (id: string, kind: string, familyId?: string): Element =>
  ({ id, kind, order: 0, ...(familyId ? { familyId } : {}) }) as unknown as Element;

const familia = (id: string, disciplina: Familia['disciplina']): Familia => {
  const f = structuredClone(FAMILIA_ARMARIO);
  f.id = id;
  f.disciplina = disciplina;
  return f;
};

const FAMILIAS: Familia[] = [
  familia('fam_arq', 'arquitetura'),
  familia('fam_hid', 'hidrossanitario'),
  familia('fam_ele', 'eletrico'),
  familia('fam_hvac', 'hvac'),
];

/** Cada caso: o elemento selecionado, a categoria que "Ocultar categoria" deve gravar. */
const CASOS: Array<[string, Element, GraphicsCategory]> = [
  ['pilar', elemento('e_sub', 'column'), 'column'],
  ['viga', elemento('e_sub', 'beam'), 'beam'],
  ['sapata', elemento('e_sub', 'footing'), 'footing'],
  ['forro', elemento('e_sub', 'ceiling'), 'ceiling'],
  ['rampa', elemento('e_sub', 'ramp'), 'ramp'],
  ['componente de arquitetura', elemento('e_sub', 'component', 'fam_arq'), 'component'],
  ['componente hidrossanitário', elemento('e_sub', 'component', 'fam_hid'), 'plumbingFixture'],
  ['componente elétrico', elemento('e_sub', 'component', 'fam_ele'), 'electricalFixture'],
  ['componente de HVAC', elemento('e_sub', 'component', 'fam_hvac'), 'mechanicalEquipment'],
];

/** Projeto com o elemento do caso e uma parede: ocultar a categoria do primeiro não pode ocultar a parede. */
function carregarCaso(el: Element): void {
  const p = createEmptyProject();
  p.componentFamilies = Object.fromEntries(FAMILIAS.map((f) => [f.id, f]));
  p.elements[el.id] = el;
  p.elements['e_wall'] = elemento('e_wall', 'wall');
  editor.load(p, 'categorias.hestia.json');
  useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', planViewId: null, viewTemp: {}, selection: [el.id] });
}

beforeEach(() => {
  useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', planViewId: null, viewTemp: {}, selection: [] });
});

afterEach(() => {
  useUi.setState({ selection: [], viewTemp: {} });
});

describe('Ocultar categoria do elemento selecionado usa a categoria do elemento (etapa 4.5d)', () => {
  it.each(CASOS)('%s grava só a categoria dele', (_nome, el, categoria) => {
    carregarCaso(el);
    hideSelectedCategoryInView();
    expect(editor.project.levels[0]!.hidden).toEqual({ categories: [categoria] });
    expect(editor.project.levels[0]!.hidden?.categories).not.toContain('wall');
  });

  it.each(CASOS)('%s: some da vista só o elemento dele, a parede continua', (_nome, el, _categoria) => {
    carregarCaso(el);
    hideSelectedCategoryInView();
    const vis = visibilityOf(editor.project, useUi.getState());
    expect(vis.hidden.has(el.id)).toBe(true);
    expect(vis.hidden.has('e_wall')).toBe(false);
  });

  it('reexibir a categoria do pilar apaga a ocultação de categoria', () => {
    carregarCaso(elemento('e_sub', 'column'));
    hideSelectedCategoryInView();
    // Ocultar poda a seleção dos ocultos; reexibir com o pilar de novo selecionado.
    useUi.setState({ selection: ['e_sub'] });
    unhideSelectedCategoryInView();
    expect(editor.project.levels[0]!.hidden).toBeUndefined();
  });

  it('o comando do menu de contexto "Ocultar categoria" grava a categoria do pilar', () => {
    carregarCaso(elemento('e_sub', 'column'));
    executaComandoDoMenu('hideCategory', 'plan', camera, centro);
    expect(editor.project.levels[0]!.hidden).toEqual({ categories: ['column'] });
  });

  it('seleção com pilares e vigas não escolhe categoria nenhuma (avisa e não grava)', () => {
    const p = createEmptyProject();
    p.elements['e_col'] = elemento('e_col', 'column');
    p.elements['e_beam'] = elemento('e_beam', 'beam');
    editor.load(p, 'categorias.hestia.json');
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', planViewId: null, viewTemp: {}, selection: ['e_col', 'e_beam'] });
    hideSelectedCategoryInView();
    expect(editor.project.levels[0]!.hidden).toBeUndefined();
  });
});
