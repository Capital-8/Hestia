import type { Lang } from '../../editor/i18n.ts';
import parte1 from './ribbon-i18n-1.json';
import parte2 from './ribbon-i18n-2.json';
import parte3 from './ribbon-i18n-3.json';
import parte4 from './ribbon-i18n-4.json';

interface RibbonI18nRow {
  pt: string;
  es: string;
  de: string;
  fr: string;
  it: string;
  pl: string;
}

const ROWS = [...parte1, ...parte2, ...parte3, ...parte4] as RibbonI18nRow[];
const BY_PT = new Map<string, RibbonI18nRow>(ROWS.map((row) => [row.pt, row]));

/**
 * Tradução dos rótulos inline da faixa (`t(pt, en)`), que não passam pelo dicionário central.
 * Retorna `undefined` para pt/en ou quando a string não tem tradução, permitindo o fallback EN.
 */
export function ribbonTxt(pt: string, lang: Lang): string | undefined {
  if (lang === 'pt' || lang === 'en') return undefined;
  return BY_PT.get(pt)?.[lang];
}
