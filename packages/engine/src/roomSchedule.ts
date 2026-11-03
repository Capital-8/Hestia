import type { Id, Project, ResolvedUnits } from '@hestia/model';
import { csvDocument, csvText } from './csv.ts';
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import { t, type Lang } from './i18n.ts';
import { resolveRooms } from './rooms.ts';

/** Um ambiente na tabela. Valores em metros (SI). */
export interface RoomScheduleRow {
  roomId: Id;
  number: string;
  name: string;
  levelId: Id;
  levelName: string;
  /** Área líquida do circuito (metros quadrados); 0 quando o ponto não está num circuito fechado. */
  area: number;
  /** Perímetro do contorno externo (m). */
  perimeter: number;
  /** Pé-direito (m). */
  ceilingHeight: number;
  /** Volume (metros cúbicos) = área × pé-direito. */
  volume: number;
  floorFinish: string;
  wallFinish: string;
  ceilingFinish: string;
}

export interface RoomScheduleTotals {
  count: number;
  area: number;
  perimeter: number;
  volume: number;
}

/** Total de um nível (linhas agrupadas por `levelId`). */
export interface RoomLevelTotals extends RoomScheduleTotals {
  levelId: Id;
  levelName: string;
}

export interface RoomSchedule {
  rows: RoomScheduleRow[];
  /** Total geral do projeto. */
  totals: RoomScheduleTotals;
  /** Totais por nível, na ordem dos níveis. */
  byLevel: RoomLevelTotals[];
}

export interface RoomScheduleFilter {
  levelId?: Id;
}

/**
 * Tabela de ambientes do projeto inteiro, nível a nível (ordem de criação dentro de cada nível). A geometria vem de
 * `resolveRooms`, então área, perímetro e volume são os mesmos da planta. Ambientes com problema (ponto fora de
 * circuito) aparecem com área zero — a validação é quem aponta o problema.
 */
export function buildRoomSchedule(p: Project): RoomSchedule {
  const rows: RoomScheduleRow[] = [];
  for (const level of p.levels) {
    for (const r of resolveRooms(p, level.id)) {
      // Duplicata no mesmo circuito não entra na tabela (senão a área do nível soma duas vezes).
      if (r.duplicateOf !== undefined) continue;
      rows.push({
        roomId: r.roomId,
        number: r.number,
        name: r.name,
        levelId: level.id,
        levelName: level.name,
        area: r.area,
        perimeter: r.perimeter,
        ceilingHeight: r.ceilingHeight,
        volume: r.volume,
        floorFinish: r.floorFinish,
        wallFinish: r.wallFinish,
        ceilingFinish: r.ceilingFinish,
      });
    }
  }
  return { rows, totals: sumRoomRows(rows), byLevel: roomLevelTotals(rows) };
}

/** Linhas que passam pelo filtro de nível (sem filtro, todas). */
export const filterRoomRows = (rows: RoomScheduleRow[], f: RoomScheduleFilter): RoomScheduleRow[] =>
  rows.filter((r) => f.levelId === undefined || r.levelId === f.levelId);

/** Somatórios de um conjunto de linhas (o da tabela inteira ou só o filtrado). */
export function sumRoomRows(rows: RoomScheduleRow[]): RoomScheduleTotals {
  return rows.reduce<RoomScheduleTotals>(
    (t, r) => ({ count: t.count + 1, area: t.area + r.area, perimeter: t.perimeter + r.perimeter, volume: t.volume + r.volume }),
    { count: 0, area: 0, perimeter: 0, volume: 0 },
  );
}

/** Totais por nível de um conjunto de linhas, na ordem em que os níveis aparecem (linhas contíguas por nível). */
export function roomLevelTotals(rows: RoomScheduleRow[]): RoomLevelTotals[] {
  const out: RoomLevelTotals[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.levelId === r.levelId) {
      last.count += 1;
      last.area += r.area;
      last.perimeter += r.perimeter;
      last.volume += r.volume;
    } else {
      out.push({ levelId: r.levelId, levelName: r.levelName, count: 1, area: r.area, perimeter: r.perimeter, volume: r.volume });
    }
  }
  return out;
}

const csvHeader = (u: ResolvedUnits, lang: Lang): string[] => [
  t(lang, 'egs_csv_col_numero'),
  t(lang, 'egs_csv_col_nome'),
  t(lang, 'egs_csv_col_nivel'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_area'), 'area'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_perimetro'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_pe_direito'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_volume'), 'volume'),
  t(lang, 'egs_csv_col_piso'),
  t(lang, 'egs_csv_col_parede'),
  t(lang, 'egs_csv_col_forro'),
];

/**
 * CSV com separador ';', decimal do idioma (ou o do projeto), cabeçalho no idioma ativo e BOM UTF-8 (o mesmo formato das
 * tabelas de pisos e lajes). Uma linha por ambiente, uma linha de subtotal por nível e uma linha de total geral.
 */
export function roomScheduleToCsv(rows: RoomScheduleRow[], totals: RoomScheduleTotals, units: ResolvedUnits, lang: Lang = 'pt'): string {
  const n = (q: 'length' | 'area' | 'volume', v: number, d: number): string => scheduleCsvCell(units, q, v, d, lang);
  const lines: string[][] = [csvHeader(units, lang)];
  let levelId: Id | null = null;
  let levelName = '';
  let acc = { area: 0, perimeter: 0, volume: 0 };
  const flush = (): void => {
    if (levelId === null) return;
    lines.push(['', '', t(lang, 'egs_room_subtotal', { level: levelName }), n('area', acc.area, 2), n('length', acc.perimeter, 2), '', n('volume', acc.volume, 3), '', '', '']);
  };
  for (const r of rows) {
    if (levelId !== null && r.levelId !== levelId) {
      flush();
      acc = { area: 0, perimeter: 0, volume: 0 };
    }
    levelId = r.levelId;
    levelName = r.levelName;
    acc.area += r.area;
    acc.perimeter += r.perimeter;
    acc.volume += r.volume;
    lines.push([
      csvText(r.number),
      csvText(r.name),
      csvText(r.levelName),
      n('area', r.area, 2),
      n('length', r.perimeter, 2),
      n('length', r.ceilingHeight, 2),
      n('volume', r.volume, 3),
      csvText(r.floorFinish),
      csvText(r.wallFinish),
      csvText(r.ceilingFinish),
    ]);
  }
  flush();
  lines.push([t(lang, 'egs_csv_total'), '', '', n('area', totals.area, 2), n('length', totals.perimeter, 2), '', n('volume', totals.volume, 3), '', '', '']);
  return csvDocument(lines);
}
