import {
  add,
  arcFromSagitta,
  arcPointAt,
  arcSample,
  arcTangentAt,
  dist,
  equal,
  mid,
  mul,
  norm,
  perp,
  pointInMulti,
  SLOPE_GAP_PX,
  SLOPE_HALF_PX,
  sub,
  validateSketch,
  type SketchDraft,
  type SketchSeg,
  type Vec2,
} from '@hestia/geom';
import type { Id } from '@hestia/model';
import { addSegs } from './perimeterSession.ts';
import { roomAt } from './sketchPickRoom.ts';
import { segDistance, type SketchCtx } from './sketchPickFaceGeom.ts';
import type { PreviewItem } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/**
 * Geometria de clique do esboço, em metros (a ferramenta não vê a vista). Os valores em pixels viram metros pelo
 * `metersPerPixel` do ambiente.
 */

/** Tolerância de clique numa linha do esboço, em px de tela (como `sketchHitSeg`). */
export const SELECT_PX = 6;

/** Erro máximo da poligonal de um arco, em metros: arco liso na prévia e na captura. */
const CHORD_M = 0.005;
/** Afastamento do teste de lado da normal, em metros (como `outwardNormal` do render). */
const SIDE_M = 0.01;

/** Pontos da linha de `a` até `b`: a reta, ou o arco amostrado. */
export function chords(seg: SketchSeg, tol = CHORD_M): Vec2[] {
  const arc = seg.sag ? arcFromSagitta(seg.a, seg.b, seg.sag) : null;
  return arc ? arcSample(arc, 0, arc.length, 0, tol) : [seg.a, seg.b];
}

/** Uma linha de prévia por corda da linha (arcos saem em poligonal). */
export function segLines(seg: SketchSeg, style: { dashed?: boolean; halo?: boolean } = {}): PreviewItem[] {
  const pts = chords(seg);
  const out: PreviewItem[] = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push({ kind: 'line', a: pts[i]!, b: pts[i + 1]!, ...style });
  return out;
}

/** Cordas de todas as linhas do rascunho, para a captura perpendicular e de alinhamento. */
export function draftEdges(segs: SketchSeg[]): Array<{ a: Vec2; b: Vec2 }> {
  return segs.flatMap((s) => {
    const pts = chords(s);
    return pts.slice(0, -1).map((a, i) => ({ a, b: pts[i + 1]! }));
  });
}

/** Pontas das linhas: vértices para a captura de extremidade. */
export const draftPoints = (segs: SketchSeg[]): Vec2[] => segs.flatMap((s) => [s.a, s.b]);

/** Linha mais próxima de `p` dentro de `tolM` metros, ou null. */
export function hitSeg(segs: SketchSeg[], p: Vec2, tolM: number): string | null {
  let best: { id: string; d: number } | null = null;
  for (const s of segs) {
    const d = segDistance(s, p);
    if (d <= tolM && (!best || d < best.d)) best = { id: s.id, d };
  }
  return best?.id ?? null;
}

/** A linha já existe no rascunho (mesmas pontas, nos dois sentidos, e mesma flecha). */
export function hasSeg(segs: SketchSeg[], seg: SketchSeg): boolean {
  const sg = (x: number | undefined): number => x ?? 0;
  return segs.some(
    (s) =>
      (equal(s.a, seg.a) && equal(s.b, seg.b) && sg(s.sag) === sg(seg.sag)) ||
      (equal(s.a, seg.b) && equal(s.b, seg.a) && sg(s.sag) === -sg(seg.sag)),
  );
}

/** Vértices do retângulo de dois cantos opostos (prévia da caixa). */
export const boxRing = (a: Vec2, b: Vec2): Vec2[] => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];

const inBox = (p: Vec2, x0: number, y0: number, x1: number, y1: number): boolean =>
  p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;

/** Segmento toca o retângulo (inclusive na borda e no caso colinear), por recorte de Liang–Barsky. */
function segHitsBox(a: Vec2, b: Vec2, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - x0, x1 - a.x, a.y - y0, y1 - a.y];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i]! < 0) return false;
      continue;
    }
    const r = q[i]! / p[i]!;
    if (p[i]! < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * Ids das linhas que a janela de `a` a `b` pega. Da esquerda para a direita (janela), só as linhas inteiras dentro do
 * retângulo; da direita para a esquerda (cruzamento), as que o tocam. Arcos são testados pela poligonal que se desenha.
 */
export function boxSelection(segs: SketchSeg[], a: Vec2, b: Vec2): string[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const window = b.x >= a.x;
  return segs
    .filter((seg) => {
      const pts = chords(seg);
      if (window) return pts.every((p) => inBox(p, x0, y0, x1, y1));
      return pts.slice(0, -1).some((p, i) => segHitsBox(p, pts[i + 1]!, x0, y0, x1, y1));
    })
    .map((s) => s.id);
}

/** Ponto de referência de uma linha (meio da corda, ou o meio sobre o arco) e a tangente unitária de `a` para `b`. */
function edgeFrame(seg: SketchSeg): { at: Vec2; t: Vec2 } {
  const arc = seg.sag ? arcFromSagitta(seg.a, seg.b, seg.sag) : null;
  if (!arc) return { at: mid(seg.a, seg.b), t: norm(sub(seg.b, seg.a)) };
  return { at: arcPointAt(arc, arc.length / 2), t: arcTangentAt(arc, arc.length / 2) };
}

/** Normal unitária da aresta voltada para fora do laço. */
function outwardNormal(at: Vec2, t: Vec2, ring: Vec2[]): Vec2 {
  const n = perp(t);
  const probe = add(at, mul(n, SIDE_M));
  return pointInMulti(probe, [[ring]]) ? mul(n, -1) : n;
}

/**
 * Aresta do laço externo cujo triângulo de inclinação está sob `p`, ou null. O centro do triângulo fica `SLOPE_GAP_PX`
 * para fora da aresta (em metros: `GAP × metersPerPixel`); o raio é o do círculo que contém o triângulo.
 */
export function triangleHit(draft: SketchDraft, p: Vec2, mpp: number): string | null {
  const outer = validateSketch(draft.segs).loops.find((l) => l.role === 'outer');
  if (!outer) return null;
  const byId = new Map(draft.segs.map((s) => [s.id, s] as const));
  let best: { id: string; d: number } | null = null;
  for (const ls of outer.segs) {
    const seg = byId.get(ls.id) ?? ls;
    if (dist(seg.a, seg.b) < 1e-9) continue;
    const { at, t } = edgeFrame(seg);
    const c = add(at, mul(outwardNormal(at, t, outer.ring), SLOPE_GAP_PX * mpp));
    const d = dist(p, c);
    if (d <= SLOPE_HALF_PX * Math.SQRT2 * mpp && (!best || d < best.d)) best = { id: seg.id, d };
  }
  return best?.id ?? null;
}

/** Dica da forma "Por ambiente" na barra de status. */
export const roomHint = (lang: Lang = 'pt'): string => translate(lang, 'tl_hint_perim_room');
export const ROOM_HINT = roomHint();

/** Prévia do ambiente sob o cursor (contorno tracejado e o nome). Fora de ambiente, a prévia fica vazia. */
export function roomHover(ctx: SketchCtx, at: Vec2, lang: Lang = 'pt'): { items: PreviewItem[]; say: string } {
  const r = roomAt(ctx, at);
  if (!r) return { items: [], say: translate(lang, 'tl_msg_room_click_empty') };
  const name = r.name || translate(lang, 'tl_label_room');
  const items: PreviewItem[] = [...r.segs.flatMap((s) => segLines(s, { dashed: true, halo: true })), { kind: 'label', at: r.point, text: name }];
  return { items, say: translate(lang, 'tl_msg_room_hover', { name }) };
}

/**
 * Clique em "Por ambiente": adiciona o contorno do ambiente ao rascunho (sem repetir as linhas que já estão nele) e
 * devolve o id do ambiente, que o forro usa em "Acompanhar o ambiente".
 */
export function roomClick(ctx: SketchCtx, at: Vec2, d: SketchDraft, lang: Lang = 'pt'): { draft: SketchDraft; roomId?: Id; say: string } {
  const r = roomAt(ctx, at);
  if (!r) return { draft: d, say: translate(lang, 'tl_msg_room_click_empty') };
  const name = r.name || translate(lang, 'tl_label_room');
  const fresh = r.segs.filter((s) => !hasSeg(d.segs, s));
  if (fresh.length === 0) return { draft: d, roomId: r.roomId, say: translate(lang, 'tl_msg_room_outline_exists', { name }) };
  return { draft: addSegs(d, fresh), roomId: r.roomId, say: translate(lang, 'tl_msg_room_outline_added', { name }) };
}
