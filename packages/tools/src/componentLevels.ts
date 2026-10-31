import {
  levelElevation,
  ramps,
  rampBaseZ,
  rampTopLevel,
  rampTopZ,
  stairs,
  stairBaseZ,
  stairTopLevel,
  stairTopZ,
  type Id,
  type Project,
  type Ramp,
  type Stair,
} from '@hestia/model';

/** Escada ou rampa que a planta de um nível pode mostrar. */
export type PlanComponent = Stair | Ramp;

/**
 * Elementos de croqui visíveis na planta do nível, não só os que têm `levelId` igual ao nível:
 * - a escada/rampa que nasce no nível;
 * - a que chega no nível (`topLevelId` explícito ou o nível imediatamente acima);
 * - a que atravessa a cota do nível (base abaixo e topo acima), como a sobreposição esmaecida do pavimento de baixo.
 *
 * O cache por projeto é seguro porque o projeto é imutável por transação (Immer em `history.ts`).
 */
const cache = new WeakMap<Project, Map<Id, PlanComponent[]>>();

export function planComponentsInLevel(p: Project, levelId: Id): PlanComponent[] {
  let byLevel = cache.get(p);
  if (!byLevel) {
    byLevel = new Map();
    cache.set(p, byLevel);
  }
  const hit = byLevel.get(levelId);
  if (hit) return hit;

  const z = levelElevation(p, levelId);
  const visible = [...stairs(p), ...ramps(p)]
    .filter((e) => {
      if (e.levelId === levelId) return true;
      const top = e.kind === 'stair' ? stairTopLevel(p, e) : rampTopLevel(p, e);
      if (top?.id === levelId) return true;
      const baseZ = e.kind === 'stair' ? stairBaseZ(p, e) : rampBaseZ(p, e);
      const topZ = e.kind === 'stair' ? stairTopZ(p, e) : rampTopZ(p, e);
      return baseZ <= z + 1e-9 && z <= topZ + 1e-9;
    })
    .sort((a, b) => a.order - b.order);

  byLevel.set(levelId, visible);
  return visible;
}
