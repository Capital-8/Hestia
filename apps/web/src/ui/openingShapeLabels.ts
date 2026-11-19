import type { OpeningShapeKind } from '@hestia/model';
import type { Dict } from '../editor/i18n.ts';

/** Nome curto de cada forma do vão (lista de tipos, filtro "Forma do vão"); o diálogo usa os nomes longos `dsh_kind_*`. */
export const SHAPE_LABEL: Record<OpeningShapeKind, keyof Dict> = {
  rect: 'dsh_short_rect',
  round: 'dsh_short_round',
  segmental: 'dsh_short_segmental',
  pointed: 'dsh_short_pointed',
  circle: 'dsh_short_circle',
  horseshoe: 'dsh_short_horseshoe',
  gable: 'dsh_short_gable',
  trapezoid: 'dsh_short_trapezoid',
  polygon: 'dsh_short_polygon',
};
