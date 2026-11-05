import { RAMP_SLOPE_EPS, formatRampPercent, formatRampRatio } from '@hestia/model';
import { fmtNumLang, t as translate, type Lang } from './i18n.ts';

/** Tolerância do desnível (m): até ela o nível de topo está alcançado. */
export const RAMP_LEVEL_TOLERANCE = 0.005;

/** Texto fixo do estado em que o nível de topo foi alcançado (PT: constante histórica usada nos testes). */
export const TEXTO_NIVEL_ALCANCADO = translate('pt', 'tl_msg_top_reached');

/** Texto do estado "nível de topo alcançado" no idioma pedido. */
export const textoNivelAlcancado = (lang: Lang = 'pt'): string => translate(lang, 'tl_msg_top_reached');

/** Número com casas fixas e o separador do idioma (PT: vírgula; EN: ponto). */
const numero = (valor: number, casas: number, lang: Lang): string => fmtNumLang(valor, casas, lang);

/** Comprimento de rampa, 1 casa: `4,2 m`. */
const comprimento = (metros: number, lang: Lang): string => `${numero(metros, 1, lang)} m`;

/** Desnível, 2 casas: `0,35 m`. */
const desnivel = (metros: number, lang: Lang): string => `${numero(metros, 2, lang)} m`;

/** Comprimento de rampa equivalente ao desnível, na inclinação dada; vazio se a inclinação não é positiva. */
const trechoEquivalente = (metros: number, slope: number, lang: Lang, key: 'tl_msg_rise_missing_ramp' | 'tl_msg_rise_passed_ramp'): string =>
  slope > 0 ? translate(lang, key, { l: comprimento(metros / slope, lang) }) : '';

/**
 * Falta de desnível no modo inclinação (`falta` > 0, em m).
 * Ex.: `faltam 0,35 m de desnível (≈ 4,2 m de rampa)`.
 */
export function textoFaltaDesnivel(falta: number, slope: number, lang: Lang = 'pt'): string {
  return translate(lang, 'tl_msg_rise_missing', {
    d: desnivel(falta, lang),
    ramp: trechoEquivalente(falta, slope, lang, 'tl_msg_rise_missing_ramp'),
  });
}

/**
 * Sobra de desnível no modo inclinação (`passou` > 0, em m): a rampa termina antes do cursor.
 * Ex.: `passou 0,10 m (≈ 1,2 m): termina antes do cursor`.
 */
export function textoPassouDesnivel(passou: number, slope: number, lang: Lang = 'pt'): string {
  return translate(lang, 'tl_msg_rise_passed', {
    d: desnivel(passou, lang),
    ramp: trechoEquivalente(passou, slope, lang, 'tl_msg_rise_passed_ramp'),
  });
}

/**
 * Resultado no modo comprimento: a inclinação final é a que sai do comprimento digitado.
 * `slopeMax` = máximo da norma (null = sem tabela); `faltaComprimento` (m) só aparece quando passa do máximo.
 * Ex.: `Resulta 9,40 % (1:10,6) · acima do máximo 8,33 % · faltam ≈ 1,3 m`.
 */
export function textoResultaInclinacao(slope: number, slopeMax: number | null, faltaComprimento: number, lang: Lang = 'pt'): string {
  const resulta = `Resulta ${formatRampPercent(slope)} (${formatRampRatio(slope)})`;
  if (slopeMax === null) return resulta;
  if (slope <= slopeMax + RAMP_SLOPE_EPS) return `${resulta} · ${translate(lang, 'tl_msg_within_code')}`;
  const falta = faltaComprimento > 0 ? translate(lang, 'tl_msg_above_max_missing', { d: comprimento(faltaComprimento, lang) }) : '';
  return translate(lang, 'tl_msg_above_max', { result: resulta, pct: formatRampPercent(slopeMax), missing: falta });
}

/**
 * Rótulo do modo inclinação, com a inclinação de trabalho na frente.
 * `falta` é o desnível que sobra (> 0 falta, < 0 passou), com tolerância de `RAMP_LEVEL_TOLERANCE`.
 * Ex.: `8,33 % (1:12) · faltam 0,35 m de desnível (≈ 4,2 m de rampa)`.
 */
export function rotuloInclinacao(slope: number, falta: number, lang: Lang = 'pt'): string {
  const prefixo = `${formatRampPercent(slope)} (${formatRampRatio(slope)}) · `;
  if (Math.abs(falta) <= RAMP_LEVEL_TOLERANCE) return `${prefixo}${textoNivelAlcancado(lang)}`;
  if (falta > 0) return `${prefixo}${textoFaltaDesnivel(falta, slope, lang)}`;
  return `${prefixo}${textoPassouDesnivel(-falta, slope, lang)}`;
}
