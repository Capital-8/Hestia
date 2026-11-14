// Tabela "Massas por pavimento" (plano de massa, A.6 e ficha U2). Uma linha por massa e pavimento, com área e perímetro SOMADOS por cópia do
// arranjo (A.4 regra 11), e um rodapé com volume, áreas totais e altura. O TS só agrega o que o kernel devolve (consultas 142, 144 e 145): nenhuma
// geometria é calculada aqui. Sem kernel (ou com a entrada recusada), devolve `null`: a tabela não mostra zero no lugar do que não foi calculado.

import { isMass, type Id, type Mass, type Project, type ResolvedUnits } from '@hestia/model';
import { csvDocument, csvText } from './csv.ts';
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import type { Lang } from './i18n.ts';
import { AVISO_MASSA } from './kernelMassa.ts';
import { servicoMassa, type AvisoMassaProjeto, type FatiaMassaProjeto, type QuantMassaProjeto, type ServicoMassa } from './massaServico.ts';
import { somaPorPavimento, totaisDasMassas } from './massaQuantities.ts';

/** O que a tabela usa do serviço. Em produção é `servicoMassa()`; os testes injetam uma fonte fixa. */
export type FonteMassa = Pick<ServicoMassa, 'fatias' | 'quantidades' | 'avisos'>;

/** Uma massa num pavimento. Área e perímetro são somados sobre as cópias do arranjo. */
export interface MassScheduleRow {
  massaId: Id;
  massaName: string;
  levelId: Id;
  levelName: string;
  /** Área da fatia no pavimento, somada sobre as cópias (m²). */
  area: number;
  /** Perímetro da fatia, somado sobre as cópias (m). */
  perimeter: number;
  /** Quantas cópias entraram na soma. */
  copias: number;
  /** `true` quando o kernel acusa cópias sobrepostas: a área pode contar em dobro. */
  sobreposta: boolean;
}

export interface MassScheduleTotals {
  /** Volume total das massas (m³), da consulta 144. */
  volume: number;
  areaLateral: number;
  areaBase: number;
  areaTopo: number;
  /** Soma das áreas da coluna de linhas (m²). */
  area: number;
  /** Soma dos perímetros da coluna de linhas (m). */
  perimeter: number;
  /** Maior altura entre as massas (m); 0 sem massa. */
  altura: number;
}

export interface MassSchedule {
  rows: MassScheduleRow[];
  totals: MassScheduleTotals;
}

const TOTAIS_VAZIOS: MassScheduleTotals = { volume: 0, areaLateral: 0, areaBase: 0, areaTopo: 0, area: 0, perimeter: 0, altura: 0 };

/** Textos do CSV (pt e en; os demais idiomas caem em pt, como em `massaIssues.ts`). */
const TXT = {
  pt: { massa: 'Massa', pavimento: 'Pavimento', area: 'Área', perimetro: 'Perímetro', aviso: 'Aviso', total: 'Total', volume: 'Volume total', lateral: 'Área lateral', base: 'Área da base', topo: 'Área do topo', altura: 'Altura máxima', sobreposta: 'a área pode contar em dobro' },
  en: { massa: 'Mass', pavimento: 'Floor', area: 'Area', perimetro: 'Perimeter', aviso: 'Warning', total: 'Total', volume: 'Total volume', lateral: 'Side area', base: 'Base area', topo: 'Top area', altura: 'Maximum height', sobreposta: 'the area may count twice' },
} as const;

/**
 * Monta a tabela a partir do kernel. Sem massa no projeto, devolve a tabela vazia sem chamar o kernel. Com massa e sem kernel (ou com a entrada
 * recusada, que o serviço devolve como `null`), devolve `null`.
 */
export function buildMassSchedule(p: Project, fonte: FonteMassa = servicoMassa()): MassSchedule | null {
  const massas = Object.values(p.elements).filter(isMass);
  if (massas.length === 0) return { rows: [], totals: TOTAIS_VAZIOS };
  const fatias = fonte.fatias(p);
  const quant = fonte.quantidades(p);
  const medidas = fonte.avisos(p);
  if (fatias === null || quant === null || medidas === null) return null;
  const rows = linhasDaTabela(p, massas, fatias, medidas);
  return { rows, totals: totais(rows, quant) };
}

/** Uma linha por (massa, pavimento), na ordem de criação da massa e depois da cota. Fatias sem pavimento do projeto ficam de fora. */
function linhasDaTabela(p: Project, massas: readonly Mass[], fatias: readonly FatiaMassaProjeto[], medidas: readonly AvisoMassaProjeto[]): MassScheduleRow[] {
  const ordem = new Map(massas.map((m, i) => [m.id, i] as const));
  const nomeDe = new Map(massas.map((m) => [m.id, m.name] as const));
  const nivelDe = new Map(p.levels.map((l) => [l.id, l.name] as const));
  const sobrepostas = new Set(medidas.filter((a) => a.codigo === AVISO_MASSA.copiasSobrepostas).map((a) => a.massaId));
  const pares: Array<{ linha: MassScheduleRow; z: number; ordem: number }> = [];
  for (const l of somaPorPavimento(fatias)) {
    if (l.nivelId === null) continue;
    const linha: MassScheduleRow = {
      massaId: l.massaId,
      massaName: nomeDe.get(l.massaId) ?? '',
      levelId: l.nivelId,
      levelName: nivelDe.get(l.nivelId) ?? '',
      area: l.area,
      perimeter: l.perimetro,
      copias: l.copias,
      sobreposta: sobrepostas.has(l.massaId),
    };
    pares.push({ linha, z: l.z, ordem: ordem.get(l.massaId) ?? 0 });
  }
  return pares.sort((a, b) => a.ordem - b.ordem || a.z - b.z).map((q) => q.linha);
}

/** Rodapé: volume e áreas da consulta 144 (somadas sobre as massas), área e perímetro das linhas, e a maior altura. */
function totais(rows: readonly MassScheduleRow[], quant: readonly QuantMassaProjeto[]): MassScheduleTotals {
  const t = totaisDasMassas(quant);
  return {
    volume: t.volume,
    areaLateral: t.areaLateral,
    areaBase: t.areaBase,
    areaTopo: t.areaTopo,
    area: rows.reduce((s, r) => s + r.area, 0),
    perimeter: rows.reduce((s, r) => s + r.perimeter, 0),
    altura: quant.reduce((m, q) => Math.max(m, q.altura), 0),
  };
}

/**
 * CSV com ';', decimal pelo idioma (ou pelo do projeto), cabeçalho no idioma ativo (pt ou en) e BOM UTF-8. Uma linha por massa e pavimento, seguida
 * de uma linha de total e das linhas do rodapé (volume, áreas e altura, com a unidade do projeto no rótulo).
 */
export function massScheduleToCsv(s: MassSchedule, units: ResolvedUnits, lang: Lang = 'pt'): string {
  const x = lang === 'en' ? TXT.en : TXT.pt;
  const n = (q: 'length' | 'area' | 'volume', v: number, d: number): string => scheduleCsvCell(units, q, v, d, lang);
  const header = [x.massa, x.pavimento, scheduleCsvHeader(units, x.area, 'area'), scheduleCsvHeader(units, x.perimetro, 'length'), x.aviso];
  const body = s.rows.map((r) => [csvText(r.massaName), csvText(r.levelName), n('area', r.area, 2), n('length', r.perimeter, 2), r.sobreposta ? x.sobreposta : '']);
  const total = [x.total, '', n('area', s.totals.area, 2), n('length', s.totals.perimeter, 2), ''];
  const rodape: string[][] = [
    [scheduleCsvHeader(units, x.volume, 'volume'), n('volume', s.totals.volume, 3)],
    [scheduleCsvHeader(units, x.lateral, 'area'), n('area', s.totals.areaLateral, 2)],
    [scheduleCsvHeader(units, x.base, 'area'), n('area', s.totals.areaBase, 2)],
    [scheduleCsvHeader(units, x.topo, 'area'), n('area', s.totals.areaTopo, 2)],
    [scheduleCsvHeader(units, x.altura, 'length'), n('length', s.totals.altura, 3)],
  ];
  return csvDocument([header, ...body, total, ...rodape]);
}
