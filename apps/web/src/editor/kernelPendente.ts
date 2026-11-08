import { useSyncExternalStore } from 'react';
import { aoMudarKernelPendente, kernelPendente } from '@hestia/engine';

/**
 * `true` enquanto uma fatia do kernel Rust (A ou B) está ligada e o wasm ainda não carregou. O TypeScript nunca produz o resultado de produção
 * dessas fatias nem das quantidades: a interface espera ("calculando…") e recalcula quando o wasm chega.
 */
export const useKernelPendente = (): boolean => useSyncExternalStore(aoMudarKernelPendente, kernelPendente, () => false);
