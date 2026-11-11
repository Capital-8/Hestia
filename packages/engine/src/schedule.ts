import { formatQuantity, isCurtainType, wallThicknessOf, unitSymbol, unitsOf, wallType, wallsOnLevel, type Id, type Project, type ResolvedUnits, type Wall, type WallType } from '@hestia/model';
import { csvDocument, csvText } from './csv.ts';
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import { collationFor, t, type Lang } from './i18n.ts';
import { quantifyLevel, type WallQuantity } from './quantities.ts';
import { resolveLevel } from './resolve.ts';

/** Uma parede na tabela de quantitativos. Valores em metros (SI). */
export interface WallScheduleRow {
  wallId: Id;
  mark: string;
  typeId: Id;
  typeName: string;
  levelId: Id;
  levelName: string;
  /** Espessura total do tipo (soma das camadas). */
  thickness: number;
  length: number;
  height: number;
  grossFaceArea: number;
  openingsArea: number;
  netFaceArea: number;
  /** Volume líquido (metros cúbicos): sem o que piso e laje do nível ocupam. */
  volume: number;
  /** Volume bruto (metros cúbicos), antes do desconto de piso e laje. */
  grossVolume: number;
  /** Camadas da face externa para a interna, em cm: "Reboco 2,0 | Bloco 14,0 | ...". */
  layersSummary: string;
}

export interface WallScheduleTotals {
  count: number;
  length: number;
  grossFaceArea: number;
  openingsArea: number;
  netFaceArea: number;
  volume: number;
  grossVolume: number;
}

export interface MaterialVolume {
  materialId: Id;
  name: string;
  volume: number;
}

export interface WallSchedule {
  rows: WallScheduleRow[];
  totals: WallScheduleTotals;
  /** Volume total por material em todo o projeto (segunda tabela). */
  volumeByMaterial: MaterialVolume[];
}

const layersSummary = (p: Project, wt: WallType, lang: Lang): string => {
  const u = unitsOf(p, lang);
  return wt.layers
    .map((l) => `${p.materials[l.materialId]?.name ?? l.materialId} ${formatQuantity(u, 'smallLength', l.thickness, { decimals: 1, withUnit: false })}`)
    .join(' | ');
};

function rowOf(p: Project, wall: Wall, levelName: string, q: WallQuantity, lang: Lang): WallScheduleRow {
  const t = wallType(p, wall);
  return {
    wallId: wall.id,
    mark: wall.mark,
    typeId: t.id,
    typeName: t.name,
    levelId: wall.levelId,
    levelName,
    thickness: wallThicknessOf(t),
    length: q.length,
    height: q.height,
    grossFaceArea: q.grossFaceArea,
    openingsArea: q.openingsArea,
    netFaceArea: q.netFaceArea,
    volume: q.volume,
    grossVolume: q.grossVolume,
    layersSummary: layersSummary(p, t, lang),
  };
}

/** Somatórios de um conjunto de linhas (o da tabela inteira ou só o filtrado). */
export function sumWallRows(rows: WallScheduleRow[]): WallScheduleTotals {
  const t: WallScheduleTotals = { count: rows.length, length: 0, grossFaceArea: 0, openingsArea: 0, netFaceArea: 0, volume: 0, grossVolume: 0 };
  for (const r of rows) {
    t.length += r.length;
    t.grossFaceArea += r.grossFaceArea;
    t.openingsArea += r.openingsArea;
    t.netFaceArea += r.netFaceArea;
    t.volume += r.volume;
    t.grossVolume += r.grossVolume;
  }
  return t;
}

/** Tabela de paredes do projeto inteiro, nível a nível (ordem de criação dentro de cada nível). */
export function buildWallSchedule(p: Project, lang: Lang = 'pt'): WallSchedule {
  const rows: WallScheduleRow[] = [];
  const volumes = new Map<Id, number>();
  for (const level of p.levels) {
    const q = quantifyLevel(p, resolveLevel(p, level.id));
    const byWall = new Map<Id, WallQuantity>(q.walls.map((x) => [x.wallId, x]));
    for (const wall of wallsOnLevel(p, level.id)) {
      // Paredes cortina têm tabela própria (curtainSchedule.ts): a camada-sombra não é espessura de parede de camadas.
      if (isCurtainType(p.wallTypes[wall.typeId])) continue;
      const wq = byWall.get(wall.id);
      if (wq) rows.push(rowOf(p, wall, level.name, wq, lang));
    }
    for (const [materialId, vol] of Object.entries(q.volumeByMaterial)) {
      volumes.set(materialId, (volumes.get(materialId) ?? 0) + vol);
    }
  }
  const volumeByMaterial = [...volumes]
    .map(([materialId, volume]) => ({ materialId, name: p.materials[materialId]?.name ?? materialId, volume }))
    .sort((a, b) => a.name.localeCompare(b.name, collationFor(lang)));
  return { rows, totals: sumWallRows(rows), volumeByMaterial };
}

/** Cabeçalho do CSV com os símbolos das unidades do projeto. */
const csvHeader = (u: ResolvedUnits, lang: Lang): string[] => [
  t(lang, 'egs_csv_col_marca'),
  t(lang, 'egs_csv_col_tipo'),
  t(lang, 'egs_csv_col_nivel'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_espessura'), 'smallLength'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_comprimento'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_altura'), 'length'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_area_bruta'), 'area'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_area_de_vaos'), 'area'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_area_liquida'), 'area'),
  scheduleCsvHeader(u, t(lang, 'egs_csv_col_volume'), 'volume'),
  `${t(lang, 'egs_csv_col_camadas')} (${unitSymbol(u, 'smallLength')})`,
];

/**
 * CSV com separador ';', decimal do idioma (ou o do projeto), cabeçalho no idioma ativo e BOM UTF-8.
 * Uma linha por parede, seguida de uma linha de total.
 */
export function scheduleToCsv(rows: WallScheduleRow[], totals: WallScheduleTotals, units: ResolvedUnits, lang: Lang = 'pt'): string {
  const n = (q: 'length' | 'smallLength' | 'area' | 'volume', v: number, d: number): string => scheduleCsvCell(units, q, v, d, lang);
  const grossCut = rows.some((r) => Math.abs(r.grossVolume - r.volume) > 1e-9);
  const body = rows.map((r) => [
    csvText(r.mark),
    csvText(r.typeName),
    csvText(r.levelName),
    n('smallLength', r.thickness, 3),
    n('length', r.length, 2),
    n('length', r.height, 2),
    n('area', r.grossFaceArea, 2),
    n('area', r.openingsArea, 2),
    n('area', r.netFaceArea, 2),
    n('volume', r.volume, 3),
    csvText(r.layersSummary),
    ...(grossCut ? [n('volume', r.grossVolume, 3)] : []),
  ]);
  const total = [t(lang, 'egs_csv_total'), '', '', '', n('length', totals.length, 2), '', n('area', totals.grossFaceArea, 2), n('area', totals.openingsArea, 2), n('area', totals.netFaceArea, 2), n('volume', totals.volume, 3), ''];
  if (grossCut) total.push(n('volume', totals.grossVolume, 3));
  const header = csvHeader(units, lang);
  if (grossCut) header.push(scheduleCsvHeader(units, t(lang, 'egs_csv_col_volume_bruto'), 'volume'));
  return csvDocument([header, ...body, total]);
}
