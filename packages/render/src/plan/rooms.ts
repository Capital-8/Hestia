import type { Vec2 } from '@hestia/geom';
import { pointInPolygon } from '@hestia/geom';
import type { ResolvedRoom } from '@hestia/engine';
import type { DetailLevel, Id, Project } from '@hestia/model';
import type { ResolvedUnits } from '@hestia/model';
import { belowFloorOps, fmtArea, labelPoint, type FloorOps } from './floors.ts';
import { ambientesDoNivel } from './resolucao.ts';
import { surfaceColor, type PlanPaint } from './style.ts';
import type { PlanTheme } from './types.ts';
import { t, type Lang } from '../i18n.ts';

/** Cor padrão do ambiente (sem cor própria): cinza-azulado claro, mais escuro no tema escuro. */
const ROOM_DEFAULT = '#b8c4d4';

/** Altura do texto do ambiente na planta, em mm de papel (mesmo padrão das demais anotações). */
const ROOM_TEXT_MM = 1.6;

const empty = (): FloorOps => ({ fills: [], strokes: [], labels: [] });

/**
 * Nome do ambiente para a planta de piso (decisão 0037): só o nome. Número e área ficam para a planta de área,
 * que tem campos configuráveis (`RoomTag`). Sem nome, cai em "Ambiente N" (ou "Ambiente").
 */
export function roomNameText(r: ResolvedRoom, lang: Lang = 'pt'): string {
  return r.name || (r.number ? t(lang, 'rn_room_default_name_numbered', { number: r.number }) : t(lang, 'rn_room_default_name'));
}

/**
 * Rótulo completo para o DXF da planta de piso: `Sala (101) · 12,34 m2` (nome, número entre parênteses quando há e
 * área com 2 casas). Na tela a planta de piso mostra só o nome (decisão 0037); o desenho técnico leva tudo.
 */
export function roomFullText(r: ResolvedRoom, u: ResolvedUnits, lang: Lang = 'pt'): string {
  const num = r.number ? ` (${r.number})` : '';
  return `${roomNameText(r, lang)}${num} · ${fmtArea(u, r.area, 2)}`;
}

/** Ponto da etiqueta: o centro do maior trecho interno do polígono (vale também para contornos em L). */
export const roomLabelAt = (r: ResolvedRoom): Vec2 | null => (r.polygon ? labelPoint([r.polygon]) : null);

/**
 * Ambientes do nível na planta (D1, E3): preenchimento leve com a cor do ambiente (ou o padrão do tema) e etiqueta
 * com o **nome** no centro (decisão 0037). Ambiente sem circuito (`polygon` nulo) não é desenhado; a validação aponta
 * o problema. Os ambientes ficam sobre os pisos e sob as paredes.
 */
export function roomOps(
  p: Project,
  levelId: Id,
  theme: PlanTheme,
  dark: boolean,
  detail: DetailLevel,
  scale: number,
  hidden: ReadonlySet<Id> | undefined,
  paint: PlanPaint,
  hideLabelRoomId?: Id,
  lang: Lang = 'pt',
): FloorOps {
  const out = empty();
  const fillBase = dark ? theme.bg : '#ffffff';
  for (const r of ambientesDoNivel(p, levelId)) {
    if (!r.polygon || hidden?.has(r.roomId)) continue;
    const color = surfaceColor(ROOM_DEFAULT, fillBase, dark ? 0.6 : 0.78, paint);
    out.fills.push({ polygons: [r.polygon], color, alpha: 0.7 });
    if (r.roomId === hideLabelRoomId) continue;
    const room = p.elements[r.roomId];
    const at = room?.kind === 'room' && room.labelPosition ? room.labelPosition : roomLabelAt(r);
    if (at) out.labels.push({ at, text: roomNameText(r, lang), ...(room?.kind === 'room' && room.labelRotation ? { rotation: room.labelRotation } : {}), papel: { escala: scale, fontMm: ROOM_TEXT_MM }, tone: 'info' });
    // Rótulo fora do ambiente: chamada reta até o ponto de referência (o rótulo é compartilhado por todas as vistas).
    if (room?.kind === 'room' && room.labelPosition && r.polygon && !pointInPolygon(room.labelPosition, r.polygon)) {
      const anchor = room.referencePoint ?? roomLabelAt(r);
      if (anchor) out.strokes.push({ pts: [room.labelPosition, anchor], closed: false, widthPx: 1, papel: { mm: 0.13, escala: scale }, color: theme.ink, alpha: 0.95 });
    }
  }
  // O detalhe não muda mais o texto: a planta de piso mostra só o nome (decisão 0037).
  void detail;
  return out;
}

/**
 * Ambientes do nível abaixo, como referência apagada (D3): mesma linguagem dos pisos de referência (D4), só o contorno
 * e o preenchimento leve do tema, sem etiqueta. Ambiente sem circuito não entra.
 */
export function belowRoomOps(rooms: ResolvedRoom[], theme: PlanTheme): FloorOps {
  return belowFloorOps(
    rooms.flatMap((r) => (r.polygon ? [{ polygon: [r.polygon] }] : [])),
    theme,
  );
}

/** Destaque de seleção e de hover dos ambientes: azul translúcido e contorno de 2 px; sem circuito, não há destaque. */
export function roomSelectionOps(p: Project, levelId: Id, selection: Id[], hover: Id | null, theme: PlanTheme, hidden?: ReadonlySet<Id>): FloorOps {
  const out = empty();
  const sel = new Set(selection);
  for (const r of ambientesDoNivel(p, levelId)) {
    if (!r.polygon || hidden?.has(r.roomId)) continue;
    const isSel = sel.has(r.roomId);
    const isHover = !isSel && hover === r.roomId;
    if (!isSel && !isHover) continue;
    out.fills.push({ polygons: [r.polygon], color: theme.select, alpha: isSel ? 0.22 : 0.14 });
    if (!isSel) continue;
    for (const ring of r.polygon) out.strokes.push({ pts: ring, closed: true, widthPx: 2, color: theme.select, alpha: 1 });
  }
  return out;
}
