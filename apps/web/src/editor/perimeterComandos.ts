import type { PerimeterModifyKind, ToolId } from '@hestia/tools';
import { t, useI18n, type TextLike } from './i18n.ts';

/**
 * Ferramentas da faixa que, com o modo de perímetro aberto, viram um comando de Modificar sobre as linhas do esboço
 * (`PerimeterTool.setModify`). Fora do modo continuam sendo as ferramentas normais do app. "Excluir" é uma ação da
 * faixa (ver `actions.ts`), não uma ferramenta, e entra pelo mesmo nome de comando.
 */
export const COMANDO_DO_ESBOCO: Partial<Record<ToolId, PerimeterModifyKind>> = {
  align: 'align',
  move: 'move',
  copy: 'copy',
  offset: 'offset',
  rotate: 'rotate',
  mirror: 'mirror',
  trim: 'trim',
  split: 'split',
  array: 'array',
};

/** Tradução do motivo no idioma ativo (lida na hora do tooltip, não no carregamento do módulo). */
const mensagem = (key: 'edc_perim_parallel' | 'edc_perim_rehost' | 'edc_perim_not_yet'): string => t(useI18n.getState().lang, key);

/** Ferramentas de Modificar sem sentido no esboço: ficam desabilitadas na faixa, com este motivo no tooltip. */
export const SEM_ESBOCO: Partial<Record<ToolId, string>> = {
  get parallel() {
    return mensagem('edc_perim_parallel');
  },
  get rehost() {
    return mensagem('edc_perim_rehost');
  },
};

/** Motivo do tooltip dos botões que ainda não existem para o esboço (Escala, Fixar, Desafixar). */
export const SEM_ESBOCO_AINDA = mensagem('edc_perim_not_yet');

/** Tradução da dica de cada comando no idioma ativo. */
const dica = (key:
  | 'edc_perim_hint_trim'
  | 'edc_perim_hint_split'
  | 'edc_perim_hint_offset'
  | 'edc_perim_hint_move'
  | 'edc_perim_hint_copy'
  | 'edc_perim_hint_rotate'
  | 'edc_perim_hint_mirror'
  | 'edc_perim_hint_array'
  | 'edc_perim_hint_align'
  | 'edc_perim_hint_delete'): string => t(useI18n.getState().lang, key);

/** Dica do comando ligado, na barra de status (a barra de opções mostra o nome do comando). */
export const DICA_COMANDO: Record<PerimeterModifyKind, string> = {
  get trim() {
    return dica('edc_perim_hint_trim');
  },
  get split() {
    return dica('edc_perim_hint_split');
  },
  get offset() {
    return dica('edc_perim_hint_offset');
  },
  get move() {
    return dica('edc_perim_hint_move');
  },
  get copy() {
    return dica('edc_perim_hint_copy');
  },
  get rotate() {
    return dica('edc_perim_hint_rotate');
  },
  get mirror() {
    return dica('edc_perim_hint_mirror');
  },
  get array() {
    return dica('edc_perim_hint_array');
  },
  get align() {
    return dica('edc_perim_hint_align');
  },
  get delete() {
    return dica('edc_perim_hint_delete');
  },
};

/** Mensagem quando o comando não pode começar (o esboço não tem linhas que sirvam a ele). */
export const COMANDO_RECUSADO: TextLike = { key: 'edc_perim_refused' };
