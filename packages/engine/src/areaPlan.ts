import { areaPlanOf, categoryById, planViewOf, planViewsOf, type AreaPlan, type ColorScheme, type Id, type Project, type Room } from '@hestia/model';
import { t, type Lang } from './i18nMessages.ts';
import { resolveRooms, type ResolvedRoom } from './rooms.ts';

/** Paleta de reserva quando o esquema não define cor para o grupo. */
export const AREA_PALETTE: readonly string[] = ['#dbe7f3', '#f6e3c8', '#e2f0dc', '#e6e1f4', '#f3e7cf', '#e8eef2', '#e4e4e4', '#e7f1e4'];

/** Esquema da planta, se houver. */
export const schemeOf = (p: Pick<Project, 'colorSchemes'>, plan: Pick<AreaPlan, 'schemeId'>): ColorScheme | null => schemeById(p, plan.schemeId);

const schemeById = (p: Pick<Project, 'colorSchemes'>, schemeId: Id | undefined): ColorScheme | null => {
  if (!schemeId) return null;
  return (p.colorSchemes ?? []).find((s) => s.id === schemeId) ?? null;
};

/** Esquema de cor da planta de área (vista) pelo id; `null` sem esquema ou se a vista não é de área. */
export const schemeOfView = (p: Pick<Project, 'colorSchemes' | 'planViews'>, viewId: Id): ColorScheme | null => {
  const v = planViewOf(p, viewId);
  return v?.kind === 'area' ? schemeById(p, v.area?.schemeId) : null;
};

const indexIn = <T>(list: readonly T[], id: Id, key: (t: T) => Id): number => Math.max(0, list.findIndex((x) => key(x) === id));

/**
 * Cor de um ambiente no esquema. Sem esquema, null (a planta fica sem preenchimento). Por categoria usa a
 * cor da categoria; por nível usa a paleta (ou o override); por faixa usa a faixa que contém a área.
 */
export function schemeColor(p: Project, plan: AreaPlan, room: Room, resolved: ResolvedRoom): string | null {
  return colorIn(p, schemeOf(p, plan), room, resolved);
}

function colorIn(p: Project, scheme: ColorScheme | null, room: Room, resolved: ResolvedRoom): string | null {
  if (!scheme) return null;
  if (scheme.by === 'category') {
    if (room.categoryId && scheme.overrides?.[room.categoryId]) return scheme.overrides[room.categoryId]!;
    const cat = categoryById(p, room.categoryId);
    if (cat) return cat.color;
    const cats = p.roomCategories ?? [];
    return AREA_PALETTE[indexIn(cats, room.categoryId ?? '', (c) => c.id) % AREA_PALETTE.length]!;
  }
  if (scheme.by === 'level') {
    if (scheme.overrides?.[room.levelId]) return scheme.overrides[room.levelId]!;
    return AREA_PALETTE[indexIn(p.levels, room.levelId, (l) => l.id) % AREA_PALETTE.length]!;
  }
  const range = (scheme.ranges ?? []).find((r) => resolved.area >= r.min && resolved.area < r.max);
  return range?.color ?? null;
}

export interface AreaLegendRow {
  id: string;
  label: string;
  color: string;
  count: number;
  area: number;
  percent: number;
}

/** Linhas da legenda: agrupadas por categoria ou por nível, com quantidade, área e percentual. */
export function areaLegendRows(p: Project, plan: AreaPlan, lang: Lang = 'pt'): AreaLegendRow[] {
  return legendRowsOf(p, plan.levelId, schemeOf(p, plan), lang);
}

/** Como `areaLegendRows`, pelo id da planta de área (vista): esquema da vista, ambientes do nível dela. */
export function areaLegendRowsOfView(p: Project, viewId: Id, lang: Lang = 'pt'): AreaLegendRow[] {
  const v = planViewOf(p, viewId);
  return v?.kind === 'area' ? legendRowsOf(p, v.levelId, schemeById(p, v.area?.schemeId), lang) : [];
}

// Ambientes e áreas vêm do NÍVEL (modelo); só o esquema é configuração da planta de área.
function legendRowsOf(p: Project, levelId: Id, scheme: ColorScheme | null, lang: Lang): AreaLegendRow[] {
  if (!scheme) return [];
  const rooms = Object.values(p.elements).filter((e): e is Room => e.kind === 'room' && e.levelId === levelId);
  const resolved = new Map(resolveRooms(p, levelId).map((r) => [r.roomId, r] as const));
  const groups = new Map<string, AreaLegendRow>();
  const total = [...resolved.values()].reduce((s, r) => s + r.area, 0);
  for (const room of rooms) {
    const r = resolved.get(room.id);
    if (!r || r.problem || r.duplicateOf !== undefined) continue;
    const color = colorIn(p, scheme, room, r);
    if (!color) continue;
    const label = scheme.by === 'level' ? (p.levels.find((l) => l.id === room.levelId)?.name ?? room.levelId) : (categoryById(p, room.categoryId)?.name ?? t(lang, 'egb_area_no_category'));
    const id = scheme.by === 'level' ? room.levelId : (room.categoryId ?? 'none');
    const row = groups.get(id) ?? { id, label, color, count: 0, area: 0, percent: 0 };
    row.count += 1;
    row.area += r.area;
    groups.set(id, row);
  }
  const out = [...groups.values()].sort((a, b) => b.area - a.area);
  for (const row of out) row.percent = total > 0 ? (row.area / total) * 100 : 0;
  return out;
}

export type AreaTableKind = 'room' | 'subtotal' | 'total';

export interface AreaTableRow {
  kind: AreaTableKind;
  roomId?: Id;
  number: string;
  name: string;
  levelName: string;
  category: string;
  area: number;
  percent: number;
  perimeter: number;
  volume: number;
}

/** Linhas do quadro de áreas da planta: ambientes, subtotal do nível e total. */
export function areaTableRows(p: Project, plan: AreaPlan, lang: Lang = 'pt'): AreaTableRow[] {
  return tableRowsOf(p, plan.levelId, lang);
}

/** Como `areaTableRows`, pelo id da planta de área (vista). Vista inexistente ou de outro tipo: sem linhas. */
export function areaTableRowsOfView(p: Project, viewId: Id, lang: Lang = 'pt'): AreaTableRow[] {
  const v = planViewOf(p, viewId);
  return v?.kind === 'area' ? tableRowsOf(p, v.levelId, lang) : [];
}

// A tabela depende só do nível (ambientes e separadores são modelo, não vista).
function tableRowsOf(p: Project, levelId: Id, lang: Lang): AreaTableRow[] {
  const rooms = Object.values(p.elements).filter((e): e is Room => e.kind === 'room' && e.levelId === levelId);
  const resolved = new Map(resolveRooms(p, levelId).map((r) => [r.roomId, r] as const));
  const rows: AreaTableRow[] = [];
  const levelName = p.levels.find((l) => l.id === levelId)?.name ?? '';
  let total = 0;
  for (const room of rooms) {
    const r = resolved.get(room.id);
    if (!r || r.problem || r.duplicateOf !== undefined) continue;
    total += r.area;
    rows.push({
      kind: 'room',
      roomId: room.id,
      number: room.number,
      name: room.name,
      levelName,
      category: categoryById(p, room.categoryId)?.name ?? '',
      area: r.area,
      percent: 0,
      perimeter: r.perimeter,
      volume: r.volume,
    });
  }
  rows.sort((a, b) => a.number.localeCompare(b.number, lang === 'en' ? 'en' : 'pt-BR', { numeric: true }));
  for (const r of rows) r.percent = total > 0 ? (r.area / total) * 100 : 0;
  rows.push({ kind: 'subtotal', number: '', name: t(lang, 'egb_area_subtotal', { level: levelName }), levelName, category: '', area: total, percent: total > 0 ? 100 : 0, perimeter: 0, volume: 0 });
  rows.push({ kind: 'total', number: '', name: t(lang, 'egb_area_total'), levelName, category: '', area: total, percent: total > 0 ? 100 : 0, perimeter: 0, volume: 0 });
  return rows;
}

/** Planta de área de um id (atalho para a UI): projeção da vista `area` (`areaPlanOf`). */
export const planById = (p: Pick<Project, 'planViews'>, id: Id): AreaPlan | undefined => areaPlanOf(p, id);

/** Quadro geral de áreas de TODAS as plantas do projeto (usado na prancha geral). */
export function areaTableAllRows(p: Project, lang: Lang = 'pt'): AreaTableRow[] {
  const out: AreaTableRow[] = [];
  let total = 0;
  for (const view of planViewsOf(p)) {
    if (view.kind !== 'area') continue;
    const rows = areaTableRowsOfView(p, view.id, lang).filter((r) => r.kind === 'room');
    if (rows.length === 0) continue;
    out.push(...rows);
    const sum = rows.reduce((s, r) => s + r.area, 0);
    total += sum;
    const levelName = p.levels.find((l) => l.id === view.levelId)?.name ?? '';
    out.push({ kind: 'subtotal', number: '', name: t(lang, 'egb_area_subtotal', { level: levelName }), levelName, category: '', area: sum, percent: 0, perimeter: 0, volume: 0 });
  }
  for (const r of out) r.percent = total > 0 ? (r.area / total) * 100 : 0;
  out.push({ kind: 'total', number: '', name: t(lang, 'egb_area_total'), levelName: '', category: '', area: total, percent: total > 0 ? 100 : 0, perimeter: 0, volume: 0 });
  return out;
}
