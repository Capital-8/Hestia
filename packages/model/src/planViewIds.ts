import type { Id } from './types.ts';

/**
 * Ids determinísticos das vistas principais de planta (docs/vistas/PLANO-MESTRE.md §4.1). Arquivo à parte para que
 * `graphics.ts` e `planView.ts` os usem sem importar um ao outro.
 */
const FLOOR_PREFIX = 'pv_';
const ROOF_PREFIX = 'pvr_';

/** Id da planta de piso principal do nível. */
export const floorViewId = (levelId: Id): Id => `${FLOOR_PREFIX}${levelId}`;
/** Id da planta de cobertura principal do nível. */
export const roofViewId = (levelId: Id): Id => `${ROOF_PREFIX}${levelId}`;

/** Se `viewId` é o id determinístico de piso (`pv_<nível>`) ou cobertura (`pvr_<nível>`), devolve tipo e nível. */
export function mainViewRef(viewId: Id): { kind: 'floor' | 'roof'; levelId: Id } | undefined {
  if (viewId.startsWith(ROOF_PREFIX) && viewId.length > ROOF_PREFIX.length) return { kind: 'roof', levelId: viewId.slice(ROOF_PREFIX.length) };
  if (viewId.startsWith(FLOOR_PREFIX) && viewId.length > FLOOR_PREFIX.length) return { kind: 'floor', levelId: viewId.slice(FLOOR_PREFIX.length) };
  return undefined;
}
