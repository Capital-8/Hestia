import { create } from 'zustand';
import type { Id } from '@hestia/model';

/**
 * Estado de tela das câmeras de render (H12/H13): a captura aberta e a câmera escolhida para o render. Fica num módulo
 * próprio, sem importar o controlador, para a planta e o controlador lerem a seleção sem ciclo de importação.
 */

/** Captura aberta: nome e proporção escolhidos. A câmera 3D é lida só na hora de guardar (a moldura é fixa na tela). */
export interface CapturaRender {
  nome: string;
  aspect: { w: number; h: number };
}

export interface RenderCameraUi {
  /** Câmera de render escolhida para o render (seleção de tela, não dado do projeto). */
  selecionada: Id | null;
  captura: CapturaRender | null;
}

export const useRenderCameraUi = create<RenderCameraUi>()(() => ({ selecionada: null, captura: null }));
