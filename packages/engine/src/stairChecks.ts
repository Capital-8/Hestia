import { dist, intersection, lerp, multiArea, type MultiPolygon, type Vec2 } from '@hestia/geom';
import { isStair, type Id, type Project, type Stair, type ValidationIssue } from '@hestia/model';
import { resolveFloors } from './floors.ts';
import { numLang, t, type Lang } from './i18nMessages.ts';
import { makeStairIssue, type StairIssueItem } from './stairIssues.ts';
import { MAX_FLIGHT_RISE, stairFlightHeights } from './stairRefit.ts';
import { resolveStairs, type ResolvedStair } from './stairs.ts';
import { resolveSlabs, slabRiseAt } from './slabs.ts';
import { stairWallOverlapIssues } from './stairWallOverlap.ts';

/**
 * Avisos que dependem da geometria das lajes e pisos do nível de topo (`stair-headroom`). Ficam fora de `stairs.ts`:
 * `resolveFloors` e `resolveSlabs` já chamam `resolveStairs` para o furo (decisão 0011 §1 item 11), então o aviso não
 * pode entrar na resolução da escada sem ciclo.
 */

/** Tolerância (m) nas comparações de folga, e área mínima (m²) para contar sobreposição entre degrau e laje. */
const EPS = 1e-9;
const EPS_AREA = 1e-6;

const numIn = (lang: Lang) => (n: number, digits: number): string => numLang(n, digits, lang);

/** Elemento do nível de topo: contorno resolvido (já com os furos das escadas) e cota da face inferior em cada ponto. */
export interface TopCover {
  polygon: MultiPolygon;
  underside: (v: Vec2) => number;
}

/** Lajes e pisos do nível, como `resolveSlabs`/`resolveFloors` entregam (furo derivado incluso). */
export function topCovers(p: Project, levelId: Id): TopCover[] {
  return [
    ...resolveFloors(p, levelId).map((f): TopCover => ({ polygon: f.polygon, underside: () => f.bottomZ })),
    ...resolveSlabs(p, levelId).map((s): TopCover => ({ polygon: s.polygon, underside: (v) => s.bottomZ + slabRiseAt(s.slope, v) })),
  ];
}

/**
 * Folga de cabeça (decisão 0011 §1 item 10): para cada degrau ou patamar sob uma laje ou piso do nível de topo, a folga
 * é a cota da face inferior menos a cota do topo do degrau (no pior ponto da sobreposição). Se a menor for menor que
 * `minHeadroom` do tipo, um aviso. Com a abertura ligada, o furo já tira da laje os degraus com folga até o pé-direito
 * do modo (`openingHeadroom`, ou o mínimo do tipo): o que sobra tem folga maior, então sem aviso. Com `openingHeadroom`
 * abaixo do mínimo do tipo, os degraus entre os dois valores ficam sob a laje e avisam.
 */
export function stairHeadroomIssue(rs: ResolvedStair, covers: TopCover[], lang: Lang = 'pt'): StairIssueItem | null {
  const num = numIn(lang);
  let worst: { h: number; ci: number } | null = null;
  for (const st of rs.steps) {
    for (const c of covers) {
      for (const piece of intersection(c.polygon, [[st.polygon]])) {
        const ring = piece[0];
        if (!ring || ring.length < 3 || multiArea([piece]) < EPS_AREA) continue;
        for (const v of ring) {
          const h = c.underside(v) - st.z;
          if (!worst || h < worst.h) worst = { h, ci: st.componentIndex };
        }
      }
    }
  }
  if (!worst || worst.h >= rs.type.minHeadroom - EPS) return null;
  return makeStairIssue(
    rs.id,
    'stair-headroom',
    'warning',
    t(lang, 'egb_issue_stair_headroom', { h: num(worst.h, 2), min: num(rs.type.minHeadroom, 2) }),
    worst.ci,
  );
}

/** Tolerância (m) entre alturas de espelho de lances diferentes (5 mm, como o piso em `stair-uneven`). */
const RISER_EVEN_TOL = 0.005;

/** Ponto médio por arco de uma polilinha (o mesmo que o das linhas de caminhada dos avisos de piso). */
function walkMid(pts: Vec2[]): Vec2 {
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) total += dist(pts[i]!, pts[i + 1]!);
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const l = dist(pts[i]!, pts[i + 1]!);
    if (acc + l >= total / 2) return lerp(pts[i]!, pts[i + 1]!, l > 0 ? (total / 2 - acc) / l : 0);
    acc += l;
  }
  return pts[pts.length - 1]!;
}

/** Piso médio (m) na linha de caminhada de um lance: média das cordas entre os pontos médios de espelhos consecutivos. */
function walkLineTread(risers: ResolvedStair['risers']): number | null {
  if (risers.length < 2) return null;
  const mids = [...risers].sort((a, b) => a.index - b.index).map((r) => walkMid(r.points));
  let s = 0;
  for (let i = 0; i + 1 < mids.length; i++) s += dist(mids[i]!, mids[i + 1]!);
  return s / (mids.length - 1);
}

/**
 * Espelhos desiguais entre lances (`stair-riser-uneven`): a altura de todo espelho (z1 − z0) é H ÷ N por construção, mas
 * a escada livre/composta pode vir a ter altura por lance; o aviso confere a variação (> 5 mm) entre os lances.
 */
export function stairRiserEvennessIssue(rs: ResolvedStair, lang: Lang = 'pt'): StairIssueItem | null {
  const byRun = new Map<number, number>();
  for (const r of rs.risers) {
    const h = r.z1 - r.z0;
    const cur = byRun.get(r.componentIndex);
    byRun.set(r.componentIndex, cur === undefined ? h : Math.max(cur, h));
  }
  if (byRun.size < 2) return null;
  const hs = [...byRun.values()];
  const spread = Math.max(...hs) - Math.min(...hs);
  if (spread <= RISER_EVEN_TOL + EPS) return null;
  return makeStairIssue(
    rs.id,
    'stair-riser-uneven',
    'warning',
    t(lang, 'egb_issue_stair_uneven_risers', { v: Math.round(spread * 1000), max: Math.round(RISER_EVEN_TOL * 1000) }),
  );
}

/**
 * Avisos de regra da escada em relação ao TIPO (espelho e piso do tipo, NBR 9050), além dos de norma fixa de
 * `stairIssues.ts`. Quando a norma fixa já avisou o mesmo caso (`stair-riser-range`, `stair-tread-range`,
 * `stair-landing-rise`), não repete:
 * - `stair-riser-below-min`: espelho abaixo do mínimo do tipo;
 * - `stair-riser-range-impossible`: nenhum nº de espelhos N dá H ÷ N em [minRiser, maxRiser];
 * - `stair-riser-fixed`: modo `fixed` com espelho fora da faixa do tipo (o reajuste não corrige);
 * - `stair-tread-type-range`: piso na linha de caminhada fora de [minTread, maxTread] do tipo (vale p/ leque e caracol);
 * - `stair-flight-rise`: trecho contínuo entre patamares acima de 3,20 m (NBR 9050), mesmo com vários lances emendados;
 * - `stair-riser-uneven`: ver `stairRiserEvennessIssue`.
 * O patamar com menos de 1,20 m já é `stair-landing-length`; o espelho acima do máximo, `stair-riser-too-high`.
 */
export function stairRuleIssues(s: Stair, rs: ResolvedStair, lang: Lang = 'pt'): StairIssueItem[] {
  const num = numIn(lang);
  const out: StairIssueItem[] = [];
  const h = rs.riserHeight;
  if (rs.riserCount === 0 || !(h > 0)) return out;
  const H = rs.topZ - rs.baseZ;
  const { minRiser, maxRiser, minTread, maxTread } = rs.type;
  const has = (code: string, ci?: number): boolean => rs.issues.some((i) => i.code === code && (ci === undefined || i.componentIndex === ci));

  if (minRiser > 0 && h < minRiser - EPS && !has('stair-riser-range')) {
    out.push(makeStairIssue(rs.id, 'stair-riser-below-min', 'warning', t(lang, 'egb_issue_stair_riser_low', { h: num(h, 3), min: num(minRiser, 3) })));
  }
  if (minRiser > 0 && maxRiser > minRiser) {
    const nMin = Math.ceil(H / maxRiser - EPS);
    const nMax = Math.floor(H / minRiser + EPS);
    if (nMin > nMax) {
      out.push(
        makeStairIssue(
          rs.id,
          'stair-riser-range-impossible',
          'warning',
          t(lang, 'egb_issue_stair_no_riser_count', { min: num(minRiser, 3), max: num(maxRiser, 3), h: num(H, 3) }),
        ),
      );
    }
    if (s.riserMode === 'fixed' && (h < minRiser - EPS || h > maxRiser + EPS)) {
      out.push(
        makeStairIssue(
          rs.id,
          'stair-riser-fixed',
          'warning',
          t(lang, 'egb_issue_stair_riser_fixed', { h: num(h, 3), min: num(minRiser, 3), max: num(maxRiser, 3) }),
        ),
      );
    }
  }

  const runIdx = [...new Set(rs.risers.map((r) => r.componentIndex))].sort((a, b) => a - b);
  for (const ci of runIdx) {
    const tread = walkLineTread(rs.risers.filter((r) => r.componentIndex === ci));
    if (tread === null || has('stair-tread-range', ci)) continue;
    if (tread < minTread - EPS || tread > maxTread + EPS) {
      out.push(
        makeStairIssue(
          rs.id,
          'stair-tread-type-range',
          'warning',
          t(lang, 'egb_issue_stair_tread_range', { tread: num(tread, 3), min: num(minTread, 2), max: num(maxTread, 2) }),
          ci,
        ),
      );
    }
  }

  // Trechos contínuos entre patamares: lances emendados contam juntos; o patamar encerra o trecho.
  const heights = stairFlightHeights(s, H);
  const starts: number[] = [];
  let inRun = false;
  s.components.forEach((c, ci) => {
    if (c.kind === 'landing') {
      inRun = false;
      return;
    }
    if (!inRun) {
      starts.push(ci);
      inRun = true;
    }
  });
  heights.forEach((fh, k) => {
    const ci = starts[k];
    if (ci === undefined || fh <= MAX_FLIGHT_RISE + 1e-6) return;
    const end = starts[k + 1] ?? s.components.length;
    const covered = rs.issues.some((i) => i.code === 'stair-landing-rise' && i.componentIndex !== undefined && i.componentIndex >= ci && i.componentIndex < end);
    if (covered) return;
    out.push(
      makeStairIssue(
        rs.id,
        'stair-flight-rise',
        'warning',
        t(lang, 'egb_issue_stair_flight_rise', { rise: num(fh, 2), max: num(MAX_FLIGHT_RISE, 2) }),
        ci,
      ),
    );
  });

  const uneven = stairRiserEvennessIssue(rs, lang);
  if (uneven) out.push(uneven);
  return out;
}

/** Todos os avisos e erros das escadas: os de `resolveStairs`, `stair-headroom` e `stair-wall-overlap`. */
export function stairIssueList(p: Project, lang: Lang = 'pt'): StairIssueItem[] {
  const covers = new Map<Id, TopCover[]>();
  const resolved = resolveStairs(p, lang);
  const out = resolved.flatMap((r) => {
    const list = [...r.issues];
    if (r.topLevelId) {
      let coversOnLevel = covers.get(r.topLevelId);
      if (!coversOnLevel) {
        coversOnLevel = topCovers(p, r.topLevelId);
        covers.set(r.topLevelId, coversOnLevel);
      }
      const h = stairHeadroomIssue(r, coversOnLevel, lang);
      if (h) list.push(h);
    }
    const el = p.elements[r.id];
    if (isStair(el)) list.push(...stairRuleIssues(el, r, lang));
    return list;
  });
  out.push(...stairWallOverlapIssues(p, resolved, lang));
  return out;
}

/**
 * Avisos de uma só escada: o mesmo que `stairIssueList(p).filter((i) => i.stairId === id)`, sem resolver as outras. A criação
 * usa isto para não resolver todas as escadas do projeto só para achar o aviso da nova. A invasão de parede é conferida só
 * contra esta escada; as paredes continuam vindo do projeto inteiro, como na lista.
 */
export function stairIssuesOf(p: Project, id: Id, lang: Lang = 'pt'): StairIssueItem[] {
  const e = p.elements[id];
  if (!isStair(e)) return [];
  const [r] = resolveStairs({ ...p, elements: { [id]: e } }, lang);
  if (!r) return [];
  const list = [...r.issues];
  if (r.topLevelId) {
    const h = stairHeadroomIssue(r, topCovers(p, r.topLevelId), lang);
    if (h) list.push(h);
  }
  list.push(...stairRuleIssues(e, r, lang));
  list.push(...stairWallOverlapIssues(p, [r], lang));
  return list;
}

/** Aviso no formato do painel, com os ids da relação (quando houver) além do `elementId`. */
export type StairValidationIssue = ValidationIssue & { ids?: string[] };

/** Os mesmos avisos no formato do painel (`ValidationIssue`, com `elementId` = id da escada e `ids` da relação). */
export function stairValidationIssues(p: Project, lang: Lang = 'pt'): StairValidationIssue[] {
  return stairIssueList(p, lang).map((i) => ({
    severity: i.severity,
    code: i.code,
    message: i.message,
    elementId: i.stairId,
    ...(i.ids ? { ids: i.ids } : {}),
  }));
}
