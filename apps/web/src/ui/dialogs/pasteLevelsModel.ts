/**
 * Lógica pura do diálogo "Selecionar níveis" (colar alinhado). Não importa React nem o controlador: o diálogo guarda o
 * modelo em estado, chama estas funções e devolve `selected`/`link` ao integrador pelos callbacks.
 */
import type { Id } from '@hestia/model';
import { cmpTexto, t, useI18n, type Lang } from '../../editor/i18n.ts';

/** Nível como o diálogo precisa: id, nome e elevação em metros (SI). */
export interface PasteLevelsLevel {
  id: Id;
  name: string;
  elevation: number;
}

/** Tudo o que a abertura do diálogo recebe do integrador. */
export interface PasteLevelsInput {
  /** Níveis do projeto (qualquer ordem; aqui são ordenados por elevação). */
  levels: readonly PasteLevelsLevel[];
  /** Níveis de onde a seleção copiada veio: são a referência e nunca são destino. */
  originLevelIds: readonly Id[];
  /** Elementos na área de transferência (as categorias ignoradas não entram). */
  elementCount: number;
  /** Níveis marcados ao abrir. */
  initialSelected: readonly Id[];
  /** Vínculo entre as cópias ao abrir (desligado por padrão no diálogo). */
  initialLink: boolean;
}

export interface PasteLevelsModel {
  /** Níveis ordenados por elevação (empate pelo nome, em pt-BR). */
  levels: PasteLevelsLevel[];
  /** Níveis de origem que existem no projeto, na ordem de `levels`. */
  originLevelIds: Id[];
  /** Elementos na área de transferência. */
  elementCount: number;
  /** Níveis de destino marcados, na ordem de `levels`. Sempre sem o nível de origem. */
  selected: Id[];
  /** Manter cópias vinculadas. */
  link: boolean;
}

export type PasteLevelsGroupKey = 'above' | 'current' | 'below';

/** Um grupo da lista: acima da origem, na origem, abaixo dela. */
export interface PasteLevelsGroup {
  key: PasteLevelsGroupKey;
  title: string;
  levels: PasteLevelsLevel[];
}

const GROUP_TITLE_KEYS: Record<PasteLevelsGroupKey, 'dlm_grp_above' | 'dlm_grp_current' | 'dlm_grp_below'> = {
  above: 'dlm_grp_above',
  current: 'dlm_grp_current',
  below: 'dlm_grp_below',
};

/** Nome comparado sem acentos e sem caixa: a busca e a ordem não dependem de "Térreo" vs "TERREO". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function elementsOf(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.trunc(count));
}

/**
 * Modelo inicial: níveis ordenados por elevação, seleção sem ids inexistentes, duplicados ou do nível de origem.
 * Não mexe nos arrays recebidos.
 */
export function createPasteLevelsModel(input: PasteLevelsInput, lang: Lang = useI18n.getState().lang): PasteLevelsModel {
  const levels = [...input.levels].sort((a, b) => a.elevation - b.elevation || cmpTexto(a.name, b.name, lang));
  const known = new Set(levels.map((l) => l.id));
  const origins = new Set(input.originLevelIds.filter((id) => known.has(id)));
  const wanted = new Set(input.initialSelected);
  return {
    levels,
    originLevelIds: levels.filter((l) => origins.has(l.id)).map((l) => l.id),
    elementCount: elementsOf(input.elementCount),
    selected: levels.filter((l) => wanted.has(l.id) && !origins.has(l.id)).map((l) => l.id),
    link: input.initialLink === true,
  };
}

/** Nível do modelo; `null` se o id não existir. */
export function levelOf(m: PasteLevelsModel, id: Id): PasteLevelsLevel | null {
  return m.levels.find((l) => l.id === id) ?? null;
}

/** O nível é de origem (referência da cópia)? */
export function isOriginLevel(m: PasteLevelsModel, id: Id): boolean {
  return m.originLevelIds.includes(id);
}

/** Elevação do nível de origem mais baixo — a base do Δh; `null` quando não há origem. */
export function originElevation(m: PasteLevelsModel): number | null {
  for (const level of m.levels) if (m.originLevelIds.includes(level.id)) return level.elevation;
  return null;
}

/** Δh do nível em relação à origem (metros); `null` para id desconhecido ou sem origem. */
export function deltaOf(m: PasteLevelsModel, id: Id): number | null {
  const reference = originElevation(m);
  const level = levelOf(m, id);
  if (reference === null || level === null) return null;
  return level.elevation - reference;
}

/** Seleção na ordem de `levels`, sem origem e sem repetição. */
function orderedSelection(m: PasteLevelsModel, ids: Iterable<Id>): Id[] {
  const wanted = new Set(ids);
  return m.levels.filter((l) => wanted.has(l.id) && !m.originLevelIds.includes(l.id)).map((l) => l.id);
}

/** Novo modelo com a seleção dada; devolve o mesmo objeto quando nada muda (bom para `setState`). */
function withSelection(m: PasteLevelsModel, ids: Iterable<Id>): PasteLevelsModel {
  const next = orderedSelection(m, ids);
  if (next.length === m.selected.length && next.every((id, i) => id === m.selected[i])) return m;
  return { ...m, selected: next };
}

/** Marca/desmarca um nível. Origem e ids desconhecidos são ignorados. */
export function toggleLevel(m: PasteLevelsModel, id: Id): PasteLevelsModel {
  if (levelOf(m, id) === null || isOriginLevel(m, id)) return m;
  const next = new Set(m.selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return withSelection(m, next);
}

/** Marca todos os níveis acima da origem, somando à seleção atual. Sem origem, não muda nada. */
export function selectAllAbove(m: PasteLevelsModel): PasteLevelsModel {
  const reference = originElevation(m);
  if (reference === null) return m;
  return withSelection(m, [...m.selected, ...m.levels.filter((l) => l.elevation > reference).map((l) => l.id)]);
}

/** Marca todos os níveis abaixo da origem, somando à seleção atual. Sem origem, não muda nada. */
export function selectAllBelow(m: PasteLevelsModel): PasteLevelsModel {
  const reference = originElevation(m);
  if (reference === null) return m;
  return withSelection(m, [...m.selected, ...m.levels.filter((l) => l.elevation < reference).map((l) => l.id)]);
}

/**
 * Marca o intervalo de índices (inclusive, na ordem de `levels`), somando à seleção atual. Os índices são limitados ao
 * que existe; a origem nunca entra.
 */
export function selectRange(m: PasteLevelsModel, fromIndex: number, toIndex: number): PasteLevelsModel {
  if (m.levels.length === 0 || !Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) return m;
  const clamp = (i: number): number => Math.min(m.levels.length - 1, Math.max(0, Math.trunc(i)));
  const a = clamp(fromIndex);
  const b = clamp(toIndex);
  const range = m.levels.slice(Math.min(a, b), Math.max(a, b) + 1).map((l) => l.id);
  return withSelection(m, [...m.selected, ...range]);
}

/** Níveis cujo nome contém o termo (sem acentos e sem caixa). Termo vazio devolve todos. */
export function search(levels: readonly PasteLevelsLevel[], term: string): PasteLevelsLevel[] {
  const q = normalize(term);
  if (q === '') return [...levels];
  return levels.filter((l) => normalize(l.name).includes(q));
}

/**
 * Lista agrupada em Acima / Atual / Abaixo pela elevação da origem (a mais baixa, quando há mais de uma). Grupos
 * vazios são omitidos. Sem origem, todos ficam em "Atual".
 */
export function groupLevels(m: PasteLevelsModel, lang: Lang = useI18n.getState().lang): PasteLevelsGroup[] {
  const reference = originElevation(m);
  const buckets: Record<PasteLevelsGroupKey, PasteLevelsLevel[]> = { above: [], current: [], below: [] };
  for (const level of m.levels) {
    if (isOriginLevel(m, level.id) || reference === null || level.elevation === reference) buckets.current.push(level);
    else if (level.elevation > reference) buckets.above.push(level);
    else buckets.below.push(level);
  }
  const keys: PasteLevelsGroupKey[] = ['above', 'current', 'below'];
  return keys.filter((key) => buckets[key].length > 0).map((key) => ({ key, title: t(lang, GROUP_TITLE_KEYS[key]), levels: buckets[key] }));
}

/** Resumo do rodapé: níveis marcados e total de cópias (elementos × níveis). */
export function summary(m: PasteLevelsModel, lang: Lang = useI18n.getState().lang): string {
  const levels = m.selected.length;
  const copies = levels * m.elementCount;
  return t(lang, 'dlm_summary', {
    levels,
    copies,
    levelWord: t(lang, levels === 1 ? 'dlm_level_one' : 'dlm_level_many'),
    copyWord: t(lang, copies === 1 ? 'dlm_copy_one' : 'dlm_copy_many'),
  });
}

/** Problema que impede colar/pré-visualizar, ou `null` quando está tudo certo. */
export function validate(m: PasteLevelsModel, lang: Lang = useI18n.getState().lang): string | null {
  if (m.levels.length === 0) return t(lang, 'dlm_err_no_levels');
  if (m.selected.length === 0) return t(lang, 'dlm_err_select_one_level');
  const known = new Set(m.levels.map((l) => l.id));
  const missing = m.selected.find((id) => !known.has(id));
  if (missing !== undefined) return t(lang, 'dlm_err_level_missing', { id: missing });
  if (m.selected.some((id) => m.originLevelIds.includes(id))) return t(lang, 'dlm_err_origin_level');
  return null;
}
