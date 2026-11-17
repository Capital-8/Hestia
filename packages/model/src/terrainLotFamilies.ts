import type { Id, Project, ProjectSettings } from './types.ts';
import { formatQuantity, unitsOf } from './units.ts';

/**
 * Famílias do texto do terreno (rótulo de curva de nível e cota de ponto do terreno) e do lote (linha de propriedade e
 * texto dos lados). Mesmo molde de `annotationFamilies.ts`: lista em `ProjectSettings` (ausente = padrões), `...Of`, `...For`,
 * comandos de upsert/remover. Os padrões reproduzem o desenho que existia antes das famílias (1,8 mm e 1,5 mm).
 */
export type TerrainTextKind = 'contour' | 'spot';
export type LotLineStyle = 'dashed' | 'solid' | 'dash-dot';
export type LengthUnit = 'project' | 'm' | 'cm' | 'mm';

export interface TerrainTextFamily {
  id: Id;
  name: string;
  /** `contour` = rótulo de curva de nível; `spot` = cota de ponto do terreno. */
  kind: TerrainTextKind;
  /** Altura do texto em mm de papel. */
  textMm: number;
  font: string;
  bold?: boolean;
  italic?: boolean;
  /** Cor do texto; ausente = a do tema. */
  color?: string;
  prefix: string;
  /** Casas decimais; ausente = as das unidades do projeto. */
  precision?: 0 | 1 | 2 | 3;
  unit: LengthUnit;
}

export interface LotFamily {
  id: Id;
  name: string;
  /** Linha de propriedade (contorno do lote). */
  lineStyle: LotLineStyle;
  /** Cor da linha; ausente = a do lote ou a do tema. */
  lineColor?: string;
  /** Multiplicador da espessura de projeção da linha. */
  lineWeight: number;
  /** Texto dos lados (rumo/papel e medida). */
  textMm: number;
  font: string;
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  showPaper: boolean;
  showLength: boolean;
  /** Casas decimais; ausente = as das unidades do projeto. */
  precision?: 0 | 1 | 2 | 3;
  unit: LengthUnit;
}

/** Fonte padrão das famílias: o desenho usa a do tema; só uma fonte diferente desta é aplicada ao rótulo. */
export const FAMILY_FONT_PADRAO = 'Arial Narrow, Arial, sans-serif';
const FONT = FAMILY_FONT_PADRAO;

export const TERRAIN_TEXT_FAMILIES_DEFAULT: TerrainTextFamily[] = [
  { id: 'tntxt_contour_std', name: 'Rótulo de curva 1,8 mm', kind: 'contour', textMm: 1.8, font: FONT, prefix: '', unit: 'project' },
  { id: 'tntxt_spot_std', name: 'Cota de ponto 1,8 mm', kind: 'spot', textMm: 1.8, font: FONT, prefix: '', unit: 'project' },
  { id: 'tntxt_spot_title', name: 'Cota de ponto 2,5 mm Negrito', kind: 'spot', textMm: 2.5, font: FONT, bold: true, prefix: 'Z ', unit: 'project' },
];

export const LOT_FAMILIES_DEFAULT: LotFamily[] = [
  { id: 'lotfam_std', name: 'Lote padrão (tracejado, 1,5 mm)', lineStyle: 'dashed', lineWeight: 1, textMm: 1.5, font: FONT, showPaper: true, showLength: true, unit: 'project' },
  { id: 'lotfam_solid', name: 'Linha de propriedade contínua', lineStyle: 'solid', lineWeight: 1.4, textMm: 2, font: FONT, bold: true, showPaper: true, showLength: true, unit: 'project' },
];

export function terrainTextFamiliesOf(s: ProjectSettings | undefined, kind?: TerrainTextKind): TerrainTextFamily[] {
  const all = s?.terrainTextFamilies?.length ? s.terrainTextFamilies : TERRAIN_TEXT_FAMILIES_DEFAULT;
  return kind ? all.filter((f) => f.kind === kind) : all;
}
export function defaultTerrainTextFamilyIdOf(s: ProjectSettings | undefined, kind: TerrainTextKind): Id {
  const fams = terrainTextFamiliesOf(s, kind);
  const pref = kind === 'contour' ? s?.defaultTerrainContourFamilyId : s?.defaultTerrainSpotFamilyId;
  return pref && fams.some((f) => f.id === pref) ? pref : fams[0]!.id;
}
export function terrainTextFamilyFor(s: ProjectSettings | undefined, kind: TerrainTextKind, id?: Id): TerrainTextFamily {
  const fams = terrainTextFamiliesOf(s, kind);
  return (id ? fams.find((f) => f.id === id) : undefined) ?? fams.find((f) => f.id === defaultTerrainTextFamilyIdOf(s, kind)) ?? fams[0]!;
}

export function lotFamiliesOf(s?: ProjectSettings): LotFamily[] {
  return s?.lotFamilies?.length ? s.lotFamilies : LOT_FAMILIES_DEFAULT;
}
export function defaultLotFamilyIdOf(s?: ProjectSettings): Id {
  const fams = lotFamiliesOf(s);
  return s?.defaultLotFamilyId && fams.some((f) => f.id === s.defaultLotFamilyId) ? s.defaultLotFamilyId : fams[0]!.id;
}
export function lotFamilyFor(s: ProjectSettings | undefined, id?: Id): LotFamily {
  const fams = lotFamiliesOf(s);
  return (id ? fams.find((f) => f.id === id) : undefined) ?? fams.find((f) => f.id === defaultLotFamilyIdOf(s)) ?? fams[0]!;
}

function upsert<T extends { id: Id }>(list: T[], item: T): T[] {
  const next = [...list];
  const i = next.findIndex((x) => x.id === item.id);
  if (i >= 0) next[i] = item;
  else next.push(item);
  return next;
}

export function writeTerrainTextFamily(s: ProjectSettings, item: TerrainTextFamily): ProjectSettings {
  return { ...s, terrainTextFamilies: upsert(terrainTextFamiliesOf(s), item) };
}
export function removeTerrainTextFamilyFrom(s: ProjectSettings, id: Id): ProjectSettings {
  const target = terrainTextFamiliesOf(s).find((x) => x.id === id);
  const next = terrainTextFamiliesOf(s).filter((x) => x.id !== id);
  if (!target || !next.some((x) => x.kind === target.kind)) return s;
  const out: ProjectSettings = { ...s, terrainTextFamilies: next };
  if (s.defaultTerrainContourFamilyId === id) delete out.defaultTerrainContourFamilyId;
  if (s.defaultTerrainSpotFamilyId === id) delete out.defaultTerrainSpotFamilyId;
  return out;
}

export function writeLotFamily(s: ProjectSettings, item: LotFamily): ProjectSettings {
  return { ...s, lotFamilies: upsert(lotFamiliesOf(s), item) };
}
export function removeLotFamilyFrom(s: ProjectSettings, id: Id): ProjectSettings {
  const next = lotFamiliesOf(s).filter((x) => x.id !== id);
  if (!next.length || next.length === lotFamiliesOf(s).length) return s;
  const out: ProjectSettings = { ...s, lotFamilies: next };
  if (s.defaultLotFamilyId === id) delete out.defaultLotFamilyId;
  return out;
}

/** Comprimento (m) formatado pela unidade e pelas casas da família (`project`/ausente = as do projeto). */
export function formatLengthByFamily(p: Pick<Project, 'settings'>, meters: number, f: { unit: LengthUnit; precision?: 0 | 1 | 2 | 3 }): string {
  return formatQuantity(unitsOf(p), 'length', meters, {
    ...(f.unit === 'project' ? {} : { unit: f.unit }),
    ...(f.precision !== undefined ? { decimals: f.precision } : {}),
  });
}
