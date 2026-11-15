import { closestOnSegment, dist, norm, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall, toLocal, wallTopFacesCached, type TopPoint } from '@hestia/engine';
import { coreSpan } from '@hestia/model';
import { t as translate } from './i18n.ts';
import type { AlignFeature, AlignKind, AlignQuery } from './alignFeatures.ts';
import type { AlignPrefer } from './types.ts';

const degenerate = (a: Vec2, b: Vec2): boolean => dist(a, b) < 1e-9;

/** Tolerância (m) para considerar que o topo coincide com a base em planta (a mesma da captura `topFace`). */
const TOP_BASE_TOL = 0.005;

const sameEdgeXY = (a: readonly TopPoint[], b: readonly TopPoint[]): boolean =>
  a.length === b.length && a.every((q, i) => Math.abs(q.x - b[i]!.x) < 1e-4 && Math.abs(q.y - b[i]!.y) < 1e-4);

/** Ponto da polilinha mais próximo de `at`, com a direção do trecho (tangente local; no arco, a tangente da amostra). */
function nearestOnPolyline(at: Vec2, pts: readonly Vec2[]): { p: Vec2; d: Vec2; distance: number } | null {
  let best: { p: Vec2; d: Vec2; distance: number } | null = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    if (degenerate(a, b)) continue;
    const p = closestOnSegment(at, a, b);
    const distance = dist(at, p);
    if (!best || distance < best.distance) best = { p, d: sub(b, a), distance };
  }
  return best;
}

/**
 * Feições da FACE SUPERIOR das paredes do nível (T-D): aresta superior externa e interna (`faceSuperior`) e do núcleo
 * (`nucleoSuperior`), na posição em planta do TOPO (`wallTopFacesCached`; em parede inclinada, deslocada H·tanθ). A
 * feição se move como a da base (translação da parede). Quando o topo coincide com uma linha da base (parede vertical),
 * funde com ela: não duplica e devolve em `drop` a chave da feição da base que o rótulo "Face superior" substitui.
 */
export function topFaceFeatures(q: AlignQuery, prefer: AlignPrefer, tolPx: number): { features: AlignFeature[]; drop: Set<string> } {
  const lang = q.lang ?? 'pt';
  const tol = tolPx * q.metersPerPixel;
  const out: AlignFeature[] = [];
  const drop = new Set<string>();
  for (const tf of wallTopFacesCached(q.project, q.levelId)) {
    if (q.hidden?.has(tf.wallId)) continue;
    const f = frameOfWall(q.project, tf.wallId);
    if (!f) continue;
    const core = coreSpan(f.type);
    const baseS: Array<{ key: string; s: number }> = [
      { key: `${f.wall.id}:face:hi`, s: f.sHi },
      { key: `${f.wall.id}:face:lo`, s: f.sLo },
      { key: `${f.wall.id}:nucleo:a`, s: f.sign * (f.extOffset - core.from) },
      { key: `${f.wall.id}:nucleo:b`, s: f.sign * (f.extOffset - core.to) },
    ];
    const edges: Array<{ id: string; kind: AlignKind; labelKey: string; pts: TopPoint[] }> = [
      { id: 'ext', kind: 'faceSuperior', labelKey: 'tl_snap_top_edge_ext', pts: tf.exterior },
      { id: 'int', kind: 'faceSuperior', labelKey: 'tl_snap_top_edge_int', pts: tf.interior },
      { id: 'nucleo:ext', kind: 'nucleoSuperior', labelKey: 'tl_snap_top_edge_core', pts: tf.coreExterior },
      { id: 'nucleo:int', kind: 'nucleoSuperior', labelKey: 'tl_snap_top_edge_core', pts: tf.coreInterior },
    ];
    const mine: AlignFeature[] = [];
    for (const e of edges) {
      if (e.kind === 'nucleoSuperior' && (sameEdgeXY(e.pts, tf.exterior) || sameEdgeXY(e.pts, tf.interior))) continue;
      const hit = nearestOnPolyline(q.at, e.pts);
      if (!hit || hit.distance > tol) continue;
      const fused = baseS.find((c) => e.pts.every((pt) => Math.abs(toLocal(f, pt).s - c.s) <= TOP_BASE_TOL));
      let label = translate(lang, e.labelKey as 'tl_snap_top_edge_ext');
      if (fused) {
        if (!q.topLabel) continue;
        drop.add(fused.key);
        label = translate(lang, 'tl_snap_top_face');
      }
      const straight = f.wall.sag === 0;
      mine.push({
        key: `${f.wall.id}:top:${e.id}`,
        kind: e.kind,
        label,
        ownerId: f.wall.id,
        line: { p: hit.p, d: norm(hit.d) },
        move: { policy: 'transladar', target: 'parede', id: f.wall.id },
        distance: hit.distance,
        ...(straight ? { seg: { a: { x: e.pts[0]!.x, y: e.pts[0]!.y }, b: { x: e.pts[e.pts.length - 1]!.x, y: e.pts[e.pts.length - 1]!.y } } } : {}),
      });
    }
    const prefKind: AlignKind | null = prefer === 'eixos' ? null : prefer === 'nucleo' ? 'nucleoSuperior' : 'faceSuperior';
    const pref = prefKind ? mine.filter((c) => c.kind === prefKind) : [];
    out.push(...(pref.length ? pref : mine));
  }
  return { features: out, drop };
}

