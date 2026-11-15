import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import { wallFacesCached, wallTopFacesCached, type TopPoint, type WallTopFaces } from '@hestia/engine';
import type { Id, Wall } from '@hestia/model';
import type { InferContext } from './infer.ts';
import type { SnapOptions } from './types.ts';

/**
 * Captura da FACE SUPERIOR da parede em planta (T-C). Cada aresta superior (exterior, interior e, com Núcleo ligado, as do
 * núcleo) oferece cantos, pontos médios e o pé sobre a aresta, na posição em planta do TOPO (em parede inclinada,
 * deslocada d(H)) e com a cota z do topo. Em parede vertical o topo coincide com a base: nas ferramentas de topo o
 * candidato funde com o da base (mesmo ponto, menor custo, rótulo "Face superior"); nas demais só aparece se a posição
 * difere da base em mais de `BASE_TOL`.
 */
export const BASE_TOL = 0.005;

/** Pesos (menor vence): padrão (como a face de base) e das ferramentas de topo, que vencem a captura da base no mesmo ponto. */
const W_VERTEX = 0.1;
const W_MID = 0.25;
const W_FOOT = 0.5;
const W_VERTEX_TOOL = -0.05;
const W_MID_TOOL = 0.15;
const W_FOOT_TOOL = 0.35;

/** Ferramentas que trabalham com o topo das paredes. */
export const TOP_FACE_TOOLS: ReadonlySet<string> = new Set(['roof', 'ceiling', 'floor', 'slab', 'align']);

export type TopFacePush = (point: Vec2, z: number, weight: number, hostId: Id) => void;

const near = (cursor: Vec2, pts: readonly Vec2[], tol: number): boolean => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const q of pts) {
    if (q.x < minX) minX = q.x;
    if (q.x > maxX) maxX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.y > maxY) maxY = q.y;
  }
  return cursor.x >= minX - tol && cursor.x <= maxX + tol && cursor.y >= minY - tol && cursor.y <= maxY + tol;
};

/** Distância de `p` ao anel (contorno fechado da base). */
function distToRing(p: Vec2, ring: readonly Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++) d = Math.min(d, dist(p, closestOnSegment(p, ring[i]!, ring[(i + 1) % ring.length]!)));
  return d;
}

export function addTopFaceSnaps(ctx: InferContext, sn: SnapOptions, cursor: Vec2, tol: number, walls: readonly Wall[], levels: readonly Id[], push: TopFacePush): void {
  if (sn.topFaces === false || (!sn.faces && !sn.core)) return;
  const tool = ctx.topFaceTool === true;
  // Parede vertical, topo horizontal e livre: o topo é a base em planta; fora das ferramentas de topo nada a oferecer.
  if (!tool && !walls.some((w) => w.tilt || w.topProfile || w.attachTopToRoof)) return;
  const byId = new Map(walls.map((w) => [w.id, w] as const));
  const wVertex = tool ? W_VERTEX_TOOL : W_VERTEX;
  const wMid = tool ? W_MID_TOOL : W_MID;
  const wFoot = tool ? W_FOOT_TOOL : W_FOOT;
  for (const level of levels) {
    let bases: Map<Id, { outline: Vec2[]; core: Vec2[] }> | null = null;
    const baseOf = (id: Id): { outline: Vec2[]; core: Vec2[] } | undefined => {
      if (!bases) bases = new Map(wallFacesCached(ctx.project, level).map((f) => [f.wallId, { outline: f.outline, core: f.coreOutline }] as const));
      return bases.get(id);
    };
    for (const tf of wallTopFacesCached(ctx.project, level)) {
      const wall = byId.get(tf.wallId);
      if (!wall) continue;
      if (!near(cursor, tf.outline, tol)) continue;
      const emit = (edge: TopPoint[], arc: boolean): void => {
        // Coincide com a base? (só as ferramentas comuns descartam; as de topo fundem mantendo o rótulo de face superior.)
        const skip = (p: Vec2): boolean => {
          if (tool) return false;
          const b = baseOf(tf.wallId);
          if (!b) return false;
          return Math.min(b.outline.length >= 3 ? distToRing(p, b.outline) : Infinity, b.core.length >= 3 ? distToRing(p, b.core) : Infinity) <= BASE_TOL;
        };
        const put = (p: Vec2, z: number, w: number): void => {
          if (dist(cursor, p) <= tol && !skip(p)) push(p, z, w, tf.wallId);
        };
        const verts = arc ? [edge[0]!, edge[Math.floor(edge.length / 2)]!, edge[edge.length - 1]!] : edge;
        for (const q of verts) put(q, q.z, wVertex);
        for (let i = 0; i + 1 < edge.length; i++) {
          const a = edge[i]!, b = edge[i + 1]!;
          const len = dist(a, b);
          if (len < 1e-9) continue;
          if (!arc) put({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, (a.z + b.z) / 2, wMid);
          const foot = closestOnSegment(cursor, a, b);
          put(foot, a.z + (b.z - a.z) * (dist(a, foot) / len), wFoot);
        }
      };
      const edges = edgesOf(tf, sn);
      for (const edge of edges) {
        emit(edge, wall.sag !== 0 && edge.length > 3);
      }
    }
  }
}

function edgesOf(tf: WallTopFaces, sn: SnapOptions): TopPoint[][] {
  const out: TopPoint[][] = [];
  if (sn.faces) out.push(tf.exterior, tf.interior);
  if (sn.core) out.push(tf.coreExterior, tf.coreInterior);
  return out;
}
