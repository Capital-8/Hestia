import type { Vec2 } from '@hestia/geom';
import { areaPlanIssue, areaPlanOf, copyPlanAnnotations, DEFAULT_AREA_GRAPHICS, DEFAULT_ROOM_CATEGORIES, planAnnotationsOf, roomTagIssue, type AreaPlan, type RoomCategory, type RoomTag } from './areaPlan.ts';
import type { Command } from './commands.ts';
import { dropOrphanViewports } from './sheetCommands.ts';
import { isRoom, type Id, type Project } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Comandos da planta de área e da etiqueta de ambiente (fora do `switch` grande de `commands.ts`). */
// armazenamento (Fase 2): este arquivo inteiro escreve em `Project.areaPlans` (a Fase 2 o move para `planViews`).
export type AreaPlanCommand = Extract<Command, { type: 'addAreaPlan' | 'updateAreaPlan' | 'removeAreaPlan' | 'addRoomTag' | 'updateRoomTag' | 'removeRoomTag' | 'setRoomReference' | 'upsertRoomCategory' | 'removeRoomCategory' | 'upsertColorScheme' | 'removeColorScheme' }>;

const planOf = (p: Project, id: Id, lang: Lang): AreaPlan => {
  const plan = areaPlanOf(p, id);
  if (!plan) throw new Error(translate(lang, 'md_area_plan_missing'));
  return plan;
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
      const issue = areaPlanIssue(p, c.plan);
      if (issue) throw new Error(issue);
      if (areaPlanOf(p, c.plan.id)) throw new Error(translate(lang, 'md_cmd_plan_id_exists'));
      const plan: AreaPlan = { ...c.plan, graphics: { ...DEFAULT_AREA_GRAPHICS, ...c.plan.graphics }, tags: [...c.plan.tags] };
      if (c.plan.annotations) plan.annotations = copyPlanAnnotations(c.plan.annotations);
      p.areaPlans = [...(p.areaPlans ?? []), plan];
      return true;
    }
    case 'updateAreaPlan': {
      const plan = planOf(p, c.id, lang);
      const next: AreaPlan = { ...plan, ...c.patch, id: plan.id };
      const issue = areaPlanIssue(p, next);
      if (issue) throw new Error(issue);
      p.areaPlans = (p.areaPlans ?? []).map((x) => (x.id === plan.id ? next : x));
      return true;
    }
    case 'removeAreaPlan': {
      planOf(p, c.id, lang);
      p.areaPlans = (p.areaPlans ?? []).filter((x) => x.id !== c.id);
      dropOrphanViewports(p);
      return true;
    }
    case 'addRoomTag': {
      const plan = planOf(p, c.planId, lang);
      roomOf(p, c.tag.roomId, lang);
      const issue = roomTagIssue(c.tag);
      if (issue) throw new Error(issue);
      if (c.tag.planId !== c.planId) throw new Error(translate(lang, 'md_cmd_tag_wrong_plan'));
      if (plan.tags.some((t) => t.id === c.tag.id)) throw new Error(translate(lang, 'md_cmd_tag_id_exists'));
      if (plan.tags.some((t) => t.roomId === c.tag.roomId)) throw new Error(translate(lang, 'md_cmd_room_tag_exists'));
      plan.tags = [...plan.tags, { ...c.tag, fields: [...c.tag.fields] }];
      return true;
    }
    case 'updateRoomTag': {
      const plan = planOf(p, c.planId, lang);
      const tag = plan.tags.find((t) => t.id === c.id);
      if (!tag) throw new Error(translate(lang, 'md_cmd_tag_missing'));
      const next: RoomTag = { ...tag, ...c.patch, id: tag.id, planId: tag.planId, roomId: tag.roomId };
      const issue = roomTagIssue(next);
      if (issue) throw new Error(issue);
      plan.tags = plan.tags.map((t) => (t.id === tag.id ? next : t));
      return true;
    }
    case 'removeRoomTag': {
      const plan = planOf(p, c.planId, lang);
      if (!plan.tags.some((t) => t.id === c.id)) throw new Error(translate(lang, 'md_cmd_tag_missing'));
      plan.tags = plan.tags.filter((t) => t.id !== c.id);
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
      for (const plan of p.areaPlans ?? []) if (plan.schemeId === c.id) delete plan.schemeId;
      return true;
    }
    default:
      return false;
  }
}

/** Remove das plantas as etiquetas de ambientes apagados (chamado por `removeRoom`/`deleteElements`). */
export function dropRoomTags(p: Project, ids: readonly Id[]): void {
  if (!p.areaPlans?.length) return;
  const doomed = new Set(ids);
  for (const plan of p.areaPlans) if (plan.tags.some((t) => doomed.has(t.roomId))) plan.tags = plan.tags.filter((t) => !doomed.has(t.roomId));
}

/**
 * Remove das anotações das plantas de área as etiquetas de elementos que não existem mais. Arquivos antigos
 * com etiqueta órfã continuam abrindo: a validação só avisa, e a próxima exclusão limpa a lista.
 */
export function prunePlanElementTags(p: Project): void {
  if (!p.areaPlans?.length) return;
  for (const plan of p.areaPlans) {
    const a = planAnnotationsOf(plan);
    const tags = a.tags.filter((t) => Boolean(p.elements[t.hostId]));
    if (tags.length !== a.tags.length) plan.annotations = { ...a, tags };
  }
}

/** Remove as plantas de área de um nível apagado. */
export function dropAreaPlansOfLevel(p: Project, levelId: Id): void {
  if (!p.areaPlans?.length) return;
  p.areaPlans = p.areaPlans.filter((x) => x.levelId !== levelId);
}


export const areaPlanCategories = (p: Pick<Project, 'roomCategories'>): RoomCategory[] => p.roomCategories ?? [];
