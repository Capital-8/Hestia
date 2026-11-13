import { beforeEach, describe, expect, it } from 'vitest';
import type { SubelementoCortina } from '@hestia/model';
import { useUi } from './state.ts';

const sub: SubelementoCortina = { wallId: 'ct1', kind: 'cell', cell: { i: 0, j: 1, s: 0.25, z: 0.75, nu: 4, nv: 2 } };

describe('subelemento da cortina no estado do editor', () => {
  beforeEach(() => {
    useUi.setState({ subElemento: null, selection: ['ct1'], tool: 'select', view: 'plan', levelId: 'lv_0' });
  });

  it('fica guardado enquanto a seleção, a ferramenta, o nível e a vista não mudam', () => {
    useUi.setState({ subElemento: sub });
    useUi.setState({ selection: ['ct1'] });
    expect(useUi.getState().subElemento).toEqual(sub);
  });

  it('some quando a seleção muda de conteúdo (outro elemento, ou nada)', () => {
    useUi.setState({ subElemento: sub });
    useUi.setState({ selection: ['w1'] });
    expect(useUi.getState().subElemento).toBeNull();
    useUi.setState({ subElemento: sub, selection: ['ct1'] });
    useUi.setState({ selection: [] });
    expect(useUi.getState().subElemento).toBeNull();
  });

  it('some ao trocar de ferramenta, de nível ou de vista', () => {
    useUi.setState({ subElemento: sub });
    useUi.setState({ tool: 'wall' });
    expect(useUi.getState().subElemento).toBeNull();
    useUi.setState({ subElemento: sub, tool: 'select' });
    useUi.setState({ levelId: 'lv_1' });
    expect(useUi.getState().subElemento).toBeNull();
    useUi.setState({ subElemento: sub, levelId: 'lv_0' });
    useUi.setState({ view: '3d' });
    expect(useUi.getState().subElemento).toBeNull();
  });
});
