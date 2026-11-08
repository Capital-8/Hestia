import type { Id, Project } from '@hestia/model';
import type { PlanResolveOptions } from './resolve.ts';
import type { ResolvedFloor } from './floors.ts';
import type { JunctionLevel } from './junctionLevel.ts';
import type { ResolvedSlab } from './slabs.ts';
import type { ResolvedLevel } from './types.ts';
import type { QuantidadesRust, TipoQuant } from './quantidadesTipos.ts';

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

/**
 * Despachantes da fatia B (decisão 0050, B5): pisos, lajes e junção de um nível. Só valem para a chamada com as opções padrão (`resolveFloors(p, nivel)`,
 * sem `layers: false`, que é o caminho de quem monta a cena e não pode depender dela). A junção (B3) é consultada só no modo sombra enquanto o
 * `junction_nivel` do Rust divergir do TS (0050, B5). Sem instalação (o padrão), as funções são só o TypeScript.
 */
export type DespachanteDePisos = (p: Project, levelId: Id, ts: () => ResolvedFloor[]) => ResolvedFloor[];
export type DespachanteDeLajes = (p: Project, levelId: Id, ts: () => ResolvedSlab[]) => ResolvedSlab[];
export type DespachanteDeJuncao = (p: Project, levelId: Id, ts: () => JunctionLevel) => JunctionLevel;

let dePisos: DespachanteDePisos | null = null;
let deLajes: DespachanteDeLajes | null = null;
let deJuncao: DespachanteDeJuncao | null = null;

/** Instala (ou, com `null`, remove) os despachantes da fatia B. */
export function definirDespachantesDaFatiaB(d: { pisos: DespachanteDePisos; lajes: DespachanteDeLajes; juncao: DespachanteDeJuncao } | null): void {
  dePisos = d?.pisos ?? null;
  deLajes = d?.lajes ?? null;
  deJuncao = d?.juncao ?? null;
}

export const despachanteDePisos = (): DespachanteDePisos | null => dePisos;
export const despachanteDeLajes = (): DespachanteDeLajes | null => deLajes;
export const despachanteDeJuncao = (): DespachanteDeJuncao | null => deJuncao;

/**
 * Despachante das quantidades (esquema v12): paredes, pisos, lajes e forros de um nível. Devolve as quantidades do Rust, ou `null` quando não há
 * Rust no caminho (nenhum despachante instalado, fatia B desligada, wasm ainda não carregado ou modo sombra): aí vale o motor TypeScript, que
 * sobrevive só como referência. Com a fatia ligada, uma falha do Rust lança `ErroDespachoKernel`; nunca devolve `null`.
 */
export type DespachanteDeQuantidades = (p: Project, levelId: Id, tipo: TipoQuant) => QuantidadesRust | null;

let deQuantidades: DespachanteDeQuantidades | null = null;

/** Instala (ou, com `null`, remove) o despachante das quantidades. */
export function definirDespachanteDeQuantidades(d: DespachanteDeQuantidades | null): void {
  deQuantidades = d;
}

export const despachanteDeQuantidades = (): DespachanteDeQuantidades | null => deQuantidades;
