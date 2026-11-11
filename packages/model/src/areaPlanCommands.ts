import type { Vec2 } from '@hestia/geom';
import { areaPlanIssue, DEFAULT_ROOM_CATEGORIES, roomTagIssue, type AreaPlan, type RoomCategory, type RoomTag } from './areaPlan.ts';
import type { Command } from './commands.ts';
import { createPlanView, deletePlanView } from './planViewCommands.ts';
import type { PlanView } from './planView.ts';
import { normalizeAnnotations, plainClone } from './planViewAnnotations.ts';
import { resolvePlanView } from './planViewResolve.ts';
import { isRoom, type Id, type Project } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Comandos da planta de área e da etiqueta de ambiente (fora do `switch` grande de `commands.ts`). */
// Desde a Fase 2 a planta de área é uma `PlanView` de `kind: 'area'`: estes comandos antigos escrevem em `Project.planViews`.
export type AreaPlanCommand = Extract<Command, { type: 'addAreaPlan' | 'updateAreaPlan' | 'removeAreaPlan' | 'addRoomTag' | 'updateRoomTag' | 'removeRoomTag' | 'setRoomReference' | 'upsertRoomCategory' | 'removeRoomCategory' | 'upsertColorScheme' | 'removeColorScheme' }>;

/** Vista de planta de área (com o bloco `area`) lida direto de `p.planViews`; recusa se não existe ou não é de área. */
type AreaView = PlanView & { area: NonNullable<PlanView['area']> };
const planOf = (p: Project, id: Id, lang: Lang): AreaView => {
  const v = resolvePlanView(p, id);
  if (v?.kind !== 'area' || !v.area) throw new Error(translate(lang, 'md_area_plan_missing'));
  return v as AreaView;
};

const roomOf = (p: Project, id: Id, lang: Lang) => {
  const room = p.elements[id];
  if (!isRoom(room)) throw new Error(translate(lang, 'md_cmd_room_missing'));
  return room;
};

const finite = (v: Vec2): boolean => Number.isFinite(v.x) && Number.isFinite(v.y);

/** Aplica um comando de planta de área. Devolve false quando o comando não é desta família. */
export function applyAreaPlanCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addAreaPlan': {
      const pl = c.plan;
      createPlanView(p, {
        id: pl.id, kind: 'area', levelId: pl.levelId, name: pl.name,
        area: { ...(pl.schemeId !== undefined ? { schemeId: pl.schemeId } : {}), scale: pl.scale, graphics: pl.graphics, tags: pl.tags, ...(pl.legend ? { legend: pl.legend } : {}), ...(pl.table ? { table: pl.table } : {}) },
        ...(pl.annotations ? { annotations: normalizeAnnotations(pl.annotations) } : {}),
        ...(pl.hidden ? { hidden: pl.hidden } : {}),
      }, lang);
      return true;
    }
    case 'updateAreaPlan': {
      const v = planOf(p, c.id, lang);
      const patch = c.patch;
      const next: AreaPlan = { id: v.id, name: v.name, levelId: v.levelId, scale: v.area.scale, graphics: v.area.graphics, tags: v.area.tags, ...patch };
      const issue = areaPlanIssue(p, next);
      if (issue) throw new Error(issue);
      v.name = next.name;
      v.levelId = next.levelId;
      const area = { ...v.area, scale: next.scale, graphics: next.graphics };
      for (const k of ['schemeId', 'legend', 'table'] as const) {
        if (!(k in patch)) continue;
        if (next[k] === undefined) delete area[k]; else (area as Record<string, unknown>)[k] = plainClone(next[k]);
      }
      v.area = area;
      if (patch.annotations) v.annotations = plainClone(normalizeAnnotations(patch.annotations));
      if ('hidden' in patch) { if (patch.hidden) v.hidden = patch.hidden; else delete v.hidden; }
      return true;
    }
    case 'removeAreaPlan': {
      planOf(p, c.id, lang);
      deletePlanView(p, c.id, lang);
      return true;
    }
    case 'addRoomTag': {
      const v = planOf(p, c.planId, lang);
      roomOf(p, c.tag.roomId, lang);
      const issue = roomTagIssue(c.tag);
      if (issue) throw new Error(issue);
      if (c.tag.planId !== c.planId) throw new Error(translate(lang, 'md_cmd_tag_wrong_plan'));
      if (v.area.tags.some((t) => t.id === c.tag.id)) throw new Error(translate(lang, 'md_cmd_tag_id_exists'));
      if (v.area.tags.some((t) => t.roomId === c.tag.roomId)) throw new Error(translate(lang, 'md_cmd_room_tag_exists'));
      v.area.tags = [...v.area.tags, { ...c.tag, fields: [...c.tag.fields] }];
      return true;
    }
    case 'updateRoomTag': {
      const v = planOf(p, c.planId, lang);
      const tag = v.area.tags.find((t) => t.id === c.id);
      if (!tag) throw new Error(translate(lang, 'md_cmd_tag_missing'));
      const next: RoomTag = { ...tag, ...c.patch, id: tag.id, planId: tag.planId, roomId: tag.roomId };
      const issue = roomTagIssue(next);
      if (issue) throw new Error(issue);
      v.area.tags = v.area.tags.map((t) => (t.id === tag.id ? next : t));
      return true;
    }
    case 'removeRoomTag': {
      const v = planOf(p, c.planId, lang);
      if (!v.area.tags.some((t) => t.id === c.id)) throw new Error(translate(lang, 'md_cmd_tag_missing'));
      v.area.tags = v.area.tags.filter((t) => t.id !== c.id);
      return true;
    }
    case 'setRoomReference': {
      const room = roomOf(p, c.id, lang);
      if (c.point === null) delete room.referencePoint;
      else {
        if (!finite(c.point)) throw new Error(translate(lang, 'md_cmd_reference_finite'));
        room.referencePoint = c.point;
      }
      return true;
    }
    case 'setRoomLabel': {
      const room = roomOf(p, c.id, lang);
      if (c.position === null) delete room.labelPosition;
      else {
        if (!finite(c.position)) throw new Error(translate(lang, 'md_cmd_label_finite'));
        room.labelPosition = c.position;
      }
      if (c.rotation !== undefined) {
        if (!Number.isFinite(c.rotation)) throw new Error(translate(lang, 'md_cmd_label_rotation'));
        room.labelRotation = c.rotation;
      }
      if (c.leader !== undefined) room.labelLeader = c.leader;
      return true;
    }
    case 'upsertRoomCategory': {
      if (!c.category.name.trim()) throw new Error(translate(lang, 'md_cmd_category_name'));
      const list = p.roomCategories ?? DEFAULT_ROOM_CATEGORIES;
      p.roomCategories = list.some((x) => x.id === c.category.id) ? list.map((x) => (x.id === c.category.id ? c.category : x)) : [...list, c.category];
      return true;
    }
    case 'removeRoomCategory': {
      const inUse = Object.values(p.elements).some((e) => isRoom(e) && e.categoryId === c.id);
      if (inUse) throw new Error(translate(lang, 'md_cmd_category_in_use'));
      p.roomCategories = (p.roomCategories ?? DEFAULT_ROOM_CATEGORIES).filter((x) => x.id !== c.id);
      return true;
    }
    case 'upsertColorScheme': {
      const s = c.scheme;
      if (!s.name.trim()) throw new Error(translate(lang, 'md_cmd_scheme_name'));
      if (s.by === 'areaRange' && (!s.ranges || s.ranges.length === 0)) throw new Error(translate(lang, 'md_cmd_scheme_ranges'));
      const list = p.colorSchemes ?? [];
      p.colorSchemes = list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s];
      return true;
    }
    case 'removeColorScheme': {
      p.colorSchemes = (p.colorSchemes ?? []).filter((x) => x.id !== c.id);
      for (const v of p.planViews) if (v.area?.schemeId === c.id) delete v.area.schemeId;
      return true;
    }
    default:
      return false;
  }
}

/** Remove das plantas as etiquetas de ambientes apagados (chamado por `removeRoom`/`deleteElements`). */
export function dropRoomTags(p: Project, ids: readonly Id[]): void {
  const doomed = new Set(ids);
  for (const v of p.planViews) if (v.area?.tags.some((t) => doomed.has(t.roomId))) v.area.tags = v.area.tags.filter((t) => !doomed.has(t.roomId));
}

/** Etiquetas de elemento (`ElementTag`) das anotações de todas as vistas que cumprem `drop`. */
function pruneElementTags(p: Project, drop: (v: PlanView, hostId: Id) => boolean): void {
  for (const v of p.planViews) {
    const tags = v.annotations.tags.filter((t) => !drop(v, t.hostId));
    if (tags.length !== v.annotations.tags.length) v.annotations = { ...v.annotations, tags };
  }
}

/**
 * Remove das anotações de TODAS as vistas as etiquetas de elementos que não existem mais (cópias e vistas extras
 * incluídas). Arquivos antigos com etiqueta órfã continuam abrindo: a validação só avisa, e a próxima exclusão limpa.
 */
export function pruneOrphanElementTags(p: Project): void {
  pruneElementTags(p, (_v, hostId) => !p.elements[hostId]);
}

/** `deleteElements`: remove de todas as vistas as etiquetas dos elementos apagados e, nas plantas de área, as órfãs. */
export function dropElementTags(p: Project, ids: readonly Id[]): void {
  const doomed = new Set(ids);
  pruneElementTags(p, (v, hostId) => doomed.has(hostId) || (v.kind === 'area' && !p.elements[hostId]));
}

export const areaPlanCategories = (p: Pick<Project, 'roomCategories'>): RoomCategory[] => p.roomCategories ?? [];
