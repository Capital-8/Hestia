import type { Familia } from '@hestia/model';
import { create } from 'zustand';
import { useFamilia } from './familiaStore.ts';

/*
 * Estado compartilhado das ações sobre peças: a última recusa (faixa vermelha no topo das propriedades) e o pedido de
 * confirmação de exclusão (a mesma barra "Sim / Não" do navegador, também disparada pelo teclado).
 */

export interface EstadoAvisoPeca {
  erro: string | null;
  /** Id da peça aguardando confirmação de exclusão. */
  exclusao: string | null;
  recusar: (motivo: string) => void;
  limpar: () => void;
  pedirExclusao: (id: string) => void;
  cancelarExclusao: () => void;
}

export const useAvisoPeca = create<EstadoAvisoPeca>((set) => ({
  erro: null,
  exclusao: null,
  recusar: (motivo) => set({ erro: motivo }),
  limpar: () => set({ erro: null }),
  pedirExclusao: (id) => set({ exclusao: id }),
  cancelarExclusao: () => set({ exclusao: null }),
}));

/** Executa a receita no histórico e guarda a recusa para a faixa de aviso; devolve o motivo (ou `null`). */
export function executarPeca(rotulo: string, receita: (rascunho: Familia) => string | null): string | null {
  const motivo = useFamilia.getState().executar(rotulo, receita);
  if (motivo === null) useAvisoPeca.getState().limpar();
  else useAvisoPeca.getState().recusar(motivo);
  return motivo;
}
