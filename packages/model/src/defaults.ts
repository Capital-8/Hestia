import { roomCategories } from './areaPlan.ts';
import { floorTypes } from './floor.ts';
import { ceilingTypes } from './ceiling.ts';
import { slabTypes } from './slab.ts';
import { roofTypes } from './roof.ts';
import { stairTypes } from './stair.ts';
import { rampTypes } from './ramp.ts';
import { makeLevel } from './level.ts';
import { ot } from './catalogoAberturasBase.ts';
import { catalogoJanelas } from './catalogoJanelas.ts';
import { catalogoPortas } from './catalogoPortas.ts';
import { catalogoComposicoes } from './catalogoComposicoes.ts';
import { LANGS, openingName, t, type Lang } from './i18n.ts';
import { SCHEMA_VERSION, type Layer, type Material, type OpeningType, type Project, type WallType } from './types.ts';

const mat = (id: string, name: string, color: string, hatch: Material['hatch'], extra: Partial<Material> = {}): Material => ({
  id,
  name,
  color,
  hatch,
  gloss: 0.1,
  opacity: 1,
  cost: 0,
  unit: 'm2',
  ...extra,
});

/** Materiais padrão no idioma pedido. */
export function materials(lang: Lang = 'pt'): Material[] {
  return [
    mat('mat_tinta', t(lang, 'md_mat_paint_white'), '#f4f1ea', 'none'),
    mat('mat_reboco', t(lang, 'md_mat_plaster'), '#d9d2c5', 'dots', { cost: 38 }),
    mat('mat_bloco14', t(lang, 'md_mat_block14'), '#c0693f', 'diagonal', { unit: 'm2', cost: 62 }),
    mat('mat_bloco9', t(lang, 'md_mat_block9'), '#c9784c', 'diagonal', { cost: 52 }),
    mat('mat_bloco19', t(lang, 'md_mat_block19'), '#b45f38', 'diagonal', { cost: 74 }),
    mat('mat_concreto', t(lang, 'md_mat_concrete'), '#8f9296', 'cross', { unit: 'm3', cost: 640 }),
    mat('mat_argamassa', t(lang, 'md_mat_mortar'), '#cdbfa9', 'dots', { cost: 30 }),
    mat('mat_ceramica', t(lang, 'md_mat_ceramic_finish'), '#e9e4da', 'none', { gloss: 0.6, cost: 85 }),
    mat('mat_gesso', t(lang, 'md_mat_gypsum_board'), '#ece9e2', 'none', { cost: 44 }),
    mat('mat_pvc', t(lang, 'md_mat_pvc'), '#e8e6df', 'none', { gloss: 0.4, cost: 60 }),
    mat('mat_la', t(lang, 'md_mat_mineral_wool'), '#e5d27a', 'dots', { cost: 28 }),
    mat('mat_perfil', t(lang, 'md_mat_steel_profile'), '#9aa0a6', 'cross', { cost: 20 }),
    mat('mat_aco', t(lang, 'md_mat_steel'), '#7b8189', 'solid', { gloss: 0.6, unit: 'm3' }),
    mat('mat_madeira', t(lang, 'md_mat_wood'), '#a9794a', 'diagonal', { cost: 150 }),
    mat('mat_vidro', t(lang, 'md_mat_glass'), '#a9d6e5', 'none', { gloss: 0.9, opacity: 0.35, cost: 220 }),
    mat('mat_aluminio', t(lang, 'md_mat_aluminum'), '#b8bdc2', 'solid', { gloss: 0.7, unit: 'm' }),
    mat('mat_telha_ceramica', t(lang, 'md_mat_ceramic_tile'), '#b5522d', 'diagonal', { cost: 85 }),
    mat('mat_fibrocimento', t(lang, 'md_mat_fiber_cement'), '#9ea3a8', 'cross', { cost: 55 }),
    mat('mat_telha_metalica', t(lang, 'md_mat_metal_tile'), '#8e99a3', 'solid', { gloss: 0.6, cost: 140 }),
  ];
}

/** Materiais padrão em PT (compatibilidade); use `materials(lang)` para o idioma ativo. */
export const DEFAULT_MATERIALS: Material[] = materials('pt');

const L = (fn: Layer['function'], materialId: string, thickness: number, wraps = false): Layer => ({
  function: fn,
  materialId,
  thickness,
  wraps,
});

const wt = (id: string, name: string, code: string, description: string, layers: Layer[]): WallType => ({
  id,
  name,
  code,
  description,
  layers,
  wrapInserts: 'both',
  wrapEnds: 'none',
  strips: [],
  cost: 0,
  thermalU: null,
  acousticRw: null,
  fireRating: null,
  manufacturer: '',
});

/** Tipos de parede padrão no idioma pedido. */
export function wallTypes(lang: Lang = 'pt'): WallType[] {
  return [
    wt('wt_alv14', t(lang, 'md_wall_alv14'), 'PA-14', t(lang, 'md_wall_alv14_desc'), [
      L('finish2', 'mat_tinta', 0.002, true),
      L('substrate', 'mat_reboco', 0.02, true),
      L('structure', 'mat_bloco14', 0.14),
      L('substrate', 'mat_reboco', 0.02, true),
      L('finish2', 'mat_tinta', 0.002, true),
    ]),
    wt('wt_alv9', t(lang, 'md_wall_alv9'), 'PA-09', t(lang, 'md_wall_alv9_desc'), [
      L('finish2', 'mat_tinta', 0.002, true),
      L('substrate', 'mat_reboco', 0.015, true),
      L('structure', 'mat_bloco9', 0.09),
      L('substrate', 'mat_reboco', 0.015, true),
      L('finish2', 'mat_tinta', 0.002, true),
    ]),
    wt('wt_ext19', t(lang, 'md_wall_ext19'), 'PE-19', t(lang, 'md_wall_ext19_desc'), [
      L('finish1', 'mat_ceramica', 0.01, true),
      L('substrate', 'mat_argamassa', 0.02, true),
      L('structure', 'mat_bloco19', 0.19),
      L('substrate', 'mat_reboco', 0.02, true),
      L('finish2', 'mat_tinta', 0.002, true),
    ]),
    wt('wt_dry', t(lang, 'md_wall_dry'), 'DW-07', t(lang, 'md_wall_dry_desc'), [
      L('finish1', 'mat_gesso', 0.0125, true),
      L('structure', 'mat_perfil', 0.048),
      L('finish1', 'mat_gesso', 0.0125, true),
    ]),
    wt('wt_conc15', t(lang, 'md_wall_conc15'), 'PC-15', t(lang, 'md_wall_conc15_desc'), [
      L('finish2', 'mat_tinta', 0.002, true),
      L('substrate', 'mat_reboco', 0.015, true),
      L('structure', 'mat_concreto', 0.15),
      L('substrate', 'mat_reboco', 0.015, true),
      L('finish2', 'mat_tinta', 0.002, true),
    ]),
  ];
}

/** Tipos de parede em PT (compatibilidade); use `wallTypes(lang)` para o idioma ativo. */
export const DEFAULT_WALL_TYPES: WallType[] = wallTypes('pt');

/**
 * Padrões da esquadria (campos opcionais do `OpeningType`). Reproduzem as espessuras que o 3D usava fixas no código,
 * então um tipo sem os campos (arquivo antigo) tem a mesma aparência de antes.
 */
export const OPENING_FRAME_DEFAULTS = { frameWidth: 0.05, frameDepth: 0.09, doorLeaf: 0.04, windowLeaf: 0.03, glass: 0.012 } as const;

/** Espessuras da esquadria de um tipo, com o padrão onde o campo falta ou é inválido. */
export interface OpeningFrame {
  frameWidth: number;
  frameDepth: number;
  leafThickness: number;
  glassThickness: number;
}

const positiveOr = (v: number | undefined, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);

/**
 * Espessuras da esquadria de um tipo. `maxDepth` é o limite da profundidade do batente — o NÚCLEO da parede
 * (`coreSpan`), não a espessura total com acabamentos (DEC-1): o batente não deve ficar sob o reboco. A profundidade é
 * o padrão (ou o valor do tipo) limitado a esse teto.
 */
export function openingFrame(t: OpeningType, maxDepth: number): OpeningFrame {
  return {
    frameWidth: positiveOr(t.frameWidth, OPENING_FRAME_DEFAULTS.frameWidth),
    frameDepth: Math.min(positiveOr(t.frameDepth, OPENING_FRAME_DEFAULTS.frameDepth), maxDepth),
    leafThickness: positiveOr(t.leafThickness, t.kind === 'door' ? OPENING_FRAME_DEFAULTS.doorLeaf : OPENING_FRAME_DEFAULTS.windowLeaf),
    glassThickness: positiveOr(t.glassThickness, OPENING_FRAME_DEFAULTS.glass),
  };
}

function baseOpeningTypes(lang: Lang = 'pt'): OpeningType[] {
  const list: OpeningType[] = [
  ot({ id: 'ot_p70', kind: 'door', name: 'Porta 70 x 210', code: 'P-01', width: 0.7, height: 2.1, sill: 0, leaves: 1, plan: 'swing' }),
  ot({ id: 'ot_p80', kind: 'door', name: 'Porta 80 x 210', code: 'P-02', width: 0.8, height: 2.1, sill: 0, leaves: 1, plan: 'swing' }),
  ot({ id: 'ot_p90', kind: 'door', name: 'Porta 90 x 210', code: 'P-03', width: 0.9, height: 2.1, sill: 0, leaves: 1, plan: 'swing' }),
  ot({ id: 'ot_p160', kind: 'door', name: 'Porta dupla 160 x 210', code: 'P-04', width: 1.6, height: 2.1, sill: 0, leaves: 2, plan: 'double' }),
  ot({ id: 'ot_pc160', kind: 'door', name: 'Porta de correr 160 x 210', code: 'P-05', width: 1.6, height: 2.1, sill: 0, leaves: 2, plan: 'sliding' }),
  ot({ id: 'ot_pp80', kind: 'door', name: 'Porta pivotante 80 x 210', code: 'P-06', width: 0.8, height: 2.1, sill: 0, leaves: 1, plan: 'pivot' }),
  ot({ id: 'ot_vao90', kind: 'door', name: 'Vão livre 90 x 210', code: 'V-01', width: 0.9, height: 2.1, sill: 0, leaves: 0, plan: 'swing' }),
  ot({ id: 'ot_pvv90', kind: 'door', name: 'Porta vai-e-vem 90 x 210', code: 'P-07', width: 0.9, height: 2.1, sill: 0, leaves: 1, plan: 'dblact' }),
  ot({ id: 'ot_pe80', kind: 'door', name: 'Porta de embutir 80 x 210', code: 'P-08', width: 0.8, height: 2.1, sill: 0, leaves: 1, plan: 'pocket' }),
  ot({ id: 'ot_pd120', kind: 'door', name: 'Porta dobrável 2 folhas 120 x 210', code: 'P-09', width: 1.2, height: 2.1, sill: 0, leaves: 2, plan: 'bifold', angle2d: 55, angle3d: 70 }),
  ot({ id: 'ot_ps90', kind: 'door', name: 'Porta sanfonada 90 x 210', code: 'P-10', width: 0.9, height: 2.1, sill: 0, leaves: 1, plan: 'accordion', angle3d: 75 }),
  ot({ id: 'ot_pg300', kind: 'door', name: 'Portão seccionado 300 x 220', code: 'P-11', width: 3.0, height: 2.2, sill: 0, leaves: 1, plan: 'garage' }, 'mat_aco'),
  ot({ id: 'ot_j120', kind: 'window', name: 'Janela 120 x 120', code: 'J-01', width: 1.2, height: 1.2, sill: 1.1, leaves: 2, plan: 'sliding' }, 'mat_aluminio'),
  ot({ id: 'ot_j150', kind: 'window', name: 'Janela 150 x 100', code: 'J-02', width: 1.5, height: 1.0, sill: 1.1, leaves: 2, plan: 'sliding' }, 'mat_aluminio'),
  ot({ id: 'ot_j60', kind: 'window', name: 'Janela 60 x 60', code: 'J-03', width: 0.6, height: 0.6, sill: 1.5, leaves: 1, plan: 'casement' }, 'mat_aluminio'),
  ot({ id: 'ot_j200', kind: 'window', name: 'Janela 200 x 120', code: 'J-04', width: 2.0, height: 1.2, sill: 1.0, leaves: 2, plan: 'sliding' }, 'mat_aluminio'),
  ot({ id: 'ot_jfixa60', kind: 'window', name: 'Janela fixa 60 x 60', code: 'J-05', width: 0.6, height: 0.6, sill: 1.5, leaves: 1, plan: 'fixed' }, 'mat_aluminio'),
  ot({ id: 'ot_j240', kind: 'window', name: 'Janela de correr 240 x 120 (3 folhas)', code: 'J-06', width: 2.4, height: 1.2, sill: 1.1, leaves: 3, plan: 'sliding' }, 'mat_aluminio'),
  ot({ id: 'ot_jv120', kind: 'window', name: 'Vão livre de janela 120 x 120', code: 'V-02', width: 1.2, height: 1.2, sill: 1.0, leaves: 0, plan: 'fixed' }, 'mat_aluminio'),
  ot({ id: 'ot_ja120', kind: 'window', name: 'Janela de abrir 120 x 120 (2 folhas)', code: 'J-07', width: 1.2, height: 1.2, sill: 1.1, leaves: 2, plan: 'hinged' }, 'mat_aluminio'),
  ot({ id: 'ot_jg90', kind: 'window', name: 'Janela guilhotina 90 x 150', code: 'J-08', width: 0.9, height: 1.5, sill: 0.9, leaves: 2, plan: 'hung' }, 'mat_aluminio'),
  ot({ id: 'ot_jp80', kind: 'window', name: 'Janela pivotante 80 x 120', code: 'J-09', width: 0.8, height: 1.2, sill: 1.0, leaves: 1, plan: 'pivotwin' }, 'mat_aluminio'),
  ot({ id: 'ot_jv80', kind: 'window', name: 'Janela veneziana 80 x 60', code: 'J-10', width: 0.8, height: 0.6, sill: 1.5, leaves: 1, plan: 'louver', angle3d: 45 }, 'mat_aluminio'),
  ot({ id: 'ot_jb80', kind: 'window', name: 'Janela basculante 80 x 50', code: 'J-11', width: 0.8, height: 0.5, sill: 1.7, leaves: 1, plan: 'tilt' }, 'mat_aluminio'),
  ];
  return list.map((x) => ({ ...x, name: openingName(x.name, lang) }));
}

/** Tipos de abertura do projeto novo (padrão + catálogos) no idioma pedido. */
export function openingTypeCatalog(lang: Lang = 'pt'): OpeningType[] {
  return [...baseOpeningTypes(lang), ...catalogoPortas(lang), ...catalogoJanelas(lang), ...catalogoComposicoes(lang)];
}

/** Tipos de abertura em PT (compatibilidade); use `openingTypeCatalog(lang)` para o idioma ativo. */
export const DEFAULT_OPENING_TYPES: OpeningType[] = openingTypeCatalog('pt');

const toRecord = <T extends { id: string }>(list: T[]): Record<string, T> =>
  Object.fromEntries(list.map((x) => [x.id, x]));

export function createEmptyProject(nameOrLang?: string | Lang, lang: Lang = 'pt'): Project {
  // Aceita `createEmptyProject('en')` (idioma) e `createEmptyProject('Meu projeto')` (nome); o nome é dado do usuário.
  const byLang = typeof nameOrLang === 'string' && LANGS.includes(nameOrLang as Lang);
  const activeLang: Lang = byLang ? (nameOrLang as Lang) : lang;
  const name = byLang ? undefined : nameOrLang;
  return {
    schemaVersion: SCHEMA_VERSION,
    name: name ?? t(activeLang, 'md_doc_untitled_project'),
    levels: [
      makeLevel({ id: 'lv_0', name: t(activeLang, 'md_doc_level_ground'), elevation: 0 }),
      makeLevel({ id: 'lv_1', name: t(activeLang, 'md_doc_level_n', { n: 2 }), elevation: 3 }),
    ],
    materials: toRecord(materials(activeLang)),
    wallTypes: toRecord(wallTypes(activeLang)),
    floorTypes: toRecord(floorTypes(activeLang)),
    slabTypes: toRecord(slabTypes(activeLang)),
    ceilingTypes: toRecord(ceilingTypes(activeLang)),
    roofTypes: toRecord(roofTypes(activeLang)),
    stairTypes: toRecord(stairTypes(activeLang)),
    rampTypes: toRecord(rampTypes(activeLang)),
    openingTypes: toRecord(openingTypeCatalog(activeLang)),
    elements: {},
    nextOrder: 1,
    settings: { joinTolerance: 0.02, showTags: false, debugJoins: false, detail: 'medium' },
    views: [],
    areaPlans: [],
    roomCategories: roomCategories(activeLang),
    colorSchemes: [],
    defaults: { wallTypeId: 'wt_alv14', doorTypeId: 'ot_p80', windowTypeId: 'ot_j120', wallHeight: 2.8 },
  };
}
