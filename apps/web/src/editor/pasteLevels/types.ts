import type { Id } from '@hestia/model';

/**
 * Estado da prévia do colar alinhado (sessão, não vai para o projeto).
 * Enquanto existe, o canvas está no modo de conferência: V confirma, X cancela.
 */
export interface PastePreviewState {
  /** Níveis de destino escolhidos no diálogo. */
  levelIds: Id[];
  /** Total de cópias que serão criadas (elementos × níveis). */
  count: number;
  /** Vista de onde o usuário abriu o comando; cancelar restaura. */
  originView: 'plan' | '3d' | 'section' | 'sheet';
  originLevelId: Id;
  originSectionId: Id | null;
  /** Planta (piso, cobertura ou área) de onde o comando abriu, para restaurar no cancelamento. */
  originPlanViewId?: Id;
  /** Manter cópias vinculadas (andar-tipo). */
  link: boolean;
}
