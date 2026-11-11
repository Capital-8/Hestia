import type { Id, Level } from './types.ts';

export interface LevelInput {
  id: Id;
  name: string;
  elevation: number;
}

/**
 * Cria um nível. As vistas dele (piso `pv_<id>` e cobertura `pvr_<id>`, com o intervalo de vista padrão da decisão 0013)
 * nascem junto, quando o comando `upsertLevel` o cria (`levelViews.ts`).
 */
export function makeLevel(l: LevelInput): Level {
  return { id: l.id, name: l.name, elevation: l.elevation };
}
