import {
  formatQuantity,
  openingFamilyOf,
  openingHandle,
  openingHinges,
  openingOptionSupport,
  openingSettingClearance,
  outline,
  validateOpeningShape,
  type OpeningGlassKind,
  type OpeningSettingSystem,
  type OpeningType,
  type ResolvedUnits,
} from '@hestia/model';
import { csvText } from './csv.ts';
import { areaPerimetroDoContorno } from './furoContornoParede.ts';
import { scheduleCsvCell, scheduleCsvHeader } from './scheduleCsv.ts';
import type { Lang } from './i18n.ts';
import type { OpeningPartsRow } from './openingPartQuantities.ts';
import type { OpeningScheduleRow } from './openingSchedule.ts';

/*
 * Quadro executivo de portas e janelas (docs/estudo-esquadrias/31): colunas que o executivo brasileiro pede e que o quadro
 * padrão não tinha (contorno real, perímetro, sistema de assentamento, vidro, ferragens por unidade, observações e quantidade
 * por tipo) e as peças do quadro de peças (`buildOpeningPartsSchedule`). Ligado só com `executivo: true`: o quadro e o CSV
 * padrão ficam como estavam. Textos em pt e en; os outros idiomas caem para en, como em `t()`.
 */

/** Campos do quadro executivo de uma linha (por esquadria, salvo onde diz "total"). Ausentes no quadro padrão. */
export interface OpeningExecFields {
  /** Espelhada: flipHand e flipFacing diferentes (imagem espelhada do tipo; Lapin, docs/estudo-esquadrias/02). */
  mirrored: boolean;
  /** Área real do contorno do vão (m2), com a forma quando há; W x H para vão retangular. Não depende do cliente de furo. */
  contourArea: number;
  contourAreaTotal: number;
  /** Perímetro do contorno do vão (m). */
  perimeter: number;
  /** Instâncias do tipo somando todas as medidas e espelhos (`count` é só a linha). */
  typeCount: number;
  /** Sistema de assentamento ('' sem sistema) e folga efetiva por lado (m). */
  settingSystem: string;
  settingClearance: number;
  /** Vidro: tipo e espessura ('' quando a esquadria não tem vidro). */
  glass: string;
  hingesPerUnit: number;
  hingesTotal: number;
  handlesPerUnit: number;
  handlesTotal: number;
  /** Desvio, composição e descrição do tipo, separados por "; ". */
  observations: string;
  /** Peças do quadro de peças, por esquadria (null quando a linha não tem parede válida). */
  frameVolume: number | null;
  casingVolume: number | null;
  glassArea: number | null;
  leafVolume: number | null;
  glassAreaTotal: number | null;
}

/** Colunas opcionais do quadro executivo, na ordem em que saem (ao fim do CSV e depois das colunas opcionais já existentes). */
export const OPENING_EXEC_KEYS = [
  'contourArea',
  'contourAreaTotal',
  'perimeter',
  'typeCount',
  'mirrored',
  'settingSystem',
  'settingClearance',
  'glass',
  'hinges',
  'handles',
  'hingesTotal',
  'handlesTotal',
  'observations',
  'frameVolume',
  'casingVolume',
  'glassArea',
  'leafVolume',
  'glassAreaTotal',
] as const;
export type OpeningExecKey = (typeof OPENING_EXEC_KEYS)[number];

type ExecText = Record<OpeningExecKey | 'yes' | 'no' | 'setting_grapa' | 'setting_espuma' | 'setting_contramarco' | `glass_${OpeningGlassKind}`, string>;

const TEXT: { pt: ExecText; en: ExecText } = {
  pt: {
    contourArea: 'Área do contorno unitária (m²)',
    contourAreaTotal: 'Área do contorno total (m²)',
    perimeter: 'Perímetro do contorno (m)',
    typeCount: 'Quantidade do tipo',
    mirrored: 'Espelhada',
    settingSystem: 'Sistema de assentamento',
    settingClearance: 'Folga de assentamento por lado (cm)',
    glass: 'Vidro',
    hinges: 'Dobradiças por esquadria',
    handles: 'Maçanetas por esquadria',
    hingesTotal: 'Dobradiças (total)',
    handlesTotal: 'Maçanetas (total)',
    observations: 'Observações',
    frameVolume: 'Batente e soleira, volume por esquadria (m³)',
    casingVolume: 'Alizar, volume por esquadria (m³)',
    glassArea: 'Vidro, área por esquadria (m²)',
    leafVolume: 'Folha, volume por esquadria (m³)',
    glassAreaTotal: 'Vidro, área total (m²)',
    yes: 'Sim',
    no: 'Não',
    setting_grapa: 'Grapa',
    setting_espuma: 'Espuma expansiva',
    setting_contramarco: 'Contramarco',
    glass_clear: 'Liso',
    glass_ribbed: 'Canelado',
    glass_smoke: 'Fumê',
    glass_green: 'Verde',
    glass_bronze: 'Bronze',
    glass_frosted: 'Jateado',
    glass_wired: 'Aramado',
    glass_laminated: 'Laminado',
    glass_tempered: 'Temperado',
  },
  en: {
    contourArea: 'Contour area per unit (m²)',
    contourAreaTotal: 'Total contour area (m²)',
    perimeter: 'Contour perimeter (m)',
    typeCount: 'Type quantity',
    mirrored: 'Mirrored',
    settingSystem: 'Setting system',
    settingClearance: 'Setting clearance per side (cm)',
    glass: 'Glass',
    hinges: 'Hinges per unit',
    handles: 'Handles per unit',
    hingesTotal: 'Hinges (total)',
    handlesTotal: 'Handles (total)',
    observations: 'Notes',
    frameVolume: 'Frame and threshold, volume per unit (m³)',
    casingVolume: 'Casing, volume per unit (m³)',
    glassArea: 'Glass, area per unit (m²)',
    leafVolume: 'Leaf, volume per unit (m³)',
    glassAreaTotal: 'Glass, total area (m²)',
    yes: 'Yes',
    no: 'No',
    setting_grapa: 'Anchor clip',
    setting_espuma: 'Expanding foam',
    setting_contramarco: 'Subframe',
    glass_clear: 'Clear',
    glass_ribbed: 'Ribbed',
    glass_smoke: 'Smoke',
    glass_green: 'Green',
    glass_bronze: 'Bronze',
    glass_frosted: 'Frosted',
    glass_wired: 'Wired',
    glass_laminated: 'Laminated',
    glass_tempered: 'Tempered',
  },
};

const execText = (lang: Lang, key: keyof ExecText): string => (lang === 'pt' ? TEXT.pt : TEXT.en)[key];

const SETTING_KEY: Record<OpeningSettingSystem, keyof ExecText> = { grapa: 'setting_grapa', espuma: 'setting_espuma', contramarco: 'setting_contramarco' };
const GLASS_KEY: Record<OpeningGlassKind, keyof ExecText> = {
  clear: 'glass_clear',
  ribbed: 'glass_ribbed',
  smoke: 'glass_smoke',
  green: 'glass_green',
  bronze: 'glass_bronze',
  frosted: 'glass_frosted',
  wired: 'glass_wired',
  laminated: 'glass_laminated',
  tempered: 'glass_tempered',
};

/** Rótulo do sistema de assentamento ('' sem sistema). */
export function settingSystemLabel(system: OpeningSettingSystem | undefined, lang: Lang = 'pt'): string {
  return system === undefined ? '' : execText(lang, SETTING_KEY[system]);
}

/** Rótulo do tipo de vidro. */
export function glassKindLabel(kind: OpeningGlassKind, lang: Lang = 'pt'): string {
  return execText(lang, GLASS_KEY[kind]);
}

/**
 * Área e perímetro do CONTORNO do vão (esquadria, não o furo): com forma válida, o contorno real; sem forma, o retângulo
 * `width x height`. Não passa pelo cliente de furo (`areaDoVaoDoTipo` só usa o contorno com cliente instalado).
 */
export function contornoDoVao(ot: Pick<OpeningType, 'width' | 'shape'>, height: number): { area: number; perimeter: number } {
  const s = ot.shape;
  if (s && s.kind !== 'rect') {
    const forma = { ...s, width: ot.width, height };
    if (validateOpeningShape(forma).length === 0) return areaPerimetroDoContorno(forma);
  }
  return { area: ot.width * height, perimeter: 2 * (ot.width + height) };
}

/** Espelhada: flipHand e flipFacing diferentes (imagem espelhada do tipo em um dos eixos). */
export const espelhada = (o: { flipHand?: boolean; flipFacing?: boolean }): boolean => !!o.flipHand !== !!o.flipFacing;

/** Entrada de `execFieldsOf`: o tipo como gravado, o tipo já no vão, a linha e as peças da medida. */
export interface ExecInput {
  raw: OpeningType;
  /** Tipo no vão (spanTypeOf): largura e forma do vão. */
  ot: OpeningType;
  height: number;
  count: number;
  mirrored: boolean;
  variant: string;
  composition: string;
  description: string;
  parts: OpeningPartsRow | null;
  lang: Lang;
  units: ResolvedUnits;
}

/** Campos do quadro executivo de uma linha. `typeCount` começa igual à linha e o quadro soma depois. */
export function execFieldsOf(i: ExecInput): OpeningExecFields {
  const { raw, ot, height, count, lang, parts } = i;
  const contorno = contornoDoVao(ot, height);
  const sup = openingOptionSupport(openingFamilyOf(ot)?.id);
  const hingesPerUnit = sup.hinges ? openingHinges(ot) : 0;
  const handlesPerUnit = sup.handle && openingHandle(ot) !== 'none' ? 1 : 0;
  const glassKind = raw.glassKind ?? (ot.kind === 'window' ? 'clear' : undefined);
  const glassThickness = raw.glassThickness;
  const glass = glassKind === undefined ? '' : glassKindLabel(glassKind, lang) + (glassThickness ? ` ${formatQuantity(i.units, 'smallLength', glassThickness, { decimals: 0 })}` : '');
  return {
    mirrored: i.mirrored,
    contourArea: contorno.area,
    contourAreaTotal: contorno.area * count,
    perimeter: contorno.perimeter,
    typeCount: count,
    settingSystem: settingSystemLabel(raw.settingSystem, lang),
    settingClearance: openingSettingClearance(raw),
    glass,
    hingesPerUnit,
    hingesTotal: hingesPerUnit * count,
    handlesPerUnit,
    handlesTotal: handlesPerUnit * count,
    observations: [i.variant, i.composition, i.description].filter((x) => x !== '').join('; '),
    frameVolume: parts ? parts.frameVolume : null,
    casingVolume: parts ? parts.casingVolume : null,
    glassArea: parts ? parts.glassArea : null,
    leafVolume: parts ? parts.leafVolume : null,
    glassAreaTotal: parts ? parts.totalGlassArea : null,
  };
}

/** Cabeçalho CSV de uma coluna executiva, com a grandeza quando a coluna é numérica. */
export function openingExecCsvHeader(k: OpeningExecKey, u: ResolvedUnits, lang: Lang): string {
  const label = execText(lang, k);
  switch (k) {
    case 'contourArea':
    case 'contourAreaTotal':
    case 'glassArea':
    case 'glassAreaTotal':
      return scheduleCsvHeader(u, label, 'area');
    case 'perimeter':
      return scheduleCsvHeader(u, label, 'length');
    case 'settingClearance':
      return scheduleCsvHeader(u, label, 'smallLength');
    default:
      return label;
  }
}

/** Célula CSV de uma coluna executiva; vazia quando a linha não tem o dado (ex.: peças sem parede válida). */
export function openingExecCsvCell(r: OpeningScheduleRow, k: OpeningExecKey, u: ResolvedUnits, lang: Lang): string {
  const e = r.exec;
  if (!e) return '';
  const n = (q: 'length' | 'smallLength' | 'area' | 'volume', v: number, d: number): string => scheduleCsvCell(u, q, v, d, lang);
  const yn = (b: boolean): string => execText(lang, b ? 'yes' : 'no');
  switch (k) {
    case 'contourArea': return n('area', e.contourArea, 2);
    case 'contourAreaTotal': return n('area', e.contourAreaTotal, 2);
    case 'perimeter': return n('length', e.perimeter, 2);
    case 'typeCount': return String(e.typeCount);
    case 'mirrored': return yn(e.mirrored);
    case 'settingSystem': return csvText(e.settingSystem);
    case 'settingClearance': return n('smallLength', e.settingClearance, 1);
    case 'glass': return csvText(e.glass);
    case 'hinges': return String(e.hingesPerUnit);
    case 'handles': return String(e.handlesPerUnit);
    case 'hingesTotal': return String(e.hingesTotal);
    case 'handlesTotal': return String(e.handlesTotal);
    case 'observations': return csvText(e.observations);
    case 'frameVolume': return e.frameVolume === null ? '' : n('volume', e.frameVolume, 3);
    case 'casingVolume': return e.casingVolume === null ? '' : n('volume', e.casingVolume, 3);
    case 'glassArea': return e.glassArea === null ? '' : n('area', e.glassArea, 2);
    case 'leafVolume': return e.leafVolume === null ? '' : n('volume', e.leafVolume, 3);
    case 'glassAreaTotal': return e.glassAreaTotal === null ? '' : n('area', e.glassAreaTotal, 2);
  }
}

/** Total de uma coluna executiva (só as que somam; as demais ficam vazias). */
export function openingExecCsvTotal(rows: readonly OpeningScheduleRow[], k: OpeningExecKey, u: ResolvedUnits, lang: Lang): string {
  const soma = (f: (e: OpeningExecFields) => number | null): number | null => rows.reduce<number | null>((acc, r) => {
    const v = r.exec ? f(r.exec) : null;
    return v === null ? acc : (acc ?? 0) + v;
  }, null);
  const put = (q: 'area' | 'length', v: number | null): string => (v === null ? '' : scheduleCsvCell(u, q, v, 2, lang));
  switch (k) {
    case 'contourAreaTotal': return put('area', soma((e) => e.contourAreaTotal));
    case 'glassAreaTotal': return put('area', soma((e) => e.glassAreaTotal));
    case 'hingesTotal': { const v = soma((e) => e.hingesTotal); return v === null ? '' : String(v); }
    case 'handlesTotal': { const v = soma((e) => e.handlesTotal); return v === null ? '' : String(v); }
    default: return '';
  }
}
