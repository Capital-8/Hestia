import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_OPTIONS } from '../editor/state.ts';
import { WallTiltField } from './OptionsBar.tsx';

describe('Inclinação da Parede (F-D): visível na barra de opções', () => {
  it('a barra de opções mostra o campo de inclinação com o valor da opção (20° = 20)', () => {
    const html = renderToStaticMarkup(createElement(WallTiltField, { o: { ...DEFAULT_OPTIONS, wallTilt: 20 }, set: () => {} }));
    expect(html).toContain('id="opt-wall-tilt"');
    expect(html).toContain('Inclinação');
  });
});
