/**
 * Erros do kernel v2 (decisão 0046 §2.3).
 *
 * - `ErroKernelLeve`: só aquela chamada falhou (`ENTRADA`, `NAO_IMPLEMENTADO`, `LIMITE`). O chamador refaz a
 *   operação em TypeScript; o kernel continua ligado.
 * - `ErroKernelGrave`: a instância não é confiável (`VERSAO`, `HANDLE`, `INTERNO`, trap). O gerenciador já
 *   tratou (recriou e repetiu); só chega ao chamador quando o kernel desligou.
 */
import { CODIGOS } from './esquema.gerado.ts';

export type NomeCodigo = keyof typeof CODIGOS;

const NOME_POR_CODIGO = new Map<number, NomeCodigo>(
  (Object.entries(CODIGOS) as [NomeCodigo, number][]).map(([nome, codigo]) => [codigo, nome]),
);

export const nomeDoCodigo = (codigo: number): string => NOME_POR_CODIGO.get(codigo) ?? `CODIGO_${codigo}`;

/** Códigos que só afetam a chamada em curso. */
export const CODIGOS_LEVES: ReadonlySet<number> = new Set([CODIGOS.ENTRADA, CODIGOS.NAO_IMPLEMENTADO, CODIGOS.LIMITE]);

export const ehCodigoLeve = (codigo: number): boolean => CODIGOS_LEVES.has(codigo);

export class ErroKernelLeve extends Error {
  readonly codigo: number;
  constructor(codigo: number, detalhe = '') {
    super(`kernel v2 (${nomeDoCodigo(codigo)})${detalhe ? `: ${detalhe}` : ''}`);
    this.name = 'ErroKernelLeve';
    this.codigo = codigo;
  }
}

export class ErroKernelGrave extends Error {
  /** Código do wasm; `null` quando foi um trap (exceção do WebAssembly) ou a instância já estava desligada. */
  readonly codigo: number | null;
  /** O kernel está desligado na sessão (limite de recriações excedido ou falha ao recriar). */
  readonly desligado: boolean;
  constructor(codigo: number | null, detalhe = '', desligado = false) {
    super(`kernel v2 (${codigo === null ? 'TRAP' : nomeDoCodigo(codigo)})${detalhe ? `: ${detalhe}` : ''}`);
    this.name = 'ErroKernelGrave';
    this.codigo = codigo;
    this.desligado = desligado;
  }
}
