import type { Id, Level } from './types.ts';
import { DEFAULT_VIEW_RANGE, type ViewRange } from './viewRange.ts';

export interface LevelInput {
  id: Id;
  name: string;
  elevation: number;
  /** Omitido: intervalo de vista padrão (topo 2,30 m, corte 1,20 m, base 0 m, como o Revit). */
  viewRange?: ViewRange;
}

/** Cria um nível completo: todo `Level` precisa de `viewRange` (decisão 0013). */
export function makeLevel(l: LevelInput): Level {
  // armazenamento (Fase 2): cria o Level com o intervalo de vista gravado nele.
  return { id: l.id, name: l.name, elevation: l.elevation, viewRange: { ...(l.viewRange ?? DEFAULT_VIEW_RANGE) } };
}
