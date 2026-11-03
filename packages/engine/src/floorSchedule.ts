import { isFloor, type Id, type Project, type ResolvedUnits } from '@hestia/model';
import { csvDocument, csvText } from './csv.ts';
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import { t, type Lang } from './i18n.ts';
import { quantifyFloors } from './floorQuantities.ts';

/** Um piso na tabela. Valores em metros (SI). */
export interface FloorScheduleRow {
  floorId: Id;
  mark: string;
  typeId: Id;
  typeName: string;
  typeCode: string;
  levelId: Id;
  levelName: string;
  /** Área em planta do contorno, bruta (metros quadrados). */
  area: number;
  /** Área líquida da face superior, sem o que a laje ocupa (metros quadrados). */
  netArea: number;
  perimeter: number;
  thickness: number;
  /** Volume líquido (metros cúbicos): sem o que a laje ocupa. */
  volume: number;
  /** Volume bruto (metros cúbicos), antes do desconto da laje. Igual a `volume` sem corte. */
  grossVolume: number;
  /** Deslocamento do topo em relação ao nível (m). */
  heightOffset: number;
}

export interface FloorScheduleTotals {
  count: number;
  area: number;
  netArea: number;
  perimeter: number;
  volume: number;
  grossVolume: number;
}

export interface FloorSchedule {
  rows: FloorScheduleRow[];
  totals: FloorScheduleTotals;
}

export interface FloorScheduleFilter {
  typeId?: Id;
  levelId?: Id;
}

/** Tabela de pisos do projeto inteiro, nível a nível (ordem de criação dentro de cada nível). */
export function buildFloorSchedule(p: Project): FloorSchedule {
  const rows: FloorScheduleRow[] = [];
  for (const level of p.levels) {
    for (const q of quantifyFloors(p, level.id).floors) {
      const e = p.elements[q.floorId];
      if (!isFloor(e)) continue;
      const t = p.floorTypes[q.typeId];
      rows.push({
        floorId: q.floorId,
        mark: e.mark,
        typeId: q.typeId,
        typeName: t?.name ?? q.typeId,
        typeCode: t?.code ?? '',
        levelId: q.levelId,
        levelName: level.name,
        area: q.area,
        netArea: q.netArea,
        perimeter: q.perimeter,
        thickness: q.thickness,
        volume: q.volume,
        grossVolume: q.grossVolume,
        heightOffset: e.heightOffset,
      });
    }
  }
  return { rows, totals: sumFloorRows(rows) };
}

/** Linhas que passam pelos filtros de tipo e de nível (sem filtro, todas). */
export const filterFloorRows = (rows: FloorScheduleRow[], f: FloorScheduleFilter): FloorScheduleRow[] =>
  rows.filter((r) => (f.typeId === undefined || r.typeId === f.typeId) && (f.levelId === undefined || r.levelId === f.levelId));

/** Somatórios de um conjunto de linhas (o da tabela inteira ou só o filtrado). */
export function sumFloorRows(rows: FloorScheduleRow[]): FloorScheduleTotals {
  return rows.reduce<FloorScheduleTotals>(
    (t, r) => ({
      count: t.count + 1,
      area: t.area + r.area,
      netArea: t.netArea + r.netArea,
      perimeter: t.perimeter + r.perimeter,
      volume: t.volume + r.volume,
      grossVolume: t.grossVolume + r.grossVolume,
    }),
    { count: 0, area: 0, netArea: 0, perimeter: 0, volume: 0, grossVolume: 0 },
  );
}

const csvHeader = (u: ResolvedUnits, lang: Lang): string[] => [
  t(lang, 'egs_csv_col_marca'),
  t(lang, 'egs_csv_col_tipo'),
  t(lang, 'egs_csv_col_codigo'),
  t(lang, 'egs_csv_col_nivel'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_area'), 'area'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_perimetro'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_espessura'), 'smallLength'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_volume'), 'volume'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_deslocamento'), 'length'),
];

/** Colunas extras do fim da tabela, só quando algum piso tem corte (líquido diferente do bruto). */
const EPS = 1e-9;

/**
 * CSV com separador ';', decimal do idioma (ou o do projeto), cabeçalho no idioma ativo e BOM UTF-8 (o mesmo formato da
 * tabela de paredes). Uma linha por piso, seguida de uma linha de total. Com corte, acrescenta no fim as colunas de área
 * líquida e de volume bruto; sem corte o CSV fica igual ao de antes.
 */
export function floorScheduleToCsv(rows: FloorScheduleRow[], totals: FloorScheduleTotals, units: ResolvedUnits, lang: Lang = 'pt'): string {
  const n = (q: 'length' | 'smallLength' | 'area' | 'volume', v: number, d: number): string => scheduleCsvCell(units, q, v, d, lang);
  const netAreaCut = rows.some((r) => Math.abs(r.netArea - r.area) > EPS);
  const grossCut = rows.some((r) => Math.abs(r.grossVolume - r.volume) > EPS);
  const header = [
    ...csvHeader(units, lang),
    ...(netAreaCut ? [scheduleCsvHeader(units, t(lang, 'egs_csv_col_area_liquida'), 'area')] : []),
    ...(grossCut ? [scheduleCsvHeader(units, t(lang, 'egs_csv_col_volume_bruto'), 'volume')] : []),
  ];
  const body = rows.map((r) => [
    csvText(r.mark),
    csvText(r.typeName),
    csvText(r.typeCode),
    csvText(r.levelName),
    n('area', r.area, 2),
    n('length', r.perimeter, 2),
    n('smallLength', r.thickness, 3),
    n('volume', r.volume, 3),
    n('length', r.heightOffset, 3),
    ...(netAreaCut ? [n('area', r.netArea, 2)] : []),
    ...(grossCut ? [n('volume', r.grossVolume, 3)] : []),
  ]);
  const total = [
    t(lang, 'egs_csv_total'),
    '',
    '',
    '',
    n('area', totals.area, 2),
    n('length', totals.perimeter, 2),
    '',
    n('volume', totals.volume, 3),
    '',
    ...(netAreaCut ? [n('area', totals.netArea, 2)] : []),
    ...(grossCut ? [n('volume', totals.grossVolume, 3)] : []),
  ];
  return csvDocument([header, ...body, total]);
}
