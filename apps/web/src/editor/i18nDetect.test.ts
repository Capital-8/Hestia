import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectLang, useI18n, type Lang } from './i18n.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  useI18n.setState({ lang: 'pt' });
});

describe('detectLang — idioma inicial do app', () => {
  it('o idioma salvo válido vence mesmo com o navegador em outro idioma', () => {
    expect(detectLang(['ja-JP', 'en-GB'], 'de')).toBe('de');
    expect(detectLang(['fr-FR'], 'pl')).toBe('pl');
    expect(detectLang([], 'it')).toBe('it');
  });

  it('usa o primeiro idioma preferido suportado, não o primeiro da lista', () => {
    expect(detectLang(['en-GB', 'pt-BR'], null)).toBe('en');
    expect(detectLang(['ja-JP', 'de-AT'], null)).toBe('de');
    expect(detectLang(['zh-CN', 'ko', 'es-AR'], null)).toBe('es');
  });

  it('reduz a tag à parte principal antes do hífen', () => {
    expect(detectLang(['pt-PT'], null)).toBe('pt');
    expect(detectLang(['fr-CA'], null)).toBe('fr');
    expect(detectLang(['de-CH'], null)).toBe('de');
  });

  it('sem nenhum idioma preferido suportado, cai em inglês', () => {
    expect(detectLang(['ja-JP'], null)).toBe('en');
    expect(detectLang([], null)).toBe('en');
    expect(detectLang(['zh-CN', 'ko'], null)).toBe('en');
  });

  it('salvo inválido é ignorado e a detecção decide', () => {
    expect(detectLang(['es-MX'], 'xx')).toBe('es');
    expect(detectLang(['it-CH'], '')).toBe('it');
    expect(detectLang(['ja-JP'], 'pt ')).toBe('en');
    expect(detectLang(['de-DE'], 'PT')).toBe('de');
  });

  it('reconhece os sete idiomas suportados por uma tag xx-YY', () => {
    const casos: ReadonlyArray<readonly [string, Lang]> = [
      ['pt-BR', 'pt'],
      ['en-US', 'en'],
      ['es-ES', 'es'],
      ['de-DE', 'de'],
      ['fr-FR', 'fr'],
      ['it-IT', 'it'],
      ['pl-PL', 'pl'],
    ];
    for (const [tag, esperado] of casos) expect(detectLang([tag], null), tag).toBe(esperado);
  });

  it('entradas estranhas nunca lançam e caem em inglês', () => {
    const estranhas = [null, '', 'x', 42, undefined, {}, true] as unknown as string[];
    expect(() => detectLang(estranhas, null)).not.toThrow();
    expect(detectLang(estranhas, null)).toBe('en');
    expect(detectLang(undefined as unknown as readonly string[], null)).toBe('en');
    expect(detectLang(null as unknown as readonly string[], null)).toBe('en');
    expect(detectLang(['ja-JP'], undefined as unknown as string)).toBe('en');
  });

  it('só setLang grava hestia.lang; a detecção sozinha não grava', () => {
    const memoria = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => memoria.set(k, v),
      removeItem: (k: string) => memoria.delete(k),
    });

    expect(detectLang(['de-DE', 'en-GB'], null)).toBe('de');
    expect(memoria.has('hestia.lang')).toBe(false);

    useI18n.getState().setLang('fr');
    expect(memoria.get('hestia.lang')).toBe('fr');
    expect(useI18n.getState().lang).toBe('fr');
  });
});
