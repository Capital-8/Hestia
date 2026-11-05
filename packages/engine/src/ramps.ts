import { dist, mid, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import {
  STAIR_MIN_HEIGHT,
  rampBaseZ,
  ramps,
  rampsOnLevel,
  rampTopLevel,
  rampTopZ,
  type Id,
  type Project,
  type Ramp,
  type RampType,
} from '@hestia/model';
import { numLang, t, type Lang } from './i18nMessages.ts';
import { makeRampIssue, rampNormIssues, type RampIssueItem } from './rampIssues.ts';
import { distributeRisers, stairLandingPolygon, stairRunSteps } from './stairSketch.ts';
import { minWidth } from './stairIssues.ts';
import { memoDoProjetoMotor } from './memoProjeto.ts';

/** Comprimento de cada fatia de lance (m). */
export const RAMP_SLICE_LENGTH = 0.1;
/** Teto de fatias por lance (o passo cresce acima disso). */
const MAX_SLICES = 400;
const EPS = 1e-9;

export interface ResolvedRampFlight {
  componentIndex: number;
  /** Planta do lance. */
  polygon: Ring;
  /** Centro da borda de início e de fim. */
  start: Vec2;
  end: Vec2;
  startEdge: [Vec2, Vec2];
  endEdge: [Vec2, Vec2];
  /** Largura do lance (m): dist(startEdge). */
  width: number;
  /** Comprimento horizontal (m): dist(start, end). */
  length: number;
  /** Cotas absolutas no início e no fim. */
  z0: number;
  z1: number;
  slope: number;
}

export interface ResolvedRampLanding {
  componentIndex: number;
  polygon: Ring;
  z: number;
  minDim: number;
}

/** Fatia de ~10 cm do lance (ou o patamar inteiro) com a cota z do ponto MAIS ALTO dela. */
export interface RampSlice {
  componentIndex: number;
  kind: 'flight' | 'landing';
  polygon: Ring;
  z: number;
}

export interface ResolvedRamp {
  id: Id;
  levelId: Id;
  topLevelId: Id | null;
  typeId: Id;
  type: RampType;
  baseZ: number;
  topZ: number;
  /** rise = topZ − baseZ. */
  rise: number;
  flights: ResolvedRampFlight[];
  landings: ResolvedRampLanding[];
  slices: RampSlice[];
  /** Soma dos comprimentos dos lances. */
  flightsLength: number;
  /** flightsLength + soma das minDim dos patamares. */
  pathLength: number;
  /** rise ÷ flightsLength; 0 sem lances. */
  slope: number;
  /** União de lances e patamares. */
  footprint: MultiPolygon;
  issues: RampIssueItem[];
}

const sketchIssues = (rampId: string, ci: number, list: Array<{ code: string; severity: 'error' | 'warning'; message: string }>): RampIssueItem[] =>
  list.map((i) => makeRampIssue(rampId, i.code, i.severity, i.message, ci));

/** Comprimento horizontal do lance: distância entre os pontos médios dos 2 espelhos. */
function runLength(run: { risers: Array<{ a: Vec2; b: Vec2 }> }): number {
  if (run.risers.length !== 2) return 0;
  const [a, b] = run.risers as [{ a: Vec2; b: Vec2 }, { a: Vec2; b: Vec2 }];
  return dist(mid(a.a, a.b), mid(b.a, b.b));
}

/** Resolve uma rampa; null se o tipo não existe (o validador do modelo já aponta `ramp-type-missing`). */
function resolveOne(p: Project, r: Ramp, lang: Lang): ResolvedRamp | null {
  const type = p.rampTypes[r.typeId];
  if (!type) return null;
  const baseZ = rampBaseZ(p, r);
  const topZ = rampTopZ(p, r);
  const H = topZ - baseZ;
  const issues: RampIssueItem[] = [];
  const empty = (): ResolvedRamp => ({
    id: r.id,
    levelId: r.levelId,
    topLevelId: rampTopLevel(p, r)?.id ?? null,
    typeId: r.typeId,
    type,
    baseZ,
    topZ,
    rise: H,
    flights: [],
    landings: [],
    slices: [],
    flightsLength: 0,
    pathLength: 0,
    slope: 0,
    footprint: [],
    issues,
  });
  if (!(H > STAIR_MIN_HEIGHT)) return empty();

  // 1ª passada: bordas e comprimentos; erro de borda impede gerar qualquer peça.
  const lengths = r.components.map((c) => (c.kind === 'run' ? runLength(c) : 0));
  let edgeError = false;
  r.components.forEach((c, ci) => {
    if (c.kind === 'run' && c.risers.length !== 2) {
      edgeError = true;
      issues.push(makeRampIssue(r.id, 'ramp-run-edges', 'error', t(lang, 'egb_issue_ramp_flight_edges'), ci));
    }
  });
  const totalL = lengths.reduce((s, x) => s + x, 0);
  if (totalL <= 0) {
    issues.push(makeRampIssue(r.id, 'ramp-empty', 'error', t(lang, 'egb_issue_ramp_empty')));
    return empty();
  }
  if (edgeError) return empty();

  const flights: ResolvedRampFlight[] = [];
  const landings: ResolvedRampLanding[] = [];
  const slices: RampSlice[] = [];
  let z = baseZ;

  r.components.forEach((c, ci) => {
    const Li = lengths[ci]!;
    if (c.kind === 'run') {
      if (!(Li > EPS)) return;
      const rise = (H * Li) / totalL;
      const res = stairRunSteps(c, { baseZ: z, riserHeight: rise, lang });
      issues.push(...sketchIssues(r.id, ci, res.issues));
      if (res.treads.length > 0) {
        const first = res.risers[0]!;
        const last = res.risers[1]!;
        flights.push({
          componentIndex: ci,
          polygon: res.treads[0]!.polygon,
          start: mid(first.a, first.b),
          end: mid(last.a, last.b),
          startEdge: [first.a, first.b],
          endEdge: [last.a, last.b],
          width: dist(first.a, first.b),
          length: Li,
          z0: z,
          z1: z + rise,
          slope: rise / Li,
        });
      }
      // Fatias de ~10 cm: k linhas (≥ 2) viram k−1 degraus; o passo cresce acima do teto.
      const lines = Math.min(MAX_SLICES + 1, Math.max(2, Math.ceil(Li / RAMP_SLICE_LENGTH) + 1));
      const sliced = { ...c, risers: distributeRisers(c, lines) };
      const step = res.treads.length > 0 ? stairRunSteps(sliced, { baseZ: z, riserHeight: rise / (lines - 1), skipPairCheck: true, lang }) : null;
      if (step) {
        for (const t of step.treads) slices.push({ componentIndex: ci, kind: 'flight', polygon: t.polygon, z: t.z });
      }
      z += rise;
    } else {
      const lp = stairLandingPolygon({ boundary: c.boundary }, lang);
      issues.push(...sketchIssues(r.id, ci, lp.issues));
      if (lp.polygon) {
        const w = minWidth(lp.polygon);
        landings.push({ componentIndex: ci, polygon: lp.polygon, z, minDim: w });
        slices.push({ componentIndex: ci, kind: 'landing', polygon: lp.polygon, z });
      }
    }
  });

  const flightsLength = flights.reduce((s, f) => s + f.length, 0);
  const pathLength = flightsLength + landings.reduce((s, l) => s + l.minDim, 0);
  const slope = flightsLength > 0 ? H / flightsLength : 0;
  const polys: MultiPolygon[] = [...flights.map((f): MultiPolygon => [[f.polygon]]), ...landings.map((l): MultiPolygon => [[l.polygon]])];
  const footprint: MultiPolygon = polys.length ? union(...polys) : [];

  const rr: ResolvedRamp = {
    id: r.id,
    levelId: r.levelId,
    topLevelId: rampTopLevel(p, r)?.id ?? null,
    typeId: r.typeId,
    type,
    baseZ,
    topZ,
    rise: H,
    flights,
    landings,
    slices,
    flightsLength,
    pathLength,
    slope,
    footprint,
    issues,
  };
  rr.issues.push(...rampNormIssues(rr, lang));
  if (r.inputMode === 'slope' && r.slopeTarget !== null && Math.abs(rr.slope - r.slopeTarget) > 0.0005) {
    const pct = pctIn(lang);
    rr.issues.push(
      makeRampIssue(
        r.id,
        'ramp-slope-differs',
        'warning',
        t(lang, 'egb_issue_ramp_slope_diff', { slope: pct(rr.slope), target: pct(r.slopeTarget) }),
      ),
    );
  }
  for (let i = 0; i + 1 < r.components.length; i++) {
    if (r.components[i]!.kind === 'run' && r.components[i + 1]!.kind === 'run') {
      rr.issues.push(makeRampIssue(r.id, 'ramp-no-landing', 'warning', t(lang, 'egb_issue_ramp_no_landing'), i));
      break;
    }
  }
  return rr;
}

const pctIn = (lang: Lang) => (s: number): string => `${numLang(s * 100, 2, lang)} %`;

/** Uma rampa resolvida, memorizada por projeto (a resolução é ~100 ms por rampa; o projeto é imutável). */
export function resolveRampOne(p: Project, r: Ramp, lang: Lang = 'pt'): ResolvedRamp | null {
  return memoDoProjetoMotor(p, `rampa|${r.id}|${lang}`, () => resolveOne(p, r, lang));
}

const resolveList = (p: Project, list: Ramp[], lang: Lang): ResolvedRamp[] =>
  list.flatMap((r) => {
    const rr = resolveRampOne(p, r, lang);
    return rr ? [rr] : [];
  });

/** Todas as rampas do projeto, resolvidas (ordem de criação). */
export function resolveRamps(p: Project, lang: Lang = 'pt'): ResolvedRamp[] {
  return resolveList(p, ramps(p), lang);
}

/** Rampas cujo nível (`levelId`) é o dado. */
export function resolveRampsOnLevel(p: Project, levelId: Id, lang: Lang = 'pt'): ResolvedRamp[] {
  return resolveList(p, rampsOnLevel(p, levelId), lang);
}
