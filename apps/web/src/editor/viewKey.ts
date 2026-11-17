import type { Id } from '@hestia/model';

/** Campos que identificam a vista 2D (o subconjunto de `PaneViewFields` que a chave de câmera usa). */
export interface ViewKeyFields {
  view: 'plan' | '3d' | 'section' | 'sheet';
  levelId: Id;
  sectionId: Id | null;
  planKind: 'floor' | 'roof' | 'area';
  areaPlanId: Id | null;
}

/** Chave da câmera 2D: cada planta tem a sua (a de cobertura tem outra, do mesmo nível); cada corte ou elevação tem a própria. */
export function viewKeyOf(f: ViewKeyFields): Id {
  return f.view === 'section' ? `sec:${f.sectionId}` : f.planKind === 'roof' ? `roof:${f.levelId}` : f.planKind === 'area' ? `area:${f.areaPlanId ?? f.levelId}` : f.levelId;
}
