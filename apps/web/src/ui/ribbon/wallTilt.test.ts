import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import { ACTIONS, type RibbonCtx } from './actions.ts';
import { contextTab } from './context.ts';
import type { RibbonItem } from './model.ts';

const comParede = () => {
  const p = createEmptyProject('vazio');
  const store = new ProjectStore(p);
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: p.defaults.wallTypeId, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  return store.project;
};

const itensDoPainel = (items: readonly RibbonItem[]): RibbonItem[] =>
  items.flatMap((it) => (it.kind === 'stack' ? it.items : [it]));

describe('faixa: botão Inclinar nas paredes selecionadas', () => {
  it('a aba contextual das paredes traz o botão Inclinar no painel Modificar parede', () => {
    const tab = contextTab('select', ['w1'], comParede())!.tab;
    const painel = tab.panels.find((x) => x.id === 'modificar-parede');
    expect(painel).toBeDefined();
    expect(itensDoPainel(painel!.items)).toContainEqual(expect.objectContaining({ kind: 'action', action: 'wallTilt' }));
  });

  it('o botão desabilita sem parede na seleção e habilita com uma parede', () => {
    const p = comParede();
    const base = { tool: 'select', view: 'plan', planKind: 'floor', areaPlanId: null, levelId: 'lv_0', showGrid: false, showUnderlay: false, showRoofProjection: false, propsOpen: false, browserOpen: false, sides: {}, options: {}, p } as unknown as Omit<RibbonCtx, 'selection'>;
    expect(ACTIONS.wallTilt.icon).toBe('slope');
    expect(ACTIONS.wallTilt.disabled!({ ...base, selection: [] } as RibbonCtx)).toBeTruthy();
    expect(ACTIONS.wallTilt.disabled!({ ...base, selection: ['w1'] } as RibbonCtx)).toBe(false);
  });
});
