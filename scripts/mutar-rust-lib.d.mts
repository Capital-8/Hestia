// Declaração de tipos de `scripts/mutar-rust-lib.mjs` (mesmo padrão de `scripts/hash-fontes.d.mts`).

export interface Mutacao {
  id: string;
  arquivo: string;
  linha: number;
  de: string;
  para: string;
  teste: string | string[];
  recorte?: string;
}

export type NomeResultado = 'MORTA' | 'SOBREVIVEU' | 'COMPILA_ERRO' | 'TIMEOUT';

export interface LinhaDeResumo {
  id: string;
  arquivo: string;
  linha: number;
  de: string;
  para: string;
  resultado: string;
  duracao_s?: number;
  linha_antes?: string;
  linha_depois?: string;
  [campo: string]: unknown;
}

export declare const RESULTADOS: readonly NomeResultado[];

export declare function editarTexto(
  texto: string,
  linha: number,
  de: string,
  para: string,
): { texto: string; linhaAntes: string; linhaDepois: string };

export declare function classificarResultado(args: { exitCode: number | null; tempoEsgotado: boolean }): 'MORTA' | 'SOBREVIVEU' | 'TIMEOUT';

export declare function testesDaMutacao(m: { teste: string | string[] }): string[];

export declare function uniaoTestes(lista: readonly { teste: string | string[] }[]): string[];

export declare function validarLista(lista: unknown, lerTexto: (arquivo: string) => string | null): string[];

export declare function idsProcessados(textoJsonl: string): Set<string>;

export declare function ultimasLinhas(texto: string, n: number): string;

export declare function montarResumo(registros: readonly LinhaDeResumo[]): string;

export declare function parsearArgs(argv: readonly string[]): {
  lista: string;
  saida: string;
  timeoutMin: number;
  baseline: boolean;
  dry: boolean;
};
