import { defaultUnits, type Id, type Project, type ResolvedUnits } from '@hestia/model';
import { csvDocument, csvText } from './csv.ts';
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import { t, type Lang } from './i18n.ts';
import { resolveBeamsOnLevel, resolveColumnsOnLevel, resolveFootingsOnLevel } from './structural.ts';

// -------------------------------------------------------------------------------------------------
// Pilar (Column Schedule)
// -------------------------------------------------------------------------------------------------

export interface ColumnScheduleRow {
  columnId: Id;
  mark: string;
  typeId: Id;
  typeName: string;
  typeCode: string;
  baseLevelId: Id;
  baseLevelName: string;
  topLevelId: Id | null;
  topLevelName: string;
  height: number;
  sectionArea: number;
  volume: number;
  areaFormwork: number;
  cost: number;
}

export interface ColumnScheduleTotals {
  count: number;
  volume: number;
  areaFormwork: number;
  cost: number;
}

export interface ColumnSchedule {
  rows: ColumnScheduleRow[];
  totals: ColumnScheduleTotals;
}

export interface ColumnScheduleFilter {
  typeId?: Id;
  levelId?: Id;
}

export function sumColumnRows(rows: readonly ColumnScheduleRow[]): ColumnScheduleTotals {
  return rows.reduce<ColumnScheduleTotals>(
    (acc, r) => ({
      count: acc.count + 1,
      volume: acc.volume + r.volume,
      areaFormwork: acc.areaFormwork + r.areaFormwork,
      cost: acc.cost + r.cost,
    }),
    { count: 0, volume: 0, areaFormwork: 0, cost: 0 },
  );
}

export function filterColumnRows(rows: readonly ColumnScheduleRow[], f: ColumnScheduleFilter): ColumnScheduleRow[] {
  return rows.filter((r) => (f.typeId === undefined || r.typeId === f.typeId) && (f.levelId === undefined || r.baseLevelId === f.levelId));
}

export function buildColumnSchedule(p: Project): ColumnSchedule {
  const rows: ColumnScheduleRow[] = [];
  const levelNames = new Map(p.levels.map((l) => [l.id, l.name]));
  for (const level of p.levels) {
    for (const rc of resolveColumnsOnLevel(p, level.id)) {
      rows.push({
        columnId: rc.id,
        mark: rc.column.mark,
        typeId: rc.type.id,
        typeName: rc.type.name,
        typeCode: rc.type.code,
        baseLevelId: rc.column.levelId,
        baseLevelName: level.name,
        topLevelId: rc.column.topLevelId,
        topLevelName: rc.column.topLevelId ? (levelNames.get(rc.column.topLevelId) ?? '') : '',
        height: rc.height,
        sectionArea: rc.sectionArea,
        volume: rc.volume,
        areaFormwork: rc.areaFormwork,
        cost: rc.cost,
      });
    }
  }
  return { rows, totals: sumColumnRows(rows) };
}

const columnCsvHeader = (u: ResolvedUnits, lang: Lang): string[] => [
  t(lang, 'egs_csv_col_marca'),
  t(lang, 'egs_csv_col_tipo'),
  t(lang, 'egs_csv_col_codigo'),
  t(lang, 'egs_csv_col_nivel_base'),
  t(lang, 'egs_csv_col_nivel_topo'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_altura'), 'length'),
  scheduleCsvHeader(u, lang === 'pt' ? 'Área da seção' : 'Section Area', 'area'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_volume'), 'volume'),
  scheduleCsvHeader(u, lang === 'pt' ? 'Área de fôrma' : 'Formwork Area', 'area'),
  scheduleCsvHeader(u, lang === 'pt' ? 'Custo' : 'Cost', 'currency'),
];

export function columnScheduleToCsv(
  schedOrRows: ColumnSchedule | readonly ColumnScheduleRow[],
  totalsOrUnits?: ColumnScheduleTotals | ResolvedUnits,
  unitsOrLang?: ResolvedUnits | Lang,
  langMaybe?: Lang,
): string {
  let rows: readonly ColumnScheduleRow[];
  let totals: ColumnScheduleTotals;
  let units: ResolvedUnits;
  let lang: Lang;

  if ('rows' in schedOrRows) {
    rows = schedOrRows.rows;
    totals = schedOrRows.totals;
    units = (totalsOrUnits as ResolvedUnits | undefined) ?? defaultUnits('pt');
    lang = (unitsOrLang as Lang | undefined) ?? 'pt';
  } else {
    rows = schedOrRows;
    totals = (totalsOrUnits as ColumnScheduleTotals) ?? sumColumnRows(rows);
    units = (unitsOrLang as ResolvedUnits | undefined) ?? defaultUnits('pt');
    lang = langMaybe ?? 'pt';
  }

  const n = (q: 'length' | 'area' | 'volume' | 'currency', v: number, d: number): string => scheduleCsvCell(units, q, v, d, lang);
  const body = rows.map((r) => [
    csvText(r.mark),
    csvText(r.typeName),
    csvText(r.typeCode),
    csvText(r.baseLevelName),
    csvText(r.topLevelName),
    n('length', r.height, 2),
    n('area', r.sectionArea, 3),
    n('volume', r.volume, 3),
    n('area', r.areaFormwork, 2),
    n('currency', r.cost, 2),
  ]);
  const total = [t(lang, 'egs_csv_total'), '', '', '', '', '', '', n('volume', totals.volume, 3), n('area', totals.areaFormwork, 2), n('currency', totals.cost, 2)];
  return csvDocument([columnCsvHeader(units, lang), ...body, total]);
}

// -------------------------------------------------------------------------------------------------
// Viga (Beam Schedule)
// -------------------------------------------------------------------------------------------------

export interface BeamScheduleRow {
  beamId: Id;
  mark: string;
  typeId: Id;
  typeName: string;
  typeCode: string;
  levelId: Id;
  levelName: string;
  length: number;
  width: number;
  depth: number;
  volume: number;
  areaFormwork: number;
  cost: number;
}

export interface BeamScheduleTotals {
  count: number;
  length: number;
  volume: number;
  areaFormwork: number;
  cost: number;
}

export interface BeamSchedule {
  rows: BeamScheduleRow[];
  totals: BeamScheduleTotals;
}

export interface BeamScheduleFilter {
  typeId?: Id;
  levelId?: Id;
}

export function sumBeamRows(rows: readonly BeamScheduleRow[]): BeamScheduleTotals {
  return rows.reduce<BeamScheduleTotals>(
    (acc, r) => ({
      count: acc.count + 1,
      length: acc.length + r.length,
      volume: acc.volume + r.volume,
      areaFormwork: acc.areaFormwork + r.areaFormwork,
      cost: acc.cost + r.cost,
    }),
    { count: 0, length: 0, volume: 0, areaFormwork: 0, cost: 0 },
  );
}

export function filterBeamRows(rows: readonly BeamScheduleRow[], f: BeamScheduleFilter): BeamScheduleRow[] {
  return rows.filter((r) => (f.typeId === undefined || r.typeId === f.typeId) && (f.levelId === undefined || r.levelId === f.levelId));
}

export function buildBeamSchedule(p: Project): BeamSchedule {
  const rows: BeamScheduleRow[] = [];
  for (const level of p.levels) {
    for (const rb of resolveBeamsOnLevel(p, level.id)) {
      rows.push({
        beamId: rb.id,
        mark: rb.beam.mark,
        typeId: rb.type.id,
        typeName: rb.type.name,
        typeCode: rb.type.code,
        levelId: rb.beam.levelId,
        levelName: level.name,
        length: rb.length,
        width: rb.type.width,
        depth: rb.type.depth,
        volume: rb.volume,
        areaFormwork: rb.areaFormwork,
        cost: rb.cost,
      });
    }
  }
  return { rows, totals: sumBeamRows(rows) };
}

const beamCsvHeader = (u: ResolvedUnits, lang: Lang): string[] => [
  t(lang, 'egs_csv_col_marca'),
  t(lang, 'egs_csv_col_tipo'),
  t(lang, 'egs_csv_col_codigo'),
  t(lang, 'egs_csv_col_nivel'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_comprimento'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_largura'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_altura'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_volume'), 'volume'),
  scheduleCsvHeader(u, lang === 'pt' ? 'Área de fôrma' : 'Formwork Area', 'area'),
  scheduleCsvHeader(u, lang === 'pt' ? 'Custo' : 'Cost', 'currency'),
];

export function beamScheduleToCsv(
  schedOrRows: BeamSchedule | readonly BeamScheduleRow[],
  totalsOrUnits?: BeamScheduleTotals | ResolvedUnits,
  unitsOrLang?: ResolvedUnits | Lang,
  langMaybe?: Lang,
): string {
  let rows: readonly BeamScheduleRow[];
  let totals: BeamScheduleTotals;
  let units: ResolvedUnits;
  let lang: Lang;

  if ('rows' in schedOrRows) {
    rows = schedOrRows.rows;
    totals = schedOrRows.totals;
    units = (totalsOrUnits as ResolvedUnits | undefined) ?? defaultUnits('pt');
    lang = (unitsOrLang as Lang | undefined) ?? 'pt';
  } else {
    rows = schedOrRows;
    totals = (totalsOrUnits as BeamScheduleTotals) ?? sumBeamRows(rows);
    units = (unitsOrLang as ResolvedUnits | undefined) ?? defaultUnits('pt');
    lang = langMaybe ?? 'pt';
  }

  const n = (q: 'length' | 'area' | 'volume' | 'currency', v: number, d: number): string => scheduleCsvCell(units, q, v, d, lang);
  const body = rows.map((r) => [
    csvText(r.mark),
    csvText(r.typeName),
    csvText(r.typeCode),
    csvText(r.levelName),
    n('length', r.length, 2),
    n('length', r.width, 2),
    n('length', r.depth, 2),
    n('volume', r.volume, 3),
    n('area', r.areaFormwork, 2),
    n('currency', r.cost, 2),
  ]);
  const total = [t(lang, 'egs_csv_total'), '', '', '', n('length', totals.length, 2), '', '', n('volume', totals.volume, 3), n('area', totals.areaFormwork, 2), n('currency', totals.cost, 2)];
  return csvDocument([beamCsvHeader(units, lang), ...body, total]);
}

// -------------------------------------------------------------------------------------------------
// Sapata (Footing Schedule)
// -------------------------------------------------------------------------------------------------

export interface FootingScheduleRow {
  footingId: Id;
  mark: string;
  typeId: Id;
  typeName: string;
  typeCode: string;
  levelId: Id;
  levelName: string;
  width: number;
  length: number;
  thickness: number;
  area: number;
  volume: number;
  cost: number;
}

export interface FootingScheduleTotals {
  count: number;
  area: number;
  volume: number;
  cost: number;
}

export interface FootingSchedule {
  rows: FootingScheduleRow[];
  totals: FootingScheduleTotals;
}

export interface FootingScheduleFilter {
  typeId?: Id;
  levelId?: Id;
}

export function sumFootingRows(rows: readonly FootingScheduleRow[]): FootingScheduleTotals {
  return rows.reduce<FootingScheduleTotals>(
    (acc, r) => ({
      count: acc.count + 1,
      area: acc.area + r.area,
      volume: acc.volume + r.volume,
      cost: acc.cost + r.cost,
    }),
    { count: 0, area: 0, volume: 0, cost: 0 },
  );
}

export function filterFootingRows(rows: readonly FootingScheduleRow[], f: FootingScheduleFilter): FootingScheduleRow[] {
  return rows.filter((r) => (f.typeId === undefined || r.typeId === f.typeId) && (f.levelId === undefined || r.levelId === f.levelId));
}

export function buildFootingSchedule(p: Project): FootingSchedule {
  const rows: FootingScheduleRow[] = [];
  for (const level of p.levels) {
    for (const rf of resolveFootingsOnLevel(p, level.id)) {
      rows.push({
        footingId: rf.id,
        mark: rf.footing.mark,
        typeId: rf.type.id,
        typeName: rf.type.name,
        typeCode: rf.type.code,
        levelId: rf.footing.levelId,
        levelName: level.name,
        width: rf.type.width,
        length: rf.type.length,
        thickness: rf.type.thickness,
        area: rf.area,
        volume: rf.volume,
        cost: rf.cost,
      });
    }
  }
  return { rows, totals: sumFootingRows(rows) };
}

const footingCsvHeader = (u: ResolvedUnits, lang: Lang): string[] => [
  t(lang, 'egs_csv_col_marca'),
  t(lang, 'egs_csv_col_tipo'),
  t(lang, 'egs_csv_col_codigo'),
  t(lang, 'egs_csv_col_nivel'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_largura'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_comprimento'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_espessura'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_area'), 'area'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_volume'), 'volume'),
  scheduleCsvHeader(u, lang === 'pt' ? 'Custo' : 'Cost', 'currency'),
];

export function footingScheduleToCsv(
  schedOrRows: FootingSchedule | readonly FootingScheduleRow[],
  totalsOrUnits?: FootingScheduleTotals | ResolvedUnits,
  unitsOrLang?: ResolvedUnits | Lang,
  langMaybe?: Lang,
): string {
  let rows: readonly FootingScheduleRow[];
  let totals: FootingScheduleTotals;
  let units: ResolvedUnits;
  let lang: Lang;

  if ('rows' in schedOrRows) {
    rows = schedOrRows.rows;
    totals = schedOrRows.totals;
    units = (totalsOrUnits as ResolvedUnits | undefined) ?? defaultUnits('pt');
    lang = (unitsOrLang as Lang | undefined) ?? 'pt';
  } else {
    rows = schedOrRows;
    totals = (totalsOrUnits as FootingScheduleTotals) ?? sumFootingRows(rows);
    units = (unitsOrLang as ResolvedUnits | undefined) ?? defaultUnits('pt');
    lang = langMaybe ?? 'pt';
  }

  const n = (q: 'length' | 'area' | 'volume' | 'currency', v: number, d: number): string => scheduleCsvCell(units, q, v, d, lang);
  const body = rows.map((r) => [
    csvText(r.mark),
    csvText(r.typeName),
    csvText(r.typeCode),
    csvText(r.levelName),
    n('length', r.width, 2),
    n('length', r.length, 2),
    n('length', r.thickness, 2),
    n('area', r.area, 2),
    n('volume', r.volume, 3),
    n('currency', r.cost, 2),
  ]);
  const total = [t(lang, 'egs_csv_total'), '', '', '', '', '', '', n('area', totals.area, 2), n('volume', totals.volume, 3), n('currency', totals.cost, 2)];
  return csvDocument([footingCsvHeader(units, lang), ...body, total]);
}
