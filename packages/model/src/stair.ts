import { t, type Lang } from './i18n.ts';
import { DEFAULT_STAIR_CALC_RULE, DEFAULT_STAIR_FINISH, type StairCalcRule } from './stairTypes.ts';
import type { Id, Stair, StairRunStyle, StairType } from './types.ts';

/** Estilos de lance aceitos (decisão 0014 §8). */
export const STAIR_RUN_STYLES: readonly StairRunStyle[] = ['monolithic', 'assembled', 'post'];

/** Sobreposição padrão entre degraus do estilo poste (m), decisão 0014 §8. */
export const DEFAULT_STAIR_TREAD_OVERLAP = 0.025;

/** Material padrão do poste central (e dos degraus do caracol de aço). */
export const DEFAULT_STAIR_POST_MATERIAL_ID: Id = 'mat_aco';

/** Folga lateral padrão em volta do furo da laje (m), decisão 0011 §6. */
export const DEFAULT_STAIR_OPENING_MARGIN = 0.05;

type StairInput = { id: Id; typeId: Id; levelId: Id } & Partial<Omit<Stair, 'order' | 'kind'>>;

/** Constrói uma escada com os campos padrão (decisão 0011 §2); `order` é atribuído pelo comando addStair. */
export function makeStair(s: StairInput): Omit<Stair, 'order'> {
  return {
    kind: 'stair',
    topLevelId: null,
    baseOffset: 0,
    topOffset: 0,
    height: 2.8,
    components: [],
    openingMode: 'headroom',
    openingHeadroom: null,
    openingMargin: DEFAULT_STAIR_OPENING_MARGIN,
    openingRect: false,
    mark: '',
    comments: '',
    ...s,
  };
}

/** Valores comuns aos tipos iniciais (decisão 0011 §1, item 8; decisão 0014 §8 para sobreposição e poste). */
const COMMON = {
  maxRiser: 0.18,
  minRiser: 0.16,
  minTread: 0.28,
  ...DEFAULT_STAIR_CALC_RULE,
  minRunWidth: 0.8,
  nosing: 0.015,
  landingThickness: 0.15,
  minHeadroom: 2.1,
  cost: 0,
  treadOverlap: DEFAULT_STAIR_TREAD_OVERLAP,
  postMaterialId: DEFAULT_STAIR_POST_MATERIAL_ID,
  ...DEFAULT_STAIR_FINISH,
} as const;

/**
 * Tipos de escada iniciais. Estilo monolítico usa a profundidade estrutural; o montado usa piso e espelho; o poste usa
 * degraus em balanço (sem espelho) presos ao poste central. As escadas caracol usam a regra do caracol em `stairChecks`.
 */
/** Tipos de escada iniciais no idioma pedido. */
export function stairTypes(lang: Lang = 'pt'): StairType[] {
  return [
    {
      ...COMMON,
      id: 'stt_monolitica',
      name: t(lang, 'md_stair_monolitica'),
      code: 'ES-01',
      description: t(lang, 'md_stair_monolitica_desc'),
      runStyle: 'monolithic',
      undersideStyle: 'smooth',
      structuralDepth: 0.2,
      treadThickness: 0,
      riserThickness: 0,
      materialId: 'mat_concreto',
    },
    {
      ...COMMON,
      id: 'stt_piso_espelho',
      name: t(lang, 'md_stair_piso_espelho'),
      code: 'ES-02',
      description: t(lang, 'md_stair_piso_espelho_desc'),
      runStyle: 'assembled',
      undersideStyle: 'smooth',
      structuralDepth: 0,
      treadThickness: 0.03,
      riserThickness: 0.02,
      materialId: 'mat_madeira',
    },
    {
      ...COMMON,
      id: 'stt_caracol_monolitica',
      name: t(lang, 'md_stair_caracol_monolitica'),
      code: 'ES-03',
      description: t(lang, 'md_stair_caracol_monolitica_desc'),
      runStyle: 'monolithic',
      undersideStyle: 'smooth',
      structuralDepth: 0.15,
      minRunWidth: 0.8,
      treadThickness: 0,
      riserThickness: 0,
      materialId: 'mat_concreto',
    },
    {
      ...COMMON,
      id: 'stt_caracol_poste',
      name: t(lang, 'md_stair_caracol_poste'),
      code: 'ES-04',
      description: t(lang, 'md_stair_caracol_poste_desc'),
      runStyle: 'post',
      undersideStyle: 'smooth',
      structuralDepth: 0,
      minRunWidth: 0.6,
      treadThickness: 0.05,
      riserThickness: 0,
      materialId: 'mat_aco',
    },
  ];
}

/** Tipos de escada em PT (compatibilidade); use `stairTypes(lang)` para o idioma ativo. */
export const DEFAULT_STAIR_TYPES: StairType[] = stairTypes('pt');

/** Entrada da validação do tipo: os campos de regra são opcionais para aceitar chamadas antigas. */
export type StairTypeIssueInput = Pick<StairType, 'runStyle' | 'treadThickness' | 'treadOverlap'> &
  Partial<Pick<StairType, 'minTread' | 'minRiser' | 'maxRiser' | keyof StairCalcRule>>;

/**
 * Regras do tipo que o modelo confere ao salvar (`upsertStairType`): estilo conhecido; sobreposição não negativa; no
 * estilo poste, espessura do degrau positiva e sobreposição menor que ela; e a regra de cálculo (fatores > 0,
 * calcMin ≤ calcTarget ≤ calcMax e maxTread ≥ minTread). Devolve a 1ª mensagem, ou null.
 */
export function stairTypeIssue(tipo: StairTypeIssueInput, lang: Lang = 'pt'): string | null {
  if (!STAIR_RUN_STYLES.includes(tipo.runStyle)) return t(lang, 'md_stair_style_unknown');
  if (!(tipo.treadOverlap >= 0)) return t(lang, 'md_stair_overlap_negative');
  if (tipo.runStyle === 'post') {
    if (!(tipo.treadThickness > 0)) return t(lang, 'md_stair_post_thickness');
    if (!(tipo.treadOverlap < tipo.treadThickness)) return t(lang, 'md_stair_overlap_thickness');
  }
  if (tipo.calcRiserFactor !== undefined && !(tipo.calcRiserFactor > 0)) return t(lang, 'md_stair_riser_factor');
  if (tipo.calcTreadFactor !== undefined && !(tipo.calcTreadFactor > 0)) return t(lang, 'md_stair_tread_factor');
  if (tipo.calcMin !== undefined && tipo.calcTarget !== undefined && tipo.calcMax !== undefined) {
    if (!(tipo.calcMin <= tipo.calcTarget && tipo.calcTarget <= tipo.calcMax)) {
      return t(lang, 'md_stair_target_range');
    }
  }
  if (tipo.minRiser !== undefined && !(tipo.minRiser > 0)) return t(lang, 'md_stair_min_riser_positive');
  if (tipo.minRiser !== undefined && tipo.maxRiser !== undefined && !(tipo.minRiser < tipo.maxRiser)) {
    return t(lang, 'md_stair_min_riser_max');
  }
  if (tipo.maxTread !== undefined && tipo.minTread !== undefined && !(tipo.maxTread >= tipo.minTread)) {
    return t(lang, 'md_stair_max_tread');
  }
  return null;
}

/** Tipo usado por padrão quando o projeto não escolhe outro. */
export const defaultStairTypeId: Id = 'stt_monolitica';
