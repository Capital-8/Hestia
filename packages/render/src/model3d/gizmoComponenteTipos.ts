import type { Id } from '@hestia/model';

export type AlcaGizmoComponente = 'mover_xy' | 'mover_x' | 'mover_y' | 'girar' | 'dim_L' | 'dim_A' | 'dim_P';

export interface AlvoComponente3D {
  id: Id;
  x: number;
  y: number;
  z: number;
  rotation: number;
  mirrored: boolean;
  /** Caixa delimitadora local em metros. */
  caixa: { min: [number, number, number]; max: [number, number, number] };
  editavelL: boolean;
  editavelA: boolean;
  editavelP: boolean;
  /** Valores atuais em mm (para etiquetas/cota rápida). */
  Lmm?: number;
  Amm?: number;
  Pmm?: number;
}

export interface HitGizmoComponente {
  alca: AlcaGizmoComponente;
  pontoMundo: { x: number; y: number; z: number };
  valorAtualMm?: number;
  /** Posição projetada em NDC da etiqueta/alça (útil para abrir input de medida no 3D). */
  ndc: { x: number; y: number };
}
