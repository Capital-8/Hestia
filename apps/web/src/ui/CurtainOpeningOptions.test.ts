import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { t } from '../editor/i18n.ts';
import { CurtainOpeningModes } from './OptionsBar.tsx';

/** Modo, alinhamento e inversões da porta/janela na cortina (decisão 0056, §7.3). A parte pura: as opções entram, o patch sai. */
type Opcoes = Parameters<typeof CurtainOpeningModes>[0]['opcoes'];
const render = (opcoes: Opcoes, onChange = (): void => {}): string => renderToStaticMarkup(createElement(CurtainOpeningModes, { opcoes, onChange }));

describe('barra de opções da porta/janela na cortina', () => {
  it('modo padrão "preencher célula": o seletor de modo traz as duas opções e não mostra o alinhamento', () => {
    const html = render({});
    expect(html).toContain('id="opt-curtain-fit"');
    expect(html).toContain(t('pt', 'pct_fit_cell'));
    expect(html).toContain(t('pt', 'pct_fit_grid'));
    expect(html).not.toContain('id="opt-curtain-align"');
  });

  it('modo "ajustar grade à porta" mostra o alinhamento com centro, início e fim', () => {
    const html = render({ curtainFit: 'grid' });
    expect(html).toContain('id="opt-curtain-align"');
    expect(html).toContain(t('pt', 'pct_justify_center'));
    expect(html).toContain(t('pt', 'pct_justify_start'));
    expect(html).toContain(t('pt', 'pct_justify_end'));
  });

  it('as duas inversões aparecem como botões, sem pressão quando desligadas', () => {
    const html = render({});
    expect(html).toMatch(/id="opt-curtain-hand"[^>]*aria-pressed="false"/);
    expect(html).toMatch(/id="opt-curtain-facing"[^>]*aria-pressed="false"/);
  });

  it('inversão ligada nas opções aparece pressionada', () => {
    expect(render({ openingFlipHand: true })).toMatch(/id="opt-curtain-hand"[^>]*aria-pressed="true"/);
  });

});
