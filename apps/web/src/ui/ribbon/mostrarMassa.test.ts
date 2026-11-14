import { afterEach, describe, expect, it } from 'vitest';
import { editor } from '../../editor/controller.ts';
import { permanentHiddenOf, viewHiddenTargetOf } from '../../editor/viewVisibility.ts';
import { useUi } from '../../editor/state.ts';
import { ACTIONS, type RibbonCtx } from './actions.ts';
import { TABS } from './tabs.ts';

const inicial = useUi.getState();
afterEach(() => {
  useUi.setState({ view: inicial.view, levelId: inicial.levelId, planKind: inicial.planKind });
  editor.store.exec({ type: 'setViewHidden', target: { kind: 'plan', levelId: inicial.levelId }, hidden: undefined });
  editor.store.exec({ type: 'setViewHidden', target: { kind: '3d' }, hidden: undefined });
});

const ctx = (): RibbonCtx => ({ p: editor.project, selection: [], view: useUi.getState().view } as unknown as RibbonCtx);
const categoriasOcultas = (): readonly string[] => permanentHiddenOf(editor.project, viewHiddenTargetOf(useUi.getState())).categories ?? [];

describe('botão "Mostrar massa" da faixa', () => {
  it('é um botão real na aba Massa e terreno (não mais "soon")', () => {
    const itens = TABS.find((tb) => tb.id === 'massa')!.panels.flatMap((p) => p.items);
    expect(itens.some((it) => it.kind === 'action' && it.action === 'showMass')).toBe(true);
    expect(itens.some((it) => it.kind === 'soon' && typeof it.label !== 'string' && it.label.pt === 'Mostrar massa')).toBe(false);
    // "Massa no local" e "Colocar massa" continuam soon
    for (const pt of ['Massa no local', 'Colocar massa']) expect(itens.some((it) => it.kind === 'soon' && typeof it.label !== 'string' && it.label.pt === pt), pt).toBe(true);
  });

  it('alterna a categoria "mass" na planta ativa e o botão acompanha (pressionado = visível)', () => {
    useUi.setState({ view: 'plan', planKind: 'floor' });
    const acao = ACTIONS.showMass;
    expect(categoriasOcultas()).not.toContain('mass');
    expect(acao.pressed?.(ctx())).toBe(true);
    acao.run();
    expect(categoriasOcultas()).toContain('mass');
    expect(acao.pressed?.(ctx())).toBe(false);
    acao.run();
    expect(categoriasOcultas()).not.toContain('mass');
    expect(acao.pressed?.(ctx())).toBe(true);
  });

  it('cada clique é um passo de desfazer e vale só para a vista ativa', () => {
    useUi.setState({ view: 'plan', planKind: 'floor' });
    ACTIONS.showMass.run();
    expect(permanentHiddenOf(editor.project, { kind: '3d' }).categories ?? []).not.toContain('mass');
    editor.store.undo();
    expect(categoriasOcultas()).not.toContain('mass');
  });

  it('no 3D liga e desliga a categoria na vista 3D', () => {
    useUi.setState({ view: '3d' });
    ACTIONS.showMass.run();
    expect(permanentHiddenOf(editor.project, { kind: '3d' }).categories).toContain('mass');
    expect(ACTIONS.showMass.pressed?.(ctx())).toBe(false);
  });

  it('na prancha o botão fica desativado com o motivo', () => {
    useUi.setState({ view: 'sheet' });
    const why = ACTIONS.showMass.disabled?.({ ...ctx(), view: 'sheet' });
    expect(why).toBeTruthy();
    expect(ACTIONS.showMass.pressed?.({ ...ctx(), view: 'sheet' })).toBe(false);
  });
});
