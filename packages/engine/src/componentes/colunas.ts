import type { PapelPeca } from '@hestia/model';
import type { PecaResolvida } from './pecas.ts';

/*
 * Peças resolvidas EM COLUNAS: a forma em que o núcleo Rust as recebe (ADR 0049 §5.1; mesmo princípio da 0046 §2.1: um
 * array tipado por campo, ids internados em u32, só números). FICHA E2-colunas: implementar as quatro funções abaixo.
 * Testes em `colunas.test.ts`. O texto (nomes, material, fita…) NÃO entra nas colunas: vai à parte em `MetaPeca`.
 */

/** Tabela fixa de papéis: o código u8 de um papel é a sua posição aqui. NÃO reordenar (o Rust usa o mesmo código). */
export const PAPEIS: readonly PapelPeca[] = [
  'lateral', 'base', 'topo', 'travessa', 'prateleira', 'divisoria', 'fundo', 'porta', 'frente_gaveta',
  'tampo', 'rodape', 'painel', 'bloco', 'generica',
];
/** Código do eixo: x = 0, y = 1, z = 2. */
export const EIXOS = ['x', 'y', 'z'] as const;

export interface ColunasPecas {
  /** Número de peças. Todos os arrays abaixo têm o tamanho indicado em função de `n`. */
  n: number;
  /** Tabela de ids únicos, na ordem da primeira aparição; `idNum[i]` indexa esta tabela. */
  ids: string[];
  idNum: Uint32Array; // n
  indice: Uint32Array; // n
  papel: Uint8Array; // n  (posição em PAPEIS)
  eixo: Uint8Array; // n  (0 x, 1 y, 2 z)
  vazio: Uint8Array; // n  (0 ou 1)
  origem: Float64Array; // 3n  (x, y, z por peça)
  tamanho: Float64Array; // 2n
  espessura: Float64Array; // n
  extensao: Float64Array; // 3n
  /** Início, em NÚMEROS (não pares), do contorno da peça dentro de `contornoDados`. Peça sem contorno: 0. */
  contornoIni: Uint32Array; // n
  /** Quantidade de PONTOS do contorno da peça; 0 = retângulo `tamanho`. */
  contornoN: Uint32Array; // n
  /** Todos os contornos concatenados, pares (u, v) em m. */
  contornoDados: Float64Array;
}

/** Texto e metadados de cada peça, na mesma ordem das colunas. Fica no TypeScript; o Rust não vê. */
export interface MetaPeca {
  nome: string;
  material: string | null;
  fita: PecaResolvida['fita'];
  veio: PecaResolvida['veio'];
  grupo: string | null;
  deAninhado: string | null;
}

/** Converte as peças em colunas. Peça com papel desconhecido: lança `Error('papel desconhecido: …')`. Entrada vazia: `n = 0`. */
export function paraColunas(pecas: readonly PecaResolvida[]): ColunasPecas {
  void pecas;
  throw new Error('não implementado: ficha E2-colunas');
}

export function metaDasPecas(pecas: readonly PecaResolvida[]): MetaPeca[] {
  void pecas;
  throw new Error('não implementado: ficha E2-colunas');
}

/** Inverso exato de `paraColunas` + `metaDasPecas`: `deColunas(paraColunas(p), metaDasPecas(p))` é igual a `p` (`toEqual`). */
export function deColunas(c: ColunasPecas, meta: readonly MetaPeca[]): PecaResolvida[] {
  void c;
  void meta;
  throw new Error('não implementado: ficha E2-colunas');
}

/**
 * Confere a integridade das colunas (o que o lado Rust também confere): `null` se íntegras, senão o motivo em português.
 * Verifica: tamanhos dos arrays coerentes com `n` (3n, 2n…); `idNum[i]` < `ids.length`; `papel[i]` < PAPEIS.length; `eixo[i]` <= 2;
 * `vazio[i]` 0 ou 1; para cada peça `contornoIni + 2 * contornoN` <= `contornoDados.length`; nenhum valor `Float64` não finito.
 */
export function validarColunas(c: ColunasPecas): string | null {
  void c;
  throw new Error('não implementado: ficha E2-colunas');
}
