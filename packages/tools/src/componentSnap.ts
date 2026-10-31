import { dist, type Vec2 } from '@hestia/geom';
import { rampsOnLevel, stairsOnLevel, type Id, type Project } from '@hestia/model';
import { rampEndpoints, rampPolylines } from './rampPick.ts';
import { stairEndpoints, stairPolylines } from './stairPick.ts';
import type { SnapKind } from './types.ts';

/** Ponto de captura de uma escada ou rampa: a forma do ponto extra do motor, com o dono para o `ignore`. */
export interface ComponentSnapPoint extends Vec2 {
  hostId?: Id;
  kind?: SnapKind;
}

/** Aresta de captura de uma escada ou rampa: o pé da perpendicular sobre ela é a captura `nearest`. */
export interface ComponentSnapSegment {
  a: Vec2;
  b: Vec2;
  hostId?: Id;
  kind?: SnapKind;
}

export interface ComponentSnapGeometry {
  points: ComponentSnapPoint[];
  segments: ComponentSnapSegment[];
}

/** Comprimento mínimo de um trecho amostrado; abaixo disso as duas pontas são o mesmo ponto (amostragem de arco). */
const MIN_SEG = 1e-9;

/** Geometria por projeto e nível: o projeto é imutável, então o cache por identidade acompanha as edições. */
const cache = new WeakMap<Project, Map<Id, ComponentSnapGeometry>>();

/** Chave do ponto com 6 casas: junções e amostras repetidas viram uma referência só. */
// units-ok: chave de deduplicação geométrica, não é texto de medida na interface.
const pointKey = (q: Vec2): string => `${q.x.toFixed(6)},${q.y.toFixed(6)}`;

/**
 * Pontas, limites, espelhos, caminhada e contornos de patamar de um elemento (escada ou rampa). A chave do ponto
 * inclui o dono: duas peças que se encostam continuam com donos distintos, e ocultar uma não leva a outra junto.
 */
function addElement(points: Map<string, ComponentSnapPoint>, segments: ComponentSnapSegment[], hostId: Id, ends: Vec2[], polylines: Vec2[][]): void {
  for (const q of ends) {
    const key = `${pointKey(q)}|${hostId}`;
    if (!points.has(key)) points.set(key, { ...q, hostId, kind: 'endpoint' });
  }
  for (const pl of polylines) {
    for (let i = 1; i < pl.length; i++) {
      const a = pl[i - 1]!;
      const b = pl[i]!;
      if (dist(a, b) < MIN_SEG) continue;
      segments.push({ a: { ...a }, b: { ...b }, hostId, kind: 'nearest' });
    }
  }
}

function geometryOfLevel(p: Project, levelId: Id): ComponentSnapGeometry {
  const points = new Map<string, ComponentSnapPoint>();
  const segments: ComponentSnapSegment[] = [];
  for (const s of stairsOnLevel(p, levelId)) addElement(points, segments, s.id, stairEndpoints(s), stairPolylines(s));
  for (const r of rampsOnLevel(p, levelId)) addElement(points, segments, r.id, rampEndpoints(r), rampPolylines(r));
  return { points: [...points.values()], segments };
}

/**
 * Pontos e arestas de captura das escadas e rampas do nível: as pontas viram `endpoint` e as linhas amostradas
 * (limites, espelhos, caminhada e patamares) viram `nearest`. `hostId` é o elemento dono: some da captura quando
 * ele está em `ignore` (ex.: a escada sendo movida). O cache evita recalcular a amostragem a cada quadro.
 */
export function componentSnapGeometry(p: Project, levelId: Id): ComponentSnapGeometry {
  let byLevel = cache.get(p);
  if (!byLevel) {
    byLevel = new Map();
    cache.set(p, byLevel);
  }
  let all = byLevel.get(levelId);
  if (!all) {
    all = geometryOfLevel(p, levelId);
    byLevel.set(levelId, all);
  }
  return all;
}
