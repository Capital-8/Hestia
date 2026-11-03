import type { Id, Project } from '@hestia/model';
import type { PlanResolveOptions } from './resolve.ts';
import type { ResolvedLevel } from './types.ts';

/**
 * Despachante do kernel Rust (decisão 0047 §12, fatia A): quando instalado (`instalarDespachoKernel`, em `kernelDespacho.ts`), recebe o
 * pedido e a versão em TypeScript (`ts`) e decide qual resultado devolver. Sem instalação (o padrão) `resolveLevel` é `resolveLevelTs`,
 * exatamente como antes. Fica fora de `resolve.ts` para não criar ciclo de módulos (o despacho usa `resolve.ts`).
 */
export type DespachanteDeNivel = (p: Project, levelId: Id, opts: PlanResolveOptions, ts: () => ResolvedLevel) => ResolvedLevel;

let despachante: DespachanteDeNivel | null = null;

/** Instala (ou, com `null`, remove) o despachante do kernel Rust. */
export function definirDespachanteDeNivel(d: DespachanteDeNivel | null): void {
  despachante = d;
}

/** O despachante instalado, ou `null` (o padrão). */
export const despachanteDeNivel = (): DespachanteDeNivel | null => despachante;
