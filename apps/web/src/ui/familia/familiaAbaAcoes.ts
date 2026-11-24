import {
  adicionarDetalhe,
  adicionarLigacao,
  adicionarSimbolo,
  criarDetalhePadrao,
  criarLigacaoPadrao,
  criarSimboloPadrao,
  duplicarCorpo,
  duplicarLigacao,
  duplicarPeca,
  espelharLigacaoEmX,
  espelharPecaEmX,
  type Familia,
} from '@hestia/model';
import type { PT_ABAS } from '../../editor/i18n/areas/familiasAbas.ts';
import type { PT_ABAS_DICAS } from '../../editor/i18n/areas/familiasAbasDicas.ts';
import { useCorpoSel } from './familiaCorpo.ts';
import { useLigacaoSel } from './FamiliaLigacoesPainel.tsx';
import { useFamilia, type DialogoFamilia, type FamiliaState } from './familiaStore.ts';

/*
 * Ações das abas Inserir, Modificar, Vista e Gerenciar (ficha G2). Cada uma chama uma função que JÁ existe no modelo
 * (edicaoLigacoes, edicaoSimbolos, edicaoDetalhes, edicaoPecas, edicaoCorpos) ou abre um diálogo que já existe. O que
 * ainda não existe não aparece aqui: a aba o mostra desabilitado, com o motivo.
 */

/** Chaves de texto das abas (shards `familiasAbas.ts` e `familiasAbasDicas.ts`). */
export type Chave = keyof typeof PT_ABAS | keyof typeof PT_ABAS_DICAS;

/** Ação sobre a família: recebe o nome do passo de desfazer e devolve o motivo da recusa, ou `null`. */
export type AcaoAba = (nome: string) => string | null;

export interface BotaoAba {
  rotulo: Chave;
  icone: string;
  /** Abre um diálogo do editor. */
  abre?: Exclude<DialogoFamilia, null>;
  /** Grava campos de vista (estilo, nível de detalhe, vista padrão); o botão fica marcado quando já estão assim. */
  ajusta?: Partial<Pick<FamiliaState, 'vista' | 'opacidade' | 'detalhe'>>;
  /** Executa uma ação sobre a família. */
  acao?: AcaoAba;
  /** Exige uma seleção: peça, ligação ou corpo. */
  precisa?: 'peca' | 'ligacao' | 'corpo';
  /** Motivo fixo de estar desabilitado. */
  indisponivel?: Chave;
}

export interface PainelAba {
  titulo: Chave;
  botoes: BotaoAba[];
}

/** Próximo id `base<n>` livre entre os ids dados. */
function novoId(base: string, existentes: readonly { id: string }[] = []): string {
  const usados = new Set(existentes.map((x) => x.id));
  let n = 1;
  while (usados.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

const sobre = (nome: string, receita: (f: Familia) => string | null): string | null =>
  useFamilia.getState().executar(nome, receita);

export const inserirLigacao: AcaoAba = (nome) =>
  sobre(nome, (f) => adicionarLigacao(f, criarLigacaoPadrao('agua_fria', 'redonda', novoId('lig', f.ligacoes))));

export const inserirSimbolo: AcaoAba = (nome) =>
  sobre(nome, (f) => {
    const id = novoId('sim', f.simbolos);
    return adicionarSimbolo(f, criarSimboloPadrao(id, id));
  });

export const inserirDetalhe: AcaoAba = (nome) =>
  sobre(nome, (f) => {
    const id = novoId('det', f.detalhes);
    return adicionarDetalhe(f, criarDetalhePadrao(id, id));
  });

export const espelharPeca: AcaoAba = (nome) => {
  const id = useFamilia.getState().sel;
  if (id === null) return 'Selecione uma peça primeiro';
  return sobre(nome, (f) => espelharPecaEmX(f, id));
};

export const copiarPeca: AcaoAba = (nome) => {
  const id = useFamilia.getState().sel;
  if (id === null) return 'Selecione uma peça primeiro';
  return sobre(nome, (f) => duplicarPeca(f, id));
};

export const espelharLigacao: AcaoAba = (nome) => {
  const id = useLigacaoSel.getState().id;
  if (id === null) return 'Selecione uma ligação primeiro';
  return sobre(nome, (f) => espelharLigacaoEmX(f, id));
};

export const copiarLigacao: AcaoAba = (nome) => {
  const id = useLigacaoSel.getState().id;
  if (id === null) return 'Selecione uma ligação primeiro';
  return sobre(nome, (f) => duplicarLigacao(f, id));
};

export const copiarCorpo: AcaoAba = (nome) => {
  const id = useCorpoSel.getState().id;
  if (id === null) return 'Selecione um corpo primeiro';
  return sobre(nome, (f) => duplicarCorpo(f, id));
};
