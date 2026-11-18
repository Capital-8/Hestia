import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AcabamentoSelect } from './AcabamentoSelect.tsx';
import { SeletorEstavel } from './SeletorEstavel.tsx';

describe('SeletorEstavel', () => {
  it('renderiza opções, valor marcado, desabilitada e optgroup', () => {
    const html = renderToStaticMarkup(createElement(SeletorEstavel, {
      id: 's1',
      value: 'b',
      onChange: () => {},
      opcoes: [
        { valor: '__misto__', rotulo: 'variados', desabilitada: true },
        { valor: 'a', rotulo: 'Alfa', grupo: 'G1' },
        { valor: 'b', rotulo: 'Beta', grupo: 'G1' },
        { valor: 'c', rotulo: 'Gama', grupo: 'G2' },
      ],
    }));
    expect(html).toContain('<select id="s1" class="select">');
    expect(html).toContain('<option value="__misto__" disabled="">variados</option>');
    expect(html).toContain('<optgroup label="G1"><option value="a">Alfa</option><option value="b" selected="">Beta</option></optgroup>');
    expect(html).toContain('<optgroup label="G2"><option value="c">Gama</option></optgroup>');
  });
});

describe('AcabamentoSelect', () => {
  const base = { id: 'p-comp-acabCorpo', rotulo: 'Corpo', onEscolher: () => {} };
  it('fechado mostra o nome do acabamento atual e a amostra de cor', () => {
    const html = renderToStaticMarkup(createElement(AcabamentoSelect, { ...base, valor: 'comp_vidro_incolor', misto: false }));
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Vidro Incolor');
    expect(html).toContain('background:#cfe6ea');
    expect(html).not.toContain('role="listbox"');
  });
  it('valor vazio mostra o padrão do móvel; misto mostra variados', () => {
    expect(renderToStaticMarkup(createElement(AcabamentoSelect, { ...base, valor: '', misto: false }))).toContain('Padrão do móvel');
    expect(renderToStaticMarkup(createElement(AcabamentoSelect, { ...base, valor: '', misto: true }))).toContain('variados');
  });
});
