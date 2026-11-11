import { describe, expect, it } from 'vitest';
import { createEmptyProject, defaultUnits, makeWall, ProjectStore, type Dimension } from '@hestia/model';
import { findEditDim, resolveDimEditInput, SECTION_REFUSAL } from './dimEditModel.ts';

const mk = (): { s: ProjectStore; d: Dimension } => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'h', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  const d: Dimension = { id: 'dm', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, offset: 0.5, refs: { a: { elementId: 'h', feature: 'wall-axis-a' }, b: { elementId: 'h', feature: 'wall-axis-b' } } };
  s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: d });
  return { s, d };
};
const scope = { view: 'plan', levelId: 'lv_0', planViewId: 'pv_lv_0', planKind: 'floor', sectionId: null };

describe('editor de valor da cota', () => {
  it('acha a cota do nível', () => {
    const { s } = mk();
    expect(findEditDim(s.project, scope, 'dm')?.dim.id).toBe('dm');
    expect(findEditDim(s.project, scope, 'x')).toBeNull();
  });
  it('texto válido gera comandos; inválido e corte são recusados', () => {
    const { s, d } = mk();
    expect(resolveDimEditInput(s.project, d, '4,5', defaultUnits()).ok).toBe(true);
    expect(resolveDimEditInput(s.project, d, 'abc', defaultUnits()).ok).toBe(false);
    expect(resolveDimEditInput(s.project, d, '4', defaultUnits(), { inSection: true })).toEqual({ ok: false, reason: SECTION_REFUSAL });
  });
});
