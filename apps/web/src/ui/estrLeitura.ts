// Quantidades calculadas de pilar, viga e fundação para os painéis (estrutura, A.4.6 e A.6): volume, área de forma, peso e
// comprimento vêm da consulta 203 (`estr_quant`) do kernel por uma função INJETÁVEL. O painel não calcula nada (A.0 item 2).
// Até a ficha R1 ligar o kernel, o padrão devolve null e o painel mostra "—".

import type { Id } from '@hestia/model';

/** Quantidades de um elemento, em unidades SI (volume, área, peso e comprimento). Campo ausente = o kernel não o entrega. */
export interface LeituraEstr {
  volume?: number;
  areaForma?: number;
  peso?: number;
  comprimento?: number;
}

/** Função de leitura: quantidades do elemento ou null quando o kernel não as entrega. */
export type FuncaoLeituraEstr = (elementId: Id) => LeituraEstr | null;

const SEM_KERNEL: FuncaoLeituraEstr = () => null;
let fonte: FuncaoLeituraEstr = SEM_KERNEL;

/** Quantidades do elemento pela consulta do kernel; null enquanto ela não está ligada. */
export const leituraEstr: FuncaoLeituraEstr = (elementId) => fonte(elementId);

/** Liga a função que consulta o kernel (ficha R1). Sem argumento, volta ao padrão sem kernel. */
export function definirLeituraEstr(fn?: FuncaoLeituraEstr): void {
  fonte = fn ?? SEM_KERNEL;
}
