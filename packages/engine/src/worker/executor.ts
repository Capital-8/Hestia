import type { Id, Project } from '@hestia/model';
import { resolveLevel, type ResolveCache } from '../resolve.ts';
import { resolveFloors } from '../floors.ts';
import { resolveSlabs } from '../slabs.ts';
import { resolveRoofs } from '../roofs.ts';
import { resolveRooms } from '../rooms.ts';
import { junctionLevel } from '../junctionLevel.ts';
import { calcularCorteDaVista } from '../sectionIncremental.ts';
import { gerarPatchNivel, MemoriaPatch } from '../fluxoPatch.ts';
import type { TipoResolucao } from './protocolo.ts';

/** O que `patchNivel` precisa além do projeto: a versão do projeto, a base do patch e a memória de quem produz. */
export interface ContextoPatch {
  versao: number;
  base: number | null;
  memoria: MemoriaPatch;
}

/** Memória do módulo: no worker é a do próprio worker; na thread principal cada cliente usa a sua (ver `ClienteResolucao`). */
const memoriaDoModulo = new MemoriaPatch();

/**
 * Executa uma resolução de nível. É a mesma função usada no worker e na thread principal (fallback): o resultado não
 * depende de onde roda. `cache` só existe na thread principal; no worker, omitido, vale o cache do próprio módulo.
 */
export function executarResolucao(tipo: TipoResolucao, p: Project, nivel: Id, cache?: ResolveCache, contexto?: Partial<ContextoPatch>): unknown {
  switch (tipo) {
    case 'nivel':
      return resolveLevel(p, nivel, cache);
    case 'patchNivel':
      return gerarPatchNivel(contexto?.memoria ?? memoriaDoModulo, resolveLevel(p, nivel, cache), contexto?.versao ?? 0, contexto?.base ?? null);
    case 'pisos':
      return resolveFloors(p, nivel);
    case 'lajes':
      return resolveSlabs(p, nivel);
    case 'telhados':
      return resolveRoofs(p, nivel);
    case 'ambientes':
      return resolveRooms(p, nivel);
    case 'juncoes':
      return junctionLevel(p, nivel);
    case 'corte':
      // `nivel` é o id da vista de corte; o estado incremental por vista vive no módulo (no worker, no próprio worker).
      return calcularCorteDaVista(p, nivel);
  }
}
