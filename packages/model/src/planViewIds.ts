import type { Id } from './types.ts';

/**
 * Id determinístico da vista principal de planta (docs/vistas/PLANO-MESTRE.md §4.1). Arquivo à parte para que
 * `graphics.ts` e `planView.ts` o usem sem importar um ao outro.
 *
 * Desde o esquema 25 só o piso (`pv_<nível>`) é principal. Vista criada pelo usuário nunca começa com `pv_`: o prefixo
 * é `pvc_` (`USER_VIEW_PREFIX`), para não ser confundida com a planta de piso principal.
 */
const FLOOR_PREFIX = 'pv_';
/** Prefixo dos ids de vista criada pelo usuário (jamais `pv_`). */
export const USER_VIEW_PREFIX = 'pvc_';

/** Id de vista criada pelo usuário a partir de um sufixo único (nunca começa com `pv_`). */
export const userViewId = (suffix: string): Id => `${USER_VIEW_PREFIX}${suffix}`;

/** Id da planta de piso principal do nível. */
export const floorViewId = (levelId: Id): Id => `${FLOOR_PREFIX}${levelId}`;

/**
 * Id que a cobertura automática tinha até o esquema 24 (`pvr_<nível>`). A cobertura migrada MANTÉM esse id, mas é
 * uma planta comum: o id não diz mais nada sobre o tipo. Só migrações, normalização de arquivo antigo e o adaptador do ouro.
 * @deprecated
 */
export const legacyRoofViewId = (levelId: Id): Id => `pvr_${levelId}`;

/** Se `viewId` é o id determinístico de piso (`pv_<nível>`), devolve tipo e nível. */
export function mainViewRef(viewId: Id): { kind: 'floor'; levelId: Id } | undefined {
  if (viewId.startsWith(FLOOR_PREFIX) && viewId.length > FLOOR_PREFIX.length) return { kind: 'floor', levelId: viewId.slice(FLOOR_PREFIX.length) };
  return undefined;
}
