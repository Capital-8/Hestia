import { levelFrames, pointAt } from '@hestia/engine';
import { formatQuantity, openingHeight, openingTypeById, openingType, unitsOf, wallHeight, wallType, type ElementTag, type Id, type Project } from '@hestia/model';
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
  for (const f of levelFrames(p, levelId)) {
    if (hidden?.has(f.wall.id)) continue;
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
    out.push({ at: pointAt(f, t, f.sMid), text: code, papel: { escala: scale, fontMm: TAG_TEXT_MM, desvio: { mm: TAG_DY_MM, uy: -1 } } });
  }
  return out;
}

/** Rótulo de anotação (cota ou texto, decisão 0019): centrado em `at`, na fonte (mm de papel) e na rotação do papel. */
export const noteLabel = (at: Vec2, text: string, fontMm: number, escala: number, rotation: number): LabelOp => ({ at, text, rotation, center: true, papel: { escala, fontMm } });

/** Valor associativo de uma etiqueta: consultas ao tipo/anfitrião são resolvidas de novo a cada quadro do projeto. */
export function elementTagText(p: Project, tag: ElementTag): string {
  const e = p.elements[tag.hostId];
  if (!e) return '';
  const levelId = 'levelId' in e ? e.levelId : e.kind === 'door' || e.kind === 'window' ? (() => { const host = p.elements[e.hostId]; return host && 'levelId' in host ? host.levelId : null; })() : null;
  const type = e.kind === 'wall' ? p.wallTypes[e.typeId]
    : e.kind === 'door' || e.kind === 'window' ? openingTypeById(p, e.typeId)
    : e.kind === 'floor' ? p.floorTypes[e.typeId]
    : e.kind === 'slab' ? p.slabTypes[e.typeId]
    : e.kind === 'ceiling' ? p.ceilingTypes[e.typeId]
    : e.kind === 'roof' ? p.roofTypes[e.typeId]
    : e.kind === 'stair' ? p.stairTypes[e.typeId]
    : e.kind === 'ramp' ? p.rampTypes[e.typeId] : undefined;
  switch (tag.property) {
    case 'type': return (type && 'code' in type ? type.code : '') || (type && 'name' in type ? type.name : '') || e.kind;
    case 'name': return e.kind === 'room' ? e.name : type && 'name' in type ? type.name : e.kind;
    case 'mark': return 'mark' in e ? e.mark : '';
    case 'level': return p.levels.find((l) => l.id === levelId)?.name ?? '';
    case 'width':
      if (e.kind === 'door' || e.kind === 'window') return formatQuantity(unitsOf(p), 'length', openingType(p, e).width);
      if (e.kind === 'wall') return formatQuantity(unitsOf(p), 'smallLength', wallType(p, e).layers.reduce((s, l) => s + l.thickness, 0));
      return '';
    case 'height':
      if (e.kind === 'door' || e.kind === 'window') return formatQuantity(unitsOf(p), 'length', openingHeight(openingType(p, e), e));
      if (e.kind === 'wall') return formatQuantity(unitsOf(p), 'length', wallHeight(p, e));
      if (e.kind === 'room') return formatQuantity(unitsOf(p), 'length', e.ceilingHeight ?? p.defaults.wallHeight);
      return '';
  }
}

function tagAnchor(p: Project, tag: ElementTag): Vec2 | null {
  const e = p.elements[tag.hostId];
  if (!e) return null;
  if (e.kind === 'wall') return { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
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

/** Etiquetas persistentes da vista: rótulo e líder acompanham a posição do elemento associado. */
export function elementTagOps(p: Project, levelId: Id, paint: PlanPaint, scale: number): { labels: LabelOp[]; strokes: StrokeOp[] } {
  const labels: LabelOp[] = [];
  const strokes: StrokeOp[] = [];
  if (!paint.visible) return { labels, strokes };
  const color = paint.color ?? '#16181c';
  for (const tag of p.levels.find((l) => l.id === levelId)?.tags ?? []) {
    const text = elementTagText(p, tag);
    if (!text) continue;
    const anchor = tagAnchor(p, tag);
    if (tag.leader && anchor) strokes.push({ pts: [anchor, tag.at], closed: false, ...espessuraDeProjecao(paint), color, alpha: 1 });
    labels.push(noteLabel(tag.at, text, TAG_TEXT_MM, scale, tag.orientation === 'vertical' ? 90 : 0));
  }
  return { labels, strokes };
}
