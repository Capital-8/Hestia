import { defaultUnits, rampTopLevel, rampsOnLevel, type Id, type Level, type Project, type Ramp, type ResolvedUnits } from '@hestia/model';
import { csvDocument, csvText } from './csv.ts';
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import { t, type Lang } from './i18n.ts';
import { rampQuantities, type RampQuantities } from './rampQuantities.ts';
import { resolveRamps } from './ramps.ts';

/** Uma rampa na tabela. Unidades: m, m² e m³. */
export interface RampScheduleRow {
  rampId: Id;
  mark: string;
  typeId: Id;
  typeName: string;
  typeCode: string;
  /** Nível de base (o da rampa). */
  baseLevelId: Id;
  baseLevelName: string;
  /** Nível de topo efetivo (explícito ou o imediatamente acima); vazio sem nível de topo. */
  topLevelId: Id | null;
  topLevelName: string;
  flightCount: number;
  /** Inclinação (fração). */
  slope: number;
  rise: number;
  pathLength: number;
  width: number;
  planArea: number;
  volume: number;
}

export interface RampScheduleTotals {
  count: number;
  planArea: number;
  volume: number;
}

export interface RampSchedule {
  rows: RampScheduleRow[];
  totals: RampScheduleTotals;
}

export interface RampScheduleFilter {
  typeId?: Id;
  /** Nível de base da rampa. */
  levelId?: Id;
}

/** Linha de uma rampa a partir dos quantitativos dela. */
function rowOf(p: Project, base: Level, r: Ramp, q: RampQuantities): RampScheduleRow {
  const t = p.rampTypes[q.typeId];
  const top = rampTopLevel(p, r);
  return {
    rampId: r.id,
    mark: r.mark,
    typeId: q.typeId,
    typeName: t?.name ?? q.typeId,
    typeCode: t?.code ?? '',
    baseLevelId: base.id,
    baseLevelName: base.name,
    topLevelId: top?.id ?? null,
    topLevelName: top?.name ?? '',
    flightCount: q.flightCount,
    slope: q.slope,
    rise: q.rise,
    pathLength: q.pathLength,
    width: q.width,
    planArea: q.planArea,
    volume: q.volume,
  };
}

/** Tabela de rampas do projeto inteiro, nível a nível (ordem de criação dentro de cada nível). */
export function buildRampSchedule(p: Project): RampSchedule {
  const resolved = new Map(resolveRamps(p).map((r) => [r.id, r] as const));
  const rows: RampScheduleRow[] = [];
  for (const level of p.levels) {
    for (const r of rampsOnLevel(p, level.id)) {
      const rr = resolved.get(r.id);
      if (!rr) continue;
      rows.push(rowOf(p, level, r, rampQuantities(rr)));
    }
  }
  return { rows, totals: sumRampRows(rows) };
}

/** Linhas que passam pelos filtros de tipo e de nível de base (sem filtro, todas). */
export const filterRampRows = (rows: RampScheduleRow[], f: RampScheduleFilter): RampScheduleRow[] =>
  rows.filter((r) => (f.typeId === undefined || r.typeId === f.typeId) && (f.levelId === undefined || r.baseLevelId === f.levelId));

/** Somatórios de um conjunto de linhas (o da tabela inteira ou só o filtrado). */
export function sumRampRows(rows: RampScheduleRow[]): RampScheduleTotals {
  return rows.reduce<RampScheduleTotals>(
    (t, r) => ({ count: t.count + 1, planArea: t.planArea + r.planArea, volume: t.volume + r.volume }),
    { count: 0, planArea: 0, volume: 0 },
  );
}

const csvHeader = (u: ResolvedUnits, lang: Lang): string[] => [
  t(lang, 'egs_csv_col_marca'),
  t(lang, 'egs_csv_col_tipo'),
  t(lang, 'egs_csv_col_codigo'),
  t(lang, 'egs_csv_col_nivel_base'),
  t(lang, 'egs_csv_col_nivel_topo'),
  t(lang, 'egs_csv_col_lances'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_inclinacao'), 'slope'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_desnivel'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_comprimento'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_largura'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_area'), 'area'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_volume'), 'volume'),
];

/**
 * CSV com separador ';', decimal do idioma (ou o do projeto), cabeçalho no idioma ativo e BOM UTF-8. Sem `units`, usa as
 * unidades padrão do idioma (m, m² e m³).
 */
export function rampScheduleToCsv(rows: RampScheduleRow[], totals: RampScheduleTotals, units?: ResolvedUnits, lang: Lang = 'pt'): string {
  const u = units ?? defaultUnits(lang);
  const n = (q: 'length' | 'area' | 'volume' | 'slope', v: number, d: number): string => scheduleCsvCell(u, q, v, d, lang);
  const body = rows.map((r) => [
    csvText(r.mark),
    csvText(r.typeName),
    csvText(r.typeCode),
    csvText(r.baseLevelName),
    csvText(r.topLevelName),
    String(r.flightCount),
    n('slope', r.slope, 2),
    n('length', r.rise, 2),
    n('length', r.pathLength, 2),
    n('length', r.width, 2),
    n('area', r.planArea, 2),
    n('volume', r.volume, 3),
  ]);
  const total = [t(lang, 'egs_csv_total'), '', '', '', '', '', '', '', '', '', n('area', totals.planArea, 2), n('volume', totals.volume, 3)];
  return csvDocument([csvHeader(u, lang), ...body, total]);
}
