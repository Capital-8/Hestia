import { DEFAULT_STAIR_CALC_RULE, type StairCalcRule } from './stairTypes.ts';
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
} as const;

/**
 * Tipos de escada iniciais. Estilo monolítico usa a profundidade estrutural; o montado usa piso e espelho; o poste usa
 * degraus em balanço (sem espelho) presos ao poste central. As escadas caracol usam a regra do caracol em `stairChecks`.
 */
export const DEFAULT_STAIR_TYPES: StairType[] = [
  {
    ...COMMON,
    id: 'stt_monolitica',
    name: 'Escada monolítica concreto',
    code: 'ES-01',
    description: 'Lance monolítico de concreto armado com patamares de concreto',
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
    name: 'Escada de piso e espelho',
    code: 'ES-02',
    description: 'Lance de degraus de madeira (piso e espelho) sobre estrutura',
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
    name: 'Escada caracol monolítica',
    code: 'ES-03',
    description: 'Caracol monolítico de concreto armado, com face inferior lisa',
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
    name: 'Escada caracol com poste central',
    code: 'ES-04',
    description: 'Caracol de degraus de aço em balanço presos a poste central de aço, sem espelho',
    runStyle: 'post',
    undersideStyle: 'smooth',
    structuralDepth: 0,
    minRunWidth: 0.6,
    treadThickness: 0.05,
    riserThickness: 0,
    materialId: 'mat_aco',
  },
];

/** Entrada da validação do tipo: os campos de regra são opcionais para aceitar chamadas antigas. */
export type StairTypeIssueInput = Pick<StairType, 'runStyle' | 'treadThickness' | 'treadOverlap'> &
  Partial<Pick<StairType, 'minTread' | 'minRiser' | 'maxRiser' | keyof StairCalcRule>>;

/**
 * Regras do tipo que o modelo confere ao salvar (`upsertStairType`): estilo conhecido; sobreposição não negativa; no
 * estilo poste, espessura do degrau positiva e sobreposição menor que ela; e a regra de cálculo (fatores > 0,
 * calcMin ≤ calcTarget ≤ calcMax e maxTread ≥ minTread). Devolve a 1ª mensagem, ou null.
 */
export function stairTypeIssue(t: StairTypeIssueInput): string | null {
  if (!STAIR_RUN_STYLES.includes(t.runStyle)) return 'Estilo de escada desconhecido.';
  if (!(t.treadOverlap >= 0)) return 'A sobreposição dos degraus não pode ser negativa.';
  if (t.runStyle === 'post') {
    if (!(t.treadThickness > 0)) return 'Escada com poste central: a espessura do degrau precisa ser maior que zero.';
    if (!(t.treadOverlap < t.treadThickness)) return 'A sobreposição dos degraus precisa ser menor que a espessura do degrau.';
  }
  if (t.calcRiserFactor !== undefined && !(t.calcRiserFactor > 0)) return 'O fator do espelho na regra de cálculo precisa ser maior que zero.';
  if (t.calcTreadFactor !== undefined && !(t.calcTreadFactor > 0)) return 'O fator do piso na regra de cálculo precisa ser maior que zero.';
  if (t.calcMin !== undefined && t.calcTarget !== undefined && t.calcMax !== undefined) {
    if (!(t.calcMin <= t.calcTarget && t.calcTarget <= t.calcMax)) {
      return 'O alvo da regra de cálculo precisa ficar entre o mínimo e o máximo da faixa.';
    }
  }
  if (t.minRiser !== undefined && !(t.minRiser > 0)) return 'O espelho mínimo precisa ser maior que zero.';
  if (t.minRiser !== undefined && t.maxRiser !== undefined && !(t.minRiser < t.maxRiser)) {
    return 'O espelho mínimo precisa ser menor que o espelho máximo.';
  }
  if (t.maxTread !== undefined && t.minTread !== undefined && !(t.maxTread >= t.minTread)) {
    return 'O piso máximo precisa ser maior ou igual ao piso mínimo.';
  }
  return null;
}

/** Tipo usado por padrão quando o projeto não escolhe outro. */
export const defaultStairTypeId: Id = 'stt_monolitica';
