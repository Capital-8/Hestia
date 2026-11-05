import { pointInPolygon, type Polygon, type Vec2 } from '@hestia/geom';
import type { ResolvedRoom } from '@hestia/engine';
import { areaLegendRows, areaTableRows, referenceDiagonals, resolveRooms, roomReferencePoint, schemeColor, schemeOf } from '@hestia/engine';
import { categoryById, unitsOf, type AreaPlan, type Id, type Project, type Room, type RoomTag } from '@hestia/model';
import { fmtArea, type FloorOps } from './floors.ts';
import type { PlanPaint } from './style.ts';
import type { PlanTheme } from './types.ts';
import { t, type Lang } from '../i18n.ts';

/** Medidas de papel (mm) da etiqueta e das linhas de referência. */
const NAME_MM = 3.5;
const INFO_MM = 2.5;
const TAG_PAD_MM = 0.9;
const TAG_GAP_MM = 0.8;
const REF_MM = 0.13;
const REF_COLOR = '#4b5563';
const LEADER_MM = 0.13;
const SHOULDER_MM = 4;
const LEGEND_W_MM = 62;
const LEGEND_ROW_MM = 5.2;
const TABLE_W_MM = 88;
const TABLE_ROW_MM = 4.6;
const TABLE_FONT_MM = 2.0;
/** Folga entre a caixa do rótulo automático e o perímetro do ambiente (mm de papel). */
const LABEL_MARGIN_MM = 1.2;
/** Folga mínima entre dois rótulos automáticos (mm de papel). */
const LABEL_GAP_MM = 1.0;

const empty = (): FloorOps => ({ fills: [], strokes: [], labels: [] });
const mm = (v: number, scale: number): number => (v * scale) / 1000;
/** Número com casas fixas e o separador decimal do projeto (`1,23` no PT, `1.23` no EN). */
const fmt = (v: number, d: number, decimalSymbol: ',' | '.'): string => (decimalSymbol === ',' ? v.toFixed(d).replace('.', ',') : v.toFixed(d));

/** Ponto de referência do ambiente: override do modelo ou o centroide/polo do polígono resolvido. */
export function referenceAt(room: Room, resolved: ResolvedRoom): Vec2 {
  if (room.referencePoint) return room.referencePoint;
  return (resolved.polygon && roomReferencePoint(resolved.polygon)) || resolved.point;
}

/** Diagonais de referência do ambiente, recortadas pelo polígono. */
export function referenceSegments(room: Room, resolved: ResolvedRoom): Array<{ a: Vec2; b: Vec2 }> {
  if (!resolved.polygon) return [];
  return referenceDiagonals(resolved.polygon, referenceAt(room, resolved));
}

/** Linhas de texto da etiqueta: nome na primeira, o resto na segunda (ou o que os campos pedirem). */
export function roomTagLines(p: Project, room: Room, r: ResolvedRoom, tag: RoomTag): string[] {
  const head: string[] = [];
  const tail: string[] = [];
  const dec = unitsOf(p).decimalSymbol;
  for (const f of tag.fields) {
    switch (f) {
      case 'name':
        if (room.name) head.push(room.name);
        break;
      case 'number':
        if (room.number) tail.push(room.number);
        break;
      case 'area':
        tail.push(fmtArea(unitsOf(p), r.area, 2));
        break;
      case 'category': {
        const c = categoryById(p, room.categoryId);
        if (c) head.push(c.name);
        break;
      }
      case 'level':
        tail.push(p.levels.find((l) => l.id === room.levelId)?.name ?? '');
        break;
      case 'perimeter':
        tail.push(`${fmt(r.perimeter, 2, dec)} m`);
        break;
      case 'volume':
        tail.push(`${fmt(r.volume, 3, dec)} m³`);
        break;
      case 'custom':
        if (tag.custom) head.push(tag.custom);
        break;
    }
  }
  const a = head.filter(Boolean).join(' · ');
  const b = tail.filter(Boolean).join(' · ');
  return [a, b].filter(Boolean);
}

/** Caixa do bloco de texto em metros (para o halo e para o posicionamento automático). */
export function tagBoxModel(lines: readonly string[], scale: number): { w: number; h: number } {
  const wMm = Math.max(8, ...lines.map((l, i) => l.length * (i === 0 ? NAME_MM : INFO_MM) * 0.6)) + 2 * TAG_PAD_MM;
  const hMm = (lines.length > 1 ? NAME_MM + TAG_GAP_MM + INFO_MM : NAME_MM) + 2 * TAG_PAD_MM;
  return { w: mm(wMm, scale), h: mm(hMm, scale) };
}

/** Retângulo do halo (coordenadas de modelo, eixo-alinhado). */
function tagMaskRect(at: Vec2, box: { w: number; h: number }): Vec2[] {
  const x0 = at.x - box.w / 2;
  const x1 = at.x + box.w / 2;
  const y0 = at.y - box.h / 2;
  const y1 = at.y + box.h / 2;
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}

/** Retângulo eixo-alinhado, no modelo (colisão entre rótulos). */
interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Caixa da etiqueta em volta do ponto, com folga opcional (modelo). */
const rectAt = (at: Vec2, box: { w: number; h: number }, pad = 0): Rect => ({
  x0: at.x - box.w / 2 - pad,
  y0: at.y - box.h / 2 - pad,
  x1: at.x + box.w / 2 + pad,
  y1: at.y + box.h / 2 + pad,
});

const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * A caixa cabe inteira no ambiente? Os quatro cantos, o centro e o meio das bordas passam por `pointInPolygon`
 * (o polígono pode ter furos); as bordas pegam reentrâncias em L/U que passam entre dois cantos.
 */
function boxInPolygon(at: Vec2, box: { w: number; h: number }, polygon: Polygon): boolean {
  const hw = box.w / 2;
  const hh = box.h / 2;
  const samples: Vec2[] = [
    { x: at.x - hw, y: at.y - hh },
    { x: at.x + hw, y: at.y - hh },
    { x: at.x + hw, y: at.y + hh },
    { x: at.x - hw, y: at.y + hh },
    at,
    { x: at.x, y: at.y - hh },
    { x: at.x, y: at.y + hh },
    { x: at.x - hw, y: at.y },
    { x: at.x + hw, y: at.y },
  ];
  return samples.every((q) => pointInPolygon(q, polygon));
}

/** Deslocamentos do rótulo automático em leque: centro, acima, abaixo, esquerda, direita e as diagonais. */
function labelOffsets(box: { w: number; h: number }, scale: number): Vec2[] {
  const gap = mm(LABEL_MARGIN_MM, scale);
  const dx = box.w / 2 + gap;
  const dy = box.h / 2 + gap;
  return [
    { x: 0, y: 0 },
    { x: 0, y: dy },
    { x: 0, y: -dy },
    { x: -dx, y: 0 },
    { x: dx, y: 0 },
    { x: -dx, y: dy },
    { x: dx, y: dy },
    { x: -dx, y: -dy },
    { x: dx, y: -dy },
  ];
}

/**
 * Posição do rótulo automático: centro/referência e o leque ao redor. Prefere o primeiro candidato cuja caixa fica
 * **inteira dentro** do ambiente (furos incluídos) e não colide com um rótulo já colocado. Se nenhum couber
 * (ambiente pequeno), fica o candidato mais próximo da referência — não o mais alto —; a chamada continua
 * aparecendo quando a caixa sai do polígono.
 */
function autoTagAt(ref: Vec2, box: { w: number; h: number }, scale: number, polygon: Polygon, placed: readonly Rect[]): Vec2 {
  const gap = mm(LABEL_GAP_MM, scale);
  const tested = labelOffsets(box, scale).map((off) => {
    const at = { x: ref.x + off.x, y: ref.y + off.y };
    return { at, inside: boxInPolygon(at, box, polygon), clear: !placed.some((q) => overlaps(rectAt(at, box, gap), q)) };
  });
  const fitting = tested.find((c) => c.inside && c.clear);
  if (fitting) return fitting.at;
  // Nenhum candidato cabe inteiro: o mais próximo da referência, de preferência sem sobrepor outro rótulo.
  const free = tested.filter((c) => c.clear);
  const pool = free.length > 0 ? free : tested;
  let best = pool[0]!.at;
  let bestDist = Infinity;
  for (const c of pool) {
    const d = Math.hypot(c.at.x - ref.x, c.at.y - ref.y);
    if (d < bestDist) {
      bestDist = d;
      best = c.at;
    }
  }
  return best;
}

/** Linha de chamada: reta ou com ombro horizontal (Revit: Leader com cotovelo). */
function leaderLines(at: Vec2, anchor: Vec2, box: { w: number; h: number }, style: string, scale: number): Vec2[][] {
  const dx = anchor.x - at.x;
  const dy = anchor.y - at.y;
  const len = Math.hypot(dx, dy) || 1;
  const d = { x: dx / len, y: dy / len };
  const n = { x: -d.y, y: d.x };
  // Saída pela borda da caixa que encara o ponto de referência.
  const tx = Math.abs(dx) > 1e-9 ? box.w / 2 / Math.abs(d.x) : Infinity;
  const ty = Math.abs(dy) > 1e-9 ? box.h / 2 / Math.abs(d.y) : Infinity;
  const t = Math.min(tx, ty, len);
  const start = { x: at.x + d.x * t, y: at.y + d.y * t };
  if (style === 'crossed') {
    const off = mm(2.5, scale);
    const A = { x: anchor.x + n.x * off, y: anchor.y + n.y * off };
    const B = { x: anchor.x - n.x * off, y: anchor.y - n.y * off };
    // Cada linha passa pelo CENTRO do texto e continua 2 mm além da caixa: o cruzamento fica no centro do rótulo.
    const through = (p: Vec2): Vec2 => {
      const vx = at.x - p.x;
      const vy = at.y - p.y;
      const len = Math.hypot(vx, vy) || 1;
      const u = { x: vx / len, y: vy / len };
      const tx = Math.abs(u.x) > 1e-9 ? box.w / 2 / Math.abs(u.x) : Infinity;
      const ty = Math.abs(u.y) > 1e-9 ? box.h / 2 / Math.abs(u.y) : Infinity;
      const edge = Math.min(tx, ty);
      const out = Math.min(edge + mm(2, scale), len);
      return { x: at.x + u.x * out, y: at.y + u.y * out };
    };
    return [[A, through(A)], [B, through(B)]];
  }
  if (style === 'kinked') {
    const sx = Math.sign(dx) || 1;
    const elbow = { x: start.x + sx * mm(SHOULDER_MM, scale), y: start.y };
    return [[start, elbow], [elbow, anchor]];
  }
  if (style === 'none') return [];
  return [[start, anchor]];
}

/**
 * Preenchimento, contorno e linhas de referência dos ambientes. Sem esquema de cores não há preenchimento
 * (a planta nasce em preto e branco); as diagonais atravessam o ambiente e se cruzam no ponto de referência.
 */
export function areaPlanRoomOps(p: Project, plan: AreaPlan, theme: PlanTheme, dark: boolean, scale: number, hidden: ReadonlySet<Id> | undefined, paint: PlanPaint, resolved: readonly ResolvedRoom[], selected?: ReadonlySet<Id>): FloorOps {
  const out = empty();
  if (!paint.visible) return out;
  const rooms = new Map(Object.values(p.elements).filter((e): e is Room => e.kind === 'room' && e.levelId === plan.levelId).map((r) => [r.id, r] as const));
  const scheme = schemeOf(p, plan);
  for (const r of resolved) {
    const room = rooms.get(r.roomId);
    if (!room || !r.polygon || hidden?.has(room.id)) continue;
    const color = scheme ? schemeColor(p, plan, room, r) : (room.color ?? null);
    if (color && plan.graphics.fill !== 'none') {
      const cat = categoryById(p, room.categoryId);
      const hatch = plan.graphics.fill === 'hatch' && cat?.hatch && cat.hatch !== 'none' ? { kind: cat.hatch, color: dark ? '#ffffff' : '#111827', alpha: 0.75 } : undefined;
      out.fills.push({ polygons: [r.polygon], color, alpha: plan.graphics.fillOpacity, hatch });
    }
    if (plan.graphics.outline !== 'none') {
      for (const ring of r.polygon) {
        out.strokes.push({
          pts: ring,
          closed: true,
          widthPx: 1,
          papel: { mm: 0.13, escala: scale },
          color: dark ? '#9ca3af' : '#6b7280',
          alpha: 1,
          ...(plan.graphics.outline === 'dashed' ? { dash: [4, 2] as [number, number] } : {}),
        });
      }
    }
    if (plan.graphics.referenceLines === 'always' || (plan.graphics.referenceLines === 'selected' && selected?.has(room.id))) {
      // O cruzamento das diagonais fica no centro do rótulo quando ele está dentro do ambiente; fora, volta ao
      // ponto de referência do ambiente (o rótulo passa a ter chamada).
      const ref = room.labelPosition && pointInPolygon(room.labelPosition, r.polygon) ? room.labelPosition : referenceAt(room, r);
      for (const s of referenceDiagonals(r.polygon, ref)) {
        out.strokes.push({ pts: [s.a, s.b], closed: false, widthPx: 1, papel: { mm: REF_MM, escala: scale }, color: dark ? '#9ca3af' : REF_COLOR, alpha: 0.9 });
      }
    }
  }
  void theme;
  return out;
}

/** Etiquetas da planta (texto em duas linhas, halo e chamada). Desenhadas por cima das paredes. */
export function areaPlanTagOps(p: Project, plan: AreaPlan, scale: number, hidden: ReadonlySet<Id> | undefined, resolved: readonly ResolvedRoom[], hideRoomId?: Id, dark = false): FloorOps {
  const out = empty();
  const ink = dark ? '#f3f4f6' : '#111827';
  const rooms = new Map(Object.values(p.elements).filter((e): e is Room => e.kind === 'room').map((r) => [r.id, r] as const));
  const placed: Rect[] = [];
  for (const r of resolved) {
    const room = rooms.get(r.roomId);
    if (!room || !r.polygon || hidden?.has(room.id) || room.id === hideRoomId) continue;
    const tag = plan.tags.find((t) => t.roomId === room.id);
    if (tag && !tag.visible) continue;
    const ref = referenceAt(room, r);
    // A etiqueta da vista (`RoomTag.at`) é a posição explícita desta planta e vence o rótulo global do modelo.
    let at = tag?.at ?? room.labelPosition ?? ref;
    const rotation = room.labelRotation ?? (tag?.orientation === 'vertical' ? 90 : 0);
    const draft: RoomTag = tag ?? {
      id: `auto:${room.id}`,
      planId: plan.id,
      roomId: room.id,
      at,
      orientation: 'horizontal',
      leader: plan.graphics.tagDefault.leader,
      fields: [...plan.graphics.tagDefault.fields],
      visible: true,
    };
    const lines = roomTagLines(p, room, r, draft);
    if (lines.length === 0) continue;
    const box = tagBoxModel(lines, scale);
    // Etiqueta automática: leque ao redor da referência, preferindo a caixa inteira dentro do ambiente e sem
    // colidir com outra etiqueta (o usuário pode arrastar depois). Posição explícita do modelo/`RoomTag` manda.
    if (!room.labelPosition && !tag) at = autoTagAt(ref, box, scale, r.polygon, placed);
    placed.push(rectAt(at, box));
    const inside = pointInPolygon(at, r.polygon);
    const explicit = room.labelLeader && room.labelLeader !== 'auto' ? room.labelLeader : null;
    const style = explicit ?? (room.labelPosition ? (inside ? 'none' : 'crossed') : tag ? tag.leader : inside ? 'none' : 'crossed');
    for (const pts of leaderLines(at, ref, box, style, scale)) {
      out.strokes.push({ pts, closed: false, widthPx: 1, papel: { mm: LEADER_MM, escala: scale }, color: ink, alpha: 0.95 });
    }
    const gap = lines.length > 1 ? (NAME_MM + TAG_GAP_MM) / 2 : 0;
    const firstDy = lines.length > 1 ? -gap : 0;
    const secondDy = lines.length > 1 ? (INFO_MM + TAG_GAP_MM) / 2 : 0;
    out.labels.push({ at, text: lines[0]!, center: true, rotation, bold: true, color: ink, papel: { escala: scale, fontMm: NAME_MM, desvio: { mm: Math.abs(firstDy), uy: Math.sign(firstDy) || -1 } } });
    if (lines[1]) out.labels.push({ at, text: lines[1], center: true, rotation, color: ink, papel: { escala: scale, fontMm: INFO_MM, desvio: { mm: secondDy, uy: 1 } } });
  }
  return out;
}

/**
 * Fantasma do rótulo em arraste (planta de piso ou de área): desenha o bloco na posição do cursor, com
 * caixa tracejada e chamada. É uma camada leve, refeita a cada quadro sem refazer a geometria do nível.
 */
export function labelGhostOps(p: Project, levelId: Id, ghost: { roomId: Id; at: Vec2 }, scale: number, fields?: readonly RoomTag['fields'][number][], dark = false): FloorOps {
  const out = empty();
  const ink = dark ? '#f3f4f6' : '#111827';
  const accent = dark ? '#93c5fd' : '#1d4ed8';
  const room = p.elements[ghost.roomId];
  const r = resolveRooms(p, levelId).find((x) => x.roomId === ghost.roomId);
  if (!room || room.kind !== 'room' || !r || !r.polygon) return out;
  const draft: RoomTag = {
    id: `ghost:${room.id}`,
    planId: '',
    roomId: room.id,
    at: ghost.at,
    orientation: 'horizontal',
    leader: 'none',
    fields: [...(fields ?? ['name', 'number', 'area'])],
    visible: true,
  };
  const lines = roomTagLines(p, room, r, draft);
  if (lines.length === 0) return out;
  const box = tagBoxModel(lines, scale);
  const at = ghost.at;
  const inside = pointInPolygon(at, r.polygon);
  for (const pts of leaderLines(at, referenceAt(room, r), box, inside ? 'none' : 'crossed', scale)) {
    out.strokes.push({ pts, closed: false, widthPx: 1, papel: { mm: LEADER_MM, escala: scale }, color: accent, alpha: 0.9, dash: [4, 2] });
  }
  out.strokes.push({ pts: tagMaskRect(at, box), closed: true, widthPx: 1, papel: { mm: 0.1, escala: scale }, color: accent, alpha: 0.9, dash: [3, 2] });
  const gap = lines.length > 1 ? (NAME_MM + TAG_GAP_MM) / 2 : 0;
  const firstDy = lines.length > 1 ? -gap : 0;
  const secondDy = lines.length > 1 ? (INFO_MM + TAG_GAP_MM) / 2 : 0;
  const rotation = room.labelRotation ?? 0;
  out.labels.push({ at, text: lines[0]!, center: true, rotation, bold: true, color: ink, papel: { escala: scale, fontMm: NAME_MM, desvio: { mm: Math.abs(firstDy), uy: Math.sign(firstDy) || -1 } } });
  if (lines[1]) out.labels.push({ at, text: lines[1], center: true, rotation, color: ink, papel: { escala: scale, fontMm: INFO_MM, desvio: { mm: secondDy, uy: 1 } } });
  return out;
}

/** Legenda de cores (só existe com esquema aplicado). */
export function areaPlanLegendOps(p: Project, plan: AreaPlan, scale: number, theme: PlanTheme, dark = false): FloorOps {
  const out = empty();
  const ink = dark ? '#f3f4f6' : '#111827';
  const mask = dark ? '#111827' : '#ffffff';
  const border = dark ? '#4b5563' : '#9ca3af';
  const legend = plan.legend;
  if (!legend) return out;
  const rows = areaLegendRows(p, plan);
  if (rows.length === 0) return out;
  const w = mm(LEGEND_W_MM, scale);
  const rowH = mm(LEGEND_ROW_MM, scale);
  const h = rowH * (rows.length + 2);
  const x0 = legend.at.x;
  const y1 = legend.at.y;
  const y0 = y1 - h;
  out.fills.push({ polygons: [[[{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y1 }, { x: x0, y: y1 }]]], color: mask, alpha: 0.94 });
  out.strokes.push({ pts: [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y1 }, { x: x0, y: y1 }], closed: true, widthPx: 1, papel: { mm: 0.13, escala: scale }, color: border, alpha: 1 });
  out.labels.push({ at: { x: x0 + mm(2, scale), y: y1 - rowH * 0.5 }, text: legend.title, center: false, bold: true, color: ink, papel: { escala: scale, fontMm: 2.8 } });
  const dec = unitsOf(p).decimalSymbol;
  rows.forEach((row, i) => {
    const y = y1 - rowH * (i + 1.5);
    const sw = mm(4, scale);
    out.fills.push({ polygons: [[[{ x: x0 + mm(2, scale), y: y - sw / 2 }, { x: x0 + mm(2, scale) + sw, y: y - sw / 2 }, { x: x0 + mm(2, scale) + sw, y: y + sw / 2 }, { x: x0 + mm(2, scale), y: y + sw / 2 }]]], color: row.color, alpha: 1 });
    out.strokes.push({ pts: [{ x: x0 + mm(2, scale), y: y - sw / 2 }, { x: x0 + mm(2, scale) + sw, y: y - sw / 2 }, { x: x0 + mm(2, scale) + sw, y: y + sw / 2 }, { x: x0 + mm(2, scale), y: y + sw / 2 }], closed: true, widthPx: 1, papel: { mm: 0.1, escala: scale }, color: border, alpha: 1 });
    out.labels.push({ at: { x: x0 + mm(8, scale), y }, text: row.label, center: false, color: ink, papel: { escala: scale, fontMm: 2.1 } });
    const parts: string[] = [];
    if (legend.showArea) parts.push(fmt(row.area, 2, dec));
    if (legend.showCount) parts.push(`${row.count}`);
    if (legend.showPercent) parts.push(`${fmt(row.percent, 1, dec)}%`);
    if (parts.length) out.labels.push({ at: { x: x0 + w - mm(2, scale), y }, text: parts.join(' · '), center: false, align: 'right', color: ink, papel: { escala: scale, fontMm: 2.0 } });
  });
  out.labels.push({ at: { x: x0 + mm(2, scale), y: y0 + rowH * 0.55 }, text: schemeOf(p, plan)?.name ?? '', center: false, color: ink, papel: { escala: scale, fontMm: 1.8 } });
  void theme;
  return out;
}

/** Quadro de áreas da planta (número, nome, nível, categoria, área, %, perímetro, volume). */
export function areaPlanTableOps(p: Project, plan: AreaPlan, scale: number, dark = false, lang: Lang = 'pt'): FloorOps {
  const out = empty();
  const ink = dark ? '#f3f4f6' : '#111827';
  const mask = dark ? '#111827' : '#ffffff';
  const border = dark ? '#4b5563' : '#6b7280';
  const table = plan.table;
  if (!table) return out;
  const rows = areaTableRows(p, plan, lang);
  const w = mm(TABLE_W_MM, scale);
  const rowH = mm(TABLE_ROW_MM, scale);
  const headerH = mm(6, scale);
  const h = headerH + rowH * rows.length;
  const x0 = table.at.x;
  const y1 = table.at.y;
  const y0 = y1 - h;
  const line = (pts: Vec2[]): void => {
    out.strokes.push({ pts, closed: false, widthPx: 1, papel: { mm: 0.1, escala: scale }, color: border, alpha: 1 });
  };
  out.fills.push({ polygons: [[[{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y1 }, { x: x0, y: y1 }]]], color: mask, alpha: 0.94 });
  out.strokes.push({ pts: [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y1 }, { x: x0, y: y1 }], closed: true, widthPx: 1, papel: { mm: 0.13, escala: scale }, color: border, alpha: 1 });
  out.labels.push({ at: { x: x0 + mm(2, scale), y: y1 - headerH * 0.55 }, text: table.title, center: false, bold: true, color: ink, papel: { escala: scale, fontMm: 2.8 } });
  line([{ x: x0, y: y1 - headerH }, { x: x0 + w, y: y1 - headerH }]);
  const cols = table.columns;
  const colW = w / Math.max(1, cols.length);
  const cell = (i: number, y: number, text: string, bold = false, align: 'left' | 'right' = 'left'): void => {
    const x = align === 'right' ? x0 + colW * (i + 1) - mm(1.5, scale) : x0 + colW * i + mm(1.5, scale);
    out.labels.push({ at: { x, y }, text, center: false, bold, align, color: ink, papel: { escala: scale, fontMm: TABLE_FONT_MM } });
  };
  cols.forEach((c, i) => {
    const label =
      c === 'number' ? t(lang, 'rn_col_no')
      : c === 'name' ? t(lang, 'rn_col_room')
      : c === 'level' ? t(lang, 'rn_col_level')
      : c === 'category' ? t(lang, 'rn_col_category')
      : c === 'area' ? t(lang, 'rn_col_area')
      : c === 'percent' ? t(lang, 'rn_col_percent')
      : c === 'perimeter' ? t(lang, 'rn_col_perimeter')
      : t(lang, 'rn_col_volume');
    cell(i, y1 - headerH * 0.55, label, true, c === 'area' || c === 'percent' || c === 'perimeter' || c === 'volume' ? 'right' : 'left');
  });
  const dec = unitsOf(p).decimalSymbol;
  rows.forEach((r, i) => {
    const y = y1 - headerH - rowH * (i + 0.5);
    const bold = r.kind !== 'room';
    cols.forEach((c, j) => {
      const text = c === 'number' ? r.number : c === 'name' ? r.name : c === 'level' ? r.levelName : c === 'category' ? r.category : c === 'area' ? fmt(r.area, 2, dec) : c === 'percent' ? `${fmt(r.percent, 1, dec)}%` : c === 'perimeter' ? fmt(r.perimeter, 2, dec) : fmt(r.volume, 3, dec);
      cell(j, y, text, bold, c === 'area' || c === 'percent' || c === 'perimeter' || c === 'volume' ? 'right' : 'left');
    });
    if (r.kind !== 'room') line([{ x: x0, y: y1 - headerH - rowH * i }, { x: x0 + w, y: y1 - headerH - rowH * i }]);
  });
  return out;
}

/** Todas as operações da planta de área: ambientes, referências, etiquetas, legenda e quadro. */
export function areaPlanOps(p: Project, plan: AreaPlan, theme: PlanTheme, dark: boolean, scale: number, hidden: ReadonlySet<Id> | undefined, paint: PlanPaint, resolved: readonly ResolvedRoom[], withFurniture = false, lang: Lang = 'pt'): FloorOps {
  const out = empty();
  const rooms = areaPlanRoomOps(p, plan, theme, dark, scale, hidden, paint, resolved);
  out.fills.push(...rooms.fills);
  out.strokes.push(...rooms.strokes);
  out.labels.push(...rooms.labels);
  const tags = areaPlanTagOps(p, plan, scale, hidden, resolved);
  out.strokes.push(...tags.strokes);
  out.labels.push(...tags.labels);
  if (withFurniture) {
    const legend = areaPlanLegendOps(p, plan, scale, theme);
    out.fills.push(...legend.fills);
    out.strokes.push(...legend.strokes);
    out.labels.push(...legend.labels);
    const table = areaPlanTableOps(p, plan, scale, false, lang);
    out.fills.push(...table.fills);
    out.strokes.push(...table.strokes);
    out.labels.push(...table.labels);
  }
  return out;
}
