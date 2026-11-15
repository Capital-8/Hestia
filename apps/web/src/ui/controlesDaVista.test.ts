import { describe, expect, it } from 'vitest';
import { ponteiroEmControle } from './controlesDaVista.ts';

const alvoCom = (casa: boolean): EventTarget => ({ closest: (s: string) => (casa && s === '.navbar' ? {} : null) }) as unknown as EventTarget;

describe('ponteiroEmControle', () => {
  it('reconhece um alvo dentro da barra de navegação', () => {
    expect(ponteiroEmControle(alvoCom(true))).toBe(true);
  });
  it('não ignora o ponteiro que começa na própria vista', () => {
    expect(ponteiroEmControle(alvoCom(false))).toBe(false);
  });
  it('alvo nulo ou sem closest (documento, janela) não é controle', () => {
    expect(ponteiroEmControle(null)).toBe(false);
    expect(ponteiroEmControle({} as EventTarget)).toBe(false);
  });
});
