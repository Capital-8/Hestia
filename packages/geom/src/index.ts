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
export { estadoKernel, exigirKernel, kernelExigido, KernelV1Pendente, ErroKernelV1, type EstadoKernel, type ImplKernel } from './kernel/contrato.ts';
// Kernel v2 (ABI v2, decisão 0046): chaves de liberação por fatia.
export { kernelFatiaLigada, fatiasLigadas, interpretarLista, CHAVE_FATIAS, FATIAS, type Fatia } from './kernel/v2/fatias.ts';
export { medicaoOperacoes, resetarMedicaoOperacoes, type MedicaoOperacoes } from './operacoesKernel.ts';
// Kernel v2: instância, cena e erros (decisão 0046), usados pelo despacho da fatia A (`packages/engine/src/kernelDespacho.ts`).
export { GerenciadorKernelV2, MAX_RECRIACOES, JANELA_RECRIACAO_MS, type EstadoGerenciador } from './kernel/v2/gerenciador.ts';
export { CenaV2 } from './kernel/v2/cena.ts';
export { fonteDeSecoes } from './kernel/v2/quadros.ts';
export { ErroKernelLeve, ErroKernelGrave } from './kernel/v2/erros.ts';
export { baixarAsset as baixarAssetDoWasm } from './kernel/carregador.ts';
