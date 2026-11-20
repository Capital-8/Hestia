import type { OpcoesArrasto } from './encaixeTipos.ts';

/** Seletor de encaixe da interface: só parede (padrão), parede + vizinho ou livre (equivale a segurar Alt). */
export type ModoEncaixe = 'parede' | 'parede_vizinho' | 'livre';

export const MODOS_ENCAIXE: readonly ModoEncaixe[] = ['parede', 'parede_vizinho', 'livre'];

export const MODO_ENCAIXE_PADRAO: ModoEncaixe = 'parede';

/** Opções de encaixe do arrasto para o modo escolhido; `alt` força `semEncaixe`. */
export function opcoesDoModoEncaixe(modo: ModoEncaixe, alt: boolean): Required<Pick<OpcoesArrasto, 'semEncaixe' | 'encaixeVizinho'>> {
  return { semEncaixe: alt || modo === 'livre', encaixeVizinho: modo === 'parede_vizinho' };
}

/** Valida um valor guardado (JSON do navegador); qualquer coisa inválida volta ao padrão. */
export function lerModoEncaixe(v: unknown): ModoEncaixe {
  return MODOS_ENCAIXE.find((m) => m === v) ?? MODO_ENCAIXE_PADRAO;
}
