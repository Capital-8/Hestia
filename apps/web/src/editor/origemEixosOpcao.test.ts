import { describe, expect, it } from 'vitest';
import { useUi } from './state.ts';

describe('opção Eixos da origem', () => {
  it('vem ligada por padrão e é preferência da tela (fora do projeto)', () => {
    expect(useUi.getState().showOrigemEixos).toBe(true);
    useUi.setState({ showOrigemEixos: false });
    expect(useUi.getState().showOrigemEixos).toBe(false);
    useUi.setState({ showOrigemEixos: true });
  });
});
