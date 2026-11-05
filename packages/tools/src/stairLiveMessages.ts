import type { StairRemaining } from '@hestia/engine';
import { fmtNumLang, t as translate, type Lang } from './i18n.ts';

/** Texto fixo do estado em que o nível de topo foi alcançado (PT: constante histórica usada nos testes). */
export const TEXTO_ALCANCADO = translate('pt', 'tl_msg_top_reached');

/** Texto do estado "nível de topo alcançado" no idioma pedido. */
export const textoAlcancado = (lang: Lang = 'pt'): string => translate(lang, 'tl_msg_top_reached');

/** Número com casas fixas e o separador do idioma (PT: vírgula; EN: ponto). */
const numero = (valor: number, casas: number, lang: Lang): string => fmtNumLang(valor, casas, lang);

/**
 * Falta de espelhos até o nível de topo (`falta` > 0) e o comprimento equivalente.
 * Ex.: `faltam 5 espelhos (≈ 1,4 m)`; singular `falta 1 espelho (≈ 0,3 m)`.
 */
export function textoFaltaEspelhos(falta: number, faltaLength: number, lang: Lang = 'pt'): string {
  const espelhos = falta === 1
    ? translate(lang, 'tl_msg_risers_missing_one')
    : translate(lang, 'tl_msg_risers_missing_many', { n: falta });
  return translate(lang, 'tl_msg_risers_missing_len', { state: espelhos, d: numero(faltaLength, 1, lang) });
}

/**
 * Espelhos a mais no cursor (`excess` > 0): a escada termina antes do cursor.
 * Ex.: `passou 2 espelhos: a escada termina antes do cursor`; singular `passou 1 espelho: ...`.
 */
export function textoPassouEspelhos(excess: number, lang: Lang = 'pt'): string {
  return excess === 1
    ? translate(lang, 'tl_msg_risers_passed_one')
    : translate(lang, 'tl_msg_risers_passed_many', { n: excess });
}

/**
 * Rótulo ao vivo da escada livre.
 * Ex.: `16 espelhos · 17,5 cm · piso 28,0 cm · faltam 5 espelhos (≈ 1,4 m)`.
 */
export function rotuloEscadaLivre(risers: number, riserHeight: number, tread: number, estado: string, lang: Lang = 'pt'): string {
  return translate(lang, 'tl_msg_stair_live', {
    n: risers,
    h: numero(riserHeight * 100, 1, lang),
    t: numero(tread * 100, 1, lang),
    state: estado,
  });
}

/** Texto do estado do restante (falta / alcançado / passou). */
export function estadoDoRestante(r: StairRemaining, lang: Lang = 'pt'): string {
  if (r.status === 'falta') return textoFaltaEspelhos(r.falta, r.faltaLength, lang);
  if (r.status === 'alcancado') return textoAlcancado(lang);
  return textoPassouEspelhos(r.excess, lang);
}
