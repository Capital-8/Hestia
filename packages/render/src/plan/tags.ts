import { levelFrames, pointAt } from '@hestia/engine';
import { elementTagText, elementTagValues, openingTypeById, tagFamilyFor, wallType, type ElementTag, type Id, type Project } from '@hestia/model';
export { elementTagText, elementTagValues };
import type { Vec2 } from '@hestia/geom';
import { aberturasDaParede } from './resolucao.ts';
import type { LabelOp, StrokeOp } from './types.ts';
import { espessuraDeProjecao, type PlanPaint } from './style.ts';

/** Medidas em mm de papel (anotação, decisão 0019). */
const TAG_TEXT_MM = 1.6;
const CHAR_W_MM = 1;
const PAD_MM = 0.9;
/** Deslocamento vertical da etiqueta em mm de papel (positivo sobe). */
const TAG_DY_MM = 1.2;

/** Maior trecho livre de [lo, hi] depois de tirar os intervalos bloqueados. */
function longestFree(lo: number, hi: number, blocked: Array<[number, number]>): [number, number] | null {
  const sorted = [...blocked].sort((x, y) => x[0] - y[0]);
  let best: [number, number] | null = null;
  let cursor = lo;
  const consider = (a: number, b: number): void => {
    if (b - a > 0 && (!best || b - a > best[1] - best[0])) best = [a, b];
  };
  for (const [s, e] of sorted) {
    if (s > cursor) consider(cursor, Math.min(s, hi));
    cursor = Math.max(cursor, e);
  }
  if (hi > cursor) consider(cursor, hi);
  return best;
}

/**
 * Etiqueta com o código do tipo em cada parede do nível (G4). A etiqueta vai ao ponto médio do maior trecho livre
 * do eixo, deslocado ao longo da parede para não cair sobre um vão (com folga do tamanho do texto). A fonte segue
 * a categoria 'anotação' (visibilidade e tamanho em mm de papel).
 */
export function wallTagLabels(p: Project, levelId: Id, paint: PlanPaint, scale: number, hidden?: ReadonlySet<Id>): LabelOp[] {
  const out: LabelOp[] = [];
  if (!paint.visible) return out;
  const mPerMm = scale / 1000;
  const halfPad = PAD_MM * mPerMm;
  const chW = CHAR_W_MM * mPerMm;
  const taggedWalls = new Set((p.levels.find((l) => l.id === levelId)?.tags ?? []).map((tg) => tg.hostId));
  for (const f of levelFrames(p, levelId)) {
    if (hidden?.has(f.wall.id) || taggedWalls.has(f.wall.id)) continue;
    const code = wallType(p, f.wall).code;
    if (!code) continue;
    const halfText = (code.length * chW) / 2 + halfPad;
    const blocked = aberturasDaParede(p, f.wall.id).map((o): [number, number] => {
      const half = (openingTypeById(p, o.typeId)?.width ?? 0) / 2;
      return [o.offset - half - halfText, o.offset + half + halfText];
    });
    const span = longestFree(0, f.length, blocked);
    if (!span) continue;
    const t = (span[0] + span[1]) / 2;
    out.push({ at: pointAt(f, t, f.sMid), text: code, auto: true, papel: { escala: scale, fontMm: TAG_TEXT_MM, desvio: { mm: TAG_DY_MM, uy: -1 } } });
  }
  return out;
}

/** Rótulo de anotação (cota ou texto, decisão 0019): centrado em `at`, na fonte (mm de papel) e na rotação do papel. */
export const noteLabel = (at: Vec2, text: string, fontMm: number, escala: number, rotation: number): LabelOp => ({ at, text, rotation, center: true, papel: { escala, fontMm } });

function tagAnchor(p: Project, tag: ElementTag): Vec2 | null {
  const e = p.elements[tag.hostId];
  if (!e) return null;
  if (e.kind === 'wall') {
    if (Math.abs(e.sag) > 1e-4) {
      const f = levelFrames(p, e.levelId).find((x) => x.wall.id === e.id);
      if (f) return pointAt(f, f.length / 2, f.sMid);
    }
    return { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
  }
  if (e.kind === 'door' || e.kind === 'window') {
    const host = p.elements[e.hostId];
    if (host?.kind === 'wall') {
      const f = levelFrames(p, host.levelId).find((x) => x.wall.id === host.id);
      if (f) return pointAt(f, e.offset, f.sMid);
    }
  }
  if (e.kind === 'room') return e.point;
  if ('boundary' in e && e.boundary.length) return { x: e.boundary.reduce((s, q) => s + q.x, 0) / e.boundary.length, y: e.boundary.reduce((s, q) => s + q.y, 0) / e.boundary.length };
  return null;
}

export interface TagOpsLook {
  selection?: readonly Id[];
  hover?: Id | null;
  selectColor?: string;
}

/** Etiquetas persistentes da vista: rótulo e líder acompanham a posição do elemento associado, com destaque na seleção. */
export function elementTagOps(
  p: Project,
  levelId: Id,
  paint: PlanPaint,
  scale: number,
  look: TagOpsLook = {},
): { labels: LabelOp[]; strokes: StrokeOp[] } {
  const labels: LabelOp[] = [];
  const strokes: StrokeOp[] = [];
  if (!paint.visible) return { labels, strokes };
  const baseColor = paint.color ?? '#16181c';
  const selectColor = look.selectColor ?? '#2563eb';
  const selected = new Set(look.selection ?? []);
  const mPerMm = scale / 1000;
  const elbowMax = 3.5 * mPerMm;
  for (const tag of p.levels.find((l) => l.id === levelId)?.tags ?? []) {
    const text = elementTagText(p, tag);
    if (!text) continue;
    const isSel = selected.has(tag.id);
    const isHover = !isSel && look.hover === tag.id;
    const color = isSel || isHover ? selectColor : baseColor;
    const anchor = tagAnchor(p, tag);
    const family = tagFamilyFor(p.settings, tag);
    if (tag.leader && anchor) {
      const dx = tag.at.x - anchor.x;
      const elbow = Math.min(elbowMax, Math.abs(dx) * 0.45);
      const pts = elbow > 0.04
        ? [anchor, { x: tag.at.x - Math.sign(dx) * elbow, y: tag.at.y }, tag.at]
        : [anchor, tag.at];
      strokes.push({ pts, closed: false, ...espessuraDeProjecao(paint), color, alpha: 1 });
    }
    if (isSel || isHover) {
      const hw = Math.max(family.textMm * 1.6, (text.length * family.textMm * 0.65) / 2 + 1.8) * mPerMm;
      const hh = Math.max(family.textMm * 1.05, family.textMm * 0.72 + 1.2) * mPerMm;
      const vert = tag.orientation === 'vertical';
      const rx = vert ? hh : hw;
      const ry = vert ? hw : hh;
      strokes.push({
        pts: [
          { x: tag.at.x - rx, y: tag.at.y - ry },
          { x: tag.at.x + rx, y: tag.at.y - ry },
          { x: tag.at.x + rx, y: tag.at.y + ry },
          { x: tag.at.x - rx, y: tag.at.y + ry },
        ],
        closed: true,
        widthPx: isSel ? 2.2 : 1.2,
        color: selectColor,
        alpha: isSel ? 1 : 0.65,
        dash: isSel ? undefined : [4, 3],
      });
    }
    const label = noteLabel(tag.at, text, family.textMm, scale, tag.orientation === 'vertical' ? 90 : 0);
    const styled = isSel || isHover ? { ...label, color: selectColor, selected: isSel } : label;
    labels.push(family.shape === 'none' ? styled : { ...styled, align: 'center', badge: { shape: family.shape, fill: family.fill === true } });
  }
  return { labels, strokes };
}
