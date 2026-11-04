import { CATALOGO_PADRAO, FAMILIA_ARMARIO, HistoricoFamilia, familiaDaBiblioteca, type Catalogo, type Familia, type Valor } from '@hestia/model';
import { resolverFamilia, type ResolucaoFamilia } from '@hestia/engine';
import { create } from 'zustand';

/**
 * Estado do editor de famílias. Fica FORA do projeto: abrir ou ocultar a aba não mexe no projeto aberto, e a família em
 * edição sobrevive a voltar ao projeto (como a aba de família do Revit). Nada é gravado.
 */
export type VistaFamilia = '3d' | 'frente' | 'lateral' | 'planta';
export type DetalheFamilia = 'grosso' | 'medio' | 'fino';
export type DialogoFamilia = null | 'parametros' | 'tipos' | 'pecas' | 'novo' | 'catalogo' | 'arquivo' | 'encaixe' | 'aninhado';
export type EixoCorte = 'x' | 'y' | 'z';

export interface Corte {
  ativo: boolean;
  eixo: EixoCorte;
  posicao: number;
}

export interface FamiliaState {
  /** Aba da família à frente do projeto. */
  aberta: boolean;
  historico: HistoricoFamilia<Familia>;
  /** Sobe a cada mudança do histórico (inclusive desfazer, refazer e nova família). */
  versao: number;
  tipoId: string | null;
  /** Valores do Flexionar: fora do histórico, um por parâmetro. */
  valores: Record<string, Valor>;
  sel: string | null;
  vista: VistaFamilia;
  /** 0..1. */
  explodir: number;
  portas: boolean;
  detalhe: DetalheFamilia;
  opacidade: number;
  corte: Corte;
  dialogo: DialogoFamilia;
  /** Id do módulo aninhado aberto no diálogo; `null` = criação de um novo. */
  aninhadoEmEdicao: string | null;
  /** Catálogo de marcenaria (chapas, fitas, ferragens) da sessão do editor; fora do histórico da família. */
  catalogo: Catalogo;
  /** Inclui a furação automática de cavilhas na lista de peças e no DXF. */
  cavilhas: boolean;
  /** Última ação de ferramenta clicada na faixa (a faixa ainda não executa nada). */
  ferramenta: string | null;
  abrir: () => void;
  ocultar: () => void;
  familia: () => Familia;
  executar: (rotulo: string, receita: (rascunho: Familia) => string | null) => string | null;
  agrupar: (rotulo: string, fn: () => void) => void;
  desfazer: () => boolean;
  refazer: () => boolean;
  setValor: (id: string, v: Valor) => void;
  limparValor: (id: string) => void;
  escolherTipo: (id: string) => void;
  selecionarPeca: (id: string | null) => void;
  novaFamilia: (f: Familia) => void;
  setCatalogo: (c: Catalogo) => void;
  set: (patch: Partial<FamiliaState>) => void;
}

/** Exceção interna: a receita recusou a edição e devolveu o motivo. */
class Recusa extends Error {
  readonly motivo: string;

  constructor(motivo: string) {
    super(motivo);
    this.motivo = motivo;
  }
}

const estadoInicial = (f: Familia): { tipoId: string | null; valores: Record<string, Valor> } => ({
  tipoId: f.tipoPadrao ?? f.tipos[0]?.id ?? null,
  valores: {},
});

const inicial = structuredClone(FAMILIA_ARMARIO);
const historicoInicial = new HistoricoFamilia<Familia>(inicial);

export const useFamilia = create<FamiliaState>((set, get) => {
  let cancelarAssinatura: (() => void) | null = null;

  const ligar = (h: HistoricoFamilia<Familia>): void => {
    cancelarAssinatura?.();
    cancelarAssinatura = h.assinar(() => {
      set((s) => ({
        historico: h,
        versao: s.versao + 1,
        sel: s.sel !== null && h.atual.pecas.some((p) => p.id === s.sel) ? s.sel : null,
      }));
    });
  };

  const { tipoId, valores } = estadoInicial(inicial);
  ligar(historicoInicial);

  return {
    aberta: false,
    historico: historicoInicial,
    versao: 0,
    tipoId,
    valores,
    sel: null,
    vista: '3d',
    explodir: 0,
    portas: true,
    detalhe: 'fino',
    opacidade: 1,
    corte: { ativo: false, eixo: 'y', posicao: 0.3 },
    dialogo: null,
    aninhadoEmEdicao: null,
    catalogo: structuredClone(CATALOGO_PADRAO),
    cavilhas: false,
    ferramenta: null,
    abrir: () => set({ aberta: true }),
    ocultar: () => set({ aberta: false, dialogo: null, aninhadoEmEdicao: null }),
    familia: () => get().historico.atual,
    executar: (rotulo, receita) => {
      try {
        get().historico.exec(rotulo, (rascunho) => {
          const motivo = receita(rascunho as unknown as Familia);
          if (motivo !== null) throw new Recusa(motivo);
        });
        return null;
      } catch (erro) {
        if (erro instanceof Recusa) return erro.motivo;
        throw erro;
      }
    },
    agrupar: (rotulo, fn) => {
      get().historico.agrupar(rotulo, fn);
    },
    desfazer: () => get().historico.desfazer(),
    refazer: () => get().historico.refazer(),
    setValor: (id, v) => set((s) => ({ valores: { ...s.valores, [id]: v } })),
    limparValor: (id) => set((s) => {
      const valores = { ...s.valores };
      delete valores[id];
      return { valores };
    }),
    escolherTipo: (id) => {
      if (!get().historico.atual.tipos.some((t) => t.id === id)) return;
      set({ tipoId: id, valores: {} });
    },
    selecionarPeca: (id) => set({ sel: id }),
    novaFamilia: (f) => {
      const novo = new HistoricoFamilia<Familia>(structuredClone(f));
      ligar(novo);
      const estado = estadoInicial(novo.atual);
      set((s) => ({ historico: novo, versao: s.versao + 1, ...estado, sel: null, aninhadoEmEdicao: null }));
    },
    setCatalogo: (c) => set({ catalogo: c }),
    set: (patch) => {
      // O item "Módulo aninhado" da faixa não é uma ferramenta: em vez de só troca-la na barra de status,
      // abre o diálogo do módulo aninhado (a faixa em si não é editável nesta ficha).
      if (patch.ferramenta === 'Módulo aninhado') {
        set({ ...patch, ferramenta: null, dialogo: 'aninhado', aninhadoEmEdicao: null });
        return;
      }
      set(patch);
    },
  };
});

interface CacheResolucao {
  versao: number;
  tipoId: string | null;
  valores: Record<string, Valor>;
  resolucao: ResolucaoFamilia;
}

let cache: CacheResolucao | null = null;

/** Resolução da família corrente, memoizada por (versão, tipo e valores): a mesma referência enquanto nada mudar. */
export function resolucaoCorrente(): ResolucaoFamilia {
  const s = useFamilia.getState();
  if (cache !== null && cache.versao === s.versao && cache.tipoId === s.tipoId && cache.valores === s.valores) {
    return cache.resolucao;
  }
  const resolucao = resolverFamilia(s.historico.atual, { tipoId: s.tipoId ?? undefined, valores: s.valores, biblioteca: familiaDaBiblioteca });
  cache = { versao: s.versao, tipoId: s.tipoId, valores: s.valores, resolucao };
  return resolucao;
}

/** Assina versão, tipo e valores e devolve a resolução memoizada do estado corrente. */
export function useResolucao(): ResolucaoFamilia {
  useFamilia((s) => s.versao);
  useFamilia((s) => s.tipoId);
  useFamilia((s) => s.valores);
  return resolucaoCorrente();
}
