import type { Project } from '@hestia/model';
import type { ToolEnv } from './types.ts';

/**
 * Gravidade (ficha G1, A.7): cota inicial do elemento a partir do terreno proposto sob o primeiro clique. Só valor inicial, sem vínculo.
 * A cota vem do ambiente (`env.cotaDoTerreno`, que o app liga ao `servicoTerreno().cotaDoTerreno`, superfície 1); nenhum caminho aqui gera malha ou cota.
 */

/** Cota do terreno (z do projeto, absoluta) sob o ponto, pelo ambiente; `null` sem gravidade ou sem terreno ali. */
export function cotaAbsolutaSobPonto(env: Pick<ToolEnv, 'cotaDoTerreno'>, x: number, y: number): number | null {
  const z = env.cotaDoTerreno?.(x, y);
  return typeof z === 'number' && Number.isFinite(z) ? z : null;
}

/** Cota do terreno sob o ponto menos a elevação do nível: o valor inicial de `baseOffset` (parede) e `heightOffset` (piso, laje). */
export function deslocamentoDoTerreno(env: Pick<ToolEnv, 'cotaDoTerreno'>, projeto: Project, levelId: string, x: number, y: number): number | null {
  const z = cotaAbsolutaSobPonto(env, x, y);
  const nivel = projeto.levels.find((l) => l.id === levelId);
  return z === null || !nivel ? null : z - nivel.elevation;
}
