import { arcFromSagitta, dist } from '@hestia/geom';
import { spanTypeOf } from './openingNominal.ts';
import { profileMax } from './profile.ts';
import { DEFAULT_VIEW_RANGE, type ViewRange } from './viewRange.ts';
import { floorViewId, planViewOf } from './planView.ts';
import { isOpening, isRamp, isStair, isWall, type Id, type Level, type Opening, type OpeningType, type Project, type Ramp, type Stair, type Wall, type WallType } from './types.ts';

export const getWall = (p: Project, id: Id): Wall | undefined => {
  const e = p.elements[id];
  return isWall(e) ? e : undefined;
};

export const wallsOnLevel = (p: Project, levelId: Id): Wall[] =>
  Object.values(p.elements)
    .filter(isWall)
    .filter((w) => w.levelId === levelId)
    .sort((a, b) => a.order - b.order);

/**
 * Aberturas de cada parede por snapshot do projeto (o motor é imutável: elemento novo vem com projeto novo). Monta-se
 * numa só passagem; antes, cada chamada varria `p.elements` inteiro (paredes × elementos em cada nível).
 */
const aberturasPorParede = new WeakMap<Project, Map<Id, Opening[]>>();

function aberturasDoProjeto(p: Project): Map<Id, Opening[]> {
  const hit = aberturasPorParede.get(p);
  if (hit) return hit;
  const porParede = new Map<Id, Opening[]>();
  for (const e of Object.values(p.elements)) {
    if (!isOpening(e)) continue;
    const lista = porParede.get(e.hostId);
    if (lista) lista.push(e);
    else porParede.set(e.hostId, [e]);
  }
  aberturasPorParede.set(p, porParede);
  return porParede;
}

/** Aberturas da parede, na ordem do projeto. A lista devolvida é cópia: quem a altera não mexe no índice. */
export const openingsOfWall = (p: Project, wallId: Id): Opening[] => [...(aberturasDoProjeto(p).get(wallId) ?? [])];

export const wallType = (p: Project, w: Wall): WallType => {
  const t = p.wallTypes[w.typeId] ?? p.wallTypes[p.defaults.wallTypeId];
  if (!t) throw new Error(`Tipo de parede ausente: ${w.typeId}`);
  return t;
};

/** Tipo da abertura já normalizado para o VÃO (`width`/`height` = vão, mesmo com `nominalRef` 'leaf'; ver `openingNominal.ts`). */
export const openingType = (p: Project, o: Opening): OpeningType => {
  const t = p.openingTypes[o.typeId];
  if (!t) throw new Error(`Tipo de abertura ausente: ${o.typeId}`);
  return spanTypeOf(t);
};

/** Arco do eixo, ou null se a parede for reta. */
export const wallArc = (w: Wall) => arcFromSagitta(w.a, w.b, w.sag);

/** Comprimento do eixo (comprimento de arco nas paredes curvas). */
export const wallLength = (w: Wall): number => wallArc(w)?.length ?? dist(w.a, w.b);

export const levelElevation = (p: Project, levelId: Id): number =>
  p.levels.find((l) => l.id === levelId)?.elevation ?? 0;

/**
 * Intervalo de vista do nível; o padrão se o nível não existir.
 * @deprecated Use `planViewRangeOf(p, viewId)` (exportado de planView.ts) com `floorViewId(levelId)`.
 */
export const viewRangeOf = (p: Project, levelId: Id): ViewRange =>
  planViewOf(p, floorViewId(levelId))?.viewRange ?? { ...DEFAULT_VIEW_RANGE };

export const wallBaseElevation = (p: Project, w: Wall): number => levelElevation(p, w.levelId) + w.baseOffset;

export function wallTopElevation(p: Project, w: Wall): number {
  if (w.topLevelId) return levelElevation(p, w.topLevelId) + w.topOffset;
  return wallBaseElevation(p, w) + w.height;
}

export const wallHeight = (p: Project, w: Wall): number => Math.max(0.01, wallTopElevation(p, w) - wallBaseElevation(p, w));

/** Altura máxima: a do perfil superior, quando há, senão a altura reta. */
export const wallMaxHeight = (p: Project, w: Wall): number => (w.topProfile && w.sag === 0 ? profileMax(w.topProfile) : wallHeight(p, w));

export const openingSill = (t: OpeningType, o: Opening): number => o.sillOverride ?? t.sill;

/**
 * Altura efetiva do vão: override da instância quando ele é um número finito e positivo; ausente, nulo, inválido ou não
 * positivo usa a altura do tipo (um override corrompido nunca derruba a geometria).
 */
export const openingHeight = (t: OpeningType, o: Opening): number => {
  const h = o.heightOverride;
  return typeof h === 'number' && Number.isFinite(h) && h > 0 ? h : t.height;
};

/** Quantos elementos usam o tipo de parede. */
export const wallTypeUsage = (p: Project, typeId: Id): number =>
  Object.values(p.elements).filter((e) => isWall(e) && e.typeId === typeId).length;

export const materialUsage = (p: Project, materialId: Id): number => {
  let n = 0;
  for (const t of Object.values(p.wallTypes)) for (const l of t.layers) if (l.materialId === materialId) n++;
  for (const t of Object.values(p.openingTypes)) {
    if (t.frameMaterialId === materialId) n++;
    if (t.glassMaterialId === materialId) n++;
  }
  return n;
};

/** Nível de menor elevação estritamente acima do nível dado, ou null (sem nível acima ou nível inexistente). */
export function levelAbove(p: Project, levelId: Id): Level | null {
  const base = p.levels.find((l) => l.id === levelId);
  if (!base) return null;
  let best: Level | null = null;
  for (const l of p.levels) if (l.elevation > base.elevation && (!best || l.elevation < best.elevation)) best = l;
  return best;
}

/** Nível de topo efetivo da escada: o explícito (topLevelId) ou o imediatamente acima; null se não houver. */
export function stairTopLevel(p: Project, s: Stair): Level | null {
  if (s.topLevelId !== null) return p.levels.find((l) => l.id === s.topLevelId) ?? null;
  return levelAbove(p, s.levelId);
}

/** Cota absoluta da base da escada: elevação do nível + baseOffset. */
export const stairBaseZ = (p: Project, s: Stair): number => levelElevation(p, s.levelId) + s.baseOffset;

/** Cota absoluta do topo: elevação do nível de topo + topOffset; sem nível de topo, base + height. */
export function stairTopZ(p: Project, s: Stair): number {
  const top = stairTopLevel(p, s);
  return top ? top.elevation + s.topOffset : stairBaseZ(p, s) + s.height;
}

export const stairs = (p: Project): Stair[] => Object.values(p.elements).filter(isStair).sort((a, b) => a.order - b.order);

export const stairsOnLevel = (p: Project, levelId: Id): Stair[] => stairs(p).filter((s) => s.levelId === levelId);

/** Quantas escadas usam o tipo de escada. */
export const stairTypeUsage = (p: Project, typeId: Id): number => stairs(p).filter((s) => s.typeId === typeId).length;

/** Nível de topo efetivo da rampa: o explícito (topLevelId) ou o imediatamente acima; null se não houver. */
export function rampTopLevel(p: Project, r: Ramp): Level | null {
  if (r.topLevelId !== null) return p.levels.find((l) => l.id === r.topLevelId) ?? null;
  return levelAbove(p, r.levelId);
}

/** Cota absoluta da base da rampa: elevação do nível + baseOffset. */
export const rampBaseZ = (p: Project, r: Ramp): number => levelElevation(p, r.levelId) + r.baseOffset;

/** Cota absoluta do topo: elevação do nível de topo + topOffset; sem nível de topo, base + height. */
export function rampTopZ(p: Project, r: Ramp): number {
  const top = rampTopLevel(p, r);
  return top ? top.elevation + r.topOffset : rampBaseZ(p, r) + r.height;
}

export const ramps = (p: Project): Ramp[] => Object.values(p.elements).filter(isRamp).sort((a, b) => a.order - b.order);

export const rampsOnLevel = (p: Project, levelId: Id): Ramp[] => ramps(p).filter((r) => r.levelId === levelId);

/** Quantas rampas usam o tipo de rampa. */
export const rampTypeUsage = (p: Project, typeId: Id): number => ramps(p).filter((r) => r.typeId === typeId).length;
