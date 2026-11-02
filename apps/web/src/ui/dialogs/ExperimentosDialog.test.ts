import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExperimentosDialog } from './ExperimentosDialog.tsx';

/** Marcação de um `<input>` pelo id; o React SSR escreve `checked=""` e `disabled=""` como atributos. */
function entrada(html: string, id: string): string {
  const m = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  if (!m) throw new Error(`sem <input id="${id}">`);
  return m[0];
}

function simularAmbiente(busca: string, salvo: Record<string, string> = {}): void {
  vi.stubGlobal('location', { search: busca });
  vi.stubGlobal('localStorage', {
    getItem: (c: string) => salvo[c] ?? null,
    setItem: () => undefined,
    removeItem: () => undefined,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Experimentais: interruptor por fatia', () => {
  it('padrão desligado: só a A pode ser ligada; as demais ficam desabilitadas com a dica', () => {
    simularAmbiente('');
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-fatia-A')).not.toContain('checked=""');
    expect(entrada(html, 'kernel-fatia-A')).not.toContain('disabled=""');
    for (const f of ['B', 'C', 'D', 'E']) {
      expect(entrada(html, `kernel-fatia-${f}`)).toContain('disabled=""');
      expect(entrada(html, `kernel-fatia-${f}`)).not.toContain('checked=""');
    }
    expect(html).toContain('ainda não disponível');
    expect(html).not.toContain('definido pela URL');
  });

  it('reflete a lista salva em hestia:kernel:fatias', () => {
    simularAmbiente('', { 'hestia:kernel:fatias': 'A' });
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-fatia-A')).toContain('checked=""');
    expect(entrada(html, 'kernel-fatia-A')).not.toContain('disabled=""');
  });

  it('?kernelFatias na URL trava o interruptor e explica "definido pela URL"', () => {
    simularAmbiente('?kernelFatias=A');
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-fatia-A')).toContain('checked=""');
    expect(entrada(html, 'kernel-fatia-A')).toContain('disabled=""');
    expect(html).toContain('definido pela URL');
  });

  it('?kernel=rust na URL liga e trava todas as fatias', () => {
    simularAmbiente('?kernel=rust');
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    for (const f of ['A', 'B', 'C', 'D', 'E']) {
      expect(entrada(html, `kernel-fatia-${f}`)).toContain('checked=""');
      expect(entrada(html, `kernel-fatia-${f}`)).toContain('disabled=""');
    }
  });

  it('modo sombra aparece desabilitado, com a dica "disponível com a A3d"', () => {
    simularAmbiente('');
    const html = renderToStaticMarkup(createElement(ExperimentosDialog));
    expect(entrada(html, 'kernel-sombra')).toContain('disabled=""');
    expect(entrada(html, 'kernel-sombra')).not.toContain('checked=""');
    expect(html).toContain('disponível com a A3d');
  });
});
