/**
 * Contrato do kernel geométrico experimental (Rust → WebAssembly).
 *
 * O kernel é um **recurso opcional**: quando não está ativo, `operacoesKernel.ts` chama exatamente
 * as funções de `boolean.ts` que sempre rodaram. Nada aqui muda o padrao do aplicativo.
 *
 * O ABI binário (layout de memória, ponteiros, códigos) está documentado em
 * `crates/geom-wasm/src/lib.rs`; os números abaixo são o espelho do lado TypeScript e não podem
 * divergir de lá.
 */
import type { MultiPolygon } from '../polygon.ts';

/** Versão do ABI que o lado JS entende. Bate com `VERSAO_ABI` em `crates/geom-wasm/src/lib.rs`. */
export const VERSAO_ABI = 1;

/** Operações (`op` em `executar`). */
export const OP = {
  UNIAO: 0,
  DIFERENCA: 1,
  INTERSECAO: 2,
  OFFSET: 3,
} as const;

/** Códigos de retorno de `executar`; qualquer coisa diferente de 0 faz o JS voltar ao TypeScript. */
export const ERRO = {
  OK: 0,
  OP: 1,
  ENTRADA: 2,
  INTERNO: 3,
  /**
   * A operação existe no contrato mas o kernel ainda não a implementa (hoje: `offset`).
   * Não é falha: o seam refaz **só essa operação** em TypeScript e mantém o kernel ativo.
   */
  NAO_IMPLEMENTADO: 4,
} as const;

/**
 * Sinaliza "esta operação não existe no kernel". O seam captura e cai para o TypeScript **sem**
 * acionar o disjuntor (diferente de uma falha real, que desativa o kernel).
 */
export class ErroNaoImplementado extends Error {
  constructor(operacao: string) {
    super(`operação "${operacao}" não implementada no kernel experimental`);
    this.name = 'ErroNaoImplementado';
  }
}

/**
 * Implementação plugável. Recebe e devolve `MultiPolygon` em metros, já no modelo do TypeScript.
 * Qualquer método pode lançar: `operacoesKernel.ts` captura, desativa o kernel e refaz em TypeScript.
 */
export interface ImplKernel {
  /** Nome do que está ativo, para o diagnóstico na interface. */
  readonly nome: string;
  uniao(args: MultiPolygon[]): MultiPolygon;
  diferenca(args: MultiPolygon[]): MultiPolygon;
  interseccao(a: MultiPolygon, b: MultiPolygon): MultiPolygon;
  offset(m: MultiPolygon, delta: number): MultiPolygon;
  /** Libera a instância (no wasm, nada a fazer; existe para o teste poder desmontar). */
  encerrar?(): void;
}

/** Diagnóstico do recurso, para a interface de experimentos. */
export interface EstadoKernel {
  readonly ativo: boolean;
  readonly nome: string;
  /** Por que não está ativo (ou por que foi desativado), em texto curto. */
  readonly motivo: string | null;
  /** Versão do ABI do wasm carregado, quando houver. */
  readonly versaoAbi: number | null;
  /** Quantas vezes uma chamada do kernel falhou e obrigou a volta para o TypeScript. */
  readonly falhas: number;
}

/**
 * Decisão do dono (2026-11-06): em produção o kernel v1 (booleanas e offset) é SEMPRE o Rust. Com o kernel exigido, `operacoesKernel.ts`
 * nunca devolve resultado do TypeScript: enquanto o wasm carrega lança `KernelV1Pendente`; se o Rust falhar, recusar a entrada ou
 * estiver indisponível, lança `ErroKernelV1`. Só testes e desenvolvimento (kernel não exigido) usam o TypeScript.
 */
export class KernelV1Pendente extends Error {
  constructor(readonly operacao: string) {
    super(`kernel Rust v1 (${operacao}): o wasm ainda não carregou; resultado pendente`);
    this.name = 'KernelV1Pendente';
  }
}

/** Falha explícita do kernel v1 exigido: o TypeScript não substitui o Rust. */
export class ErroKernelV1 extends Error {
  constructor(
    readonly operacao: string,
    mensagem: string,
  ) {
    super(`kernel Rust v1 (${operacao}): ${mensagem}`);
    this.name = 'ErroKernelV1';
  }
}

let exigido = false;

/** Liga/desliga a exigência do Rust no v1. Quem chama é o despacho do app (produção) ou um teste. */
export function exigirKernel(valor: boolean): void {
  exigido = valor;
}

/** O Rust é o único caminho do v1 neste realm? */
export const kernelExigido = (): boolean => exigido;

let impl: ImplKernel | null = null;
let motivo: string | null = null;
let versaoAbi: number | null = null;
let falhas = 0;

/** Implementação ativa, ou `null` quando o recurso está desligado/indisponível. */
export function implKernel(): ImplKernel | null {
  return impl;
}

/** Ativa uma implementação. Quem chama é o carregador (`kernel/carregador.ts`) ou um teste. */
export function definirImplKernel(nova: ImplKernel | null, info?: { versaoAbi?: number }): void {
  impl = nova;
  if (nova === null) {
    motivo = null;
    versaoAbi = null;
    return;
  }
  motivo = null;
  if (info?.versaoAbi !== undefined) versaoAbi = info.versaoAbi;
}

/**
 * Desativa o kernel e registra o motivo. Chamado pelo disjuntor de `operacoesKernel.ts` e pelo
 * carregador quando o wasm não instancia. Não tenta reativar: numa sessão, uma vez fora é fora.
 */
export function desativarKernel(razao: string): void {
  if (impl !== null) impl.encerrar?.();
  impl = null;
  motivo = razao;
}

/** Registra uma falha de chamada (alimenta o diagnóstico). */
export function registrarFalhaKernel(): void {
  falhas++;
}

/** Estado atual, para a interface de experimentos. */
export function estadoKernel(): EstadoKernel {
  return { ativo: impl !== null, nome: impl?.nome ?? 'ts', motivo, versaoAbi, falhas };
}

/** Zera o estado do módulo. Só para testes. */
export function resetarEstadoKernel(): void {
  exigido = false;
  impl = null;
  motivo = null;
  versaoAbi = null;
  falhas = 0;
}
