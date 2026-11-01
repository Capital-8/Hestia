export * from './vec.ts';
export * from './line.ts';
export * from './polygon.ts';
export * from './triangulate.ts';
export * from './transform.ts';
export * from './arc.ts';
export * from './skeleton.ts';
export * from './openingSymbol.ts';
export * from './sketchTypes.ts';
export * from './sketchValidate.ts';
export * from './sketchConst.ts';
export * from './numberText.ts';

// `boolean.ts` continua sendo a implementação TypeScript, intocada. As operações quentes saem por
// `operacoesKernel.ts`, que delega ao kernel experimental quando ele está ativo e chama exatamente
// as funções de `boolean.ts` quando não está (o padrão). Decisão em docs/decisoes/0045.
export { asMulti, booleanStats, closeGaps, closeGapsSafe, resetBooleanStats } from './boolean.ts';
export type { BoolOp, BooleanStats } from './boolean.ts';
export { difference, differenceClipper, intersection, offsetMulti, union, unionClipper } from './operacoesKernel.ts';

// Recurso experimental (kernel Rust/WASM). Desligado por padrão; ver docs/decisoes/0045.
export { ativarKernelExperimental, desativarKernelExperimental, garantirKernelExperimental } from './kernel/carregador.ts';
export { estadoKernel, type EstadoKernel, type ImplKernel } from './kernel/contrato.ts';
export { medicaoOperacoes, resetarMedicaoOperacoes, type MedicaoOperacoes } from './operacoesKernel.ts';
