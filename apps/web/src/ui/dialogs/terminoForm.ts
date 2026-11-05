import { TERMINO_MAX_CM, TERMINO_PRIORIDADE_MAX, TERMINO_PRIORIDADE_MIN, terminoAtePrioridade, type LayerLimiteExterno, type LayerTermino } from '@hestia/model';
import { t as translate, type Dict, type Lang } from '../../editor/i18n.ts';

/**
 * Formulário do "Término nas paredes" (decisão 0023 §2, P8; decisão 0025): seletor de seis opções e, conforme a opção,
 * um campo numérico (prioridade 1 a 9 ou deslocamento em cm). Rótulos com até 22 caracteres (densidade da UI).
 */

export type TerminoKind = 'auto' | 'face' | 'nucleo' | 'passa' | 'ate' | 'cm';

const TERMINO_KINDS: readonly TerminoKind[] = ['auto', 'face', 'nucleo', 'passa', 'ate', 'cm'];

const TERMINO_LABEL_KEYS: Record<TerminoKind, keyof Dict> = {
  auto: 'dlc_term_auto',
  face: 'dlc_term_face',
  nucleo: 'dlc_term_core',
  passa: 'dlc_term_pass',
  ate: 'dlc_term_priority',
  cm: 'dlc_term_offset',
};

/** Opções do seletor de término no idioma pedido. */
export function terminoOpcoes(lang: Lang): ReadonlyArray<{ value: TerminoKind; label: string }> {
  return TERMINO_KINDS.map((value) => ({ value, label: translate(lang, TERMINO_LABEL_KEYS[value]) }));
}

/** Opções em PT (compatibilidade com consumidores e testes antigos). */
export const TERMINO_OPCOES: ReadonlyArray<{ value: TerminoKind; label: string }> = terminoOpcoes('pt');

/** Dica curta de cada opção do seletor (decisão 0025). */
const TERMINO_AJUDA_KEYS: Record<TerminoKind, keyof Dict> = {
  auto: 'dlc_term_help_auto',
  face: 'dlc_term_help_face',
  nucleo: 'dlc_term_help_core',
  passa: 'dlc_term_help_pass',
  ate: 'dlc_term_help_priority',
  cm: 'dlc_term_help_offset',
};

/** Dicas do término no idioma pedido. */
export function terminoAjuda(lang: Lang): Record<TerminoKind, string> {
  return {
    auto: translate(lang, TERMINO_AJUDA_KEYS.auto),
    face: translate(lang, TERMINO_AJUDA_KEYS.face),
    nucleo: translate(lang, TERMINO_AJUDA_KEYS.nucleo),
    passa: translate(lang, TERMINO_AJUDA_KEYS.passa),
    ate: translate(lang, TERMINO_AJUDA_KEYS.ate),
    cm: translate(lang, TERMINO_AJUDA_KEYS.cm),
  };
}

/** Dicas em PT (compatibilidade com consumidores e testes antigos). */
export const TERMINO_AJUDA: Record<TerminoKind, string> = terminoAjuda('pt');

/** Tipo e texto do campo de um término guardado (o texto é a prioridade ou o deslocamento). */
export function formDoTermino(t: LayerTermino): { kind: TerminoKind; cmText: string } {
  if (typeof t === 'object' && 'cm' in t) return { kind: 'cm', cmText: String(t.cm) };
  const n = terminoAtePrioridade(t);
  if (n !== null) return { kind: 'ate', cmText: String(n) };
  return { kind: t as TerminoKind, cmText: '0' };
}

/** Término a gravar a partir do seletor e do texto do campo. Devolve `{ erro }` quando o campo não é válido: deslocamento
 * entre −30 e +30 cm (aceita vírgula decimal) ou prioridade inteira de 1 a 9. O automático vira `undefined`.
 */
export function terminoDoForm(kind: TerminoKind, text: string, lang: Lang = 'pt'): { termino: LayerTermino | undefined } | { erro: string } {
  if (kind === 'ate') {
    const n = Number(text.trim());
    if (text.trim() === '' || !Number.isInteger(n) || n < TERMINO_PRIORIDADE_MIN || n > TERMINO_PRIORIDADE_MAX) {
      return { erro: translate(lang, 'dlc_err_term_priority', { min: TERMINO_PRIORIDADE_MIN, max: TERMINO_PRIORIDADE_MAX }) };
    }
    return { termino: { ate: { prioridade: n } } };
  }
  if (kind !== 'cm') return { termino: kind === 'auto' ? undefined : kind };
  const n = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(n) || Math.abs(n) > TERMINO_MAX_CM) return { erro: translate(lang, 'dlc_err_term_range', { max: TERMINO_MAX_CM }) };
  return { termino: { cm: Math.round(n * 10) / 10 } };
}

/**
 * "Limite no perímetro externo" (decisão 0027): até onde a camada de piso ou de laje vai na borda da edificação,
 * independente do término nas paredes internas. `auto` = o contorno do elemento, como antes.
 */
export type LimiteExternoKind = 'auto' | 'parede' | 'nucleo';

const LIMITE_KINDS: readonly LimiteExternoKind[] = ['auto', 'parede', 'nucleo'];

const LIMITE_LABEL_KEYS: Record<LimiteExternoKind, keyof Dict> = {
  auto: 'dlc_limit_element',
  parede: 'dlc_limit_wall_face',
  nucleo: 'dlc_limit_core_face',
};

/** Opções do limite externo no idioma pedido. */
export function limiteExternoOpcoes(lang: Lang): ReadonlyArray<{ value: LimiteExternoKind; label: string }> {
  return LIMITE_KINDS.map((value) => ({ value, label: translate(lang, LIMITE_LABEL_KEYS[value]) }));
}

/** Opções em PT (compatibilidade com consumidores e testes antigos). */
export const LIMITE_EXTERNO_OPCOES: ReadonlyArray<{ value: LimiteExternoKind; label: string }> = limiteExternoOpcoes('pt');

/** Dica curta de cada opção do limite externo (decisão 0027). */
const LIMITE_AJUDA_KEYS: Record<LimiteExternoKind, keyof Dict> = {
  auto: 'dlc_limit_help_auto',
  parede: 'dlc_limit_help_wall',
  nucleo: 'dlc_limit_help_core',
};

/** Dicas do limite externo no idioma pedido. */
export function limiteExternoAjuda(lang: Lang): Record<LimiteExternoKind, string> {
  return {
    auto: translate(lang, LIMITE_AJUDA_KEYS.auto),
    parede: translate(lang, LIMITE_AJUDA_KEYS.parede),
    nucleo: translate(lang, LIMITE_AJUDA_KEYS.nucleo),
  };
}

/** Dicas em PT (compatibilidade com consumidores e testes antigos). */
export const LIMITE_EXTERNO_AJUDA: Record<LimiteExternoKind, string> = limiteExternoAjuda('pt');

/** Limite guardado na camada → opção do seletor. */
export const formDoLimiteExterno = (v: LayerLimiteExterno | undefined): LimiteExternoKind => v ?? 'auto';

/** Limite a gravar a partir do seletor (o contorno do elemento é a ausência do campo). */
export const limiteExternoDoForm = (kind: LimiteExternoKind): LayerLimiteExterno | undefined => (kind === 'auto' ? undefined : kind);
