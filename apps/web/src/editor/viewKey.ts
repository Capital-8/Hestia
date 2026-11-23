import type { Id } from '@hestia/model';
import { cameraKeyOf, type ViewIdentityFields } from './viewIdentity.ts';

/** Campos que identificam a vista 2D (o subconjunto de `PaneViewFields` que a chave de câmera usa). */
export interface ViewKeyFields {
  view: 'plan' | '3d' | 'section' | 'sheet' | 'face';
  levelId: Id;
  sectionId: Id | null;
  planKind: 'floor' | 'roof' | 'area';
  areaPlanId: Id | null;
  /** Planta de disciplina (só vale com `planKind` 'floor'); ausente = planta padrão. */
  planViewId?: Id | null;
  /** Vista 3D salva; ausente = 3D padrão (a chave de câmera 2D do 3D segue a planta do nível). */
  view3dViewId?: Id | null;
}

/**
 * Chave da câmera 2D: a chave canônica de `viewIdentity.ts` (`plan:`, `pv:`, `roof:`, `area:`, `section:`). Cada planta
 * tem a sua, inclusive duas plantas do mesmo nível; cada corte ou elevação tem a própria. A câmera vive só em memória.
 */
export function viewKeyOf(f: ViewKeyFields): Id {
  return cameraKeyOf(f satisfies ViewIdentityFields);
}
