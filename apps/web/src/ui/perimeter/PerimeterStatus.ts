import type { SketchIssue, SketchIssueCode, SketchResult, SketchTarget } from '@hestia/geom';
import { defaultUnits, formatQuantity, type ResolvedUnits } from '@hestia/model';
import { t, useI18n, type Dict, type Lang } from '../../editor/i18n.ts';

/** Textos do perímetro: títulos dos grupos, rótulos de ferramenta, barra de status e lista de problemas. */

/** Chave do título do grupo nas propriedades e da seção do elemento. */
const TITLE_KEY: Record<SketchTarget, keyof Dict> = {
  roof: 'pro_pm_title_roof',
  floor: 'pro_pm_title_floor',
  slab: 'pro_pm_title_slab',
  ceiling: 'pro_pm_title_ceiling',
};

/** Chave do nome da ferramenta: barra de opções e aba "Modificar | …". */
const TOOL_KEY: Record<SketchTarget, keyof Dict> = {
  roof: 'pro_pm_tool_roof',
  floor: 'pro_pm_tool_floor',
  slab: 'pro_pm_tool_slab',
  ceiling: 'pro_pm_tool_ceiling',
};

/** O que Concluir grava, para o rótulo do botão ("grava o telhado"). */
const SAVES_KEY: Record<SketchTarget, keyof Dict> = {
  roof: 'pro_pm_saves_roof',
  floor: 'pro_pm_saves_floor',
  slab: 'pro_pm_saves_slab',
  ceiling: 'pro_pm_saves_ceiling',
};

const ISSUE_KEY: Record<SketchIssueCode, keyof Dict> = {
  open: 'pro_pm_issue_open',
  'too-few': 'pro_pm_issue_too_few',
  'zero-length': 'pro_pm_issue_zero_length',
  'self-cross': 'pro_pm_issue_self_cross',
  overlap: 'pro_pm_issue_overlap',
  'loops-cross': 'pro_pm_issue_loops_cross',
  'loops-touch': 'pro_pm_issue_loops_touch',
  'hole-outside': 'pro_pm_issue_hole_outside',
  'hole-in-hole': 'pro_pm_issue_hole_in_hole',
  'multi-outer': 'pro_pm_issue_multi_outer',
  empty: 'pro_pm_issue_empty',
};

/** Título do grupo no idioma pedido. */
export function perimeterTitle(target: SketchTarget, lang: Lang = 'pt'): string {
  return t(lang, TITLE_KEY[target]);
}

/** Nome da ferramenta no idioma pedido. */
export function perimeterTool(target: SketchTarget, lang: Lang = 'pt'): string {
  return t(lang, TOOL_KEY[target]);
}

/**
 * Compatibilidade: `Properties.tsx` ainda indexa `PERIMETER_TITLE` diretamente. Resolve no idioma ativo a cada acesso;
 * código novo deve usar `perimeterTitle(target, lang)`.
 */
export const PERIMETER_TITLE: Record<SketchTarget, string> = new Proxy({} as Record<SketchTarget, string>, {
  get: (_target, prop) => perimeterTitle(String(prop) as SketchTarget, useI18n.getState().lang),
  ownKeys: () => Object.keys(TITLE_KEY),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});

/** Texto de um código de problema do contorno. */
export const issueText = (code: SketchIssueCode, lang: Lang = 'pt'): string => t(lang, ISSUE_KEY[code]);

/** Problemas do rascunho com o texto traduzido, na ordem em que o deduzidor os achou. */
export type IssueLine = SketchIssue & { text: string };

export function issueLines(result: SketchResult, lang: Lang = 'pt'): IssueLine[] {
  return result.issues.map((i) => ({ ...i, text: issueText(i.code, lang) }));
}

/** Ajuda do modo, mostrada ao entrar e enquanto o contorno não estiver fechado. */
export function perimeterHint(target: SketchTarget, lang: Lang = 'pt'): string {
  if (target === 'roof') return t(lang, 'pro_pm_hint_roof');
  return t(lang, 'pro_pm_hint', { tool: perimeterTool(target, lang) });
}

/** Mensagem da barra de status conforme o resultado da dedução do contorno. */
export function sketchStatus(target: SketchTarget, result: SketchResult | null, lang: Lang = 'pt'): string {
  if (!result) return perimeterHint(target, lang);
  if (result.ok) return t(lang, 'pro_pm_loop_closed', { target: t(lang, SAVES_KEY[target]) });
  const [first, ...rest] = result.issues;
  if (!first) return perimeterHint(target, lang);
  if (rest.length === 0) return issueText(first.code, lang);
  return t(lang, rest.length === 1 ? 'pro_pm_more_issues_one' : 'pro_pm_more_issues_many', {
    issue: issueText(first.code, lang),
    n: rest.length,
  });
}

/** Dica do botão Concluir: diz o que grava, ou por que ainda não pode gravar. */
export function finishTitle(target: SketchTarget, result: SketchResult | null, lang: Lang = 'pt'): string {
  if (result?.ok) return t(lang, 'pro_pm_finish_title_ok', { target: t(lang, SAVES_KEY[target]) });
  const first = result?.issues[0];
  return first
    ? t(lang, 'pro_pm_finish_title_blocked', { issue: issueText(first.code, lang) })
    : t(lang, 'pro_pm_finish_title_empty');
}

/** Dados de uma aresta para a mensagem da barra de status. */
export interface EdgeStatusInput {
  index: number;
  lengthM: number;
  /** Só telhado. Ausente nos demais alvos. */
  definesSlope?: boolean;
  slopePct?: number;
}

/** Mensagem ao selecionar uma aresta: comprimento, e no telhado se define inclinação. */
export function edgeStatus(e: EdgeStatusInput, units: ResolvedUnits = defaultUnits(), lang: Lang = 'pt'): string {
  const head = t(lang, 'pro_pm_edge_n', { n: e.index + 1 });
  if (e.definesSlope === undefined) return t(lang, 'pro_pm_edge_length', { edge: head, length: formatQuantity(units, 'length', e.lengthM) });
  if (!e.definesSlope) return t(lang, 'pro_pm_edge_no_slope', { edge: head });
  return t(lang, 'pro_pm_edge_slope', { edge: head, value: formatQuantity(units, 'slope', (e.slopePct ?? 0) / 100) });
}
