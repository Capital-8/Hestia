import { esvaziarMemoSemEsquadrias } from '@hestia/model';
import { esvaziarCacheDeLajes } from './slabs.ts';
import { esvaziarCacheDeClusters } from './resolve.ts';
import { esvaziarCacheDeJuncao } from './junctionLevel.ts';
import { esvaziarCachesDeResolucao } from './resolveMemo.ts';
import { cacheDeCortadores } from './cutterCache.ts';
import { resetCircuitCache } from './enclosed.ts';
import { resetRegionCache } from './rooms.ts';

/**
 * Esvazia os caches globais do motor que são chaveados por CONTEÚDO (não por identidade do projeto): pintura e estrutura dos clusters,
 * clusters compartilhados, junção por nível, cortadores, lajes, circuitos de ambientes e o memo sem esquadrias.
 *
 * Eles guardam o que o kernel v1 (booleanas e offset) devolveu na hora do cálculo. Trocar o backend do v1 no meio do processo (Rust x TypeScript:
 * só acontece em harness de comparação e em testes; em produção o Rust é o único backend desde o boot) faria uma entrada calculada num backend
 * ser reaproveitada no outro (a mesma pintura com vértices na grade de 1 µm numa resolução que esperava os do TypeScript). Quem alterna o
 * backend na mesma execução chama esta função na troca.
 */
export function limparCachesDeConteudo(): void {
  esvaziarCachesDeResolucao();
  esvaziarCacheDeClusters();
  esvaziarCacheDeJuncao();
  esvaziarCacheDeLajes();
  esvaziarMemoSemEsquadrias();
  cacheDeCortadores.esvaziar();
  resetCircuitCache();
  resetRegionCache();
}
