import type { Vec2 } from '@hestia/geom';
import { t, type Lang } from './i18n.ts';
import type { Id } from './types.ts';

/** Segmento do croqui: reta (sag = 0) ou arco por flecha, mesma convenção das paredes (arcFromSagitta). */
export interface StairCurve {
  a: Vec2;
  b: Vec2;
  /** Flecha do arco (m), positiva à esquerda de a→b. 0 = reta. */
  sag: number;
}

/** Origem do lance gerado (preenchida pelo gerador; sem vínculo paramétrico depois da edição manual). */
export type StairGenerator = 'straight' | 'lshape' | 'ushape' | 'winder' | 'spiral' | 'free';

/**
 * Parâmetros do croqui caracol (decisão 0014 §2). Metadado opcional do lance: as alças (centro, raios, ângulo inicial e
 * varredura) regeneram o croqui. Editar o croqui à mão descarta `spiral`. `sweep` em radianos, com sinal (+ anti-horário).
 */
export interface StairSpiralParams {
  center: Vec2;
  rInner: number;
  rOuter: number;
  /** Ângulo do primeiro espelho (rad, a partir do eixo x). */
  startAngle: number;
  /** Varredura (rad, com sinal): do primeiro ao último espelho; + anti-horário. */
  sweep: number;
}

/**
 * Lance (Revit: Stair Run por croqui). É o croqui único do lance: limites esquerdo e direito, linhas de espelho e
 * linha de caminhada opcional. Os geradores só produzem este croqui; a geometria dos degraus sai dele no motor.
 */
export interface StairRun {
  id: Id;
  kind: 'run';
  /** Cadeia contínua, lado esquerdo no sentido de subida. */
  boundaryLeft: StairCurve[];
  /** Cadeia contínua, lado direito no sentido de subida. */
  boundaryRight: StairCurve[];
  /** Linhas de espelho. A ordem no vetor não importa (o motor ordena pela caminhada ou pela direção). */
  risers: StairCurve[];
  /** Caminhada (cadeia) do primeiro ao último espelho; vazia = automática. */
  path: StairCurve[];
  generatedBy?: StairGenerator;
  /** Parâmetros do caracol (só quando `generatedBy` é 'spiral'); ausente nos demais lances. */
  spiral?: StairSpiralParams;
}

/** Patamar (Revit: Landing por croqui): laço fechado de retas e arcos, plano, sem vínculo paramétrico com o lance. */
export interface StairLanding {
  id: Id;
  kind: 'landing';
  boundary: StairCurve[];
}

/**
 * Escada (Revit: Stair por componente). `components` guarda a sequência em ordem (lance, patamar, lance...); a cota de
 * cada patamar sai da base e do número de espelhos dos lances anteriores. Base = nível + baseOffset; topo = nível de
 * topo + topOffset (o nível de topo padrão é o imediatamente acima); sem nível acima, o topo é base + height.
 */
/** Modo da abertura da laje (decisão 0011 §6). */
export type StairOpeningMode = 'headroom' | 'full' | 'none';

export interface Stair {
  id: Id;
  kind: 'stair';
  levelId: Id;
  typeId: Id;
  /** Nível de topo explícito; null = o nível imediatamente acima (levelAbove). */
  topLevelId: Id | null;
  baseOffset: number;
  topOffset: number;
  /** Altura usada só quando não há nível acima e o topo não é explícito. */
  height: number;
  /**
   * Como o nº de espelhos reage à altura entre níveis (decisão 0041). `auto` (ausente) = reajusta o croqui quando o
   * espelho real passa do máximo do tipo; `fixed` = mantém o croqui e aceita o aviso de espelho acima do máximo.
   */
  riserMode?: 'auto' | 'fixed';
  components: Array<StairRun | StairLanding>;
  /** Trajeto da escada livre: vértices em metros, do início ao fim; o 1º ponto é o início da escada. Ausente nas demais formas e em projetos antigos. */
  freePath?: Vec2[];
  /** Escada livre: índices dos vértices do `freePath` marcados como patamar manual (mesmo se colineares). */
  manualLandings?: number[];
  /**
   * Abertura da laje do nível de topo (decisão 0011 §6): 'headroom' = o furo tira os degraus que não deixam o pé-direito
   * livre (`openingHeadroom`); 'full' = o furo é a projeção inteira da escada (degraus e patamares); 'none' = sem furo.
   */
  openingMode: StairOpeningMode;
  /** Pé-direito livre do furo (m) no modo 'headroom'; null = o mínimo do tipo (`minHeadroom`). */
  openingHeadroom: number | null;
  /** Folga lateral (m) em volta do furo: a região cresce por essa distância em todo o contorno. */
  openingMargin: number;
  /** Furo retangular: o retângulo de menor área que envolve a região (depois da folga). */
  openingRect: boolean;
  mark: string;
  comments: string;
  /** Ordem de criação. */
  order: number;
}

/**
 * Estilo do lance: monolítico (laje de concreto), montado (piso e espelho) ou poste (caracol com poste central: degraus
 * em balanço presos ao poste, sem espelho).
 */
export type StairRunStyle = 'monolithic' | 'assembled' | 'post';

/** Face inferior do lance monolítico (Revit: Underside Surface): lisa (rampa contínua) ou escalonada (dente de serra). */
export type StairUndersideStyle = 'smooth' | 'stepped';

/**
 * Regra de cálculo do piso (estilo Revit "Stair Calculator"): a relação a·R + b·T fica dentro de [calcMin, calcMax] e
 * o piso calculado é (calcTarget − a·R) ÷ b, limitado a [minTread, maxTread]. Só gera avisos, nunca bloqueia.
 */
export interface StairCalcRule {
  /** Fator do espelho (a). */
  calcRiserFactor: number;
  /** Fator do piso (b). */
  calcTreadFactor: number;
  /** Alvo de a·R + b·T (m). */
  calcTarget: number;
  /** Faixa aceitável de a·R + b·T (m). */
  calcMin: number;
  calcMax: number;
  /** Piso máximo (m). */
  maxTread: number;
}

/** Regra padrão: 2·R + T entre 0,63 e 0,65 m, alvo 0,63 m e piso máximo 0,32 m. */
export const DEFAULT_STAIR_CALC_RULE: StairCalcRule = {
  calcRiserFactor: 2,
  calcTreadFactor: 1,
  calcTarget: 0.63,
  calcMin: 0.63,
  calcMax: 0.65,
  maxTread: 0.32,
};

/** Predefinição de regra de cálculo oferecida ao tipo de escada. */
export interface StairCalcPreset {
  id: 'nbr9050' | 'nbr9077' | 'ibc';
  label: string;
  rule: StairCalcRule;
}

/**
 * Predefinições de norma: NBR 9050 (2R + T entre 0,63 e 0,65 m), NBR 9077 (entre 0,63 e 0,64 m) e IBC.
 * O IBC é uma aproximação do "Stair Calculator" do Revit: 2R + T entre 0,60 e 0,65 m, alvo 0,63 m.
 */
export function stairCalcPresets(lang: Lang = 'pt'): readonly StairCalcPreset[] {
  return [
    {
      id: 'nbr9050',
      label: t(lang, 'md_stt_preset_nbr9050'),
      rule: { ...DEFAULT_STAIR_CALC_RULE },
    },
    {
      id: 'nbr9077',
      label: t(lang, 'md_stt_preset_nbr9077'),
      rule: { ...DEFAULT_STAIR_CALC_RULE, calcMax: 0.64 },
    },
    {
      id: 'ibc',
      label: t(lang, 'md_stt_preset_ibc'),
      rule: { ...DEFAULT_STAIR_CALC_RULE, calcMin: 0.6 },
    },
  ];
}

/** Predefinições em PT (compatibilidade); use `stairCalcPresets(lang)` para o idioma ativo. */
export const STAIR_CALC_PRESETS: readonly StairCalcPreset[] = stairCalcPresets('pt');

/** Regra de cálculo do tipo de escada (com os seis campos já preenchidos). */
export function stairCalcRuleOf(t: Pick<StairType, keyof StairCalcRule>): StairCalcRule {
  return {
    calcRiserFactor: t.calcRiserFactor,
    calcTreadFactor: t.calcTreadFactor,
    calcTarget: t.calcTarget,
    calcMin: t.calcMin,
    calcMax: t.calcMax,
    maxTread: t.maxTread,
  };
}

/**
 * Tipo de escada (Revit: Stair Type). Regras de espelho/piso valem para o lance calculado; no croqui livre elas não
 * bloqueiam. Campos de estilo que não se aplicam ao estilo escolhido ficam em 0 (ex.: `treadThickness` no monolítico).
 */
export interface StairType {
  id: Id;
  name: string;
  code: string;
  description: string;
  /** Espelho máximo (m). */
  maxRiser: number;
  /** Espelho mínimo (m). NBR 9050: espelho entre 0,16 e 0,18 m. Sempre menor que `maxRiser`. */
  minRiser: number;
  /** Piso mínimo (m). */
  minTread: number;
  /** Fator do espelho (a) na regra a·R + b·T. */
  calcRiserFactor: number;
  /** Fator do piso (b) na regra a·R + b·T. */
  calcTreadFactor: number;
  /** Alvo de a·R + b·T (m): define o piso calculado. */
  calcTarget: number;
  /** Faixa aceitável de a·R + b·T (m); fora dela, aviso de norma. */
  calcMin: number;
  calcMax: number;
  /** Piso máximo (m). */
  maxTread: number;
  /** Largura mínima do lance (m). */
  minRunWidth: number;
  runStyle: StairRunStyle;
  /**
   * Face inferior do lance monolítico (só vale para `runStyle: 'monolithic'`): lisa ou escalonada. Não se aplica ao
   * estilo montado, mas o campo existe sempre (o montado guarda 'smooth', sem uso).
   */
  undersideStyle: StairUndersideStyle;
  /** Espessura estrutural do lance monolítico, PERPENDICULAR à rampa (m), medida a partir dos cantos internos dos degraus. */
  structuralDepth: number;
  /** Espessura do piso do lance montado (m). */
  treadThickness: number;
  /** Espessura do espelho do lance montado (m). Zero no estilo poste (sem espelho). */
  riserThickness: number;
  /**
   * Sobreposição (m) entre degraus consecutivos do estilo poste: o degrau avança sobre o seguinte em planta. Não pode ser
   * negativa em nenhum estilo; no poste, precisa ser menor que `treadThickness` (regra de `stairTypeIssue`).
   */
  treadOverlap: number;
  /** Material do poste central (estilo poste). */
  postMaterialId: Id;
  /** Nariz (m): só 3D e quantitativo. */
  nosing: number;
  /** Espessura do patamar (m). */
  landingThickness: number;
  /** Pé-direito livre mínimo sob o lance (m). */
  minHeadroom: number;
  materialId: Id;
  /** Custo informativo (em reais). 0 quando não informado. */
  cost: number;
  /**
   * Acabamento do PISO do degrau (revestimento sobre a estrutura): ligado/desligado, material e espessura (m). Campo
   * ausente (tipos de projetos antigos) = desligado. Só vale nos estilos monolítico e poste (no montado, piso e espelho
   * do tipo já são o acabamento). Ver `stairFinishOf`.
   */
  treadFinishEnabled?: boolean;
  treadFinishMaterialId?: Id;
  treadFinishThickness?: number;
  /** Acabamento do ESPELHO (mesma regra do piso; não existe no estilo poste, que não tem espelho). */
  riserFinishEnabled?: boolean;
  riserFinishMaterialId?: Id;
  riserFinishThickness?: number;
  /**
   * Bocel: ressalto do piso acabado sobre a face acabada do espelho. Ausente = ligado, com `bocelProjection` (padrão
   * 0,015 m). Só tem efeito com o acabamento do piso ligado; faz parte do mesmo sólido do piso e não muda a planta.
   */
  bocelEnabled?: boolean;
  /** Projeção do bocel (m). */
  bocelProjection?: number;
}

/** Valores padrão dos acabamentos de um tipo novo (desligados; bocel ligado com 1,5 cm, o limite do aviso). */
export const DEFAULT_STAIR_FINISH = {
  treadFinishEnabled: false,
  treadFinishMaterialId: 'mat_ceramica',
  treadFinishThickness: 0.015,
  riserFinishEnabled: false,
  riserFinishMaterialId: 'mat_ceramica',
  riserFinishThickness: 0.01,
  bocelEnabled: true,
  bocelProjection: 0.015,
} as const;

/** Acabamentos do tipo, já com os padrões aplicados. `treadOn`/`riserOn` só valem com espessura positiva. */
export interface StairFinish {
  treadOn: boolean;
  treadThickness: number;
  treadMaterialId: Id;
  riserOn: boolean;
  riserThickness: number;
  riserMaterialId: Id;
  /** Bocel efetivo (m): 0 se desligado ou se o piso acabado está desligado. */
  bocel: number;
}

/**
 * Acabamentos efetivos de um tipo de escada. Campos ausentes = desligado (migração sem mudar a versão do esquema).
 * Estilo montado: sempre desligado (piso e espelho do tipo já são o acabamento). Poste: sem espelho, só piso.
 */
export function stairFinishOf(type: StairType): StairFinish {
  const d = DEFAULT_STAIR_FINISH;
  const applies = type.runStyle === 'monolithic' || type.runStyle === 'post';
  const tt = Math.max(0, type.treadFinishThickness ?? d.treadFinishThickness);
  const rt = Math.max(0, type.riserFinishThickness ?? d.riserFinishThickness);
  const treadOn = applies && type.treadFinishEnabled === true && tt > 0;
  const riserOn = applies && type.runStyle !== 'post' && type.riserFinishEnabled === true && rt > 0;
  const bocelOn = type.bocelEnabled ?? d.bocelEnabled;
  return {
    treadOn,
    treadThickness: treadOn ? tt : 0,
    treadMaterialId: type.treadFinishMaterialId ?? d.treadFinishMaterialId,
    riserOn,
    riserThickness: riserOn ? rt : 0,
    riserMaterialId: type.riserFinishMaterialId ?? d.riserFinishMaterialId,
    bocel: treadOn && bocelOn ? Math.max(0, type.bocelProjection ?? d.bocelProjection) : 0,
  };
}
