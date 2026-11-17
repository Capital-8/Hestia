import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { toggleGravidade, useUi } from '../editor/state.ts';
import { GravidadeButton } from './GravidadeButton.tsx';

// A renderização de servidor lê o estado inicial do zustand; o teste lê o estado corrente.
vi.mock('../editor/state.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../editor/state.ts')>();
  const useUi = Object.assign((sel: (s: unknown) => unknown) => sel(real.useUi.getState()), real.useUi);
  return { ...real, useUi };
});

afterEach(() => useUi.setState({ gravidade: false }));

const html = (): string => renderToStaticMarkup(createElement(GravidadeButton));

describe('GravidadeButton', () => {
  it('desligado: pressionado falso e marca OFF; ligado: pressionado verdadeiro, sem OFF', () => {
    useUi.setState({ gravidade: false });
    const off = html();
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('Gravidade');
    expect(off).toContain('OFF');
    useUi.setState({ gravidade: true });
    const on = html();
    expect(on).toContain('aria-pressed="true"');
    expect(on).not.toContain('OFF');
  });

  it('o clique usa toggleGravidade, que liga e desliga o campo', () => {
    useUi.setState({ gravidade: false });
    expect(toggleGravidade()).toBe(true);
    expect(html()).toContain('aria-pressed="true"');
    expect(toggleGravidade()).toBe(false);
    expect(html()).toContain('aria-pressed="false"');
  });

  it('a barra de status traz o botão logo depois de Orto', () => {
    const fonte = readFileSync(new URL('./StatusBar.tsx', import.meta.url), 'utf8');
    expect(fonte).toMatch(/<OrthoButton \/>\s*<GravidadeButton \/>/);
  });
});
