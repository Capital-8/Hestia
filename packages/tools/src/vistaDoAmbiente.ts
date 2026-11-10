import { floorViewId, type Id } from '@hestia/model';
import type { ToolEnv } from './types.ts';

/**
 * Id da vista de planta em que a ferramenta está trabalhando: a planta de área aberta, ou a planta de piso do nível.
 * O ambiente ainda não informa planta de cobertura (`ToolEnv` não tem o campo), então a cobertura cai na de piso:
 * as anotações das duas são as mesmas hoje.
 */
export function viewIdOfEnv(env: Pick<ToolEnv, 'levelId' | 'areaPlanId'>): Id {
  const area = env.areaPlanId?.();
  if (area) return area;
  return floorViewId(env.levelId());
}
