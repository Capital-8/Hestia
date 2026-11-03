import { sheetInnerBox, viewportBox, type Sheet } from '@hestia/model';
import type { SheetDrawList, SheetGroup } from '@hestia/render';
import { t, type Dict, type Lang } from '../../editor/i18n.ts';

/**
 * Captura de pontos (snap de pontos) na prancha, usada ao mover uma vista: pontas e meios dos traços desenhados dentro
 * das vistas, interseções entre um traço vertical e um horizontal, e os cantos, meios de lado e centro da moldura da
 * vista e da folha. É o *Snap to Points* do Revit reduzido ao que a prancha precisa. Tudo em mm de papel, com y para
 * cima; sem estado global e sem UI — quem move a vista é o chamador.
 */

export interface PaperPoint {
  x: number;
  y: number;
}

export type SnapPointKind =
  | 'extremidade'
  | 'intersecao'
  | 'meio'
  | 'canto_moldura'
  | 'meio_moldura'
  | 'centro_moldura'
  | 'canto_folha'
  | 'meio_folha'
  | 'centro_folha';

export interface SnapPoint {
  p: PaperPoint;
  kind: SnapPointKind;
  /** Rótulo humano do tipo, no idioma de `SnapPointsQuery.lang`. */
  label: string;
  /** Distância do cursor ao ponto, em mm de papel. */
  distance: number;
}

export interface SnapPointsQuery {
  drawList: SheetDrawList | null;
  sheet: Sheet;
  /** Cursor em mm de papel. */
  at: PaperPoint;
  /** Tolerância em mm de papel (o chamador usa 8/zoom). */
  tol: number;
  /** Idioma dos rótulos (ausente = português). */
  lang?: Lang;
}

/** Passo do arredondamento usado para deduplicar pontos (mm de papel). */
export const SNAP_POINT_STEP_MM = 0.05;

/** Máximo de segmentos analisados por grupo; o excedente é descartado em silêncio para não pesar no arraste. */
export const MAX_SNAP_SEGMENTS = 2000;

/** Máximo de pontos devolvidos; o corte é silencioso, depois de ordenar por distância. */
export const MAX_SNAP_POINTS = 400;

/** Comprimento mínimo de um segmento para gerar o ponto do meio (mm de papel). */
export const MIN_MID_SEGMENT_MM = 10;

const EPS = 1e-6;
const EPS_TIE = 1e-9;
const EPS_AXIS = 1e-6;

const LABELS: Record<SnapPointKind, keyof Dict> = {
  extremidade: 'cvs_snap_endpoint',
  intersecao: 'cvs_snap_intersection',
  meio: 'cvs_snap_midpoint',
  canto_moldura: 'cvs_snap_frame_corner',
  meio_moldura: 'cvs_snap_frame_mid',
  centro_moldura: 'cvs_snap_frame_center',
  canto_folha: 'cvs_snap_sheet_corner',
  meio_folha: 'cvs_snap_sheet_mid',
  centro_folha: 'cvs_snap_sheet_center',
};

/** Rótulo humano de cada tipo de ponto no idioma pedido (ausente = português). */
export const snapLabel = (kind: SnapPointKind, lang: Lang = 'pt'): string => t(lang, LABELS[kind]);

/**
 * Prioridade do empate de distância: índice menor vence. A geometria do desenho ganha da moldura (que passa por cima
 * dela) e a moldura ganha da folha; entre os cantos já desenhados, a interseção é a mais precisa.
 */
const PRIORITY: Record<SnapPointKind, number> = {
  intersecao: 0,
  extremidade: 1,
  meio: 2,
  centro_moldura: 3,
  meio_moldura: 4,
  canto_moldura: 5,
  centro_folha: 6,
  meio_folha: 7,
  canto_folha: 8,
};

/** Chave de deduplicação: coordenada arredondada a 0,05 mm, como em `sheetAlignTool`. */
const pointKey = (p: PaperPoint): string =>
  `${Math.round(p.x / SNAP_POINT_STEP_MM)}:${Math.round(p.y / SNAP_POINT_STEP_MM)}`;

const hypot = (a: PaperPoint, b: PaperPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

const finite = (p: PaperPoint): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

/**
 * Guarda o candidato se ele está na tolerância e, na mesma célula de 0,05 mm, só substitui quem tem prioridade menor.
 * A célula é pequena o bastante para os dois pontos serem o mesmo na tela.
 */
function consider(kept: Map<string, SnapPoint>, p: PaperPoint, kind: SnapPointKind, at: PaperPoint, tol: number, lang: Lang): void {
  if (!finite(p)) return;
  const distance = hypot(p, at);
  if (distance > tol + EPS) return;
  const key = pointKey(p);
  const prev = kept.get(key);
  if (prev && PRIORITY[prev.kind] <= PRIORITY[kind]) return;
  kept.set(key, { p, kind, label: snapLabel(kind, lang), distance });
}

/** Caixa com os quatro cantos, os quatro meios de lado e o centro, separados por tipo. */
function boxPoints(
  b: { x: number; y: number; w: number; h: number },
  corner: SnapPointKind,
  mid: SnapPointKind,
  centre: SnapPointKind,
  at: PaperPoint,
  tol: number,
  kept: Map<string, SnapPoint>,
  lang: Lang,
): void {
  if (!(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h))) return;
  const x0 = b.x;
  const y0 = b.y;
  const x1 = b.x + b.w;
  const y1 = b.y + b.h;
  const xm = (x0 + x1) / 2;
  const ym = (y0 + y1) / 2;
  consider(kept, { x: x0, y: y0 }, corner, at, tol, lang);
  consider(kept, { x: x1, y: y0 }, corner, at, tol, lang);
  consider(kept, { x: x1, y: y1 }, corner, at, tol, lang);
  consider(kept, { x: x0, y: y1 }, corner, at, tol, lang);
  consider(kept, { x: xm, y: y0 }, mid, at, tol, lang);
  consider(kept, { x: x1, y: ym }, mid, at, tol, lang);
  consider(kept, { x: xm, y: y1 }, mid, at, tol, lang);
  consider(kept, { x: x0, y: ym }, mid, at, tol, lang);
  consider(kept, { x: xm, y: ym }, centre, at, tol, lang);
}

/** Segmento vertical: x constante e o intervalo coberto em y. */
interface VSeg {
  x: number;
  y0: number;
  y1: number;
}

/** Segmento horizontal: y constante e o intervalo coberto em x. */
interface HSeg {
  y: number;
  x0: number;
  x1: number;
}

/**
 * Pontos da construção desenhada de um grupo: pontas, meios e interseções entre verticais e horizontais. Os segmentos
 * são separados por eixo para a interseção custar só os pares possíveis, e a contagem para no limite do grupo.
 */
function constructionPoints(group: SheetGroup, at: PaperPoint, tol: number, kept: Map<string, SnapPoint>, lang: Lang): void {
  const verticals: VSeg[] = [];
  const horizontals: HSeg[] = [];
  let used = 0;

  for (const path of group.paths) {
    if (used >= MAX_SNAP_SEGMENTS) break;
    const pts = path.pts;
    const n = pts.length;
    if (n < 2) continue;
    // Caminho fechado também tem o segmento de fechamento (da última ponta de volta à primeira).
    const segments = path.closed && n > 2 ? n : n - 1;
    for (let i = 0; i < segments; i++) {
      if (used >= MAX_SNAP_SEGMENTS) break;
      used++;
      const a = pts[i]!;
      const b = i + 1 < n ? pts[i + 1]! : pts[0]!;
      if (!finite(a) || !finite(b)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const vertical = Math.abs(dx) <= EPS_AXIS && Math.abs(dy) > EPS_AXIS;
      const horizontal = Math.abs(dy) <= EPS_AXIS && Math.abs(dx) > EPS_AXIS;
      // Pontas de todo segmento, mesmo inclinado, e o meio só quando o traço é longo o bastante para ter um.
      consider(kept, a, 'extremidade', at, tol, lang);
      consider(kept, b, 'extremidade', at, tol, lang);
      if (Math.hypot(dx, dy) >= MIN_MID_SEGMENT_MM) {
        consider(kept, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'meio', at, tol, lang);
      }
      if (vertical) verticals.push({ x: a.x, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) });
      else if (horizontal) horizontals.push({ y: a.y, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x) });
    }
  }

  // Só os pares que podem cair na tolerância do cursor: a interseção é exatamente (x da vertical, y da horizontal).
  for (const v of verticals) {
    if (Math.abs(v.x - at.x) > tol + EPS) continue;
    for (const h of horizontals) {
      if (Math.abs(h.y - at.y) > tol + EPS) continue;
      if (v.x < h.x0 - EPS || v.x > h.x1 + EPS) continue;
      if (h.y < v.y0 - EPS || h.y > v.y1 + EPS) continue;
      consider(kept, { x: v.x, y: h.y }, 'intersecao', at, tol, lang);
    }
  }
}

/**
 * Todos os pontos capturáveis perto do cursor na prancha, ordenados por distância. Deduplica por 0,05 mm mantendo o
 * tipo de maior prioridade e corta em {@link MAX_SNAP_POINTS} depois de ordenar.
 */
export function snapPointsAt(q: SnapPointsQuery): SnapPoint[] {
  const { at, tol } = q;
  const lang: Lang = q.lang ?? 'pt';
  if (!finite(at) || !Number.isFinite(tol) || tol < 0) return [];
  const kept = new Map<string, SnapPoint>();
  const groups = q.drawList?.groups ?? [];

  q.sheet.viewports.forEach((vp, i) => {
    // A ordem dos grupos é a das vistas; o último grupo é o mobiliário da folha (fora da captura).
    const group = i < groups.length - 1 ? groups[i] : undefined;
    if (group) constructionPoints(group, at, tol, kept, lang);
    boxPoints(viewportBox(vp), 'canto_moldura', 'meio_moldura', 'centro_moldura', at, tol, kept, lang);
  });

  const inner = sheetInnerBox(q.sheet);
  boxPoints(
    { x: inner.x0, y: inner.y0, w: inner.x1 - inner.x0, h: inner.y1 - inner.y0 },
    'canto_folha',
    'meio_folha',
    'centro_folha',
    at,
    tol,
    kept,
    lang,
  );

  const out = [...kept.values()].filter((p) => p.distance <= tol + EPS);
  out.sort((a, b) => {
    const d = a.distance - b.distance;
    if (Math.abs(d) > EPS_TIE) return d;
    return PRIORITY[a.kind] - PRIORITY[b.kind];
  });
  return out.length > MAX_SNAP_POINTS ? out.slice(0, MAX_SNAP_POINTS) : out;
}

/**
 * Ponto mais próximo do cursor dentro da tolerância, com a mesma prioridade de desempate de {@link snapPointsAt}. A
 * distância é recalculada a partir de `at`, porque a lista pode vir de outra consulta.
 */
export function nearestPoint(points: readonly SnapPoint[], at: PaperPoint, tol: number): SnapPoint | null {
  if (!finite(at) || !Number.isFinite(tol) || tol < 0) return null;
  let best: SnapPoint | null = null;
  let bestD = 0;
  for (const p of points) {
    if (!finite(p.p)) continue;
    const d = hypot(p.p, at);
    if (d > tol + EPS) continue;
    if (!best || d < bestD - EPS_TIE) {
      best = p;
      bestD = d;
    } else if (Math.abs(d - bestD) <= EPS_TIE && PRIORITY[p.kind] < PRIORITY[best.kind]) {
      best = p;
    }
  }
  return best;
}
