import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDimOverride,
  clearDimOverrides,
  clearDimTarget,
  setDimOverride,
  setDimTarget,
  suspendSelectionDims,
  useUi,
} from './state.ts';

describe('dimOverrides e dimTargets (referências de cota da sessão)', () => {
  beforeEach(() => {
    useUi.setState({ dimOverrides: {}, dimTargets: {}, dimsSuspendedVersion: null, selection: [], tool: 'select' });
  });

  it('setDimOverride grava por chave e preserva as outras', () => {
    setDimOverride('opening:wallLeft', 'axis');
    setDimOverride('opening:openRight', 'casing');
    expect(useUi.getState().dimOverrides).toEqual({ 'opening:wallLeft': 'axis', 'opening:openRight': 'casing' });
    setDimOverride('opening:wallLeft', 'coreFace');
    expect(useUi.getState().dimOverrides['opening:wallLeft']).toBe('coreFace');
  });

  it('clearDimOverride remove só a chave', () => {
    setDimOverride('opening:wall', 'axis');
    setDimOverride('opening:opening', 'clear');
    clearDimOverride('opening:wall');
    expect(useUi.getState().dimOverrides).toEqual({ 'opening:opening': 'clear' });
  });

  it('setDimTarget e clearDimTarget gravam e removem alvos personalizados', () => {
    setDimTarget('wall:w1:right', { kind: 'grid', gridId: 'g1' });
    setDimTarget('wall:w1:left', { kind: 'element', ref: { elementId: 'w2', feature: 'wall-face-lo' } });
    expect(useUi.getState().dimTargets['wall:w1:right']).toEqual({ kind: 'grid', gridId: 'g1' });
    clearDimTarget('wall:w1:right');
    expect(useUi.getState().dimTargets).toEqual({
      'wall:w1:left': { kind: 'element', ref: { elementId: 'w2', feature: 'wall-face-lo' } },
    });
  });

  it('clearDimOverrides esvazia overrides e alvos personalizados', () => {
    setDimOverride('opening:wallLeft', 'axis');
    setDimTarget('wall:w1:right', { kind: 'grid', gridId: 'g1' });
    clearDimOverrides();
    expect(useUi.getState().dimOverrides).toEqual({});
    expect(useUi.getState().dimTargets).toEqual({});
  });

  it('mantém as trocas de referência ao desselecionar ou alternar elementos', () => {
    setDimOverride('wall:w1:right:gapRightB', 'axis');
    setDimTarget('wall:w1:right', { kind: 'grid', gridId: 'g1' });
    useUi.setState({ selection: ['w1'] });
    useUi.setState({ selection: [] });
    useUi.setState({ selection: ['w1'] });
    expect(useUi.getState().dimOverrides).toEqual({ 'wall:w1:right:gapRightB': 'axis' });
    expect(useUi.getState().dimTargets).toEqual({ 'wall:w1:right': { kind: 'grid', gridId: 'g1' } });
  });

  it('a suspensão das cotas temporárias some na próxima ferramenta ou seleção', () => {
    suspendSelectionDims(3);
    expect(useUi.getState().dimsSuspendedVersion).toBe(3);
    useUi.setState({ selection: ['a'] });
    expect(useUi.getState().dimsSuspendedVersion).toBeNull();

    suspendSelectionDims(4);
    useUi.setState({ tool: 'wall' });
    expect(useUi.getState().dimsSuspendedVersion).toBeNull();
  });
});
