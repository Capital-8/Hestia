import { floorViewId, type Id } from '@hestia/model';
import type { ToolEnv } from './types.ts';

/**
 * Id da vista de planta em que a ferramenta está trabalhando. `env.viewId` (a vista ativa do editor: piso, cobertura ou
 * área) manda quando presente. Ambiente que não o informa: a planta de área aberta, ou a planta de piso do nível.
 */
export function viewIdOfEnv(env: Pick<ToolEnv, 'levelId' | 'areaPlanId' | 'viewId'>): Id {
  if (env.viewId) return env.viewId;
  const area = env.areaPlanId?.();
  if (area) return area;
  return floorViewId(env.levelId());
}
