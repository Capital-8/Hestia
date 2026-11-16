import { apoioDoElemento, servicoGuardaCorpo, servicoMassa, type ApoioDoElemento } from '@hestia/engine';
import { dist, type Vec2 } from '@hestia/geom';
import { isGuardaCorpo, isMass, type Id, type Project, type Ramp, type Stair } from '@hestia/model';
import { planComponentsInLevel } from './componentLevels.ts';
import { rampEndpoints, rampPolylines } from './rampPick.ts';
import { stairEndpoints, stairPolylines } from './stairPick.ts';
import { SnapIndexado } from './snapIndexado.ts';
import type { SnapKind } from './types.ts';

/** Ponto de captura de uma escada, rampa ou guarda-corpo: a forma do ponto extra do motor, com o dono para o `ignore`. */
export interface ComponentSnapPoint extends Vec2 {
  hostId?: Id;
  kind?: SnapKind;
}

/** Aresta de captura de uma escada, rampa ou guarda-corpo: o pé da perpendicular sobre ela é a captura `nearest`. */
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

interface Entrada {
  /** Os kernels do guarda-corpo e da massa estavam prontos? Eles podem ficar prontos sem o projeto mudar, e aí a geometria ganha as peças. */
  kernel: boolean;
  geometry: ComponentSnapGeometry;
  index?: SnapIndexado;
}

/** Geometria por projeto e nível: o projeto é imutável, então o cache por identidade acompanha as edições. */
const cache = new WeakMap<Project, Map<Id, Entrada>>();

/** Chave do ponto com 6 casas: junções e amostras repetidas viram uma referência só. */
// units-ok: chave de deduplicação geométrica, não é texto de medida na interface.
const pointKey = (q: Vec2): string => `${q.x.toFixed(6)},${q.y.toFixed(6)}`;

/** Chave do segmento: o par ordenado normalizado, para a mesma aresta vinda de duas peças virar uma só. */
function segmentKey(a: Vec2, b: Vec2, hostId: Id): string {
  const ka = pointKey(a);
  const kb = pointKey(b);
  return ka <= kb ? `${ka}|${kb}|${hostId}` : `${kb}|${ka}|${hostId}`;
}

/** Vértice de captura do croqui: as pontas entram como `endpoint`, com o dono do elemento. */
function addPoint(points: Map<string, ComponentSnapPoint>, hostId: Id, q: Vec2): void {
  const key = `${pointKey(q)}|${hostId}`;
  if (!points.has(key)) points.set(key, { x: q.x, y: q.y, hostId, kind: 'endpoint' });
}

/** Aresta de captura do croqui; as pontas também viram `endpoint`, como os cantos das linhas do croqui. */
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

/** Croqui de um elemento sem geometria resolvida (topo <= base, croqui inválido): as pontas e as linhas amostradas viram captura. */
function geometryOfSketch(hostId: Id, ends: Vec2[], polylines: Vec2[][]): ComponentSnapGeometry {
  const points = new Map<string, ComponentSnapPoint>();
  const segments: ComponentSnapSegment[] = [];
  const seen = new Set<string>();
  for (const q of ends) addPoint(points, hostId, q);
  for (const pl of polylines) {
    for (let i = 1; i < pl.length; i++) addSegment(points, segments, seen, hostId, pl[i - 1]!, pl[i]!);
  }
  return { points: [...points.values()], segments };
}

/** Pontos e arestas de captura de um elemento no formato do motor (o dono vai em cada item), guardados pelo apoio do elemento. */
const doApoio = new WeakMap<ApoioDoElemento, ComponentSnapGeometry>();

/**
 * Pontos e arestas de apoio de um elemento (a mesma fonte das cotas associativas): vértice (`endpoint`), meio de cada aresta
 * (`midpoint`), centro (`center`) e as arestas (`nearest`). A deduplicação já veio do motor. Uma edição de outro elemento não
 * refaz estes itens: o apoio é o mesmo objeto enquanto o elemento (e a geometria dele) não muda.
 */
function geometryOfApoio(hostId: Id, apoio: ApoioDoElemento): ComponentSnapGeometry {
  let g = doApoio.get(apoio);
  if (!g) {
    g = {
      points: apoio.pontos.map((q) => ({ x: q.x, y: q.y, hostId, kind: q.tipo })),
      segments: apoio.segmentos.map((e) => ({ a: e.a, b: e.b, hostId, kind: 'nearest' as const })),
    };
    doApoio.set(apoio, g);
  }
  return g;
}

/** Escada ou rampa do nível: a geometria resolvida do motor primeiro; sem peças, o croqui de sempre. */
function geometryOfComponent(p: Project, e: Stair | Ramp): ComponentSnapGeometry {
  const apoio = apoioDoElemento(p, e);
  if (apoio) return geometryOfApoio(e.id, apoio);
  return e.kind === 'stair' ? geometryOfSketch(e.id, stairEndpoints(e), stairPolylines(e)) : geometryOfSketch(e.id, rampEndpoints(e), rampPolylines(e));
}

function geometryOfLevel(p: Project, levelId: Id): ComponentSnapGeometry {
  const parts: ComponentSnapGeometry[] = [];
  // A planta mostra a escada/rampa que nasce, a que chega e a que atravessa a cota do nível (helper componentLevels).
  for (const e of planComponentsInLevel(p, levelId)) parts.push(geometryOfComponent(p, e));
  // Guarda-corpo do nível (manual ou hospedado): eixo e peças. Sem a geometria do kernel, só o eixo do manual.
  for (const e of Object.values(p.elements)) {
    if (!isGuardaCorpo(e) || e.levelId !== levelId) continue;
    const apoio = apoioDoElemento(p, e);
    if (apoio) parts.push(geometryOfApoio(e.id, apoio));
  }
  // Massa do nível: vértices, meios de aresta e arestas do anel cortado (o kernel; sem ele o apoio sai vazio, A.5), pela mesma fonte das cotas.
  for (const e of Object.values(p.elements)) {
    if (!isMass(e) || e.levelId !== levelId) continue;
    const apoio = apoioDoElemento(p, e);
    if (apoio) parts.push(geometryOfApoio(e.id, apoio));
  }
  return { points: parts.flatMap((g) => g.points), segments: parts.flatMap((g) => g.segments) };
}

function entradaDoNivel(p: Project, levelId: Id): Entrada {
  let byLevel = cache.get(p);
  if (!byLevel) {
    byLevel = new Map();
    cache.set(p, byLevel);
  }
  const kernel = servicoGuardaCorpo().pronto() && servicoMassa().pronto();
  let all = byLevel.get(levelId);
  if (!all || all.kernel !== kernel) {
    all = { kernel, geometry: geometryOfLevel(p, levelId) };
    byLevel.set(levelId, all);
  }
  return all;
}

/**
 * Pontos e arestas de captura das escadas, rampas e guarda-corpos visíveis no nível: vértices, meios, centros e arestas da
 * geometria resolvida (degraus, patamares, pegada, espelhos, acabamentos, eixo, peças do guarda-corpo — o que o render
 * desenha) viram `endpoint`, `midpoint`, `center` e `nearest`. Sem peças resolvidas, o croqui entra no lugar para o
 * elemento não sumir da captura. `hostId` é o elemento dono: some da captura quando ele está em `ignore` (ex.: a escada
 * sendo movida). O cache evita recalcular a cada quadro.
 */
export function componentSnapGeometry(p: Project, levelId: Id): ComponentSnapGeometry {
  return entradaDoNivel(p, levelId).geometry;
}

/**
 * A mesma geometria, indexada para a captura: a consulta do cursor custa só o que está perto dele (com 100 escadas, a
 * varredura linear dos ~30 mil pontos passava de 25 ms por movimento do mouse). Memorizada junto com a geometria.
 */
export function componentSnapIndex(p: Project, levelId: Id): SnapIndexado {
  const e = entradaDoNivel(p, levelId);
  e.index ??= new SnapIndexado(e.geometry.points, e.geometry.segments);
  return e.index;
}
