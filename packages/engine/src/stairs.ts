import { asMulti, dist, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import {
  STAIR_MIN_HEIGHT,
  stairBaseZ,
  stairs,
  stairsOnLevel,
  stairTopLevel,
  stairTopZ,
  type Id,
  type Project,
  type Stair,
  type StairType,
} from '@hestia/model';
import { t, type Lang } from './i18nMessages.ts';
import { makeStairIssue, spiralNormIssues, stairNormIssues, type StairIssueItem } from './stairIssues.ts';
import { DEFAULT_STAIR_NORMS } from './stairNorms.ts';
import { orderRisers, stairLandingPolygon, stairRunSteps, trimRisers, type StairRunSketch } from './stairSketch.ts';
import { isSpiralRun, spiralParamsOf } from './stairSpiral.ts';
import { memoDoProjetoMotor } from './memoProjeto.ts';

/** Degrau (kind 'tread', index 1..N−1 no lance) ou patamar (kind 'landing', index sequencial na escada, a partir de 1). */
export interface ResolvedStairStep {
  componentIndex: number;
  kind: 'tread' | 'landing';
  index: number;
  polygon: Ring;
  /** Cota absoluta do topo. */
  z: number;
}

/**
 * Espelho de um lance. `index` é a posição dele no croqui do lance dono (`componentIndex`). O nº global do espelho na
 * escada (1..N, cada linha de emenda contada uma vez) vale z0 = base + (nº − 1)·h. O espelho de emenda entre dois lances
 * sem patamar pertence ao lance anterior: o lance seguinte começa no 2º espelho do seu croqui. z0/z1 são cotas absolutas.
 */
export interface ResolvedStairRiser {
  componentIndex: number;
  index: number;
  a: Vec2;
  b: Vec2;
  points: Vec2[];
  z0: number;
  z1: number;
}

/** Caracol do croqui da escada (decisão 0014 §2): centro e raios do primeiro lance com parâmetros `spiral`. */
export interface ResolvedSpiral {
  /** Índice do componente (lance) que é o caracol. */
  componentIndex: number;
  center: Vec2;
  rInner: number;
  rOuter: number;
}

/** Escada resolvida (decisão 0011 §4): cotas, altura real do espelho, degraus, espelhos, pegada e avisos. */
export interface ResolvedStair {
  id: Id;
  levelId: Id;
  /** Nível de topo efetivo (explícito ou o imediatamente acima); null sem nível acima. */
  topLevelId: Id | null;
  typeId: Id;
  type: StairType;
  baseZ: number;
  topZ: number;
  /** N: nº de linhas de espelho distintas de todos os lances (linha de emenda conta uma vez; inclui lances com erro). */
  riserCount: number;
  /** Altura real h = H ÷ N; 0 sem espelhos ou sem altura. */
  riserHeight: number;
  steps: ResolvedStairStep[];
  risers: ResolvedStairRiser[];
  /** União de degraus e patamares, em planta. */
  footprint: MultiPolygon;
  /** Erros de croqui e de geometria, mais os avisos de norma. */
  issues: StairIssueItem[];
  /**
   * Caixa do croqui em planta (mesmo sem degraus, ex.: topo não acima da base). Mantém a escada visível e selecionável
   * na planta e no 3D quando o motor não gera geometria.
   */
  sketchBounds?: { minX: number; minY: number; maxX: number; maxY: number };
  /** Caracol (decisão 0014): presente quando um lance tem os parâmetros `spiral`; ausente nos demais. */
  spiral?: ResolvedSpiral;
}

const sketchIssues = (s: Stair, ci: number, list: Array<{ code: string; severity: 'error' | 'warning'; message: string }>): StairIssueItem[] =>
  list.map((i) => makeStairIssue(s.id, i.code, i.severity, i.message, ci));

/** Pontas de dois espelhos "os mesmos" (decisão 0011 §1; tolerância de 1 mm). */
const SHARE_TOL = 1e-3;

/** Pontas (aparadas) do espelho de subida `first` ou `last` do lance. Null sem espelhos. */
function endRiser(run: StairRunSketch, end: 'first' | 'last'): { a: Vec2; b: Vec2 } | null {
  const order = orderRisers(run);
  if (order.length === 0) return null;
  const g = trimRisers(run)[end === 'first' ? order[0]! : order[order.length - 1]!]!;
  return { a: g.a, b: g.b };
}

/**
 * Lances consecutivos sem patamar: o último espelho do anterior é o primeiro deste (mesmas pontas, nas duas ordens).
 * Winder: o gerador compartilha uma linha de espelho entre cada par de lances (decisão 0011 §5).
 */
function sharesRiser(prev: StairRunSketch, next: StairRunSketch): boolean {
  const a = endRiser(prev, 'last');
  const b = endRiser(next, 'first');
  if (!a || !b) return false;
  const same = (p: Vec2, q: Vec2): boolean => dist(p, q) <= SHARE_TOL;
  return (same(a.a, b.a) && same(a.b, b.b)) || (same(a.a, b.b) && same(a.b, b.a));
}

/** Resolve uma escada; null se o tipo não existe (o validador do modelo já aponta `stair-type-missing`). */
function resolveOne(p: Project, s: Stair, lang: Lang): ResolvedStair | null {
  const type = p.stairTypes[s.typeId];
  if (!type) return null;
  const baseZ = stairBaseZ(p, s);
  const topZ = stairTopZ(p, s);
  const H = topZ - baseZ;
  // `shared[ci]`: o lance ci começa com o espelho de emenda do lance anterior (ci−1), que conta uma vez só.
  const shared = s.components.map((c, ci) => {
    const prev = s.components[ci - 1];
    return c.kind === 'run' && prev?.kind === 'run' && sharesRiser(prev, c);
  });
  const N = s.components.reduce((n, c, ci) => n + (c.kind === 'run' ? c.risers.length - (shared[ci] ? 1 : 0) : 0), 0);
  // Topo a STAIR_MIN_HEIGHT ou menos acima da base: escada inválida (`stair-top-not-above`), sem peça nenhuma.
  const h = N > 0 && H > STAIR_MIN_HEIGHT ? H / N : 0;
  const issues: StairIssueItem[] = [];
  const steps: ResolvedStairStep[] = [];
  const risers: ResolvedStairRiser[] = [];
  if (N === 0) issues.push(makeStairIssue(s.id, 'stair-empty', 'error', t(lang, 'egb_issue_stair_empty')));
  // `next` = nº de linhas de espelho distintas até o último espelho já contado (cota do próximo patamar).
  let next = 0;
  let landingCount = 0;
  s.components.forEach((c, ci) => {
    if (c.kind === 'run') {
      // g0 = nº de espelhos distintos antes do 1º espelho do lance; com emenda, o 1º espelho é o último do anterior.
      const g0 = shared[ci] ? next - 1 : next;
      next = g0 + c.risers.length;
      if (h <= 0) return;
      const z = baseZ + g0 * h;
      // Erro de croqui: o lance não gera degraus, mas conta nos espelhos e os demais componentes continuam.
      const res = stairRunSteps(c, { baseZ: z, riserHeight: h, lang });
      issues.push(...sketchIssues(s, ci, res.issues));
      for (const t of res.treads) steps.push({ componentIndex: ci, kind: 'tread', index: t.index, polygon: t.polygon, z: t.z });
      for (const r of res.risers) {
        if (shared[ci] && r.index === 1) continue;
        risers.push({ componentIndex: ci, index: r.index, a: r.a, b: r.b, points: r.points, z0: r.z0, z1: r.z1 });
      }
    } else {
      // Escada sem altura não gera patamar (ele alimentaria o footprint e o furo derivado).
      if (h <= 0) return;
      const lp = stairLandingPolygon({ boundary: c.boundary }, lang);
      issues.push(...sketchIssues(s, ci, lp.issues));
      if (lp.polygon) {
        landingCount++;
        steps.push({ componentIndex: ci, kind: 'landing', index: landingCount, polygon: lp.polygon, z: baseZ + next * h });
      }
    }
  });
  const footprint: MultiPolygon = steps.length ? union(...steps.map((st) => asMulti(st.polygon))) : [];
  // Caixa do croqui: serve de fallback visual quando não há degraus (topo <= base), para a escada não sumir da tela.
  const pts: Vec2[] = [];
  for (const c of s.components) {
    const curves = c.kind === 'landing' ? c.boundary : [...c.boundaryLeft, ...c.boundaryRight, ...c.risers, ...c.path];
    for (const k of curves) pts.push(k.a, k.b);
  }
  const sketchBounds = pts.length > 0
    ? { minX: Math.min(...pts.map((q) => q.x)), minY: Math.min(...pts.map((q) => q.y)), maxX: Math.max(...pts.map((q) => q.x)), maxY: Math.max(...pts.map((q) => q.y)) }
    : undefined;
  const rs: ResolvedStair = {
    id: s.id,
    levelId: s.levelId,
    topLevelId: stairTopLevel(p, s)?.id ?? null,
    typeId: s.typeId,
    type,
    baseZ,
    topZ,
    riserCount: N,
    riserHeight: h,
    steps,
    risers,
    footprint,
    issues,
    ...(sketchBounds ? { sketchBounds } : {}),
  };
  rs.issues.push(...stairNormIssues(rs, DEFAULT_STAIR_NORMS, lang));
  const spiralIndex = s.components.findIndex((c) => c.kind === 'run' && spiralParamsOf(c) !== undefined);
  const sp = spiralIndex >= 0 ? spiralParamsOf(s.components[spiralIndex]!) : undefined;
  if (sp) rs.spiral = { componentIndex: spiralIndex, center: sp.center, rInner: sp.rInner, rOuter: sp.rOuter };
  s.components.forEach((c, ci) => {
    if (c.kind !== 'run' || !isSpiralRun(c)) return;
    const sp = spiralParamsOf(c);
    rs.issues.push(...spiralNormIssues(rs, ci, sp && { sweep: sp.sweep, rInner: sp.rInner, rOuter: sp.rOuter, risers: c.risers.length }, DEFAULT_STAIR_NORMS, lang));
  });
  return rs;
}

/** Uma escada resolvida, memorizada por projeto (o projeto é imutável: cada edição cria outro objeto). */
export function resolveStairOne(p: Project, s: Stair, lang: Lang = 'pt'): ResolvedStair | null {
  return memoDoProjetoMotor(p, `escada|${s.id}|${lang}`, () => resolveOne(p, s, lang));
}

const resolveList = (p: Project, list: Stair[], lang: Lang): ResolvedStair[] =>
  list.flatMap((s) => {
    const r = resolveStairOne(p, s, lang);
    return r ? [r] : [];
  });

/** Todas as escadas do projeto, resolvidas (ordem de criação). */
export function resolveStairs(p: Project, lang: Lang = 'pt'): ResolvedStair[] {
  return resolveList(p, stairs(p), lang);
}

/** Escadas cujo nível (`levelId`) é o dado. */
export function resolveStairsOnLevel(p: Project, levelId: Id, lang: Lang = 'pt'): ResolvedStair[] {
  return resolveList(p, stairsOnLevel(p, levelId), lang);
}
