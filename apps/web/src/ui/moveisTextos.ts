import { t, useI18n, type Dict } from '../editor/i18n.ts';

/**
 * Textos da frente de móveis fora do React (cálculo de limites, status, avisos de funções puras).
 * Componentes usam `useT()`; aqui o idioma vem do store, no momento da chamada.
 */
export function tm(key: keyof Dict, args?: Record<string, string | number>): string {
  return t(useI18n.getState().lang, key, args);
}

/** Nome de um acabamento 3D no idioma ativo. O nome PT do catálogo é o fallback quando a chave falta. */
export function nomeDoAcabamento(id: string, nomePt: string): string {
  const chave = `mov_acab_${id}` as keyof Dict;
  const texto = tm(chave);
  return texto === String(chave) ? nomePt : texto;
}
