import { fitBox, type Viewport } from '@hestia/render';
import { ProjectStore, isCad, isFloor, isGeneric, isOpening, isRamp, isRoof, isSlab, isStair, isWall, newId, openingType, wallTypeUsage, type Element, type FloorType, type Id, type Project } from '@hestia/model';
import { rampPoints } from './rampActions.ts';
import { stairPoints } from './stairActions.ts';
import { t, useI18n } from './i18n.ts';

/** Tipos que o navegador de projeto lista: parede, porta, janela, piso, laje, forro, telhado, escada e rampa. */
export type TypeKind = 'wall' | 'door' | 'window' | 'floor' | 'slab' | 'ceiling' | 'roof' | 'stair' | 'ramp';

export interface TypeChoice {
  id: Id;
  name: string;
}

const lang = () => useI18n.getState().lang;

/** Nível de um elemento: a parede tem o seu; a abertura herda o da parede anfitriã. */
export function levelOfElement(p: Project, e: Element): Id | undefined {
  if (isWall(e) || isGeneric(e) || isCad(e) || isRamp(e) || e.kind === 'railing' || e.kind === 'floor' || e.kind === 'slab' || e.kind === 'ceiling' || e.kind === 'roof' || e.kind === 'stair' || e.kind === 'room') return e.levelId;
  const host = p.elements[e.hostId];
  return isWall(host) ? host.levelId : undefined;
}

function usesType(e: Element, kind: TypeKind, typeId: Id): boolean {
  if (kind === 'wall') return isWall(e) && e.typeId === typeId;
  if (kind === 'floor') return isFloor(e) && e.typeId === typeId;
  if (kind === 'slab') return isSlab(e) && e.typeId === typeId;
  if (kind === 'ceiling') return e.kind === 'ceiling' && e.typeId === typeId;
  if (kind === 'roof') return isRoof(e) && e.typeId === typeId;
  if (kind === 'stair') return isStair(e) && e.typeId === typeId;
  if (kind === 'ramp') return isRamp(e) && e.typeId === typeId;
  return isOpening(e) && e.kind === kind && e.typeId === typeId;
}

/** Ids de todos os elementos que usam o tipo, em todos os níveis. */
export function instancesOfType(p: Project, kind: TypeKind, typeId: Id): Id[] {
  return Object.values(p.elements)
    .filter((e) => usesType(e, kind, typeId))
    .map((e) => e.id);
}

/** Separa as instâncias do nível atual das de outros níveis. */
export function splitByLevel(p: Project, ids: Id[], levelId: Id): { here: Id[]; elsewhere: number } {
  const here: Id[] = [];
  let elsewhere = 0;
  for (const id of ids) {
    const e = p.elements[id];
    if (!e) continue;
    if (levelOfElement(p, e) === levelId) here.push(id);
    else elsewhere++;
  }
  return { here, elsewhere };
}

/**
 * Plano de "Selecionar todas as instâncias": seleciona só as do nível atual (sem trocar de nível)
 * e descreve no status quantas ficaram em outros níveis.
 */
export function selectAllPlan(p: Project, kind: TypeKind, typeId: Id, levelId: Id, typeName: string): { ids: Id[]; status: string } {
  const l = lang();
  const all = instancesOfType(p, kind, typeId);
  if (all.length === 0) return { ids: [], status: t(l, 'eds_msg_no_instances_of_type', { type: typeName }) };
  const { here, elsewhere } = splitByLevel(p, all, levelId);
  if (here.length === 0) {
    return { ids: [], status: t(l, elsewhere === 1 ? 'eds_msg_no_instances_here_one' : 'eds_msg_no_instances_here_many', { n: elsewhere }) };
  }
  if (elsewhere === 0) {
    return { ids: here, status: t(l, here.length === 1 ? 'eds_msg_instances_here_one' : 'eds_msg_instances_here_many', { n: here.length }) };
  }
  const key = here.length === 1
    ? (elsewhere === 1 ? 'eds_msg_instances_here_other_one_one' : 'eds_msg_instances_here_other_one_many')
    : (elsewhere === 1 ? 'eds_msg_instances_here_other_many_one' : 'eds_msg_instances_here_other_many_many');
  return { ids: here, status: t(l, key, { n: here.length, m: elsewhere }) };
}

/** Tipos que podem substituir `typeId`: outros tipos de parede, ou de porta/janela do mesmo tipo. */
export function compatibleTypes(p: Project, kind: TypeKind, typeId: Id): TypeChoice[] {
  const list =
    kind === 'wall'
      ? Object.values(p.wallTypes).filter((t) => t.id !== typeId)
      : kind === 'floor'
        ? Object.values(p.floorTypes).filter((t) => t.id !== typeId)
        : kind === 'slab'
          ? Object.values(p.slabTypes).filter((t) => t.id !== typeId)
          : kind === 'roof'
            ? Object.values(p.roofTypes).filter((t) => t.id !== typeId)
            : kind === 'stair'
              ? Object.values(p.stairTypes).filter((t) => t.id !== typeId)
              : kind === 'ramp'
                ? Object.values(p.rampTypes).filter((t) => t.id !== typeId)
                : Object.values(p.openingTypes).filter((t) => t.kind === kind && t.id !== typeId);
  return list.map((t) => ({ id: t.id, name: t.name }));
}

/**
 * Substitui o tipo em todas as instâncias (todos os níveis) com UM comando `updateElements`,
 * dentro de uma transação: um único passo de desfazer. Devolve quantas instâncias foram trocadas.
 */
export function replaceType(store: ProjectStore, kind: TypeKind, fromId: Id, toId: Id): number {
  if (!compatibleTypes(store.project, kind, fromId).some((t) => t.id === toId)) throw new Error(t(lang(), 'eds_msg_type_incompatible'));
  const ids = instancesOfType(store.project, kind, fromId);
  if (ids.length === 0) return 0;
  store.transaction('eds_undo_replace_type', () => {
    store.exec({ type: 'updateElements', ids, patch: { typeId: toId } });
  });
  return ids.length;
}

export function replaceStatus(count: number, toName: string): string {
  return t(lang(), count === 1 ? 'eds_msg_type_replaced_one' : 'eds_msg_type_replaced_many', { n: count, name: toName });
}

interface Pt {
  x: number;
  y: number;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Pontos de referência de uma parede: extremos e meio do arco (a flecha `sag` fica à esquerda de a→b). */
function wallPoints(w: { a: Pt; b: Pt; sag: number }): Pt[] {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const mid = { x: (w.a.x + w.b.x) / 2 + nx * w.sag, y: (w.a.y + w.b.y) / 2 + ny * w.sag };
  return [w.a, w.b, mid];
}

/**
 * Caixa que envolve as paredes e as aberturas dadas (aberturas: centro e as duas bordas do vão, sobre o eixo
 * do hospedeiro). Null quando nenhum elemento tem geometria.
 */
export function boxOfElements(p: Project, ids: Id[]): Box | null {
  const pts: Pt[] = [];
  for (const id of ids) {
    const e = p.elements[id];
    if (isWall(e)) pts.push(...wallPoints(e));
    else if (isFloor(e) || isSlab(e) || isRoof(e)) pts.push(...e.boundary);
    else if (isStair(e)) pts.push(...stairPoints(e));
    else if (isRamp(e)) pts.push(...rampPoints(e));
    else if (e && isOpening(e)) {
      const host = p.elements[e.hostId];
      if (!isWall(host)) continue;
      const dx = host.b.x - host.a.x;
      const dy = host.b.y - host.a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const hw = (p.openingTypes[e.typeId] ? openingType(p, e).width : 0) / 2;
      const c = { x: host.a.x + ux * e.offset, y: host.a.y + uy * e.offset };
      pts.push({ x: c.x - ux * hw, y: c.y - uy * hw }, { x: c.x + ux * hw, y: c.y + uy * hw }, c);
    }
  }
  if (pts.length === 0) return null;
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export interface WhereUsedTarget {
  levelId: Id;
  /** Instâncias do nível escolhido. */
  ids: Id[];
  /** Quantas ficaram em outros níveis. */
  elsewhere: number;
}

/**
 * Nível para "Onde é usado": o que tem mais instâncias do tipo (empate: o primeiro na ordem dos níveis).
 * Null quando o tipo não tem instância em nenhum nível.
 */
export function whereUsedTarget(p: Project, kind: TypeKind, typeId: Id): WhereUsedTarget | null {
  const all = instancesOfType(p, kind, typeId);
  const byLevel = new Map<Id, Id[]>();
  for (const id of all) {
    const e = p.elements[id];
    const lv = e ? levelOfElement(p, e) : undefined;
    if (lv !== undefined) byLevel.set(lv, [...(byLevel.get(lv) ?? []), id]);
  }
  let best: { levelId: Id; ids: Id[] } | null = null;
  for (const l of p.levels) {
    const ids = byLevel.get(l.id);
    if (ids && (!best || ids.length > best.ids.length)) best = { levelId: l.id, ids };
  }
  if (!best) return null;
  return { levelId: best.levelId, ids: best.ids, elsewhere: all.length - best.ids.length };
}

/** O que o controller oferece para "Onde é usado" (um subconjunto de `Editor`). */
export interface WhereUsedNav {
  readonly project: Project;
  viewport(): Viewport | null;
  setViewport(v: Viewport): void;
  selectLevel(levelId: Id): void;
}

/**
 * "Onde é usado": vai ao nível com mais instâncias, enquadra essas instâncias e as seleciona. As de outros
 * níveis são só contadas no status. Devolve a frase de status.
 */
export function whereUsed(nav: WhereUsedNav, kind: TypeKind, typeId: Id, name: string, select: (ids: Id[]) => void): string {
  const l = lang();
  const target = whereUsedTarget(nav.project, kind, typeId);
  if (!target) return t(l, 'eds_msg_no_instances_of_type', { type: name });
  // O viewport é do canvas (mesmo tamanho em todos os níveis): lê antes de trocar de nível.
  const current = nav.viewport();
  nav.selectLevel(target.levelId);
  select(target.ids);
  const box = boxOfElements(nav.project, target.ids);
  if (current && box) nav.setViewport(fitBox(current, box));
  const levelName = nav.project.levels.find((lv) => lv.id === target.levelId)?.name ?? target.levelId;
  const key = target.ids.length === 1
    ? (target.elsewhere === 0 ? 'eds_msg_where_used_one' : target.elsewhere === 1 ? 'eds_msg_where_used_other_one_one' : 'eds_msg_where_used_other_one_many')
    : (target.elsewhere === 0 ? 'eds_msg_where_used_many' : target.elsewhere === 1 ? 'eds_msg_where_used_other_many_one' : 'eds_msg_where_used_other_many_many');
  return t(l, key, { n: target.ids.length, name, level: levelName, m: target.elsewhere });
}

/** Motivo pelo qual o tipo de parede não pode ser excluído; null quando pode. */
export function wallTypeDeleteBlock(p: Project, typeId: Id): string | null {
  const l = lang();
  if (p.defaults.wallTypeId === typeId) return t(l, 'eds_msg_type_is_default');
  const uso = wallTypeUsage(p, typeId);
  if (uso > 0) return t(l, uso === 1 ? 'eds_msg_in_use_by_walls_one' : 'eds_msg_in_use_by_walls_many', { n: uso });
  return null;
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

/** Exclui o tipo de parede pelo comando `deleteWallType`, devolvendo o erro em vez de lançá-lo. */
export function tryDeleteWallType(store: ProjectStore, typeId: Id): DeleteResult {
  try {
    store.exec({ type: 'deleteWallType', id: typeId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t(lang(), 'eds_msg_unknown_failure') };
  }
}

/** Pisos que usam o tipo (em todos os níveis). */
export const floorTypeUsage = (p: Project, typeId: Id): number => instancesOfType(p, 'floor', typeId).length;

/** Motivo pelo qual o tipo de piso não pode ser excluído; null quando pode. */
export function floorTypeDeleteBlock(p: Project, typeId: Id): string | null {
  const l = lang();
  if (Object.keys(p.floorTypes).length <= 1) return t(l, 'eds_msg_last_floor_type');
  const uso = floorTypeUsage(p, typeId);
  if (uso > 0) return t(l, uso === 1 ? 'eds_msg_in_use_by_floors_one' : 'eds_msg_in_use_by_floors_many', { n: uso });
  return null;
}

/** Exclui o tipo de piso (o comando recusa se estiver em uso), devolvendo o erro em vez de lançá-lo. */
export function tryDeleteFloorType(store: ProjectStore, typeId: Id): DeleteResult {
  try {
    store.exec({ type: 'deleteFloorType', id: typeId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t(lang(), 'eds_msg_unknown_failure') };
  }
}

/** Cópia do tipo de piso com id novo e nome "(cópia)". Devolve o id criado. */
export function duplicateFloorType(store: ProjectStore, typeId: Id): Id | null {
  const src = store.project.floorTypes[typeId];
  if (!src) return null;
  const copy: FloorType = { ...structuredClone(src), id: newId('ft'), name: t(lang(), 'eds_def_copy_suffix', { name: src.name }) };
  store.exec({ type: 'upsertFloorType', floorType: copy }, 'eds_undo_duplicate_floor_type');
  return copy.id;
}

/** Renomeia o tipo de piso; nome vazio não é aceito. */
export function renameFloorType(store: ProjectStore, typeId: Id, name: string): DeleteResult {
  const clean = name.trim();
  const src = store.project.floorTypes[typeId];
  if (!src) return { ok: false, error: t(lang(), 'eds_msg_type_missing') };
  if (!clean) return { ok: false, error: t(lang(), 'eds_msg_type_needs_name') };
  store.exec({ type: 'upsertFloorType', floorType: { ...src, name: clean } }, 'eds_undo_rename_floor_type');
  return { ok: true };
}

/**
 * Validação do tipo de piso antes de salvar: ao menos uma camada, espessura maior que zero em toda camada
 * (só a membrana pode ter zero) e nome. Devolve a mensagem do primeiro problema, ou null se está pronto.
 */
export function floorTypeError(tipo: Pick<FloorType, 'name' | 'layers'>): string | null {
  const l = lang();
  if (!tipo.name.trim()) return t(l, 'eds_msg_type_needs_name');
  if (tipo.layers.length === 0) return t(l, 'eds_msg_type_needs_layer');
  const bad = tipo.layers.findIndex((lv) => lv.function !== 'membrane' && !(lv.thickness > 0));
  if (bad >= 0) return t(l, 'eds_msg_layer_thickness', { n: bad + 1 });
  return null;
}

/** Tipo de piso das opções ao abrir um projeto: mantém o escolhido se existir no projeto, senão o primeiro. */
export const keptFloorType = (p: Project, current: Id): Id => (p.floorTypes[current] ? current : (Object.keys(p.floorTypes)[0] ?? current));
