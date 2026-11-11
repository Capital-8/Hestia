import type { Layer, LayerLimiteExterno, LayerTermino, TerminoCamada } from './types.ts';

/**
 * Término na junção por camada (decisão 0023 §2, P8; regras por camada, decisão 0025). Campo opcional e aditivo: sem o
 * campo vale `auto`, então arquivo antigo abre igual. Nenhuma regra usa nome ou material: o término é uma escolha por
 * atributo de camada (prioridade, posição no núcleo e a própria regra).
 */

/** Deslocamento máximo, em cm, nos dois sentidos (decisão 0023 §2). */
export const TERMINO_MAX_CM = 30;

/** Faixa da prioridade do término `{ ate }` (decisão 0025): 1 é a maior prioridade, 9 a menor. */
export const TERMINO_PRIORIDADE_MIN = 1;
export const TERMINO_PRIORIDADE_MAX = 9;

/** Término efetivo da camada (padrão `auto` quando ausente). */
export const terminoOf = (l: Pick<Layer, 'termino'>): LayerTermino => l.termino ?? 'auto';

/**
 * Regra de parede (decisão 0025): `face`, `nucleo`, `passa` ou `{ ate }`. A região da camada vem dessa regra, e a junção
 * automática por prioridade contra as paredes não a recorta. O deslocamento em cm não entra: segue a junção como antes.
 */
export const terminoEhRegraParede = (l: Pick<Layer, 'termino'>): boolean => {
  const t = terminoOf(l);
  return t === 'face' || t === 'nucleo' || t === 'passa' || (typeof t === 'object' && ('ate' in t || 'camada' in t));
};

/** Término por camada da parede (decisão 0054), ou null nos demais valores. */
export const terminoCamadaOf = (t: LayerTermino): TerminoCamada | null => (typeof t === 'object' && 'camada' in t ? t.camada : null);

const FUNCOES_REF = ['structure', 'substrate', 'thermal', 'membrane', 'finish1', 'finish2', 'eixo'];

/** Erro de validação do término, ou null quando é válido. */
export function terminoIssue(l: Pick<Layer, 'termino'>): string | null {
  const t = l.termino;
  if (t === undefined || t === 'auto' || t === 'nucleo' || t === 'face' || t === 'passa') return null;
  if (typeof t !== 'object' || t === null) return 'Término nas paredes: valor inválido';
  if ('ate' in t) {
    const n = t.ate?.prioridade;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < TERMINO_PRIORIDADE_MIN || n > TERMINO_PRIORIDADE_MAX) {
      return `Término nas paredes: prioridade entre ${TERMINO_PRIORIDADE_MIN} e ${TERMINO_PRIORIDADE_MAX}`;
    }
    return null;
  }
  if ('camada' in t) {
    const c = t.camada;
    if (typeof c !== 'object' || c === null) return 'Término por camada: valor inválido';
    if (!FUNCOES_REF.includes(c.funcao)) return 'Término por camada: função da parede inválida';
    if (c.lado !== 'proximo' && c.lado !== 'distante') return 'Término por camada: lado inválido';
    if (c.face !== 'proxima' && c.face !== 'meio' && c.face !== 'distante') return 'Término por camada: face inválida';
    if (typeof c.cm !== 'number' || !Number.isFinite(c.cm)) return 'Término por camada: deslocamento inválido';
    if (Math.abs(c.cm) > TERMINO_MAX_CM) return `Término por camada: deslocamento entre −${TERMINO_MAX_CM} e ${TERMINO_MAX_CM} cm`;
    return null;
  }
  if (typeof t.cm !== 'number' || !Number.isFinite(t.cm)) return 'Término na junção: deslocamento inválido';
  if (Math.abs(t.cm) > TERMINO_MAX_CM) return `Término na junção: deslocamento entre −${TERMINO_MAX_CM} e ${TERMINO_MAX_CM} cm`;
  return null;
}

/** Deslocamento em metros de um término em cm (0 para os valores de nome e de regra). */
export const terminoMeters = (t: LayerTermino): number => (typeof t === 'object' && 'cm' in t ? t.cm / 100 : 0);

/** Prioridade limite de um término `{ ate }`, ou null nos demais valores. */
export const terminoAtePrioridade = (t: LayerTermino): number | null => (typeof t === 'object' && 'ate' in t ? t.ate.prioridade : null);

/** Tipo de piso ou de laje com as camadas validadas: lança erro na primeira camada com término inválido. */
export function comTerminoValido<T extends { layers: readonly Layer[] }>(tipo: T): T {
  const erro = tipo.layers.flatMap((l) => [terminoIssue(l), limiteExternoIssue(l)]).find((e) => e !== null);
  if (erro) throw new Error(erro);
  return tipo;
}

/**
 * Limite da camada no perímetro externo (decisão 0027). Ausente = o contorno do elemento manda, como antes; `parede` e
 * `nucleo` são as duas faces externas da parede. Campo aditivo: arquivo antigo abre igual.
 */
export const limiteExternoOf = (l: Pick<Layer, 'limiteExterno'>): LayerLimiteExterno | undefined => l.limiteExterno;

/** Erro de validação do limite externo, ou null quando é válido. */
export function limiteExternoIssue(l: Pick<Layer, 'limiteExterno'>): string | null {
  const v = l.limiteExterno;
  if (v === undefined || v === 'parede' || v === 'nucleo') return null;
  return 'Limite no perímetro externo: valor inválido';
}
