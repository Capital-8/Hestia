import type { Id } from '@hestia/model';

/**
 * Decisão do dono: o TypeScript nunca produz resultado de produção das fatias A e B nem das quantidades. Com uma fatia ligada e o wasm ainda
 * sem carregar, o despacho não tem o que devolver: lança `KernelPendente`. Não é falha: quem chama espera o wasm (a interface mostra
 * "calculando…", o worker re-executa o pedido quando o wasm carrega) e pede de novo. As funções `*Ts` seguem existindo só como oráculo de teste.
 */
export class KernelPendente extends Error {
  constructor(
    readonly fatia: 'A' | 'B',
    readonly nivel: Id | null,
  ) {
    super(`kernel Rust (fatia ${fatia}, nível ${nivel}): o wasm ainda não carregou; resultado pendente`);
    this.name = 'KernelPendente';
  }
}

/** Observadores da mudança de "kernel pendente" (a interface assina para trocar "calculando…" pelo resultado). */
const ouvintes = new Set<() => void>();

export function aoMudarKernelPendente(f: () => void): () => void {
  ouvintes.add(f);
  return () => void ouvintes.delete(f);
}

export const avisarKernelPendente = (): void => ouvintes.forEach((f) => f());
