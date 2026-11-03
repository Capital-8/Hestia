import type { Vec2 } from '@hestia/geom';
import {
  generateLShape,
  generateStraightRun,
  generateUShape,
  generateWinderL,
  planStairFree,
  riserCountFor,
  treadFor,
  type StairComponentSketch,
  type StairFixed,
  type StairRunSketch,
  type TreadRule,
} from '@hestia/engine';
import { DEFAULT_STAIR_CALC_RULE, type Id, type StairGenerator, type StairType } from '@hestia/model';
import type { StairPart } from './stairSketchState.ts';
import { fmtNumLang, t as translate, type DictKey, type Lang } from './i18n.ts';

/**
 * Formas da ferramenta Escada por cliques (decisão 0011 §5; caracol, decisão 0014 §1 item 12). Os valores de reta, L, U e
 * leque são os nomes dos geradores do modelo; `spiral` é o caracol (gerador `generateSpiralRun`, `stairSpiralRun.ts`);
 * `free` é a escada livre, planejada pelo trajeto de cliques (`planStairRunFree`).
 */
export const STAIR_RUN_SHAPES = ['straight', 'lshape', 'ushape', 'winder', 'spiral', 'free'] as const;
export type StairRunShape = (typeof STAIR_RUN_SHAPES)[number] | 'free';

/** Rótulos das formas que a ferramenta oferece. */
export const STAIR_RUN_SHAPE_LABEL: Record<StairRunShape, string> = {
  straight: 'Reta',
  lshape: 'Em L',
  ushape: 'Em U',
  winder: 'Com leque',
  spiral: 'Caracol',
  free: 'Livre',
};

const SHAPE_LABEL_KEYS: Record<StairRunShape, DictKey> = {
  straight: 'tl_stt_shape_straight',
  lshape: 'tl_stt_shape_l',
  ushape: 'tl_stt_shape_u',
  winder: 'tl_stt_shape_winder',
  spiral: 'tl_stt_shape_spiral',
  free: 'tl_stt_shape_free',
};

/** Rótulo da forma no idioma pedido. */
export function stairRunShapeLabel(shape: StairRunShape, lang: Lang = 'pt'): string {
  return translate(lang, SHAPE_LABEL_KEYS[shape]);
}
/** Rótulo da escada livre (mantido para quem importava a constante antiga). */
export const STAIR_RUN_SHAPE_FREE_LABEL = STAIR_RUN_SHAPE_LABEL.free;

/** Opções da ferramenta Escada reta/L/U/leque/caracol (`ToolOptions.stairRun`). */
export interface StairRunToolOptions {
  /** Tipo de escada; ausente ou inexistente = o padrão do projeto. */
  typeId?: Id;
  shape: StairRunShape;
  /** Reta: comprimento do lance, do 1º ao último espelho (m), dado pelo 2º clique. Ausente = nº de espelhos pela altura. */
  length?: number;
  /** Largura de cada lance (m). */
  width: number;
  /** Lado do giro, visto de quem sobe o 1º lance (L, U e leque). */
  turn: 'left' | 'right';
  /** Profundidade do patamar (L e U), a partir do último espelho do 1º lance. Padrão = largura. */
  landingDepth?: number;
  /** Caracol: raio interno (m). Ausente = 0,10 m. */
  spiralInner?: number;
  /** Caracol: raio externo digitado (m). Ausente = o 2º clique define o raio (campo vazio; sugestão 1,00 m). */
  spiralOuter?: number;
  /** Caracol: varredura digitada (graus, em módulo; o sentido vem de `spiralSense`). Ausente = o 3º clique define. */
  spiralSweep?: number;
  /** Caracol: sentido da varredura digitada. Ausente = anti-horário. */
  spiralSense?: 'ccw' | 'cw';
}

export const DEFAULT_STAIR_RUN_OPTIONS: StairRunToolOptions = { shape: 'straight', width: 1.2, turn: 'left' };

/**
 * Espelhos mínimos por forma: L e U têm dois lances de 2; o leque precisa de 5 (ver `planStairRun`); o caracol, 2 (um
 * degrau; a forma é validada pelo gerador de caracol).
 */
export const MIN_RISERS: Record<StairRunShape, number> = { straight: 2, lshape: 4, ushape: 4, winder: 5, spiral: 2, free: 2 };

/** Winder: espelhos do 1º lance reto; espelhos radiais do leque (padrão do gerador); o resto vai ao último lance. */
export const WINDER_FIRST_RISERS = 2;
export const WINDER_FAN_RISERS = 3;

/** Regra padrão quando o tipo ainda não é conhecido (mesmos números de `DEFAULT_STAIR_CALC_RULE`). */
export function defaultTreadRule(minTread: number): TreadRule {
  return {
    minTread,
    maxTread: DEFAULT_STAIR_CALC_RULE.maxTread,
    a: DEFAULT_STAIR_CALC_RULE.calcRiserFactor,
    b: DEFAULT_STAIR_CALC_RULE.calcTreadFactor,
    target: DEFAULT_STAIR_CALC_RULE.calcTarget,
  };
}

/**
 * Piso de um lance reto de comprimento `length` (m, do 1º ao último espelho). A altura manda: N = ceil(H ÷ espelho máximo)
 * e o piso ideal é `treadFor` (regra do tipo), como no Revit. O comprimento só limita: mais longo que (N − 1) × ideal, a
 * escada termina antes do clique; mais curto, o piso encolhe até o mínimo do tipo. Erro se nem o piso mínimo cabe.
 */
export function fitRunToLength(
  H: number,
  maxRiser: number,
  minTread: number,
  length: number,
  rule: TreadRule = defaultTreadRule(minTread),
  lang: Lang = 'pt',
): { risers: number; tread: number } | { error: string } {
  const N = Math.max(2, riserCountFor(H, maxRiser));
  const tread = Math.min(treadFor(H / N, rule), length / (N - 1));
  if (tread < rule.minTread - 1e-9) {
    return {
      error: translate(lang, 'tl_msg_stair_too_short', {
        c: fmtNumLang(length * 100, 0, lang),
        n: N,
        m: fmtNumLang(rule.minTread * 100, 0, lang),
      }),
    };
  }
  return { risers: N, tread };
}

export interface StairRunPlanInput {
  /** Centro do 1º espelho (1º clique). */
  start: Vec2;
  /** Direção de subida (não precisa ser unitária). */
  dir: Vec2;
  /** H = cota do topo − cota da base (m). */
  H: number;
  /** Espelho máximo do tipo (m). */
  maxRiser: number;
  /** Piso mínimo do tipo (m). */
  minTread: number;
  /** Regra de cálculo do tipo; ausente = a padrão (Blondel 0,63 − 2h, piso máximo 0,32). */
  rule?: TreadRule;
  options: StairRunToolOptions;
  /** Idioma das mensagens do plano (ausente = português). */
  lang?: Lang;
}

/** Plano calculado: componentes em ordem (como croqui), nº de espelhos N, altura real h e piso. */
export interface StairRunPlan {
  parts: StairPart[];
  risers: number;
  riserHeight: number;
  tread: number;
  /** Reta com clique além do fim da escada: a explicação em pt-BR (ausente se o comprimento é usado inteiro). */
  note?: string;
  /** Escada livre: trajeto normalizado (o último ponto é o centro do último espelho). */
  path?: Vec2[];
  /** Escada livre: nº de lances. */
  runs?: number;
  /** Escada livre: nº de patamares (giro, em linha e passagem). */
  landings?: number;
  /** Escada livre: metros de trajeto estendido para completar N espelhos. */
  extended?: number;
  /** Escada livre: metros de trajeto que sobram depois do espelho N. */
  slack?: number;
}

/** Aviso de uma reta cujo comprimento clicado passa do que a altura pede: a escada termina antes do clique. */
function lengthNote(length: number, N: number, tread: number, lang: Lang = 'pt'): string {
  const m = (v: number): string => fmtNumLang(v, 2, lang);
  if (lang === 'en') {
    return `(the height asks for ${N} risers: the stair ends at ${m((N - 1) * tread)} m, before the ${m(length)} m click).`;
  }
  return `(a altura pede ${N} espelhos: a escada termina a ${m((N - 1) * tread)} m, antes do clique de ${m(length)} m).`;
}

export type StairRunPlanResult = StairRunPlan | { error: string };

/**
 * Calcula a escada pronta: N = ceil(H ÷ espelho máximo), h = H ÷ N, piso = treadFor(h, regra do tipo) e os componentes do
 * gerador da forma. L e U dividem N com `risersFirst = ceil(N/2)`. O winder é fundido em um lance só (ver `mergeWinder`).
 * Sem efeito no modelo: só devolve o plano ou a mensagem de status em pt-BR.
 */
export function planStairRun(i: StairRunPlanInput): StairRunPlanResult {
  const { shape, width, turn } = i.options;
  const lang = i.lang ?? 'pt';
  if (shape === 'spiral') return { error: translate(lang, 'tl_msg_plan_spiral_only') };
  if (shape === 'free') return { error: translate(lang, 'tl_msg_plan_free_only') };
  const landingDepth = i.options.landingDepth ?? width;
  if (!(width > 0)) return { error: translate(lang, 'tl_msg_width_positive') };
  if (shape === 'lshape' && !(landingDepth >= width)) return { error: translate(lang, 'tl_msg_landing_l_depth') };
  if (shape === 'ushape' && !(landingDepth > 0)) return { error: translate(lang, 'tl_msg_landing_u_depth') };
  let N: number;
  try {
    N = riserCountFor(i.H, i.maxRiser);
  } catch (e) {
    return { error: e instanceof RangeError ? e.message : translate(lang, 'tl_msg_invalid_height_riser') };
  }
  if (N < 2) return { error: translate(lang, 'tl_msg_height_below_riser') };
  if (N < MIN_RISERS[shape]) return { error: translate(lang, 'tl_msg_shape_min_risers', { n: MIN_RISERS[shape], m: N }) };
  const rule = i.rule ?? defaultTreadRule(i.minTread);
  // Reta com comprimento (2º clique): N vem só da altura; o comprimento limita o piso (a escada termina antes do clique).
  const byLength = shape === 'straight' && i.options.length !== undefined;
  let sizedTread: number | undefined;
  if (byLength) {
    const sized = fitRunToLength(i.H, i.maxRiser, i.minTread, i.options.length!, rule, i.lang);
    if ('error' in sized) return sized;
    N = sized.risers;
    sizedTread = sized.tread;
  }
  const riserHeight = i.H / N;
  const tread = sizedTread ?? treadFor(riserHeight, rule);
  const note = byLength && i.options.length! > (N - 1) * tread + 0.005 ? lengthNote(i.options.length!, N, tread, i.lang) : undefined;
  const base = { start: i.start, dir: i.dir, width, tread };
  let parts: StairPart[];
  try {
    if (shape === 'straight') parts = fromSketches([{ kind: 'run', run: generateStraightRun({ ...base, risers: N }) }], shape);
    else if (shape === 'winder') parts = mergeWinder(generateWinderL({ ...base, turn, risersFirst: WINDER_FIRST_RISERS, risersSecond: N - WINDER_FIRST_RISERS - WINDER_FAN_RISERS + 2, winderRisers: WINDER_FAN_RISERS }), shape);
    else {
      const first = Math.ceil(N / 2);
      const two = { ...base, turn, risersFirst: first, risersSecond: N - first };
      const cs = shape === 'lshape' ? generateLShape({ ...two, landingDepth }) : generateUShape({ ...two, landingDepth });
      parts = fromSketches(cs, shape);
    }
  } catch (e) {
    return { error: e instanceof RangeError ? e.message : translate(lang, 'tl_msg_cannot_generate_stair') };
  }
  return { parts, risers: N, riserHeight, tread, note };
}

/** Entrada do plano da escada livre: o trajeto de cliques vale como o desenho inteiro. */
export interface StairFreePlanInput {
  path: Vec2[];
  H: number;
  type: StairType;
  options: StairRunToolOptions;
  fixed?: StairFixed;
}

/**
 * Plano da escada livre: cada trecho reto vira um lance e cada giro, um patamar. O motor (`planStairFree`) devolve os
 * componentes em croqui; aqui eles viram peças da ferramenta com `generatedBy 'free'`, junto do trajeto normalizado e
 * dos números do plano (lances, patamares, extensão e sobra).
 */
export function planStairRunFree(i: StairFreePlanInput): StairRunPlanResult {
  const plan = planStairFree(i.path, i.H, i.type, {
    width: i.options.width,
    ...(i.options.landingDepth !== undefined ? { landingDepth: i.options.landingDepth } : {}),
    ...(i.fixed ? { fixed: i.fixed } : {}),
  });
  if ('error' in plan) return plan;
  const out: StairRunPlan = {
    parts: fromSketches(plan.parts, 'free'),
    risers: plan.risers,
    riserHeight: plan.riserHeight,
    tread: plan.tread,
    path: plan.path,
    runs: plan.runs,
    landings: plan.landings,
    extended: plan.extended,
    slack: plan.slack,
  };
  if (plan.note) out.note = plan.note;
  return out;
}

/** Componentes do gerador para o croqui (cada lance recebe a origem `generatedBy`). */
function fromSketches(cs: StairComponentSketch[], generatedBy: StairGenerator): StairPart[] {
  return cs.map((c): StairPart => (c.kind === 'run' ? { kind: 'run', run: { ...c.run, generatedBy } } : { kind: 'landing', landing: { boundary: c.landing.boundary } }));
}

/**
 * Winder: o gerador devolve três lances, e cada junção compartilha uma linha de espelho (o último espelho de um é o
 * primeiro do seguinte). O motor soma os espelhos por componente, então manter as três peças contaria a linha duas vezes
 * e deslocaria a cota do 2º lance. Aqui os dois espelhos duplicados saem das peças seguintes e as três viram UM lance:
 * cada linha fica uma vez, os pisos de junção continuam no mesmo lance e N bate com a contagem.
 */
function mergeWinder(cs: StairComponentSketch[], generatedBy: StairGenerator): StairPart[] {
  const runs = cs.flatMap((c): StairRunSketch[] => (c.kind === 'run' ? [c.run] : []));
  const [first, fan, last] = runs;
  if (runs.length !== 3 || !first || !fan || !last) throw new RangeError(translate('pt', 'tl_msg_winder_three'));
  const run: StairRunSketch & { generatedBy: StairGenerator } = {
    boundaryLeft: [...first.boundaryLeft, ...fan.boundaryLeft, ...last.boundaryLeft],
    boundaryRight: [...first.boundaryRight, ...fan.boundaryRight, ...last.boundaryRight],
    risers: [...first.risers, ...fan.risers.slice(1), ...last.risers.slice(1)],
    path: [],
    generatedBy,
  };
  return [{ kind: 'run', run }];
}
