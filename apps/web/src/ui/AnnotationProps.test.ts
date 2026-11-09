import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectStore, areaPlanOf, angularDimensionData, createEmptyProject, levelDimensions, levelTexts, makeWall, planAnnotationsOf, sectionAnnotationsOf, type Dimension } from '@hestia/model';
import { createAreaPlanAction } from '../editor/areaPlanActions.ts';
import { editor } from '../editor/controller.ts';
import { deleteSelectionIn } from '../editor/deleteIds.ts';
import { useUi } from '../editor/state.ts';
import { AnnotationProps, angularSidePatch, selectedNote, updateTextIn } from './AnnotationProps.tsx';

// O painel real assina o projeto pelo editor; no teste basta o projeto atual (sem `getServerSnapshot` no render de servidor).
vi.mock('../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor/controller.ts')>();
  return { ...actual, useProject: () => actual.editor.project };
});

afterEach(() => {
  editor.store.exec({ type: 'setSettings', patch: { units: undefined } });
});

const LV0 = 'lv_0';

describe('seleção de anotação no painel de propriedades', () => {
  it('reconhece a cota e o texto selecionados pelo id no nível ativo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
    s.exec({ type: 'addText', levelId: LV0, text: { id: 't1', at: { x: 1, y: 1 }, text: 'Sala', height: 2.5, rotation: 0 } });
    expect(selectedNote(s.project, LV0, ['d1'])?.dim?.id).toBe('d1');
    expect(selectedNote(s.project, LV0, ['t1'])?.text?.text).toBe('Sala');
    expect(selectedNote(s.project, LV0, ['d1', 't1'])).toBeNull();
    expect(selectedNote(s.project, 'lv_outro', ['d1'])).toBeNull();
    expect(selectedNote(s.project, LV0, [])).toBeNull();
  });

  it('excluir a seleção remove a cota pelo próprio comando e volta com o desfazer', async () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
    useUi.setState({ selection: ['d1'], levelId: LV0 });
    await deleteSelectionIn(s);
    expect(levelDimensions(s.project, LV0)).toHaveLength(0);
    expect(useUi.getState().selection).toEqual([]);
    s.undo();
    expect(levelDimensions(s.project, LV0)).toHaveLength(1);
  });

  it('excluir texto e nada mais: a seleção sem elementos não quebra', async () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addText', levelId: LV0, text: { id: 't1', at: { x: 1, y: 1 }, text: 'X', height: 2.5, rotation: 0 } });
    useUi.setState({ selection: ['t1', 'nao_existe'], levelId: LV0 });
    await deleteSelectionIn(s);
    expect(levelTexts(s.project, LV0)).toHaveLength(0);
  });
});

describe('anotações da planta de área no painel', () => {
  it('selectedNote com planId acha cota/texto da planta e não os do nível', () => {
    const s = new ProjectStore(createEmptyProject());
    const planId = createAreaPlanAction(s, LV0);
    s.exec({ type: 'addDimension', levelId: LV0, planId, dimension: { id: 'dp', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
    s.exec({ type: 'addText', levelId: LV0, planId, text: { id: 'tp', at: { x: 1, y: 1 }, text: 'Depósito', height: 2.5, rotation: 0 } });
    s.exec({ type: 'addText', levelId: LV0, text: { id: 'tl', at: { x: 2, y: 2 }, text: 'Piso', height: 2.5, rotation: 0 } });
    const p = s.project;
    expect(selectedNote(p, LV0, ['dp'], planId)?.dim?.id).toBe('dp');
    expect(selectedNote(p, LV0, ['tp'], planId)?.text?.id).toBe('tp');
    // Sem planId procura no nível: o texto da planta não aparece e o do nível, sim.
    expect(selectedNote(p, LV0, ['tp'])).toBeNull();
    expect(selectedNote(p, LV0, ['tl'], planId)).toBeNull();
    expect(selectedNote(p, LV0, ['tl'])?.text?.id).toBe('tl');
  });

  it('editar texto da planta grava em plan.annotations, não no nível', () => {
    const s = new ProjectStore(createEmptyProject());
    const planId = createAreaPlanAction(s, LV0);
    s.exec({ type: 'addText', levelId: LV0, planId, text: { id: 'tp', at: { x: 1, y: 1 }, text: 'Antes', height: 2.5, rotation: 0 } });
    updateTextIn(s, LV0, 'tp', { text: 'Depois\nda obra', width: 45, frame: true }, planId);
    const plano = planAnnotationsOf(areaPlanOf(s.project, planId)!).texts;
    expect(plano).toHaveLength(1);
    expect(plano[0]).toMatchObject({ text: 'Depois\nda obra', width: 45, frame: true });
    expect(levelTexts(s.project, LV0)).toHaveLength(0);
  });

  it('excluir na planta de área remove a anotação da planta e não apaga o modelo', async () => {
    const s = new ProjectStore(createEmptyProject());
    const planId = createAreaPlanAction(s, LV0);
    s.exec({ type: 'addText', levelId: LV0, planId, text: { id: 'tp', at: { x: 1, y: 1 }, text: 'Depósito', height: 2.5, rotation: 0 } });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, locationLine: 'finishInterior' }) });
    useUi.setState({ view: 'plan', planKind: 'area', areaPlanId: planId, levelId: LV0, selection: ['tp', 'w1'] });
    await deleteSelectionIn(s);
    expect(planAnnotationsOf(areaPlanOf(s.project, planId)!).texts).toHaveLength(0);
    expect(s.project.elements['w1']).toBeDefined();
    expect(useUi.getState().selection).toEqual([]);
    s.undo();
    expect(planAnnotationsOf(areaPlanOf(s.project, planId)!).texts).toHaveLength(1);
  });

  it('o valor da cota e a unidade seguem as unidades do projeto', () => {
    editor.store.exec({ type: 'setSettings', patch: { units: { length: { unit: 'cm', decimals: 1 } } } });
    const dim: Dimension = { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 };
    const html = renderToStaticMarkup(createElement(AnnotationProps, { dim }));
    expect(html).toContain('400,0 cm');
    expect(html).toContain('value="project" selected=""');
  });
});

describe('cota angular: lado Volta', () => {
  const deg = Math.PI / 180;

  it('de Maior (107,3°) para Volta (252,7°) recalcula valor e direção sem mover paredes', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: LV0, a: { x: -3, y: 0 }, b: { x: 3, y: 0 } }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: LV0, a: { x: -3 * Math.cos(72.7 * deg), y: -3 * Math.sin(72.7 * deg) }, b: { x: 3 * Math.cos(72.7 * deg), y: 3 * Math.sin(72.7 * deg) } }) });
    const wallsBefore = { w1: s.project.elements['w1'], w2: s.project.elements['w2'] };
    const to = { x: Math.cos(72.7 * deg), y: Math.sin(72.7 * deg) };
    const major = angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, to, 1.5, 'major', 'w1:eixo', 'w2:eixo');
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'dang', a: { x: 0, y: 0 }, b: { x: major.to.x * 1.5, y: major.to.y * 1.5 }, offset: 0, angular: major } });

    const patch = angularSidePatch(major, 'reflex');
    expect(patch.side).toBe('reflex');
    expect(patch.base).toBe('major');
    expect(patch.value).toBeCloseTo(252.7 * deg, 9);
    expect(patch.to).toEqual(major.to);

    s.exec({ type: 'updateDimension', levelId: LV0, id: 'dang', patch: { angular: { ...major, ...patch } } });
    const saved = levelDimensions(s.project, LV0)[0]!;
    expect(saved.angular!.value).toBeCloseTo(252.7 * deg, 9);
    expect(saved.angular!.side).toBe('reflex');
    expect(s.project.elements['w1']).toEqual(wallsBefore.w1);
    expect(s.project.elements['w2']).toEqual(wallsBefore.w2);

    // Voltar para o lado que a volta complementa recupera o Maior original (107,3°).
    const back = angularSidePatch(saved.angular!, 'major');
    expect(back.value).toBeCloseTo(107.3 * deg, 9);
    expect(back.to).toEqual(major.to);
  });

  it('de Menor (72,7°) para Volta dá 252,7° (360° − suplementar)', () => {
    const to = { x: Math.cos(72.7 * deg), y: Math.sin(72.7 * deg) };
    const minor = angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, to, 1.5, 'minor', 'a', 'b');
    const patch = angularSidePatch(minor, 'reflex');
    expect(patch.base).toBe('major');
    expect(patch.value).toBeCloseTo(252.7 * deg, 9);
  });

  it('o seletor Lado oferece apenas Menor e Maior', () => {
    const dim: Dimension = {
      id: 'dang',
      a: { x: 0, y: 0 },
      b: { x: 0, y: 2 },
      offset: 0,
      angular: angularDimensionData({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, 2, 'minor', 'a', 'b'),
    };
    const html = renderToStaticMarkup(createElement(AnnotationProps, { dim }));
    expect(html).toContain('Menor');
    expect(html).toContain('Maior');
    expect(html).not.toContain('Volta (360° − ângulo)');
    expect(html).toContain('value="minor" selected=""');
  });
});

describe('anotações do corte no painel de propriedades', () => {
  const VIEW = { id: 'sv1', name: 'Corte AA', kind: 'section' as const, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 3 };
  const comCorte = (): ProjectStore => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addView', view: VIEW });
    return s;
  };

  it('selectedNote com sectionId acha cota/texto da vista e não os do nível', () => {
    const s = comCorte();
    s.exec({ type: 'addDimension', levelId: LV0, sectionId: 'sv1', dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 0.4 } });
    s.exec({ type: 'addText', levelId: LV0, sectionId: 'sv1', text: { id: 't1', at: { x: 1, y: 1 }, text: 'Nota', height: 2.5, rotation: 0 } });
    s.exec({ type: 'addDimension', levelId: LV0, dimension: { id: 'dl', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, offset: 0.3 } });
    const p = s.project;
    expect(selectedNote(p, LV0, ['d1'], null, 'sv1')).toMatchObject({ section: true, dim: { id: 'd1' } });
    expect(selectedNote(p, LV0, ['t1'], null, 'sv1')?.text?.text).toBe('Nota');
    expect(selectedNote(p, LV0, ['dl'], null, 'sv1')).toBeNull();
    expect(selectedNote(p, LV0, ['d1'])).toBeNull();
  });

  it('editar o texto do corte grava na vista e não no nível', () => {
    const s = comCorte();
    s.exec({ type: 'addText', levelId: LV0, sectionId: 'sv1', text: { id: 't1', at: { x: 1, y: 1 }, text: 'Antes', height: 2.5, rotation: 0 } });
    updateTextIn(s, LV0, 't1', { text: 'Depois' }, null, 'sv1');
    expect(sectionAnnotationsOf(s.project.views.find((v) => v.id === 'sv1')).texts[0]!.text).toBe('Depois');
    expect(levelTexts(s.project, LV0)).toHaveLength(0);
    s.undo();
    expect(sectionAnnotationsOf(s.project.views.find((v) => v.id === 'sv1')).texts[0]!.text).toBe('Antes');
  });

  it('o painel mede a cota do corte pelas pontas gravadas (sem resolver refs de parede da planta)', () => {
    const dim: Dimension = {
      id: 'd1',
      a: { x: 0, y: 0 },
      b: { x: 3, y: 0 },
      offset: 0.4,
      refs: { a: { wallId: 'w_nao_existe', end: 'a' } },
    };
    const html = renderToStaticMarkup(createElement(AnnotationProps, { dim, section: true, sectionId: 'sv1' }));
    expect(html).toContain('3,00 m');
    expect(html).toContain('Família');
  });

  it('o painel mostra o valor da família da cota e a deixa trocar de família', () => {
    editor.store.exec({ type: 'upsertDimensionFamily', family: { id: 'fam_cm', name: 'Centímetros', tick: 'slash', tickSize: 2.8, textHeight: 2.5, font: 'Arial', extensionGap: 1.5, extensionOvershoot: 2, textPlacement: 'above', textGap: 1.5, readConvention: 'aligned', textFit: 'leader', leaderWhenNoFit: true, stackSpacing: 7, unit: 'cm', precision: 0, prefix: '', suffix: '' } });
    editor.store.exec({ type: 'setDefaultDimensionFamily', id: 'fam_cm' });
    const dim: Dimension = { id: 'd1', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 0.4, familyId: 'fam_cm' };
    const html = renderToStaticMarkup(createElement(AnnotationProps, { dim }));
    expect(html).toContain('300 cm');
    expect(html).toContain('Centímetros');
    expect(html).toContain('prop-dimfamily-edit');
    editor.store.exec({ type: 'removeDimensionFamily', id: 'fam_cm' });
  });
});
