import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PadraoSelect } from './materialsCampos.tsx';

describe('seletor de padrão com miniaturas', () => {
  it('mostra os 21 padrões como botões de rádio e marca só o valor atual', () => {
    const markup = renderToStaticMarkup(createElement(PadraoSelect, { id: 'padrao-teste', label: 'Padrão', value: 'brick', onChange: () => undefined }));
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('id="padrao-teste"');
    expect((markup.match(/<button[^>]*role="radio"/g) ?? []).length).toBe(21);
    expect((markup.match(/aria-checked="true"/g) ?? []).length).toBe(1);
    expect(markup).toContain('Alvenaria');
    expect(markup).toContain('Bloco de concreto');
    expect(markup).toContain('Aço');
  });
});
