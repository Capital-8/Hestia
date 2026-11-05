import { add, dist, dot, mul, norm, perp, sub, type Vec2 } from '@hestia/geom';
import { stairCalcRuleOf, type StairType } from '@hestia/model';
import { FREE_COLLINEAR_ANGLE, FREE_MAX_TURN_ANGLE, compactRing, findSelfOverlap, turnLandingRing, turnTMin } from './freePathGeom.ts';
import { numLang, t, type Lang } from './i18nMessages.ts';
import { inlineLanding } from './rampPlan.ts';
import { generateStraightRun, treadFor, treadRuleOf, type StairComponentSketch } from './stairGenerators.ts';
import {
  STAIR_COUNT_EPS,
  distributeStairRisers,
  layoutStairSegment,
  stairLiveParams,
  type StairFixed,
  type StairSegmentLayout,
} from './stairLive.ts';
import { DEFAULT_STAIR_NORMS, type StairNorms } from './stairNorms.ts';

/** Distância mínima entre vértices consecutivos (m): menor que isso, o vértice é ignorado. */
const MIN_SEGMENT = 0.01;

export interface StairFreeOptions {
  /** Largura do lance (m). */
  width: number;
  /** Profundidade do patamar de giro; padrão = width; nunca menor que width. */
  landingDepth?: number;
  /** Índices do trajeto ORIGINAL com patamar forçado. */
  manualLandings?: number[];
  /** N e T fixos (Ajustar / medidos); ausente = padrões do tipo. */
  fixed?: StairFixed;
  /** Padrão DEFAULT_STAIR_NORMS. */
  norms?: StairNorms;
  /** Idioma das mensagens (padrão `'pt'`). */
  lang?: Lang;
}

export interface StairFreePlan {
  /** Lances e patamares em ordem do trajeto (sem `generatedBy`). */
  parts: StairComponentSketch[];
  /** N. */
  risers: number;
  /** h = H ÷ N. */
  riserHeight: number;
  /** T. */
  tread: number;
  /** Nº de lances. */
  runs: number;
  /** Nº de patamares (giro + em linha + passagem). */
  landings: number;
  /** Trajeto normalizado: o último vértice é o centro do último espelho; vértices após o fechamento caem. */
  path: Vec2[];
  /** m de trajeto estendido (último trecho), 0 se não. */
  extended: number;
  /** m de trajeto que sobra depois do espelho N (inclui trechos descartados). */
  slack: number;
  /** Houve vértices descartados depois do fechamento. */
  truncated: boolean;
  note?: string;
}
export type StairFreePlanResult = StairFreePlan | { error: string };

/** Recuos de um vértice. */
export interface TurnRecuo {
  /** Menor recuo sem polígono autointerceptante: (w/2)·tan(θ/2). */
  tMin: number;
  /** Recuo preferido: área do patamar >= D × D. */
  tPref: number;
}
export function turnRecuo(theta: number, width: number, depth: number): TurnRecuo {
  const tMin = turnTMin(theta, width);
  return { tMin, tPref: Math.max((depth * depth) / (2 * width), tMin) };
}

/** Como o vão de um trecho é usado. */
export interface SegmentFit {
  /** `run` = lance(s); `pass` = só um patamar retangular entre duas curvas; `short` = não cabe. */
  kind: 'run' | 'pass' | 'short';
  /** Recuo na ponta de entrada (curva no início do trecho). */
  bIn: number;
  /** Recuo na ponta de saída (curva no fim do trecho). */
  aOut: number;
  /** Vão do lance (run) ou comprimento do retângulo de passagem (pass). */
  span: number;
}

/**
 * Como o vão de um trecho de comprimento `len` é usado. `tin` = curva no início do trecho, `tout` = curva no fim
 * (null = ponta do trajeto). Prefere os recuos de área D × D; cai para os mínimos; entre duas curvas que não comportam
 * nem um lance de 2 espelhos vira trecho de passagem.
 */
export function fitSegment(len: number, tread: number, tin: TurnRecuo | null, tout: TurnRecuo | null): SegmentFit {
  const prefSpan = len - (tin?.tPref ?? 0) - (tout?.tPref ?? 0);
  if (prefSpan >= tread - STAIR_COUNT_EPS) return { kind: 'run', bIn: tin?.tPref ?? 0, aOut: tout?.tPref ?? 0, span: prefSpan };
  const minSpan = len - (tin?.tMin ?? 0) - (tout?.tMin ?? 0);
  if (minSpan >= tread - STAIR_COUNT_EPS) return { kind: 'run', bIn: tin?.tMin ?? 0, aOut: tout?.tMin ?? 0, span: minSpan };
  if (tin && tout && minSpan >= -STAIR_COUNT_EPS) {
    const pref = prefSpan >= 0;
    const bIn = pref ? tin.tPref : tin.tMin;
    const aOut = pref ? tout.tPref : tout.tMin;
    return { kind: 'pass', bIn, aOut, span: Math.max(0, len - bIn - aOut) };
  }
  return { kind: 'short', bIn: 0, aOut: 0, span: 0 };
}

interface Seg {
  a: Vec2;
  d: Vec2;
  len: number;
}
interface Turn {
  v: Vec2;
  dA: Vec2;
  dB: Vec2;
  theta: number;
  recuo: TurnRecuo;
}

const angleBetween = (dA: Vec2, dB: Vec2): number => Math.acos(Math.max(-1, Math.min(1, dot(dA, dB))));
const pt2In = (lang: Lang) => (v: number): string => numLang(v, 2, lang); // units-ok: coordenadas do desenho técnico da escada livre

/** Anel do patamar de giro: compactado; giro (quase) nulo vira o retângulo de 4 pontos. */
function turnRing(t: Turn, width: number, tIn: number, tOut: number): Vec2[] {
  const raw = turnLandingRing(t.v, t.dA, t.dB, width, tIn, tOut);
  if (t.theta < 1e-6) return compactRing([raw[0]!, raw[2]!, raw[3]!, raw[5]!]);
  return compactRing(raw);
}

const landingOfRing = (ring: Vec2[]): StairComponentSketch => ({
  kind: 'landing',
  landing: { boundary: ring.map((p, i) => ({ a: p, b: ring[(i + 1) % ring.length]!, sag: 0 })) },
});

/**
 * Planeja uma escada de trajeto livre (vértices clicados). Cada trecho reto é um lance (com patamar em linha quando
 * passa do máximo de espelhos por lance); cada vértice com giro >= 3° (ou marcado) vira patamar de giro com mitra. Um
 * piso só (T) em toda a escada: a folga do trecho vai para o patamar de giro de entrada. Nunca devolve polígono
 * autointerceptante nem lance de 1 espelho; nenhuma exceção escapa (vira `{ error }`).
 */
export function planStairFree(path: Vec2[], H: number, type: StairType, o: StairFreeOptions): StairFreePlanResult {
  try {
    return plan(path, H, type, o);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function plan(path: Vec2[], H: number, type: StairType, o: StairFreeOptions): StairFreePlanResult {
  const lang = o.lang ?? 'pt';
  const pt2 = pt2In(lang);
  const w = o.width;
  if (!(w > 0)) return { error: t(lang, 'egb_err_stair_width') };
  if (!(H > 0)) return { error: t(lang, 'egb_err_stair_height') };
  const params = stairLiveParams(H, type, { fixed: o.fixed, width: w, norms: o.norms ?? DEFAULT_STAIR_NORMS, lang });
  if ('error' in params) return params;
  const T = params.tread;
  const N = params.risers;
  const D = Math.max(o.landingDepth ?? w, w);
  const manual = new Set(o.manualLandings ?? []);

  // Limpa vértices repetidos, guardando o índice original.
  const pts: Vec2[] = [];
  const orig: number[] = [];
  path.forEach((p, i) => {
    if (pts.length === 0 || dist(p, pts[pts.length - 1]!) >= MIN_SEGMENT) {
      pts.push(p);
      orig.push(i);
    }
  });
  if (pts.length < 2) return { error: t(lang, 'egb_err_path_points') };

  // Dissolve vértices quase colineares que não são patamar manual (a escada não tem patamar ali).
  for (let again = true; again; ) {
    again = false;
    for (let i = 1; i + 1 < pts.length; i++) {
      const dA = norm(sub(pts[i]!, pts[i - 1]!));
      const dB = norm(sub(pts[i + 1]!, pts[i]!));
      if (angleBetween(dA, dB) < FREE_COLLINEAR_ANGLE && !manual.has(orig[i]!)) {
        pts.splice(i, 1);
        orig.splice(i, 1);
        again = true;
        break;
      }
    }
  }

  const segs: Seg[] = [];
  for (let i = 0; i + 1 < pts.length; i++) segs.push({ a: pts[i]!, d: norm(sub(pts[i + 1]!, pts[i]!)), len: dist(pts[i]!, pts[i + 1]!) });
  const S = segs.length;
  const last = S - 1;
  const turns: Turn[] = [];
  for (let k = 0; k < last; k++) {
    const dA = segs[k]!.d;
    const dB = segs[k + 1]!.d;
    const theta = angleBetween(dA, dB);
    if (theta > FREE_MAX_TURN_ANGLE) return { error: t(lang, 'egb_err_sharp_turn', { n: orig[k + 1]! + 1 }) };
    turns.push({ v: pts[k + 1]!, dA, dB, theta, recuo: turnRecuo(theta, w, D) });
  }

  const fits: SegmentFit[] = segs.map((sg, k) => {
    const tin = k > 0 ? turns[k - 1]!.recuo : null;
    if (k === last) {
      // O último trecho nunca é erro por curto: pode ser estendido.
      const bIn = tin?.tPref ?? 0;
      return { kind: 'run', bIn, aOut: 0, span: Math.max(0, sg.len - bIn) };
    }
    return fitSegment(sg.len, T, tin, turns[k]!.recuo);
  });

  const dist1 = distributeStairRisers(fits.map((f) => (f.kind === 'run' ? f.span : 0)), params);
  const lastUsed = dist1.closedAt ?? last;
  for (let k = 0; k <= lastUsed; k++) {
    if (fits[k]!.kind === 'short') {
      return { error: k === 0 ? t(lang, 'egb_err_first_segment_short') : t(lang, 'egb_err_segment_short', { n: k + 1 }) };
    }
  }
  const poucos = (j: number): { error: string } => {
    const v = orig[j + 1]! + 1;
    return { error: t(lang, 'egb_err_few_risers', { risers: N, vertex: v, segment: v - 1 }) };
  };
  for (let k = 0; k <= lastUsed && dist1.missing > 0; k++) if (dist1.layouts[k]!.leftover1) return poucos(k);

  const lays: StairSegmentLayout[] = dist1.layouts.slice(0, lastUsed + 1);
  let extended = 0;
  if (dist1.closedAt !== null && lastUsed < last) {
    // O trajeto fecha antes do fim: o trecho que fecha passa a ser o último do trajeto normalizado, e o último trecho
    // usa o recuo preferido de entrada e nenhum de saída. Refaz o vão assim para replanejar o `path` normalizado dar
    // exatamente os mesmos componentes (se o recuo preferido come o vão que o recuo mínimo deixava, o trecho estende).
    const k = lastUsed;
    const bIn = k > 0 ? turns[k - 1]!.recuo.tPref : 0;
    const need = N - dist1.layouts.slice(0, k).reduce((acc, l) => acc + l.risers, 0);
    const lay = layoutStairSegment(Infinity, params, need, false);
    fits[k] = { kind: 'run', bIn, aOut: 0, span: Math.max(0, segs[k]!.len - bIn) };
    lays[k] = lay;
    extended = Math.max(0, bIn + lay.length - segs[k]!.len);
  }
  if (dist1.missing > 0) {
    // O trajeto acabou antes do topo: estende o último trecho na sua direção.
    const before = lays.slice(0, last).reduce((s, l) => s + l.risers, 0);
    const need = N - before;
    if (need < 2) return poucos(last - 1 >= 0 ? last - 1 : 0);
    const ext = layoutStairSegment(Infinity, params, need, false);
    lays[last] = ext;
    extended = Math.max(0, fits[last]!.bIn + ext.length - segs[last]!.len);
  }

  // Monta os componentes na ordem do trajeto.
  const parts: StairComponentSketch[] = [];
  const segOf: number[] = [];
  let runs = 0;
  let landings = 0;
  let placedRisers = 0;
  const push = (c: StairComponentSketch, k: number): void => {
    parts.push(c);
    segOf.push(k);
    if (c.kind === 'run') runs += 1;
    else landings += 1;
  };
  for (let k = 0; k <= lastUsed; k++) {
    const sg = segs[k]!;
    const f = fits[k]!;
    const at = (u: number, v: number): Vec2 => add(sg.a, add(mul(sg.d, u), mul(perp(sg.d), v)));
    if (f.kind === 'run') {
      for (const pc of lays[k]!.pieces) {
        const u0 = f.bIn + pc.at;
        if (pc.kind === 'flight') {
          push({ kind: 'run', run: generateStraightRun({ start: at(u0, 0), dir: sg.d, width: w, risers: pc.risers, tread: T }) }, k);
          placedRisers += pc.risers;
        } else push(inlineLanding(at, u0, u0 + pc.length, -w / 2, w / 2), k);
      }
    } else if (f.span >= 1e-6) push(inlineLanding(at, f.bIn, f.bIn + f.span, -w / 2, w / 2), k);
    if (k < lastUsed) {
      // A folga do trecho entra no recuo de entrada do patamar; a saída é o recuo de entrada do trecho seguinte.
      const tIn = f.kind === 'run' ? sg.len - (f.bIn + lays[k]!.length) : f.aOut;
      push(landingOfRing(turnRing(turns[k]!, w, tIn, fits[k + 1]!.bIn)), k);
    }
  }
  if (placedRisers !== N || runs === 0) return { error: t(lang, 'egb_err_distribute_risers') };

  // Só na criação/regeneração: trechos não adjacentes não podem se sobrepor.
  const clash = findSelfOverlap(parts, segOf);
  if (clash) return { error: t(lang, 'egb_err_path_overlap', { n: segOf[clash.a]! + 1 }) };

  // Trajeto normalizado: o último vértice vira o centro do último espelho; o resto depois do fechamento cai.
  const lastSeg = segs[lastUsed]!;
  const endDist = fits[lastUsed]!.bIn + lays[lastUsed]!.length;
  const outPath = [...path.slice(0, orig[lastUsed]! + 1), add(lastSeg.a, mul(lastSeg.d, endDist))];
  let slack = Math.max(0, lastSeg.len - endDist);
  for (let k = lastUsed + 1; k < S; k++) slack += segs[k]!.len;
  const truncated = lastUsed < last;

  let note: string | undefined;
  if (extended > 1e-6) note = t(lang, 'egb_note_path_extended_stair', { d: pt2(extended), risers: N });
  else if (truncated) note = t(lang, 'egb_note_path_shortened_stair', { risers: N });
  else if (slack > 0.005) note = t(lang, 'egb_note_stair_ends_early', { d: pt2(slack) });

  const result: StairFreePlan = {
    parts,
    risers: N,
    riserHeight: params.riserHeight,
    tread: T,
    runs,
    landings,
    path: outPath,
    extended,
    slack,
    truncated,
  };
  if (note) result.note = note;
  return result;
}

export interface OptimizeStairInput {
  path: Vec2[];
  H: number;
  type: StairType;
  width: number;
  landingDepth?: number;
  manualLandings?: number[];
  norms?: StairNorms;
  /** Idioma das mensagens (padrão `'pt'`). */
  lang?: Lang;
}
export interface OptimizeStairResult {
  /** N e T escolhidos. */
  fixed: StairFixed;
  riserHeight: number;
  /** Trajeto ajustado (último trecho esticado/encurtado pelo plano). */
  path: Vec2[];
  /** Antes do ajuste de trajeto: + estende, − sobra (m). */
  gap: number;
  /** Soma das violações restantes (0 = tudo dentro da norma). */
  violation: number;
  /** Violações em pt-BR. */
  messages: string[];
  plan: StairFreePlan;
  /** "Ajustado: ...". */
  note: string;
}

interface Cand {
  N: number;
  T: number;
  T0: number;
  Nmin: number;
  gap: number;
  violation: number;
  messages: string[];
  plan: StairFreePlan;
}

const cmNumIn = (lang: Lang) => (m: number): string => numLang(m * 100 + 1e-5, 1, lang); // units-ok: cotas em cm do desenho técnico da escada livre

/**
 * "Ajustar": escolhe N, h e piso (T) para o trajeto caber na regra Blondel do tipo. Testa N = Nmin … Nmin + 4 e, para
 * cada um, pisos dentro da faixa Blondel, refinando por bissecção onde a sobra do trajeto troca de sinal. Custo
 * lexicográfico: violação da norma, |sobra|, |N − Nmin|, |T − T ideal|. Nunca devolve plano com erro.
 */
export function optimizeStair(i: OptimizeStairInput): OptimizeStairResult | { error: string } {
  try {
    return optimize(i);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function optimize(i: OptimizeStairInput): OptimizeStairResult | { error: string } {
  const lang = i.lang ?? 'pt';
  const pt2 = pt2In(lang);
  const cmNum = cmNumIn(lang);
  const { path, H, type, width } = i;
  const norms = i.norms ?? DEFAULT_STAIR_NORMS;
  const base = stairLiveParams(H, type, { width, norms, lang });
  if ('error' in base) return base;
  const Nmin = base.risers;
  const rule = treadRuleOf(type);
  const calc = stairCalcRuleOf(type);
  const a = calc.calcRiserFactor;
  const b = calc.calcTreadFactor;
  const dist1 = (x: number, lo: number, hi: number): number => Math.max(0, lo - x, x - hi);

  const evalAt = (N: number, T: number, T0: number): Cand | { error: string } => {
    const r = planStairFree(path, H, type, {
      width,
      landingDepth: i.landingDepth,
      manualLandings: i.manualLandings,
      norms,
      fixed: { risers: N, tread: T },
      lang,
    });
    if ('error' in r) return r;
    const h = H / N;
    const msgs: string[] = [];
    const add1 = (v: number, text: string): number => {
      if (v > 1e-9) msgs.push(text);
      return v;
    };
    const violation =
      add1(Math.max(0, h - type.maxRiser), t(lang, 'egb_live_stair_riser_over', { h: cmNum(h), max: cmNum(type.maxRiser) })) +
      add1(Math.max(0, norms.riserMin - h), t(lang, 'egb_live_stair_riser_below', { h: cmNum(h), min: cmNum(norms.riserMin) })) +
      add1(Math.max(0, h - norms.riserMax), t(lang, 'egb_live_stair_riser_above', { h: cmNum(h), max: cmNum(norms.riserMax) })) +
      add1(
        dist1(a * h + b * T, calc.calcMin, calc.calcMax),
        t(lang, 'egb_live_stair_blondel', { v: cmNum(a * h + b * T), min: cmNum(calc.calcMin), max: cmNum(calc.calcMax) }),
      ) +
      add1(dist1(T, type.minTread, calc.maxTread), t(lang, 'egb_live_stair_tread', { tread: cmNum(T), min: cmNum(type.minTread), max: cmNum(calc.maxTread) }));
    return { N, T, T0, Nmin, gap: r.extended - r.slack, violation, messages: msgs, plan: r };
  };

  const better = (x: Cand, y: Cand): boolean => {
    if (Math.abs(x.violation - y.violation) > 1e-9) return x.violation < y.violation;
    if (Math.abs(Math.abs(x.gap) - Math.abs(y.gap)) > 1e-6) return Math.abs(x.gap) < Math.abs(y.gap);
    if (x.N !== y.N) return Math.abs(x.N - Nmin) < Math.abs(y.N - Nmin);
    return Math.abs(x.T - x.T0) < Math.abs(y.T - y.T0) - 1e-9;
  };

  let best: Cand | null = null;
  let nminError = '';
  for (let N = Nmin; N <= Nmin + 4; N++) {
    const h = H / N;
    if (N > Nmin && h < norms.riserMin - 1e-9) continue;
    const T0 = treadFor(h, rule);
    const lo = Math.max(type.minTread, (calc.calcMin - a * h) / b);
    const hi = Math.min(calc.maxTread, (calc.calcMax - a * h) / b);
    const ts = [T0];
    if (lo <= hi) {
      ts.push(lo, hi);
      for (let s = 1; s <= 9; s++) ts.push(lo + ((hi - lo) * s) / 10);
    }
    ts.sort((x, y) => x - y);
    const evals: Cand[] = [];
    for (const T of ts) {
      const c = evalAt(N, T, T0);
      if ('error' in c) {
        if (N === Nmin && T === T0) nminError = c.error;
        continue;
      }
      evals.push(c);
    }
    // Bissecção onde a sobra troca de sinal entre amostras vizinhas.
    const all = evals.slice();
    for (let s = 0; s + 1 < evals.length; s++) {
      let lo2 = evals[s]!;
      let hi2 = evals[s + 1]!;
      if (!(lo2.gap * hi2.gap < 0)) continue;
      for (let it = 0; it < 30; it++) {
        const c = evalAt(N, (lo2.T + hi2.T) / 2, T0);
        if ('error' in c) break;
        all.push(c);
        if (c.gap * lo2.gap > 0) lo2 = c;
        else if (Math.abs(c.gap) < 1e-10) break;
        else hi2 = c;
      }
    }
    for (const c of all) if (!best || better(c, best)) best = c;
  }
  if (!best) return { error: nminError || t(lang, 'egb_err_adjust_path') };

  const gap = best.gap;
  const trecho =
    Math.abs(gap) < 0.005
      ? t(lang, 'egb_live_path_kept')
      : gap > 0
        ? t(lang, 'egb_live_path_extended', { d: pt2(gap) })
        : t(lang, 'egb_live_path_shortened', { d: pt2(-gap) });
  let note = t(lang, 'egb_live_stair_adjusted', {
    risers: best.N,
    h: cmNum(H / best.N),
    tread: cmNum(best.T),
    segment: trecho,
  });
  if (best.violation > 1e-9) note += t(lang, 'egb_live_no_option', { message: best.messages.join(' ') });
  return {
    fixed: { risers: best.N, tread: best.T },
    riserHeight: H / best.N,
    path: best.plan.path,
    gap,
    violation: best.violation,
    messages: best.messages,
    plan: best.plan,
    note,
  };
}
