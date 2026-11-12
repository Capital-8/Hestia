import { describe, expect, it } from 'vitest';
import { createEmptyProject, ProjectStore, roofViewId } from '@hestia/model';
import { editor } from './controller.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';

describe('viewScale segue a vista de planta ativa', () => {
  it('escala gráfica diferente só na cobertura: piso e cobertura leem cada qual a sua', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'updatePlanView', viewId: roofViewId('lv_0'), patch: { graphics: { scale: 25 } } });
    editor.load(s.project, 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', planViewId: 'pv_lv_0', selection: [], sectionId: null, options: DEFAULT_OPTIONS });
    const piso = editor.viewScale();
    useUi.setState({ planViewId: roofViewId('lv_0') });
    expect(editor.viewScale()).toBe(25);
    expect(piso).not.toBe(25);
    useUi.setState({ planViewId: 'pv_lv_0' });
    expect(editor.viewScale()).toBe(piso);
  });
});
