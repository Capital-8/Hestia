import { describe, expect, it } from 'vitest';
import { floorViewId, ProjectStore, projetoComCoberturaDeTeste, legacyRoofViewId as roofViewId } from '@hestia/model';
import type { SectionView } from '@hestia/model';

describe('setViewHidden', () => {
  it('guarda e limpa ocultação da planta de piso com um undo', () => {
    const s = new ProjectStore(projetoComCoberturaDeTeste());
    s.exec({ type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId('lv_0') }, hidden: { elements: ['w1'], categories: ['door'] } });
    expect(s.project.planViews[0]!.hidden).toEqual({ elements: ['w1'], categories: ['door'] });
    s.undo();
    expect(s.project.planViews[0]!.hidden).toBeUndefined();
    s.redo();
    expect(s.project.planViews[0]!.hidden?.elements).toEqual(['w1']);
  });

  it('separa planta de piso, cobertura, área, corte e 3D', () => {
    const s = new ProjectStore(projetoComCoberturaDeTeste());
    const p = s.project;
    const view: SectionView = { id: 'sec1', name: 'Corte', kind: 'section', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, depth: 3 };
    p.views.push(view);
    s.exec({ type: 'batch', commands: [
      { type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId('lv_0') }, hidden: { elements: ['a'] } },
      { type: 'setViewHidden', target: { kind: 'plan', viewId: roofViewId('lv_0') }, hidden: { elements: ['b'] } },
      { type: 'setViewHidden', target: { kind: 'section', viewId: 'sec1' }, hidden: { elements: ['c'] } },
      { type: 'setViewHidden', target: { kind: '3d' }, hidden: { categories: ['wall'] } },
    ] });
    expect(s.project.planViews[0]!.hidden?.elements).toEqual(['a']);
    expect(s.project.planViews[1]!.hidden?.elements).toEqual(['b']);
    expect(s.project.views[0]!.hidden?.elements).toEqual(['c']);
    expect(s.project.view3d?.hidden?.categories).toEqual(['wall']);
  });

  it('remove a entrada quando a lista fica vazia e recusa categoria inválida', () => {
    const s = new ProjectStore(projetoComCoberturaDeTeste());
    s.exec({ type: 'setViewHidden', target: { kind: '3d' }, hidden: { elements: ['a'] } });
    s.exec({ type: 'setViewHidden', target: { kind: '3d' }, hidden: undefined });
    expect(s.project.view3d?.hidden).toBeUndefined();
    expect(() => s.exec({ type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId('lv_0') }, hidden: { categories: ['nope' as never] } })).toThrow(/categorias/);
  });
});
