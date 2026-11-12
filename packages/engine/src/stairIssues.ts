import { cross, dist, lerp, norm, sub, type Vec2 } from '@hestia/geom';
import { stairCalcRuleOf, stairFinishOf } from '@hestia/model';
import { numLang, t, type Lang } from './i18nMessages.ts';
import type { ResolvedStair, ResolvedStairRiser } from './stairs.ts';
import { DEFAULT_STAIR_NORMS, type StairNorms } from './stairNorms.ts';
import { stairRunQuantities } from './stairQuantities.ts';

/** Aviso ou erro de uma escada. `componentIndex` (posição em `components`) quando o caso é de um lance ou patamar. */
export interface StairIssueItem {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  stairId: string;
  componentIndex?: number;
  /** Elementos envolvidos, para o "Ir para" (ex.: escada e parede invadida). */
  ids?: string[];
}

/** Tolerância (m) nas comparações com faixas e com o nº de espelhos (evita 0,28 × 0,9999… virar aviso). */
const EPS = 1e-9;

const numIn = (lang: Lang) => (n: number, digits: number): string => numLang(n, digits, lang);

export function makeStairIssue(
  stairId: string,
  code: string,
  severity: 'error' | 'warning',
  message: string,
  componentIndex?: number,
): StairIssueItem {
  const out: StairIssueItem = { code, severity, message, stairId };
  if (componentIndex !== undefined) out.componentIndex = componentIndex;
  return out;
}

/** Comprimento de uma polilinha (m). */
function polyLength(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) s += dist(pts[i]!, pts[i + 1]!);
  return s;
}

/** Ponto médio por comprimento de arco de uma polilinha (com pelo menos dois pontos). */
function arcMid(pts: Vec2[]): Vec2 {
  const half = polyLength(pts) / 2;
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const l = dist(a, b);
    if (acc + l >= half) return lerp(a, b, l > 0 ? (half - acc) / l : 0);
    acc += l;
  }
  return pts[pts.length - 1]!;
}

/** Cascas convexas (cadeia monótona de Andrew). */
function convexHull(pts: Vec2[]): Vec2[] {
  const s = [...pts].sort((p, q) => p.x - q.x || p.y - q.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Menor dimensão de um polígono: menor largura da casca convexa (distância máxima a cada aresta da casca). */
export function minWidth(ring: Vec2[]): number {
  const hull = convexHull(ring);
  if (hull.length < 3) return 0;
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const L = dist(a, b);
    if (L < 1e-12) continue;
    const dx = (b.x - a.x) / L;
    const dy = (b.y - a.y) / L;
    let far = 0;
    for (const p of hull) far = Math.max(far, Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)));
    best = Math.min(best, far);
  }
  return best === Infinity ? 0 : best;
}

function risersByRun(risers: ResolvedStairRiser[]): Array<[number, ResolvedStairRiser[]]> {
  const groups = new Map<number, ResolvedStairRiser[]>();
  for (const r of risers) {
    const list = groups.get(r.componentIndex);
    if (list) list.push(r);
    else groups.set(r.componentIndex, [r]);
  }
  return [...groups.entries()];
}

/** Espelho (altura real h = H ÷ N) contra o tipo e a faixa de norma. Sem espelhos ou sem altura, nada. */
function riserChecks(rs: ResolvedStair, norms: StairNorms, out: StairIssueItem[], lang: Lang): void {
  const num = numIn(lang);
  const h = rs.riserHeight;
  if (rs.riserCount === 0 || !(h > 0)) return;
  const H = rs.topZ - rs.baseZ;
  const max = rs.type.maxRiser;
  if (max > 0) {
    const desired = Math.ceil(H / max - EPS);
    if (rs.riserCount !== desired) {
      out.push(
        makeStairIssue(
          rs.id,
          'stair-risers-count',
          'warning',
          t(lang, 'egb_issue_stair_riser_count_diff', { count: rs.riserCount, desired }),
        ),
      );
    }
    if (h > max + EPS) {
      out.push(
        makeStairIssue(
          rs.id,
          'stair-riser-too-high',
          'error',
          t(lang, 'egb_issue_stair_riser_over', { h: num(h, 3), max: num(max, 3) }),
        ),
      );
    }
  }
  if (h < norms.riserMin - EPS || h > norms.riserMax + EPS) {
    out.push(
      makeStairIssue(
        rs.id,
        'stair-riser-range',
        'warning',
        t(lang, 'egb_issue_stair_norm_riser', { h: num(h, 3), min: num(norms.riserMin, 2), max: num(norms.riserMax, 2) }),
      ),
    );
  }
}

/** Diferença máxima (m) entre pisos consecutivos de um lance reto (decisão 0011 §1 item 10). */
const TREAD_EVEN_TOL = 0.005;
/** Seno máximo do ângulo entre dois espelhos para contar como paralelos (~0,06°). */
const PARALLEL_SIN = 1e-3;

/**
 * Degraus iguais (`stair-uneven`): num lance de espelhos paralelos, o piso entre pares de espelhos consecutivos não pode
 * variar mais de 5 mm. Em leque os espelhos não são paralelos e a variação do piso é esperada: não avisa.
 *
 * Alturas entre lances: não se checam. A altura do espelho é uma só por escada (h = H ÷ N, decisão 0011 §1 item 4),
 * então todo espelho de todo lance tem a mesma altura por construção. Se o modelo passar a aceitar altura por lance,
 * a comparação entra aqui, por `componentIndex`.
 */
function evenTreadCheck(rs: ResolvedStair, ci: number, risers: ResolvedStairRiser[], out: StairIssueItem[], lang: Lang): void {
  if (risers.length < 3) return;
  const u0 = norm(sub(risers[0]!.b, risers[0]!.a));
  if (!risers.every((r) => Math.abs(cross(u0, norm(sub(r.b, r.a)))) < PARALLEL_SIN)) return;
  const mids = risers.map((r) => arcMid(r.points));
  const treads = mids.slice(1).map((m, i) => dist(mids[i]!, m));
  const spread = Math.max(...treads) - Math.min(...treads);
  if (spread > TREAD_EVEN_TOL + EPS) {
    out.push(
      makeStairIssue(
        rs.id,
        'stair-uneven',
        'warning',
        t(lang, 'egb_issue_stair_uneven_treads', { v: Math.round(spread * 1000), max: Math.round(TREAD_EVEN_TOL * 1000) }),
        ci,
      ),
    );
  }
}

/**
 * Piso do leque (decisão 0011 §1 item 10, aviso `stair-winder-tread`): entre dois espelhos que NÃO são paralelos, o piso
 * medido a `winderTreadAt` m da borda interna — a corda entre os dois espelhos nesse afastamento — não pode ser menor
 * que `winderTreadMin`. O lado interno é o lado em que as pontas dos espelhos ficam mais próximas entre si. O caracol
 * tem a sua própria regra (`stair-spiral-tread`), com os mesmos números: aqui ele é pulado.
 */
function winderTreadCheck(rs: ResolvedStair, ci: number, risers: ResolvedStairRiser[], norms: StairNorms, out: StairIssueItem[], lang: Lang): void {
  const num = numIn(lang);
  if (risers.length < 2 || rs.spiral?.componentIndex === ci) return;
  const pointAt = (inner: Vec2, outer: Vec2): Vec2 => {
    const l = dist(inner, outer);
    return lerp(inner, outer, l > EPS ? Math.min(1, norms.winderTreadAt / l) : 0);
  };
  let worst = Infinity;
  for (let i = 1; i < risers.length; i++) {
    const p = risers[i - 1]!;
    const q = risers[i]!;
    if (Math.abs(cross(norm(sub(p.b, p.a)), norm(sub(q.b, q.a)))) < PARALLEL_SIN) continue;
    // O lado interno é o par de pontas mais próximo; o outro par é a borda externa.
    const straightPair = dist(p.a, q.a) + dist(p.b, q.b);
    const crossedPair = dist(p.a, q.b) + dist(p.b, q.a);
    const [i0, o0, i1, o1] = straightPair <= crossedPair ? [p.a, p.b, q.a, q.b] : [p.b, p.a, q.b, q.a];
    worst = Math.min(worst, dist(pointAt(i0, o0), pointAt(i1, o1)));
  }
  if (worst < norms.winderTreadMin - EPS) {
    out.push(
      makeStairIssue(
        rs.id,
        'stair-winder-tread',
        'warning',
        t(lang, 'egb_issue_stair_winder_tread', {
          at: num(norms.winderTreadAt, 2),
          tread: num(worst, 2),
          min: num(norms.winderTreadMin, 2),
        }),
        ci,
      ),
    );
  }
}

/** Rótulo da relação de cálculo: "2h + p" para a regra padrão e os fatores explícitos nas demais. */
function relationLabel(a: number, b: number, lang: Lang): string {
  const f = (v: number): string => (Number.isInteger(v) ? String(v) : numLang(v, 2, lang));
  return `${f(a)}h + ${b === 1 ? '' : `${f(b)}`}p`;
}

/** Lance a lance: largura, piso médio, regra de cálculo, desnível sem patamar, degraus iguais e piso do leque. */
function runChecks(rs: ResolvedStair, norms: StairNorms, out: StairIssueItem[], lang: Lang): void {
  const num = numIn(lang);
  const h = rs.riserHeight;
  const calc = stairCalcRuleOf(rs.type);
  const runsQuant = stairRunQuantities(rs);
  for (const [ci, risers] of risersByRun(rs.risers)) {
    const width = Math.min(...risers.map((r) => polyLength(r.points)));
    if (width < rs.type.minRunWidth - EPS) {
      out.push(
        makeStairIssue(
          rs.id,
          'stair-width-min',
          'warning',
          t(lang, 'egb_issue_stair_width', { w: num(width, 2), min: num(rs.type.minRunWidth, 2) }),
          ci,
        ),
      );
    }
    evenTreadCheck(rs, ci, risers, out, lang);
    winderTreadCheck(rs, ci, risers, norms, out, lang);
    const run = runsQuant.find((q) => q.componentIndex === ci);
    if (risers.length >= 2 && run && run.treadCount > 0) {
      // Piso médio do quantitativo (área dos degraus ÷ largura × nº de degraus): o aviso e a tabela usam a mesma conta.
      // A soma das cordas entre pontos médios subestimava o caracol (0,393 contra 0,395).
      const tread = run.treadMean;
      if (tread < norms.treadMin - EPS || tread > norms.treadMax + EPS) {
        out.push(
          makeStairIssue(
            rs.id,
            'stair-tread-range',
            'warning',
            t(lang, 'egb_issue_stair_tread_avg', {
              tread: num(tread, 3),
              min: num(norms.treadMin, 2),
              max: num(norms.treadMax, 2),
            }),
            ci,
          ),
        );
      }
      const relation = calc.calcRiserFactor * h + calc.calcTreadFactor * tread;
      if (relation < calc.calcMin - EPS || relation > calc.calcMax + EPS) {
        out.push(
          makeStairIssue(
            rs.id,
            'stair-blondel',
            'warning',
            t(lang, 'egb_issue_stair_relation', {
              relation: relationLabel(calc.calcRiserFactor, calc.calcTreadFactor, lang),
              v: num(relation, 3),
              min: num(calc.calcMin, 2),
              max: num(calc.calcMax, 2),
            }),
            ci,
          ),
        );
      }
    }
    const rise = risers.length * h;
    if (rise > norms.maxRiseBetweenLandings + EPS) {
      out.push(
        makeStairIssue(
          rs.id,
          'stair-landing-rise',
          'warning',
          t(lang, 'egb_issue_stair_rise_between', { rise: num(rise, 2), max: num(norms.maxRiseBetweenLandings, 2) }),
          ci,
        ),
      );
    }
  }
}

/** Menor dimensão de cada patamar. */
function landingChecks(rs: ResolvedStair, norms: StairNorms, out: StairIssueItem[], lang: Lang): void {
  const num = numIn(lang);
  for (const st of rs.steps) {
    if (st.kind !== 'landing') continue;
    const w = minWidth(st.polygon);
    if (w < norms.landingMinLength - EPS) {
      out.push(
        makeStairIssue(
          rs.id,
          'stair-landing-length',
          'warning',
          t(lang, 'egb_issue_stair_landing_small', { w: num(w, 2), min: num(norms.landingMinLength, 2) }),
          st.componentIndex,
        ),
      );
    }
  }
}

/**
 * Acabamentos: o bocel acima de `norms.nosingProjectionMax` (1,5 cm) avisa (configurável, não trava), e o acabamento do
 * piso que não cabe na estrutura (monolítico: profundidade estrutural; poste: espessura do degrau) também. Os avisos de
 * espelho, pisada e relação 2e+p já usam os valores ACABADOS: a geometria resolvida é a das faces acabadas.
 */
function finishChecks(rs: ResolvedStair, norms: StairNorms, out: StairIssueItem[], lang: Lang): void {
  const fin = stairFinishOf(rs.type);
  if (!fin.treadOn) return;
  const num = numIn(lang);
  if (fin.bocel > norms.nosingProjectionMax + EPS) {
    out.push(
      makeStairIssue(rs.id, 'stair-bocel-projection', 'warning', t(lang, 'egb_issue_stair_bocel', { v: num(fin.bocel * 100, 1), max: num(norms.nosingProjectionMax * 100, 1) })),
    );
  }
  const structure = rs.type.runStyle === 'post' ? rs.type.treadThickness : rs.type.structuralDepth;
  if (fin.treadThickness >= structure - EPS) {
    out.push(
      makeStairIssue(rs.id, 'stair-finish-structure', 'warning', t(lang, 'egb_issue_stair_finish_thick', { tp: num(fin.treadThickness * 100, 1), st: num(structure * 100, 1) })),
    );
  }
}

/** Avisos de norma (decisão 0011 §3 e §1 item 10) de uma escada resolvida. Nunca bloqueiam. */
export function stairNormIssues(rs: ResolvedStair, norms: StairNorms = DEFAULT_STAIR_NORMS, lang: Lang = 'pt'): StairIssueItem[] {
  const out: StairIssueItem[] = [];
  riserChecks(rs, norms, out, lang);
  runChecks(rs, norms, out, lang);
  landingChecks(rs, norms, out, lang);
  finishChecks(rs, norms, out, lang);
  return out;
}

/** Aviso fixo de todo lance de caracol (decisão 0014 §1 item 6, e): não é saída de emergência (RT 11 e IT 11 SP). */
export const SPIRAL_EXIT_MESSAGE = t('pt', 'egb_issue_stair_spiral_egress');

/** Parâmetros do caracol para os avisos: varredura (rad), raios e nº de espelhos (N) do lance. */
export interface SpiralNormInput {
  sweep: number;
  rInner: number;
  rOuter: number;
  risers: number;
}

/**
 * Avisos de norma do caracol (decisão 0014 §1 itens 6 e 7), sempre avisos. Δ = |sweep| ÷ (N−1); a corda entre dois
 * espelhos no raio r é 2·r·sen(Δ/2) (a mesma medida do degrau em `stairBody`):
 * - `stair-spiral-tread`: piso a 0,55 m da borda interna abaixo de 0,28 m;
 * - `stair-spiral-narrow` (informativo): piso na borda estreita (interna) abaixo de 0,07 m;
 * - `stair-spiral-headroom`: com |sweep| > 2π, folga entre voltas (n−1)·h − Tv abaixo da folga mínima do tipo, com n = 2π ÷ Δ
 *   espelhos por volta; a folga mínima é a do espelho de trás do degrau de cima (decisão 0014 §1 item 7), e
 *   Tv = T monolítico (`structuralDepth` ÷ cosθ, no raio da caminhada) ou `treadThickness` (outros);
 * - `stair-spiral-exit`: aviso fixo de saída de emergência (sempre).
 * O 2e+p no raio da caminhada já sai de `stair-blondel` (regra do leque).
 */
export function spiralNormIssues(
  rs: ResolvedStair,
  componentIndex: number,
  sp: SpiralNormInput | undefined,
  norms: StairNorms = DEFAULT_STAIR_NORMS,
  lang: Lang = 'pt',
): StairIssueItem[] {
  const num = numIn(lang);
  const out: StairIssueItem[] = [makeStairIssue(rs.id, 'stair-spiral-exit', 'warning', t(lang, 'egb_issue_stair_spiral_egress'), componentIndex)];
  const h = rs.riserHeight;
  if (!sp || !(h > 0) || !(sp.risers >= 2) || !(Math.abs(sp.sweep) > 0)) return out;
  const step = Math.abs(sp.sweep) / (sp.risers - 1);
  const chord = (r: number): number => 2 * r * Math.sin(step / 2);

  const atTread = chord(sp.rInner + norms.spiralTreadAt);
  if (atTread < norms.spiralTreadMin - EPS) {
    out.push(
      makeStairIssue(
        rs.id,
        'stair-spiral-tread',
        'warning',
        t(lang, 'egb_issue_stair_spiral_tread', {
          at: num(norms.spiralTreadAt, 2),
          tread: num(atTread, 2),
          min: num(norms.spiralTreadMin, 2),
        }),
        componentIndex,
      ),
    );
  }
  const narrow = chord(sp.rInner);
  if (narrow < norms.spiralNarrowMin - EPS) {
    out.push(
      makeStairIssue(
        rs.id,
        'stair-spiral-narrow',
        'warning',
        t(lang, 'egb_issue_stair_narrow_tread', { tread: num(narrow, 3), min: num(norms.spiralNarrowMin, 2) }),
        componentIndex,
      ),
    );
  }
  if (Math.abs(sp.sweep) > 2 * Math.PI + EPS) {
    const p = chord((sp.rInner + sp.rOuter) / 2);
    const tv = rs.type.runStyle === 'monolithic'
      ? (p > EPS ? (rs.type.structuralDepth * Math.hypot(p, h)) / p : rs.type.structuralDepth)
      : rs.type.treadThickness;
    const perTurn = (2 * Math.PI) / step;
    const folga = (perTurn - 1) * h - tv;
    if (folga < rs.type.minHeadroom - EPS) {
      out.push(
        makeStairIssue(
          rs.id,
          'stair-spiral-headroom',
          'warning',
          t(lang, 'egb_issue_stair_spiral_headroom', { v: num(folga, 2), min: num(rs.type.minHeadroom, 2) }),
          componentIndex,
        ),
      );
    }
  }
  return out;
}
