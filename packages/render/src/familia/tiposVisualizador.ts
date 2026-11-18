import type { FaceExternaCaixa, VaoResolvido } from '@hestia/model';

export type ModoInteracao3DFamilia =
  | 'selecionar'
  | 'prateleira'
  | 'divisoria'
  | 'porta'
  | 'gavetas'
  | 'cabideiro'
  | 'ripado'
  | 'sapateira'
  | 'tampo'
  | 'tamponamento'
  | 'recorte';

export interface HoverVao3D {
  vaoId: string;
  /** Fração normalizada [0..1] ao longo do eixo relevante dentro do vão. */
  posicaoNormalizada: number;
  /** Distância (mm) do início interno do vão até o plano fantasma. */
  medidaInicioMm: number;
  /** Distância (mm) do plano fantasma até o fim interno do vão. */
  medidaFimMm: number;
  eixo: 'x' | 'z';
  /** Coordenada aproximada em tela para posicionar etiqueta/popover se necessário. */
  clientX: number;
  clientY: number;
}

export interface CliqueVao3D extends HoverVao3D {
  /** Lado aproximado onde clicou dentro do vão (útil para lado da dobradiça na porta de 1 folha). */
  ladoHorizontal: 'esquerda' | 'direita';
}

export interface CliqueFace3D {
  face: FaceExternaCaixa;
  clientX: number;
  clientY: number;
}

export type { VaoResolvido, FaceExternaCaixa };
