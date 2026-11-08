import { TERMINO_MAX_CM, TERMINO_PRIORIDADE_MAX, TERMINO_PRIORIDADE_MIN, terminoAtePrioridade, type FuncaoRefParede, type Layer, type LayerLimiteExterno, type LayerTermino, type TerminoCamada } from '@hestia/model';
import { t as translate, type Dict, type Lang } from '../../editor/i18n.ts';

/**
 * Formulário do "Término nas paredes" (decisão 0023 §2, P8; decisão 0025): seletor de seis opções e, conforme a opção,
 * um campo numérico (prioridade 1 a 9 ou deslocamento em cm). Rótulos com até 22 caracteres (densidade da UI).
 */

export type TerminoKind = 'auto' | 'face' | 'nucleo' | 'passa' | 'ate' | 'cm' | 'camada';

const TERMINO_KINDS: readonly TerminoKind[] = ['auto', 'face', 'nucleo', 'passa', 'ate', 'cm', 'camada'];

const TERMINO_LABEL_KEYS: Record<TerminoKind, keyof Dict> = {
  auto: 'dlc_term_auto',
  face: 'dlc_term_face',
  nucleo: 'dlc_term_core',
  passa: 'dlc_term_pass',
  ate: 'dlc_term_priority',
  cm: 'dlc_term_offset',
  camada: 'dlc_term_cam_kind',
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
  camada: 'dlc_term_cam_help',
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
    camada: translate(lang, TERMINO_AJUDA_KEYS.camada),
  };
}

/** Dicas em PT (compatibilidade com consumidores e testes antigos). */
export const TERMINO_AJUDA: Record<TerminoKind, string> = terminoAjuda('pt');

/** Campos do modo "Até uma camada da parede" (o recuo fica em texto, como o campo digitado). */
export interface CamadaForm { funcao: FuncaoRefParede; lado: TerminoCamada['lado']; face: TerminoCamada['face']; cmText: string }

/** Valor inicial do modo: substrato do lado oposto, face mais próxima, sem recuo (o exemplo da ajuda). */
export const CAMADA_FORM_PADRAO: CamadaForm = { funcao: 'substrate', lado: 'distante', face: 'proxima', cmText: '0' };

const CAMADA_FUNCOES: readonly FuncaoRefParede[] = ['structure', 'substrate', 'thermal', 'membrane', 'finish1', 'finish2', 'eixo'];
const CAMADA_FUNCAO_KEYS: Record<FuncaoRefParede, keyof Dict> = {
  structure: 'dlc_term_cam_f_structure',
  substrate: 'dlc_term_cam_f_substrate',
  thermal: 'dlc_term_cam_f_thermal',
  membrane: 'dlc_term_cam_f_membrane',
  finish1: 'dlc_term_cam_f_finish1',
  finish2: 'dlc_term_cam_f_finish2',
  eixo: 'dlc_term_cam_f_axis',
};
const CAMADA_LADO_KEYS: Record<TerminoCamada['lado'], keyof Dict> = { proximo: 'dlc_term_cam_side_near', distante: 'dlc_term_cam_side_far' };
const CAMADA_FACE_KEYS: Record<TerminoCamada['face'], keyof Dict> = { proxima: 'dlc_term_cam_face_near', meio: 'dlc_term_cam_face_mid', distante: 'dlc_term_cam_face_far' };

/** Opções dos três seletores do modo "Até uma camada da parede" no idioma pedido. */
export function camadaOpcoes(lang: Lang): {
  funcoes: ReadonlyArray<{ value: FuncaoRefParede; label: string }>;
  lados: ReadonlyArray<{ value: TerminoCamada['lado']; label: string }>;
  faces: ReadonlyArray<{ value: TerminoCamada['face']; label: string }>;
} {
  return {
    funcoes: CAMADA_FUNCOES.map((value) => ({ value, label: translate(lang, CAMADA_FUNCAO_KEYS[value]) })),
    lados: (Object.keys(CAMADA_LADO_KEYS) as Array<TerminoCamada['lado']>).map((value) => ({ value, label: translate(lang, CAMADA_LADO_KEYS[value]) })),
    faces: (Object.keys(CAMADA_FACE_KEYS) as Array<TerminoCamada['face']>).map((value) => ({ value, label: translate(lang, CAMADA_FACE_KEYS[value]) })),
  };
}

/** Predefinições de um clique que preenchem o término das camadas da laje ou do piso. */
export type PredefinicaoId = 'laje-substrato-externo' | 'piso-acabamento-interno' | 'laje-face-externa';

interface Predefinicao { id: PredefinicaoId; label: keyof Dict; ajuda: keyof Dict; alvo: (l: Layer) => boolean; camada: TerminoCamada }

const PREDEFINICOES: readonly Predefinicao[] = [
  // Só a camada estrutural (pela função da camada); as demais ficam como estão.
  { id: 'laje-substrato-externo', label: 'dlc_term_cam_p1', ajuda: 'dlc_term_cam_p1h', alvo: (l) => l.function === 'structure', camada: { funcao: 'substrate', lado: 'distante', face: 'proxima', cm: 0 } },
  { id: 'piso-acabamento-interno', label: 'dlc_term_cam_p2', ajuda: 'dlc_term_cam_p2h', alvo: () => true, camada: { funcao: 'finish1', lado: 'proximo', face: 'proxima', cm: 0 } },
  { id: 'laje-face-externa', label: 'dlc_term_cam_p3', ajuda: 'dlc_term_cam_p3h', alvo: () => true, camada: { funcao: 'finish2', lado: 'distante', face: 'distante', cm: 0 } },
];

/** Predefinições com rótulo e explicação no idioma pedido. */
export function predefinicoes(lang: Lang): ReadonlyArray<{ id: PredefinicaoId; label: string; ajuda: string }> {
  return PREDEFINICOES.map((p) => ({ id: p.id, label: translate(lang, p.label), ajuda: translate(lang, p.ajuda) }));
}

/** Camadas com o término da predefinição gravado nas que ela alcança (as demais ficam intactas). */
export function aplicarPredefinicao(id: PredefinicaoId, layers: readonly Layer[]): Layer[] {
  const p = PREDEFINICOES.find((x) => x.id === id);
  if (!p) return [...layers];
  return layers.map((l) => (p.alvo(l) ? { ...l, termino: { camada: { ...p.camada } } } : l));
}

/** Tipo e texto do campo de um término guardado (o texto é a prioridade ou o deslocamento). */
export function formDoTermino(t: LayerTermino): { kind: TerminoKind; cmText: string; camada?: CamadaForm } {
  if (typeof t === 'object' && 'camada' in t) {
    const c = t.camada;
    return { kind: 'camada', cmText: '0', camada: { funcao: c.funcao, lado: c.lado, face: c.face, cmText: String(c.cm) } };
  }
  if (typeof t === 'object' && 'cm' in t) return { kind: 'cm', cmText: String(t.cm) };
  const n = terminoAtePrioridade(t);
  if (n !== null) return { kind: 'ate', cmText: String(n) };
  return { kind: t as TerminoKind, cmText: '0' };
}

/** Término a gravar a partir do seletor e do texto do campo. Devolve `{ erro }` quando o campo não é válido: deslocamento
 * entre −30 e +30 cm (aceita vírgula decimal) ou prioridade inteira de 1 a 9. O automático vira `undefined`.
 */
export function terminoDoForm(kind: TerminoKind, text: string, lang: Lang = 'pt', camada: CamadaForm = CAMADA_FORM_PADRAO): { termino: LayerTermino | undefined } | { erro: string } {
  if (kind === 'camada') {
    const n = Number(camada.cmText.trim().replace(',', '.'));
    if (camada.cmText.trim() === '' || !Number.isFinite(n) || Math.abs(n) > TERMINO_MAX_CM) return { erro: translate(lang, 'dlc_err_term_range', { max: TERMINO_MAX_CM }) };
    return { termino: { camada: { funcao: camada.funcao, lado: camada.lado, face: camada.face, cm: Math.round(n * 10) / 10 } } };
  }
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
