export interface EntradaDeFonte {
  caminho: string;
  conteudo: string | Uint8Array;
}
export declare const ARQUIVO_HASH_FONTE: string;
export declare function normalizarConteudo(conteudo: string | Uint8Array): string;
export declare function hashDeFontes(entradas: readonly EntradaDeFonte[]): string;
export declare function listarFontes(raiz: string): string[];
export declare function calcularHashDasFontes(raiz: string): string;
export declare function lerHashGravado(arquivo: string): string | null;
