import { describe, expect, it } from 'vitest';
import { ProjectStore, annotationRemovals, createEmptyProject, makeLevel, levelDimensions, levelTexts, type Dimension, type TextNote } from './index.ts';

const LV0 = 'lv_0';
const dim = (id: string, over: Partial<Dimension> = {}): Dimension => ({ id, a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 0.8, ...over });
const txt = (id: string, over: Partial<TextNote> = {}): TextNote => ({ id, at: { x: 1, y: 1 }, text: 'Sala', height: 2.5, rotation: 0, ...over });

describe('cotas no modelo', () => {
  it('adiciona, altera e remove uma cota no nível, com desfazer', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('d1') });
    expect(levelDimensions(s.project, LV0)).toHaveLength(1);
    s.exec({ type: 'updateDimension', levelId: LV0, id: 'd1', patch: { offset: 1.5 } });
    expect(levelDimensions(s.project, LV0)[0]!.offset).toBe(1.5);
    s.exec({ type: 'removeDimension', levelId: LV0, id: 'd1' });
    expect(levelDimensions(s.project, LV0)).toHaveLength(0);
    s.undo();
    expect(levelDimensions(s.project, LV0)[0]!.offset).toBe(1.5);
    s.undo();
    expect(levelDimensions(s.project, LV0)[0]!.offset).toBe(0.8);
    s.undo();
    expect(levelDimensions(s.project, LV0)).toHaveLength(0);
  });

  it('recusa cota de comprimento zero e não altera o projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('d1', { b: { x: 0, y: 0 } }) })).toThrow('dois pontos distintos');
    expect(levelDimensions(s.project, LV0)).toHaveLength(0);
  });

  it('recusa alteração de cota inexistente e nível inexistente', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'updateDimension', levelId: LV0, id: 'x', patch: { offset: 1 } })).toThrow('Cota inexistente');
    expect(() => s.exec({ type: 'addDimension', levelId: 'lv_nao', dimension: dim('d1') })).toThrow('Nível inexistente');
  });

  it('remover o nível leva as cotas e os textos junto', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'upsertLevel', level: { ...makeLevel({ id: 'lv_1', name: 'Pav. 1', elevation: 3 }) } });
    s.exec({ type: 'addDimension', levelId: 'lv_1', dimension: dim('d1') });
    s.exec({ type: 'addText', levelId: 'lv_1', text: txt('t1') });
    s.exec({ type: 'deleteLevel', id: 'lv_1' });
    expect(s.project.levels.some((l) => l.id === 'lv_1')).toBe(false);
  });
});

describe('textos no modelo', () => {
  it('adiciona, altera e remove um texto, com desfazer', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addText', levelId: LV0, text: txt('t1') });
    s.exec({ type: 'updateText', levelId: LV0, id: 't1', patch: { text: 'Quarto', rotation: 90 } });
    expect(levelTexts(s.project, LV0)[0]).toMatchObject({ text: 'Quarto', rotation: 90 });
    s.exec({ type: 'removeText', levelId: LV0, id: 't1' });
    s.undo();
    expect(levelTexts(s.project, LV0)[0]!.text).toBe('Quarto');
  });

  it('recusa texto vazio, altura não positiva e alteração de texto inexistente', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'addText', levelId: LV0, text: txt('t1', { text: '   ' }) })).toThrow('não pode ser vazio');
    expect(() => s.exec({ type: 'addText', levelId: LV0, text: txt('t1', { height: 0 }) })).toThrow('altura do texto');
    expect(() => s.exec({ type: 'updateText', levelId: LV0, id: 'nao', patch: { text: 'a' } })).toThrow('Texto inexistente');
    expect(levelTexts(s.project, LV0)).toHaveLength(0);
  });

  it('a alteração de texto mantém o id', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addText', levelId: LV0, text: txt('t1') });
    s.exec({ type: 'updateText', levelId: LV0, id: 't1', patch: { id: 'outro', text: 'X' } } as never);
    expect(levelTexts(s.project, LV0)[0]!.id).toBe('t1');
  });
});

describe('exclusão de anotações pelos ids da seleção', () => {
  it('gera remoções só para as cotas e textos cujos ids foram pedidos', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('d1') });
    s.exec({ type: 'addText', levelId: LV0, text: txt('t1') });
    expect(annotationRemovals(s.project, LV0, ['d1', 'e_parede', 't1'])).toEqual([
      { type: 'removeDimension', levelId: LV0, id: 'd1' },
      { type: 'removeText', levelId: LV0, id: 't1' },
    ]);
    expect(annotationRemovals(s.project, LV0, ['zz'])).toEqual([]);
  });
});

describe('anotações na vista de corte/elevação (mesmos comandos da planta, com sectionId)', () => {
  const VIEW = { id: 'sv1', name: 'Corte AA', kind: 'section' as const, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 5 };
  const comVista = (): ProjectStore => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addView', view: VIEW });
    return s;
  };
  const anot = (s: ProjectStore) => s.project.views.find((v) => v.id === 'sv1')?.annotations;

  it('cota e texto entram na vista, com validação do modelo e desfazer rotulado por item', () => {
    const s = comVista();
    s.exec({ type: 'addDimension', levelId: LV0, sectionId: 'sv1', dimension: dim('d1') });
    s.exec({ type: 'addText', levelId: LV0, sectionId: 'sv1', text: txt('t1') });
    expect(anot(s)?.dimensions.map((d) => d.id)).toEqual(['d1']);
    expect(anot(s)?.texts.map((t) => t.id)).toEqual(['t1']);
    expect(levelDimensions(s.project, LV0)).toHaveLength(0);
    expect(s.undoLabel).toBe('Criar texto');
    s.exec({ type: 'updateDimension', levelId: LV0, sectionId: 'sv1', id: 'd1', patch: { offset: 1.2 } });
    expect(anot(s)?.dimensions[0]!.offset).toBe(1.2);
    expect(s.undoLabel).toBe('Editar cota');
    s.exec({ type: 'removeDimension', levelId: LV0, sectionId: 'sv1', id: 'd1' });
    expect(anot(s)?.dimensions).toHaveLength(0);
    s.undo();
    expect(anot(s)?.dimensions[0]!.offset).toBe(1.2);
    s.undo();
    expect(anot(s)?.dimensions[0]!.offset).toBe(0.8);
  });

  it('recusa cota degenerada e cota/texto inexistentes na vista', () => {
    const s = comVista();
    expect(() => s.exec({ type: 'addDimension', levelId: LV0, sectionId: 'sv1', dimension: dim('d1', { b: { x: 0, y: 0 } }) })).toThrow('dois pontos distintos');
    expect(() => s.exec({ type: 'updateDimension', levelId: LV0, sectionId: 'sv1', id: 'x', patch: { offset: 1 } })).toThrow('Cota inexistente');
    expect(() => s.exec({ type: 'addText', levelId: LV0, sectionId: 'sv1', text: txt('t1', { text: ' ' }) })).toThrow('vazio');
    expect(anot(s)).toBeUndefined();
  });

  it('vista inexistente é recusada e o nível continua sendo validado', () => {
    const s = comVista();
    expect(() => s.exec({ type: 'addDimension', levelId: LV0, sectionId: 'nao', dimension: dim('d1') })).toThrow(/inexistente/);
    expect(() => s.exec({ type: 'addDimension', levelId: 'lv_nao', sectionId: 'sv1', dimension: dim('d1') })).toThrow('Nível inexistente');
  });

  it('cada vista de corte tem o seu conjunto; remover tudo volta a vista sem anotações', () => {
    const s = comVista();
    s.exec({ type: 'addView', view: { ...VIEW, id: 'sv2', name: 'Corte BB' } });
    s.exec({ type: 'addDimension', levelId: LV0, sectionId: 'sv1', dimension: dim('d1') });
    s.exec({ type: 'addDimension', levelId: LV0, sectionId: 'sv2', dimension: dim('d2') });
    expect(anot(s)?.dimensions.map((d) => d.id)).toEqual(['d1']);
    expect(s.project.views.find((v) => v.id === 'sv2')?.annotations?.dimensions.map((d) => d.id)).toEqual(['d2']);
    s.exec({ type: 'removeDimension', levelId: LV0, sectionId: 'sv2', id: 'd2' });
    expect(s.project.views.find((v) => v.id === 'sv2')?.annotations).toBeUndefined();
  });
});
