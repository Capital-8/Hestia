import type { Vec2 } from '@hestia/geom';
import { pointInPolygon } from '@hestia/geom';
import type { ResolvedRoom } from '@hestia/engine';
import type { DetailLevel, Id, Project, ResolvedUnits, TagField } from '@hestia/model';
import { belowFloorOps, fmtArea, labelPoint, type FloorOps } from './floors.ts';
import { roomTagLines } from './areaPlan.ts';
import { ambientesDoNivel } from './resolucao.ts';
import { surfaceColor, type PlanPaint } from './style.ts';
import type { PlanTheme } from './types.ts';
import { fmtNumLang, t, type Lang } from '../i18n.ts';

/** Cor padrão do ambiente (sem cor própria): cinza-azulado claro, mais escuro no tema escuro. */
const ROOM_DEFAULT = '#b8c4d4';

/** Altura do texto do ambiente na planta, em mm de papel (mesmo padrão das demais anotações). */
const ROOM_TEXT_MM = 1.6;

/** Fonte da segunda linha do rótulo (número, área, nível, perímetro, volume), menor que a do nome. */
const ROOM_SUBTEXT_MM = 1.3;

/** Folga entre as duas linhas do rótulo, em mm de papel (papel do `TAG_GAP_MM` da planta de área). */
const ROOM_LINE_GAP_MM = 0.4;

/** Campos do rótulo quando o ambiente não configura nada: só o nome (decisão 0037). */
const DEFAULT_LABEL_FIELDS: TagField[] = ['name'];

const empty = (): FloorOps => ({ fills: [], strokes: [], labels: [] });

/**
 * Nome do ambiente para a planta de piso (decisão 0037): só o nome. Número e área ficam para a planta de área,
 * que tem campos configuráveis (`RoomTag`). Sem nome, cai em "Ambiente N" (ou "Ambiente").
 */
export function roomNameText(r: ResolvedRoom, lang: Lang = 'pt'): string {
  return r.name || (r.number ? t(lang, 'rn_room_default_name_numbered', { number: r.number }) : t(lang, 'rn_room_default_name'));
}

/**
 * Rótulo completo para o DXF da planta de piso, numa linha só (o DXF não tem segunda linha). Sem `fields` (ambiente
 * antigo) mantém o texto clássico `Sala (101) · 12,34 m2` (decisão 0037); com `fields` (o `labelFields` do modelo)
 * segue os mesmos campos da tela: `Sala · 101 · 12,34 m2`. Categoria, nível e personalizado exigem o `Project`
 * da planta de área e aqui não têm valor: saem de cena, como sairiam com `custom: ''` na tela.
 */
export function roomFullText(r: ResolvedRoom, u: ResolvedUnits, fields?: readonly TagField[], lang: Lang = 'pt'): string {
  if (!fields) {
    const num = r.number ? ` (${r.number})` : '';
    return `${roomNameText(r, lang)}${num} · ${fmtArea(u, r.area, 2)}`;
  }
  const parts: string[] = [];
  for (const f of fields) {
    if (f === 'name') parts.push(r.name);
    else if (f === 'number') parts.push(r.number);
    else if (f === 'area') parts.push(fmtArea(u, r.area, 2));
    else if (f === 'perimeter') parts.push(`${fmtNumLang(r.perimeter, 2, u.decimalSymbol)} m`);
    else if (f === 'volume') parts.push(`${fmtNumLang(r.volume, 3, u.decimalSymbol)} m³`); // units-ok: rótulo do DXF, o separador vem das unidades do projeto
  }
  // Só o nome e o ambiente não tem nome: o padrão "Ambiente N" da planta de piso, como na tela.
  if (fields.length === 1 && fields[0] === 'name') return roomNameText(r, lang);
  return parts.filter(Boolean).join(' · ');
}

/**
 * Ponto da etiqueta: o centro do maior trecho interno do polígono (vale também para contornos em L).
 */
export const roomLabelAt = (r: ResolvedRoom): Vec2 | null => (r.polygon ? labelPoint([r.polygon]) : null);

/**
 * Ambientes do nível na planta (D1, E3): preenchimento leve com a cor do ambiente (ou o padrão do tema) e rótulo no
 * centro com os campos configurados do ambiente (`Room.labelFields`, decisão 0037 ampliada: ausente = só o nome).
 * Até duas linhas, com a mesma técnica da planta de área: a primeira (nome/categoria/personalizado) acima do ponto
 * com `ROOM_TEXT_MM`, a segunda (número/área/nível/perímetro/volume) abaixo com fonte menor e `papel.desvio`.
 * Ambiente sem circuito (`polygon` nulo) não é desenhado; a validação aponta o problema. Os ambientes ficam sobre
 * os pisos e sob as paredes.
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
    if (at) {
      const fields = room?.kind === 'room' ? room.labelFields ?? DEFAULT_LABEL_FIELDS : DEFAULT_LABEL_FIELDS;
      const lines = room?.kind === 'room' ? roomTagLines(p, room, r, { fields, custom: '' }) : [];
      // Sem nome e só o campo nome: o padrão "Ambiente N" da planta de piso (sem `labelFields`, a saída é a de hoje).
      if (fields.length === 1 && fields[0] === 'name' && lines.length === 0) lines.push(roomNameText(r, lang));
      if (lines.length > 0) {
        const rotation = room?.kind === 'room' && room.labelRotation ? { rotation: room.labelRotation } : {};
        const duas = lines.length > 1;
        const firstDy = duas ? -((ROOM_TEXT_MM + ROOM_LINE_GAP_MM) / 2) : 0;
        const secondDy = duas ? (ROOM_SUBTEXT_MM + ROOM_LINE_GAP_MM) / 2 : 0;
        out.labels.push({ at, text: lines[0]!, ...rotation, papel: { escala: scale, fontMm: ROOM_TEXT_MM, ...(duas ? { desvio: { mm: Math.abs(firstDy), uy: Math.sign(firstDy) || -1 } } : {}) }, tone: 'info' });
        if (lines[1]) out.labels.push({ at, text: lines[1], ...rotation, papel: { escala: scale, fontMm: ROOM_SUBTEXT_MM, desvio: { mm: secondDy, uy: 1 } }, tone: 'info' });
      }
    }
    // Rótulo fora do ambiente: chamada reta até o ponto de referência (o rótulo é compartilhado por todas as vistas).
    if (room?.kind === 'room' && room.labelPosition && r.polygon && !pointInPolygon(room.labelPosition, r.polygon)) {
      const anchor = room.referencePoint ?? roomLabelAt(r);
      if (anchor) out.strokes.push({ pts: [room.labelPosition, anchor], closed: false, widthPx: 1, papel: { mm: 0.13, escala: scale }, color: theme.ink, alpha: 0.95 });
    }
  }
  // O detalhe não muda mais o texto: o que entra no rótulo são os campos do ambiente (decisão 0037).
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
