import { DEFAULT_ROOM_CATEGORIES } from './areaPlan.ts';
import { DEFAULT_FLOOR_TYPES } from './floor.ts';
import { DEFAULT_CEILING_TYPES } from './ceiling.ts';
import { DEFAULT_SLAB_TYPES } from './slab.ts';
import { DEFAULT_ROOF_TYPES } from './roof.ts';
import { DEFAULT_STAIR_TYPES } from './stair.ts';
import { DEFAULT_RAMP_TYPES } from './ramp.ts';
import { makeLevel } from './level.ts';
import { ot } from './catalogoAberturasBase.ts';
import { CATALOGO_JANELAS_BR } from './catalogoJanelas.ts';
import { CATALOGO_PORTAS_BR } from './catalogoPortas.ts';
import { CATALOGO_COMPOSICOES_BR } from './catalogoComposicoes.ts';
import { SCHEMA_VERSION, type Layer, type Material, type MaterialTexturePreset, type OpeningType, type Project, type WallType } from './types.ts';

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

/**
 * Render físico (PBR) de um material padrão: rugosidade, preset de textura e escala da textura (metros por repetição).
 * Metalicidade 0, transmissão 0 e IOR 1.5 quando não dito; só o aço/alumínio e o vidro saem disso. Sem emissão: o
 * catálogo não tem lâmpada.
 */
const fisico = (roughness: number, preset: MaterialTexturePreset, scale: number, extra: Partial<Material> = {}): Partial<Material> => ({
  roughness,
  metallic: 0,
  transmission: 0,
  ior: 1.5,
  texture: { preset },
  mapping: { scale },
  ...extra,
});

/**
 * Catálogo padrão. Cor, hachura, custo, unidade, `gloss` e `opacity` ficam como estavam (a planta não muda). Os campos
 * de render vêm de `fisico(...)`; cada linha justifica o valor com um material real. Metálicos: metalicidade 1.
 * Escala (`mapping.scale`, metros por repetição da imagem = uma imagem de 1024 px cobre esse tamanho na superfície).
 * A conta sai da própria imagem: contam-se as repetições dela (fiadas, tábuas, placas, colunas de telha) e multiplica-se
 * pelo tamanho real de cada uma. O render usa uma escala só nos três eixos, então quando a imagem tem razões diferentes
 * entre eixos a escala é o meio-termo (ver cada linha):
 *   - tijolo: 12 fiadas por imagem x 0,065 m = 0,78 m; 5,1 tijolos x 0,21 m = 1,07 m; meio-termo de erro igual = 0,9 m.
 *   - telha: uma telha de 0,40 m ocupa 64 px da imagem (16 telhas por imagem) = 16 x 0,40 = 6,4 m.
 *   - madeira: 9,3 tábuas por imagem x 0,15 m = 1,4 m.
 *   - piso cerâmico: 2,5 placas por imagem x 0,60 m = 1,5 m (a biblioteca cita 1,5 m x 1,5 m para essa imagem).
 *   - reboco: 4 m (faixa do brief, de 2 a 4 m; a imagem não tem repetição discreta para contar. Com 2 m o grão some
 *     em 1280x720; 4 m é o topo da faixa e foi escolhido pela prova visual, desvio padrão da fachada de 3,2 para 5,6).
 *   - concreto: 2 m (mantido; sem referência no brief).
 *   - metal: 1 m (mantido; sem referência no brief).
 */
export const DEFAULT_MATERIALS: Material[] = [
  // Pintura acrílica acetinada: meio-fosca, sem textura própria.
  mat('mat_tinta', 'Tinta branca', '#f4f1ea', 'none', fisico(0.5, 'nenhum', 1)),
  // Reboco de cal/cimento: muito fosco, estuque.
  mat('mat_reboco', 'Reboco', '#d9d2c5', 'dots', { cost: 38, ...fisico(0.9, 'reboco', 4) }),
  // Bloco cerâmico queimado: argila fosca, com a textura de tijolo.
  mat('mat_bloco14', 'Bloco cerâmico 14', '#c0693f', 'diagonal', { unit: 'm2', cost: 62, ...fisico(0.8, 'tijolo', 0.9) }),
  mat('mat_bloco9', 'Bloco cerâmico 9', '#c9784c', 'diagonal', { cost: 52, ...fisico(0.8, 'tijolo', 0.9) }),
  mat('mat_bloco19', 'Bloco cerâmico 19', '#b45f38', 'diagonal', { cost: 74, ...fisico(0.8, 'tijolo', 0.9) }),
  // Concreto aparente: fosco e rugoso.
  mat('mat_concreto', 'Concreto', '#8f9296', 'cross', { unit: 'm3', cost: 640, ...fisico(0.85, 'concreto', 2) }),
  // Argamassa de assentamento/regularização: fosca, com a textura de reboco (como no lote T3).
  mat('mat_argamassa', 'Argamassa', '#cdbfa9', 'dots', { cost: 30, ...fisico(0.85, 'reboco', 4) }),
  // Revestimento cerâmico esmaltado: semibrilho, textura de piso.
  mat('mat_ceramica', 'Revestimento cerâmico', '#e9e4da', 'none', { gloss: 0.6, cost: 85, ...fisico(0.35, 'piso', 1.5) }),
  // Cartão de gesso: papel fosco.
  mat('mat_gesso', 'Placa de gesso', '#ece9e2', 'none', { cost: 44, ...fisico(0.8, 'nenhum', 1) }),
  // PVC de forro: plástico semibrilho.
  mat('mat_pvc', 'PVC', '#e8e6df', 'none', { gloss: 0.4, cost: 60, ...fisico(0.45, 'nenhum', 1) }),
  // Lã mineral: fibrosa, sem brilho.
  mat('mat_la', 'Lã mineral', '#e5d27a', 'dots', { cost: 28, ...fisico(0.95, 'nenhum', 1) }),
  // Perfil de aço galvanizado (montante de drywall e terça): metálico com pouca oxidação.
  mat('mat_perfil', 'Perfil de aço', '#9aa0a6', 'cross', { cost: 20, ...fisico(0.4, 'metal', 1, { metallic: 1 }) }),
  // Aço estrutural pintado ou escovado: metálico, mais liso que o galvanizado.
  mat('mat_aco', 'Aço', '#7b8189', 'solid', { gloss: 0.6, unit: 'm3', ...fisico(0.3, 'metal', 1, { metallic: 1 }) }),
  // Madeira serrada (tábua): acabamento natural, sem verniz brilhante.
  mat('mat_madeira', 'Madeira', '#a9794a', 'diagonal', { cost: 150, ...fisico(0.6, 'madeira', 1.4) }),
  // Vidro float incolor: lisíssimo, transmissão 0,85 e IOR 1,52.
  mat('mat_vidro', 'Vidro', '#a9d6e5', 'none', { gloss: 0.9, opacity: 0.35, cost: 220, ...fisico(0.05, 'nenhum', 1, { transmission: 0.85, ior: 1.52 }) }),
  // Alumínio anodizado de caixilho: metálico e relativamente liso.
  mat('mat_aluminio', 'Alumínio', '#b8bdc2', 'solid', { gloss: 0.7, unit: 'm', ...fisico(0.35, 'metal', 1, { metallic: 1 }) }),
  // Telha de argila queimada: fosca, com a textura de telha.
  mat('mat_telha_ceramica', 'Telha cerâmica', '#b5522d', 'diagonal', { cost: 85, ...fisico(0.7, 'telha', 6.4) }),
  // Telha ondulada de fibrocimento: cimento com acabamento fosco, textura de concreto.
  mat('mat_fibrocimento', 'Fibrocimento', '#9ea3a8', 'cross', { cost: 55, ...fisico(0.8, 'concreto', 2) }),
  // Chapa de aço galvanizado pré-pintada da telha metálica: metálica, semibrilho.
  mat('mat_telha_metalica', 'Telha metálica', '#8e99a3', 'solid', { gloss: 0.6, cost: 140, ...fisico(0.4, 'metal', 1, { metallic: 1 }) }),
];

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

export const DEFAULT_WALL_TYPES: WallType[] = [
  wt('wt_alv14', 'Alvenaria 14 + reboco', 'PA-14', 'Bloco cerâmico 14 cm com reboco e pintura nas duas faces', [
    L('finish2', 'mat_tinta', 0.002, true),
    L('substrate', 'mat_reboco', 0.02, true),
    L('structure', 'mat_bloco14', 0.14),
    L('substrate', 'mat_reboco', 0.02, true),
    L('finish2', 'mat_tinta', 0.002, true),
  ]),
  wt('wt_alv9', 'Alvenaria 9 (divisória)', 'PA-09', 'Bloco cerâmico 9 cm com reboco e pintura', [
    L('finish2', 'mat_tinta', 0.002, true),
    L('substrate', 'mat_reboco', 0.015, true),
    L('structure', 'mat_bloco9', 0.09),
    L('substrate', 'mat_reboco', 0.015, true),
    L('finish2', 'mat_tinta', 0.002, true),
  ]),
  wt('wt_ext19', 'Externa 19 + cerâmica', 'PE-19', 'Bloco 19 cm, revestimento cerâmico externo e pintura interna', [
    L('finish1', 'mat_ceramica', 0.01, true),
    L('substrate', 'mat_argamassa', 0.02, true),
    L('structure', 'mat_bloco19', 0.19),
    L('substrate', 'mat_reboco', 0.02, true),
    L('finish2', 'mat_tinta', 0.002, true),
  ]),
  wt('wt_dry', 'Drywall 7', 'DW-07', 'Placas de gesso acartonado sobre perfil de aço com lã mineral', [
    L('finish1', 'mat_gesso', 0.0125, true),
    L('structure', 'mat_perfil', 0.048),
    L('finish1', 'mat_gesso', 0.0125, true),
  ]),
  wt('wt_conc15', 'Concreto 15', 'PC-15', 'Parede de concreto armado 15 cm com reboco', [
    L('finish2', 'mat_tinta', 0.002, true),
    L('substrate', 'mat_reboco', 0.015, true),
    L('structure', 'mat_concreto', 0.15),
    L('substrate', 'mat_reboco', 0.015, true),
    L('finish2', 'mat_tinta', 0.002, true),
  ]),
];

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

export const DEFAULT_OPENING_TYPES: OpeningType[] = [
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
  ...CATALOGO_PORTAS_BR,
  ...CATALOGO_JANELAS_BR,
  ...CATALOGO_COMPOSICOES_BR,
];

const toRecord = <T extends { id: string }>(list: T[]): Record<string, T> =>
  Object.fromEntries(list.map((x) => [x.id, x]));

export function createEmptyProject(name = 'Projeto sem título'): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    name,
    levels: [
      makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }),
      makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }),
    ],
    materials: toRecord(DEFAULT_MATERIALS),
    wallTypes: toRecord(DEFAULT_WALL_TYPES),
    floorTypes: toRecord(DEFAULT_FLOOR_TYPES),
    slabTypes: toRecord(DEFAULT_SLAB_TYPES),
    ceilingTypes: toRecord(DEFAULT_CEILING_TYPES),
    roofTypes: toRecord(DEFAULT_ROOF_TYPES),
    stairTypes: toRecord(DEFAULT_STAIR_TYPES),
    rampTypes: toRecord(DEFAULT_RAMP_TYPES),
    openingTypes: toRecord(DEFAULT_OPENING_TYPES),
    elements: {},
    nextOrder: 1,
    settings: { joinTolerance: 0.02, showTags: false, debugJoins: false, detail: 'medium', materialPbrPadrao: true },
    views: [],
    areaPlans: [],
    roomCategories: DEFAULT_ROOM_CATEGORIES,
    colorSchemes: [],
    defaults: { wallTypeId: 'wt_alv14', doorTypeId: 'ot_p80', windowTypeId: 'ot_j120', wallHeight: 2.8 },
  };
}
