import { isCad } from './cad.ts';
import type { Command } from './commands.ts';
import { hasLevel } from './elementLevel.ts';
import {
  isCeiling,
  isFloor,
  isGeneric,
  isOpening,
  isRamp,
  isRoof,
  isRoom,
  isSlab,
  isStair,
  isWall,
  type Ceiling,
  type Element,
  type Generic,
  type Id,
  type Level,
  type Opening,
  type Project,
  type Ramp,
  type Stair,
  type Wall,
} from './types.ts';

/**
 * Vínculo de andar-tipo: as cópias coladas em vários níveis lembram qual elemento de origem
 * representam. Não é grupo: cada elemento continua independente e editável. O vínculo só
 * habilita "Sincronizar cópias vinculadas" e "Desvincular".
 *
 * `sourceIds[i]` é representado por `members[].ids[i]` em cada nível.
 */
export interface CopyLink {
  id: Id;
  sourceIds: Id[];
  members: { levelId: Id; ids: Id[] }[];
  createdAt: number;
}

/**
 * Geradora de ids do vínculo. Mesma assinatura de `MintId` do clipboard do editor
 * (`(prefix: string) => Id`), repetida aqui para o modelo não depender da ferramenta.
 */
export type CopyLinkMint = (prefix: string) => Id;

export interface SyncLinkedElements {
  linkId: Id;
  fromId: Id;
  toIds?: Id[];
}

type CopyLinkMember = CopyLink['members'][number];

/** Vínculo que contém o elemento (como origem ou como cópia); null quando não há vínculo. */
export function copyLinkOf(p: Project, elementId: Id): CopyLink | null {
  for (const link of p.copyLinks ?? []) {
    if (link.sourceIds.includes(elementId) || link.members.some((m) => m.ids.includes(elementId))) return link;
  }
  return null;
}

/**
 * Papel do elemento no vínculo: o índice em `sourceIds` (e em cada `members[].ids`).
 * Devolve -1 quando o elemento não pertence ao vínculo.
 */
export function linkRoleIndex(link: CopyLink, elementId: Id): number {
  const source = link.sourceIds.indexOf(elementId);
  if (source >= 0) return source;
  for (const member of link.members) {
    const role = member.ids.indexOf(elementId);
    if (role >= 0) return role;
  }
  return -1;
}

/**
 * Outras cópias do mesmo papel, uma por nível (a origem não entra). Elementos que já não existem
 * no projeto são ignorados; elementos repetidos no vínculo aparecem uma vez só.
 */
export function linkedSiblings(p: Project, link: CopyLink, elementId: Id): Id[] {
  const role = linkRoleIndex(link, elementId);
  if (role < 0) return [];
  const out: Id[] = [];
  for (const member of link.members) {
    const id = member.ids[role];
    if (!id || id === elementId || !p.elements[id] || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

/** Monta o vínculo com os ids de origem e as cópias por nível (as listas são copiadas). */
export function makeCopyLink(sourceIds: Id[], members: { levelId: Id; ids: Id[] }[], mint: CopyLinkMint): CopyLink {
  return {
    id: mint('link'),
    sourceIds: [...sourceIds],
    members: members.map((m) => ({ levelId: m.levelId, ids: [...m.ids] })),
    createdAt: Date.now(),
  };
}

/** Níveis ordenados por cota: o delta de índice do vínculo é o mesmo do "Colar alinhado aos níveis". */
function sortedLevels(p: Project): Level[] {
  return [...p.levels].sort((a, b) => a.elevation - b.elevation);
}

function levelIndex(levels: Level[], levelId: Id | null | undefined): number {
  return levelId ? levels.findIndex((l) => l.id === levelId) : -1;
}

/** Nível efetivo do elemento: o próprio, ou o da parede anfitriã no caso de abertura. */
function elementLevelIdOf(p: Project, elementId: Id): Id | null {
  const e = p.elements[elementId];
  if (!e) return null;
  if (isOpening(e)) {
    const host = p.elements[e.hostId];
    return host && hasLevel(host) ? host.levelId : null;
  }
  return hasLevel(e) ? e.levelId : null;
}

function memberOf(link: CopyLink, elementId: Id): CopyLinkMember | undefined {
  return link.members.find((m) => m.ids.includes(elementId));
}

/**
 * Remapeia o nível de topo pelo delta de índice entre o nível de origem e o de destino. Se o topo
 * estourar o último nível, devolve null: o topo cai na altura explícita (`height`), como no colar.
 */
function remapTopLevel(levels: Level[], fromLevelId: Id | null, toLevelId: Id | null, topLevelId: Id | null): Id | null {
  if (topLevelId === null) return null;
  const from = levelIndex(levels, fromLevelId);
  const to = levelIndex(levels, toLevelId);
  const top = levelIndex(levels, topLevelId);
  if (from < 0 || to < 0 || top < 0) return topLevelId;
  return levels[top + (to - from)]?.id ?? null;
}

/** Id da cópia do mesmo papel no nível de destino; undefined quando o id não está no vínculo. */
function remapLinkedId(link: CopyLink, targetMember: CopyLinkMember, sourceId: Id | undefined): Id | undefined {
  if (!sourceId) return undefined;
  const role = linkRoleIndex(link, sourceId);
  return role >= 0 ? targetMember.ids[role] : undefined;
}

/** Desloca o Z (terceira coordenada) de uma lista x, y, z... sem tocar nas demais coordenadas. */
function shiftZ(positions: readonly number[], dz: number): number[] {
  const out = positions.slice();
  for (let i = 2; i < out.length; i += 3) out[i] = out[i]! + dz;
  return out;
}

/**
 * Vínculo do forro com o ambiente. Só remapeia quando o ambiente também está no vínculo; sem ele, o
 * forro do destino solta o vínculo e mantém o contorno copiado (mesma regra do colar).
 */
function ceilingRoomPatch(from: Ceiling, target: Ceiling, link: CopyLink, targetMember: CopyLinkMember): Partial<Ceiling> {
  if (!from.roomId) return { roomId: null, roomLinked: undefined };
  const mapped = remapLinkedId(link, targetMember, from.roomId);
  if (mapped) return { roomId: mapped, roomLinked: from.roomLinked };
  return { roomId: target.roomId ?? null, roomLinked: false };
}

/**
 * Comando que leva a geometria/parâmetros de `from` para uma cópia. Mantém id, nível e ordem do
 * destino e remapeia referências entre níveis. Devolve null quando os elementos não são da mesma
 * categoria (vínculo corrompido) ou quando falta o nível para calcular o delta de Z.
 */
function syncOne(
  p: Project,
  link: CopyLink,
  targetMember: CopyLinkMember,
  from: Element,
  target: Element,
  levels: Level[],
  fromLevelId: Id | null,
): Command | null {
  if (from.kind !== target.kind) return null;
  const toLevelId = elementLevelIdOf(p, target.id) ?? targetMember.levelId;
  switch (from.kind) {
    // v1: guarda-corpo não entra no vínculo de andar-tipo (decisão 0055 §11); a cópia fica sem sincronização.
    case 'railing':
      return null;
    // estrutura: ficha T1 (copiar/colar e vínculo de andar-tipo de pilar, viga e fundação); a cópia fica sem sincronização.
    case 'column':
    case 'beam':
    case 'footing':
      return null;
    case 'wall': {
      if (!isWall(target)) return null;
      const { id: _id, kind: _kind, levelId: _levelId, order: _order, ...rest } = from;
      const patch: Partial<Wall> = {
        ...rest,
        topLevelId: remapTopLevel(levels, fromLevelId, toLevelId, from.topLevelId),
        // Telhado de topo: aponta para a cópia do mesmo nível; fora do vínculo, limpa (volta a "qualquer telhado").
        attachTopRoofId: remapLinkedId(link, targetMember, from.attachTopRoofId),
      };
      return { type: 'updateElements', ids: [target.id], patch };
    }
    case 'door':
    case 'window': {
      if (!isOpening(target)) return null;
      const { id: _id, hostId, ...rest } = from;
      const hostRole = linkRoleIndex(link, hostId);
      const mappedHost = hostRole >= 0 ? targetMember.ids[hostRole] : undefined;
      const patch: Partial<Opening> = { ...rest, hostId: mappedHost ?? target.hostId };
      return { type: 'updateElements', ids: [target.id], patch };
    }
    case 'floor': {
      if (!isFloor(target)) return null;
      const { id: _id, kind: _kind, levelId: _levelId, order: _order, ...rest } = from;
      return { type: 'updateElements', ids: [target.id], patch: rest };
    }
    case 'slab': {
      if (!isSlab(target)) return null;
      const { id: _id, kind: _kind, levelId: _levelId, order: _order, ...rest } = from;
      return { type: 'updateElements', ids: [target.id], patch: rest };
    }
    case 'ceiling': {
      if (!isCeiling(target)) return null;
      const { id: _id, kind: _kind, levelId: _levelId, order: _order, ...rest } = from;
      const patch: Partial<Ceiling> = { ...rest, ...ceilingRoomPatch(from, target, link, targetMember) };
      return { type: 'updateCeiling', id: target.id, patch };
    }
    case 'roof': {
      if (!isRoof(target)) return null;
      const { id: _id, kind: _kind, levelId: _levelId, order: _order, ...rest } = from;
      return { type: 'updateElements', ids: [target.id], patch: rest };
    }
    case 'stair': {
      if (!isStair(target)) return null;
      const { id: _id, kind: _kind, levelId: _levelId, order: _order, ...rest } = from;
      const patch: Partial<Stair> = { ...rest, topLevelId: remapTopLevel(levels, fromLevelId, toLevelId, from.topLevelId) };
      return { type: 'updateElements', ids: [target.id], patch };
    }
    case 'ramp': {
      if (!isRamp(target)) return null;
      const { id: _id, kind: _kind, levelId: _levelId, order: _order, ...rest } = from;
      const patch: Partial<Ramp> = { ...rest, topLevelId: remapTopLevel(levels, fromLevelId, toLevelId, from.topLevelId) };
      return { type: 'updateElements', ids: [target.id], patch };
    }
    case 'room': {
      if (!isRoom(target)) return null;
      const { id: _id, kind: _kind, levelId: _levelId, order: _order, ...rest } = from;
      return { type: 'updateRoom', id: target.id, patch: rest };
    }
    case 'cad': {
      if (!isCad(target)) return null;
      // Os traços e textos do CAD são imutáveis e compartilhados entre as cópias; o que muda por nível é o
      // deslocamento vertical. `offsetZ` é relativo ao nível (`z = elevação + offsetZ`), então copiar o valor
      // da origem mantém a cópia na mesma posição relativa ao nível de destino (sem somar delta).
      return {
        type: 'updateCadDrawing',
        id: target.id,
        patch: { name: from.name, visible: from.visible, offsetZ: from.offsetZ },
      };
    }
    case 'generic': {
      if (!isGeneric(target)) return null;
      const { id: _id, kind: _kind, levelId: _levelId, order: _order, ...rest } = from;
      // A malha do genérico está em Z absoluto: a cópia do destino precisa do delta de elevação.
      const fromZ = levels.find((l) => l.id === from.levelId)?.elevation;
      const toZ = levels.find((l) => l.id === toLevelId)?.elevation;
      if (fromZ === undefined || toZ === undefined) return null;
      const dz = toZ - fromZ;
      const patch: Partial<Generic> = {
        ...rest,
        mesh: dz === 0 ? from.mesh : { positions: shiftZ(from.mesh.positions, dz), indices: from.mesh.indices },
      };
      return { type: 'updateGeneric', id: target.id, patch };
    }
  }
}

/**
 * Sincroniza as cópias vinculadas de um elemento: leva geometria e parâmetros do `fromId` para os
 * irmãos (todos, ou só `toIds`), mantendo id, nível e ordem de cada destino. Devolve um único batch
 * (um passo de desfazer) ou null quando não há o que sincronizar.
 *
 * O `fromId` pode ser tanto uma cópia quanto o elemento de origem. Referências entre níveis são
 * remapeadas: `topLevelId` por delta de índice, `attachTopRoofId`, `hostId` e `roomId` pela posição
 * no vínculo.
 */
/**
 * Sincroniza o andar-tipo INTEIRO a partir do nível do elemento selecionado: parede, aberturas, piso, laje,
 * forro, telhado, escada, rampa, ambiente etc. de uma vez, num único passo de desfazer. Se o selecionado for
 * a origem, leva os originais; se for uma cópia, leva o conjunto daquele nível para os outros níveis.
 */
export function syncWholeLinkCommand(p: Project, linkId: Id, fromElementId: Id): Command | null {
  const link = (p.copyLinks ?? []).find((l) => l.id === linkId);
  if (!link) return null;
  const fromLevelId = elementLevelIdOf(p, fromElementId);
  const member = fromLevelId ? link.members.find((m) => m.levelId === fromLevelId) : undefined;
  const fromIds = member ? member.ids : link.sourceIds;
  const commands: Command[] = [];
  for (const fromId of fromIds) {
    if (!fromId || !p.elements[fromId]) continue;
    const command = syncLinkedCommand(p, { linkId, fromId });
    if (command) commands.push(command);
  }
  return commands.length > 0 ? { type: 'batch', commands } : null;
}

export function syncLinkedCommand(p: Project, c: SyncLinkedElements): Command | null {
  const link = (p.copyLinks ?? []).find((l) => l.id === c.linkId);
  if (!link) return null;
  const from = p.elements[c.fromId];
  if (!from) return null;
  const role = linkRoleIndex(link, c.fromId);
  if (role < 0 || role >= link.sourceIds.length) return null;
  const levels = sortedLevels(p);
  const fromLevelId = elementLevelIdOf(p, c.fromId) ?? memberOf(link, c.fromId)?.levelId ?? null;
  const only = c.toIds ? new Set(c.toIds) : null;
  const commands: Command[] = [];
  const seen = new Set<Id>();
  for (const member of link.members) {
    const targetId = member.ids[role];
    if (!targetId || targetId === c.fromId || seen.has(targetId)) continue;
    if (only && !only.has(targetId)) continue;
    seen.add(targetId);
    const target = p.elements[targetId];
    if (!target) continue;
    const command = syncOne(p, link, member, from, target, levels, fromLevelId);
    if (command) commands.push(command);
  }
  return commands.length > 0 ? { type: 'batch', commands } : null;
}
