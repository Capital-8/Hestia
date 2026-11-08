export declare const EXPORTS_V1: readonly string[];
export declare const EXPORTS_V2: readonly string[];
export interface ResultadoExportacoes {
  abi2: boolean;
  v1Completa: boolean;
  erros: string[];
  avisos: string[];
}
export declare function conferirExportacoes(exportadas: Iterable<string>): ResultadoExportacoes;
