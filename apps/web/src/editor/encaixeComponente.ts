import { create } from 'zustand';
import { lerModoEncaixe, MODOS_ENCAIXE, MODO_ENCAIXE_PADRAO, opcoesDoModoEncaixe, type ModoEncaixe } from '@hestia/engine';
import { safeGet, safeSet } from './storage.ts';

/*
 * Seletor de encaixe do arrasto de móveis (preferência da interface, guardada no navegador; não entra no arquivo do projeto).
 * Vale para o arrasto 3D, o arrasto na planta e a prévia de inserção. Padrão: só parede.
 */

const CHAVE = 'hestia.encaixe.modo';

export const useEncaixe = create<{ modo: ModoEncaixe }>(() => ({ modo: lerModoEncaixe(safeGet(CHAVE)) }));

export function modoEncaixeAtual(): ModoEncaixe {
  return useEncaixe.getState().modo;
}

export function definirModoEncaixe(modo: ModoEncaixe): void {
  useEncaixe.setState({ modo });
  safeSet(CHAVE, modo);
}

/** Próximo valor do seletor, em ordem circular. */
export function proximoModoEncaixe(m: ModoEncaixe): ModoEncaixe {
  return MODOS_ENCAIXE[(MODOS_ENCAIXE.indexOf(m) + 1) % MODOS_ENCAIXE.length] ?? MODO_ENCAIXE_PADRAO;
}

/** Opções de encaixe do motor para o modo atual do seletor (`alt` força o encaixe solto). */
export function opcoesDeEncaixeAtuais(alt: boolean): { semEncaixe: boolean; encaixeVizinho: boolean } {
  return opcoesDoModoEncaixe(modoEncaixeAtual(), alt);
}
