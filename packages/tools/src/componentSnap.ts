import { resolveRampOne, resolveStairOne, type ResolvedRamp, type ResolvedStair } from '@hestia/engine';
import { dist, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import type { Id, Project, Ramp, Stair } from '@hestia/model';
import { planComponentsInLevel } from './componentLevels.ts';
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

/** Chave do segmento: o par ordenado normalizado, para a mesma aresta vinda de duas peças virar uma só. */
function segmentKey(a: Vec2, b: Vec2, hostId: Id): string {
  const ka = pointKey(a);
  const kb = pointKey(b);
  return ka <= kb ? `${ka}|${kb}|${hostId}` : `${kb}|${ka}|${hostId}`;
}

/** Vértice de captura: as pontas dos polígonos e dos espelhos entram como `endpoint`, com o dono do elemento. */
function addPoint(points: Map<string, ComponentSnapPoint>, hostId: Id, q: Vec2): void {
  const key = `${pointKey(q)}|${hostId}`;
  if (!points.has(key)) points.set(key, { x: q.x, y: q.y, hostId, kind: 'endpoint' });
}

/** Aresta de captura; as pontas também viram `endpoint`, como os cantos das linhas do croqui. */
function addSegment(
  points: Map<string, ComponentSnapPoint>,
  segments: ComponentSnapSegment[],
  seen: Set<string>,
  hostId: Id,
  a: Vec2,
  b: Vec2,
): void {
  addPoint(points, hostId, a);
  addPoint(points, hostId, b);
  if (dist(a, b) < MIN_SEG) return;
  const key = segmentKey(a, b, hostId);
  if (seen.has(key)) return;
  seen.add(key);
  segments.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, hostId, kind: 'nearest' });
}

/** Anel de um polígono (externo ou furo): todos os vértices e todas as arestas, fechando o contorno. */
function addRing(
  points: Map<string, ComponentSnapPoint>,
  segments: ComponentSnapSegment[],
  seen: Set<string>,
  hostId: Id,
  ring: Ring,
): void {
  for (const q of ring) addPoint(points, hostId, q);
  for (let i = 1; i < ring.length; i++) addSegment(points, segments, seen, hostId, ring[i - 1]!, ring[i]!);
  // O anel não repete o primeiro ponto no fim: a aresta de fechamento é a do último vértice de volta ao primeiro.
  if (ring.length > 2) addSegment(points, segments, seen, hostId, ring[ring.length - 1]!, ring[0]!);
}

/** MultiPolygon: cada polígono tem o anel externo e os furos; todos contam como contorno de captura. */
function addMulti(
  points: Map<string, ComponentSnapPoint>,
  segments: ComponentSnapSegment[],
  seen: Set<string>,
  hostId: Id,
  mp: MultiPolygon,
): void {
  for (const poly of mp) for (const ring of poly) addRing(points, segments, seen, hostId, ring);
}

/** Croqui da escada/rampa: pontas das curvas viram `endpoint` e as linhas amostradas, `nearest`. */
function addSketch(
  points: Map<string, ComponentSnapPoint>,
  segments: ComponentSnapSegment[],
  seen: Set<string>,
  hostId: Id,
  ends: Vec2[],
  polylines: Vec2[][],
): void {
  for (const q of ends) addPoint(points, hostId, q);
  for (const pl of polylines) {
    for (let i = 1; i < pl.length; i++) addSegment(points, segments, seen, hostId, pl[i - 1]!, pl[i]!);
  }
}

/**
 * Geometria resolvida da escada: degraus, patamares, pegada e espelhos, a mesma que o render desenha em planta.
 * Devolve `false` quando a resolução não gerou peça nenhuma e o croqui precisa entrar no lugar dela.
 */
function addResolvedStair(
  points: Map<string, ComponentSnapPoint>,
  segments: ComponentSnapSegment[],
  seen: Set<string>,
  s: ResolvedStair,
): boolean {
  if (s.steps.length === 0) return false;
  for (const st of s.steps) addRing(points, segments, seen, s.id, st.polygon);
  addMulti(points, segments, seen, s.id, s.footprint);
  for (const r of s.risers) addSegment(points, segments, seen, s.id, r.a, r.b);
  return true;
}

/**
 * Geometria resolvida da rampa: lances, patamares, pegada e as bordas de início/fim de cada lance.
 * Devolve `false` quando não há lance nem patamar e o croqui precisa entrar no lugar dela.
 */
function addResolvedRamp(
  points: Map<string, ComponentSnapPoint>,
  segments: ComponentSnapSegment[],
  seen: Set<string>,
  r: ResolvedRamp,
): boolean {
  if (r.flights.length === 0 && r.landings.length === 0) return false;
  for (const f of r.flights) {
    addRing(points, segments, seen, r.id, f.polygon);
    addSegment(points, segments, seen, r.id, f.startEdge[0], f.startEdge[1]);
    addSegment(points, segments, seen, r.id, f.endEdge[0], f.endEdge[1]);
  }
  for (const l of r.landings) addRing(points, segments, seen, r.id, l.polygon);
  addMulti(points, segments, seen, r.id, r.footprint);
  return true;
}

/** Escada do nível: resolvedor do motor primeiro; sem peças (topo <= base, croqui inválido), o croqui de sempre. */
function addStair(
  p: Project,
  points: Map<string, ComponentSnapPoint>,
  segments: ComponentSnapSegment[],
  seen: Set<string>,
  s: Stair,
): void {
  const rs = resolveStairOne(p, s);
  if (rs && addResolvedStair(points, segments, seen, rs)) return;
  addSketch(points, segments, seen, s.id, stairEndpoints(s), stairPolylines(s));
}

/** Rampa do nível: mesmo critério da escada. */
function addRamp(
  p: Project,
  points: Map<string, ComponentSnapPoint>,
  segments: ComponentSnapSegment[],
  seen: Set<string>,
  r: Ramp,
): void {
  const rr = resolveRampOne(p, r);
  if (rr && addResolvedRamp(points, segments, seen, rr)) return;
  addSketch(points, segments, seen, r.id, rampEndpoints(r), rampPolylines(r));
}

function geometryOfLevel(p: Project, levelId: Id): ComponentSnapGeometry {
  const points = new Map<string, ComponentSnapPoint>();
  const segments: ComponentSnapSegment[] = [];
  const seen = new Set<string>();
  // A planta mostra a escada/rampa que nasce, a que chega e a que atravessa a cota do nível (helper componentLevels).
  for (const e of planComponentsInLevel(p, levelId)) {
    if (e.kind === 'stair') addStair(p, points, segments, seen, e);
    else addRamp(p, points, segments, seen, e);
  }
  return { points: [...points.values()], segments };
}

/**
 * Pontos e arestas de captura das escadas e rampas visíveis no nível: os vértices e as arestas da geometria resolvida
 * (degraus, patamares, pegada, espelhos, bordas dos lances — o que o render desenha) viram `endpoint` e `nearest`.
 * Sem peças resolvidas, o croqui entra no lugar para o elemento não sumir da captura. `hostId` é o elemento dono:
 * some da captura quando ele está em `ignore` (ex.: a escada sendo movida). O cache evita recalcular a cada quadro.
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
