import { create } from 'zustand';
import type { Valor } from './expressao.ts';
import { PECAS_INICIAIS, TIPOS, type CampoFormula, type Peca, type Valores } from './familiaModelo.ts';
import { resolverFamilia, type Resolucao } from './resolver.ts';

/**
 * Estado do editor de famílias (protótipo de interface). Fica FORA do projeto: abrir ou ocultar a aba não mexe no
 * projeto aberto, e a família em edição sobrevive a voltar ao projeto (como a aba de família do Revit). Nada é gravado.
 */
export type VistaFamilia = '3d' | 'frente' | 'lateral' | 'planta';
export type DetalheFamilia = 'grosso' | 'medio' | 'fino';
export type DialogoFamilia = null | 'parametros' | 'tipos' | 'pecas' | 'novo';

export interface FamiliaState {
  /** Aba da família à frente do projeto. */
  aberta: boolean;
  tipoId: string;
  valores: Valores;
  pecas: Peca[];
  sel: string;
  vista: VistaFamilia;
  explodir: boolean;
  portas: boolean;
  detalhe: DetalheFamilia;
  dialogo: DialogoFamilia;
  /** Última ação de ferramenta clicada na faixa (a faixa ainda não executa nada). */
  ferramenta: string | null;
  abrir: () => void;
  ocultar: () => void;
  set: (patch: Partial<FamiliaState>) => void;
  setValor: (id: string, v: Valor) => void;
  setFormula: (pecaId: string, campo: CampoFormula, texto: string) => void;
  escolherTipo: (id: string) => void;
}

const tipoInicial = TIPOS[1]!;

export const useFamilia = create<FamiliaState>((set) => ({
  aberta: false,
  tipoId: tipoInicial.id,
  valores: { ...tipoInicial.v },
  pecas: PECAS_INICIAIS.map((p) => ({ ...p })),
  sel: 'latE',
  vista: '3d',
  explodir: false,
  portas: true,
  detalhe: 'fino',
  dialogo: null,
  ferramenta: null,
  abrir: () => set({ aberta: true }),
  ocultar: () => set({ aberta: false, dialogo: null }),
  set: (patch) => set(patch),
  setValor: (id, v) => set((s) => ({ valores: { ...s.valores, [id]: v } })),
  setFormula: (pecaId, campo, texto) => set((s) => ({ pecas: s.pecas.map((p) => (p.id === pecaId ? { ...p, [campo]: texto } : p)) })),
  escolherTipo: (id) => set((s) => {
    const t = TIPOS.find((x) => x.id === id);
    return t ? { tipoId: id, valores: { ...s.valores, ...t.v } } : s;
  }),
}));

/** Resolução da família corrente (memoizada por valores e fórmulas pelo chamador). */
export function resolverCorrente(s: Pick<FamiliaState, 'valores' | 'pecas'>): Resolucao {
  return resolverFamilia(s.valores, s.pecas);
}
