import type { ResolveCache } from '@hestia/engine';
import { ClienteResolucao, type WorkerLike } from '@hestia/engine/src/worker/cliente.ts';
import { instalarServidor, type EscopoServidor } from '@hestia/engine/src/worker/servidor.ts';
import { configDoDespacho } from './preferenciasKernel.ts';

/**
 * Resolução de níveis fora da thread principal (ver `packages/engine/src/worker`). Este arquivo serve aos dois lados:
 * na thread principal, `criarClienteResolucao` devolve o cliente; dentro do worker (que o abre por este mesmo módulo,
 * com `new URL(..., import.meta.url)`), o bloco do fim instala o servidor do protocolo.
 *
 * Desligado por padrão: o controller ainda usa a resolução síncrona (`LevelResolveCache`), que não espera uma promessa.
 * Ligar exige a integração descrita no relatório e um teste no navegador.
 */

/** Verdadeiro dentro de um worker dedicado do navegador (não na janela). */
const ehEscopoDeWorker = (): boolean => {
  const g = globalThis as { WorkerGlobalScope?: new () => unknown; window?: unknown };
  return g.window === undefined && typeof g.WorkerGlobalScope === 'function' && (globalThis as unknown) instanceof g.WorkerGlobalScope;
};

/**
 * Cria o cliente de resolução. Com `usarWorker` falso (padrão), tudo roda na thread principal, com o mesmo resultado.
 * Se o navegador não tiver `Worker` (ou ele falhar), o cliente cai para a thread principal sozinho.
 */
export function criarClienteResolucao(opcoes: { usarWorker?: boolean; cache?: ResolveCache } = {}): ClienteResolucao {
  return new ClienteResolucao({
    usarWorker: opcoes.usarWorker ?? false,
    cache: opcoes.cache,
    // Despacho da fatia A (0047 §12): URL e `localStorage` não chegam ao worker; a configuração viaja em cada pedido.
    kernelV2: configDoDespacho,
    criarWorker: () => new Worker(new URL('./resolveWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike,
  });
}

if (ehEscopoDeWorker()) {
  instalarServidor(globalThis as unknown as EscopoServidor);
}
