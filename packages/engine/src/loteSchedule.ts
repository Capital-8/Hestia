import { isLot, type Id, type Lot, type Project, type ResolvedUnits } from '@hestia/model';
import { csvDocument, csvText } from './csv.ts';
import type { Lang } from './i18nMessages.ts';
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import { indicesDoLote } from './loteIndices.ts';

/**
 * Tabela "Índices do lote" (ficha P4, A.6): uma linha por lote, com a área, a área edificável, a projeção, a área construída e, para cada índice, o valor,
 * o limite do lote e a marca "dentro" ou "excede". Limite ausente mostra "—" e não há marca. Tudo é calculado pelo motor do lote (`indicesDoLote`), sem
 * o kernel: a tabela é ao vivo, a interface a recalcula a cada renderização.
 */

/** Texto do limite ausente e da marca quando não há limite (A.6: "—"). */
export const LIMITE_AUSENTE = '—';

/** Folga numérica nas comparações de fração (a mesma dos avisos do lote). */
const EPS = 1e-9;

/**
 * Marca de um índice contra o limite. Nos dois índices de teto (taxa de ocupação e coeficiente) "excede" quer dizer acima do máximo. Na permeabilidade,
 * que é um mínimo, "excede" quer dizer abaixo do mínimo: a marca diz que o limite não é cumprido, como nos outros dois.
 */
export type SituacaoIndice = 'dentro' | 'excede';

/** Um índice com o valor (fração), o limite do lote (fração, ou `null` sem limite) e a marca (`null` sem limite). */
export interface IndiceLote {
  valor: number;
  limite: number | null;
  situacao: SituacaoIndice | null;
}

export interface LoteScheduleRow {
  loteId: Id;
  nome: string;
  /** Área do lote (metros quadrados). */
  area: number;
  /** Área edificável, lote menos os recuos (metros quadrados). */
  areaEdificavel: number;
  /** Área da projeção da edificação dentro do lote (metros quadrados). */
  areaProjecao: number;
  /** Soma das áreas construídas por nível dentro do lote (metros quadrados). */
  areaConstruida: number;
  taxaOcupacao: IndiceLote;
  coefAproveitamento: IndiceLote;
  permeabilidade: IndiceLote;
}

export interface LoteSchedule {
  rows: LoteScheduleRow[];
}

/**
 * Marca de um índice de teto (máximo): "excede" quando o valor passa do limite; sem limite, `null`.
 */
export function situacaoMaxima(valor: number, limite: number | undefined): SituacaoIndice | null {
  if (limite === undefined) return null;
  return valor > limite + EPS ? 'excede' : 'dentro';
}

/** Marca de um índice de piso (mínimo): "excede" quando o valor fica abaixo do limite; sem limite, `null`. */
export function situacaoMinima(valor: number, limite: number | undefined): SituacaoIndice | null {
  if (limite === undefined) return null;
  return valor < limite - EPS ? 'excede' : 'dentro';
}

const indice = (valor: number, limite: number | undefined, situacao: (v: number, l: number | undefined) => SituacaoIndice | null): IndiceLote => ({
  valor,
  limite: limite ?? null,
  situacao: situacao(valor, limite),
});

const porOrdem = (a: Lot, b: Lot): number => a.order - b.order || a.id.localeCompare(b.id);

/**
 * Monta a tabela com todos os lotes do projeto, na ordem do modelo. Sem lote, tabela vazia. Lote sem edificação tem índices zero (sem divisão por zero:
 * `indicesDoLote` cuida disso) e segue com a marca do seu limite.
 */
export function buildLoteSchedule(p: Project): LoteSchedule {
  const lotes = Object.values(p.elements).filter(isLot).sort(porOrdem);
  const rows = lotes.map((l): LoteScheduleRow => {
    const ind = indicesDoLote(p, l);
    const { taxaOcupacaoMax, coefAproveitamentoMax, permeabilidadeMin } = l.limites;
    return {
      loteId: l.id,
      nome: l.name,
      area: ind.areaLote,
      areaEdificavel: ind.areaEdificavel,
      areaProjecao: ind.areaProjecao,
      areaConstruida: ind.areaConstruida,
      taxaOcupacao: indice(ind.taxaOcupacao, taxaOcupacaoMax, situacaoMaxima),
      coefAproveitamento: indice(ind.coefAproveitamento, coefAproveitamentoMax, situacaoMaxima),
      permeabilidade: indice(ind.permeabilidade, permeabilidadeMin, situacaoMinima),
    };
  });
  return { rows };
}

/** Textos do CSV, entregues pelo app (i18n da interface): o motor não guarda dicionário desta tabela. */
export interface RotulosCsvLote {
  lote: string;
  area: string;
  areaEdificavel: string;
  areaProjecao: string;
  areaConstruida: string;
  taxaOcupacao: string;
  coefAproveitamento: string;
  permeabilidade: string;
  /** Sufixo das colunas de limite ("limite"). */
  limite: string;
  /** Sufixo das colunas de marca ("marca"). */
  marca: string;
  dentro: string;
  excede: string;
}

/** Célula de um índice em percentual: o valor fracionário vira porcentagem com a casa decimal dada. */
const percentual = (units: ResolvedUnits, v: number, lang: Lang): string => scheduleCsvCell(units, 'currency', v * 100, 2, lang);

/** Célula de um índice de razão (coeficiente): sem unidade, o número com o separador do projeto. */
const razao = (units: ResolvedUnits, v: number, lang: Lang): string => scheduleCsvCell(units, 'currency', v, 2, lang);

const marca = (s: SituacaoIndice | null, r: RotulosCsvLote): string => (s === 'dentro' ? r.dentro : s === 'excede' ? r.excede : LIMITE_AUSENTE);

/**
 * CSV da tabela: separador ';', decimal do idioma (ou o do projeto), BOM UTF-8, cabeçalho com a unidade do projeto e uma linha por lote. Percentuais
 * saem em porcentagem; o coeficiente sai como razão. Sem limite, a célula do limite e a da marca mostram "—".
 */
export function loteScheduleToCsv(s: LoteSchedule, units: ResolvedUnits, r: RotulosCsvLote, lang: Lang = 'pt'): string {
  const a = (v: number): string => scheduleCsvCell(units, 'area', v, 2, lang);
  const lim = (v: number | null, f: (x: number) => string): string => (v === null ? LIMITE_AUSENTE : f(v));
  const pct = (x: number): string => percentual(units, x, lang);
  const cab = [
    r.lote,
    scheduleCsvHeader(units, r.area, 'area'),
    scheduleCsvHeader(units, r.areaEdificavel, 'area'),
    scheduleCsvHeader(units, r.areaProjecao, 'area'),
    scheduleCsvHeader(units, r.areaConstruida, 'area'),
    `${r.taxaOcupacao} (%)`,
    `${r.taxaOcupacao} - ${r.limite} (%)`,
    `${r.taxaOcupacao} - ${r.marca}`,
    r.coefAproveitamento,
    `${r.coefAproveitamento} - ${r.limite}`,
    `${r.coefAproveitamento} - ${r.marca}`,
    `${r.permeabilidade} (%)`,
    `${r.permeabilidade} - ${r.limite} (%)`,
    `${r.permeabilidade} - ${r.marca}`,
  ];
  const corpo = s.rows.map((l) => [
    csvText(l.nome),
    a(l.area),
    a(l.areaEdificavel),
    a(l.areaProjecao),
    a(l.areaConstruida),
    pct(l.taxaOcupacao.valor),
    lim(l.taxaOcupacao.limite, pct),
    marca(l.taxaOcupacao.situacao, r),
    razao(units, l.coefAproveitamento.valor, lang),
    lim(l.coefAproveitamento.limite, (x) => razao(units, x, lang)),
    marca(l.coefAproveitamento.situacao, r),
    pct(l.permeabilidade.valor),
    lim(l.permeabilidade.limite, pct),
    marca(l.permeabilidade.situacao, r),
  ]);
  return csvDocument([cab, ...corpo]);
}
