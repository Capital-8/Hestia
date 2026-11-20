import { dist, type Vec2 } from './vec.ts';
import { ringArea } from './polygon.ts';
import { SkeletonFail, type Node, type Sim } from './skeletonCore.ts';

/** Aresta líder de uma face (uma por reta; arestas colineares de mesmo peso compartilham a face). */
export interface LeaderInfo {
  id: number;
  ring: number;
  edge: number;
  w: number;
  startNode: number;
  endNode: number;
}

export interface RawFace {
  ring: number;
  edge: number;
  polygon: Vec2[];
  z: number[];
  holes?: Vec2[][];
  holeZ?: number[][];
}

export interface RawArc {
  a: Vec2;
  b: Vec2;
  za: number;
  zb: number;
  faces: [number, number];
}

const EPS = 1e-6;

function cleanNodes(nodes: Node[]): Node[] {
  const pts: Node[] = [];
  for (const q of nodes) {
    const last = pts[pts.length - 1];
    if (!last || dist(last, q) > EPS) pts.push(q);
  }
  while (pts.length > 2 && dist(pts[0]!, pts[pts.length - 1]!) <= EPS) pts.pop();
  return pts;
}

function walkLoop(sim: Sim, arcs: Array<{ a: number; b: number }>, path: number[]): Node[] {
  const start = path[0]!;
  let at = path[path.length - 1]!;
  let guard = arcs.length + 2;
  while (at !== start) {
    if (--guard <= 0) throw new SkeletonFail('contorno de face não fecha');
    const k = arcs.findIndex((s) => s.a === at || s.b === at);
    if (k < 0) throw new SkeletonFail('contorno de face não fecha');
    const seg = arcs[k]!;
    arcs[k] = arcs[arcs.length - 1]!;
    arcs.pop();
    at = seg.a === at ? seg.b : seg.a;
    if (at !== start) path.push(at);
  }
  return cleanNodes(path.map((id) => sim.nodes[id]!));
}

/** Separa um laço que toca a si mesmo num ponto em anel principal + laços internos (furos na própria face). */
function pinched(ring: Node[]): Node[][] {
  const same = (a: Node, b: Node): boolean => dist(a, b) < EPS;
  const loops: Node[][] = [];
  const cur = [...ring];
  while (true) {
    let splitIdx = -1;
    for (let j = 2; j < cur.length; j++) {
      if (same(cur[j]!, cur[0]!)) {
        splitIdx = j;
        break;
      }
    }
    if (splitIdx >= 0) {
      loops.push(cur.splice(splitIdx));
      continue;
    }
    let found: [number, number] | null = null;
    outer: for (let j = 2; j < cur.length; j++) {
      for (let i = 1; i < j; i++) {
        if (same(cur[i]!, cur[j]!)) {
          found = [i, j];
          break outer;
        }
      }
    }
    if (found) {
      loops.push(cur.splice(found[0], found[1] - found[0]));
      continue;
    }
    break;
  }
  return [cur, ...loops];
}

function toRingZ(pts: Node[], ccw: boolean): { ring: Vec2[]; z: number[] } {
  const ordered = (ringArea(pts) > 0) === ccw ? pts : [...pts].reverse();
  return {
    ring: ordered.map((p) => ({ x: p.x, y: p.y })),
    z: ordered.map((p) => p.z),
  };
}

/** Monta faces (uma por líder com peso > 0, incluindo furos internos na face) e arcos entre duas faces. */
export function buildOutput(sim: Sim, leaders: LeaderInfo[]): { faces: RawFace[]; arcs: RawArc[] } {
  const faces: RawFace[] = [];
  const faceIdx = new Map<number, number>();
  for (const L of leaders) {
    if (L.w <= 0) continue;
    const arcs = sim.arcs
      .filter((s) => (s.left === L.id) !== (s.right === L.id))
      .map((s) => ({ a: s.a, b: s.b }));
    const loops = pinched(walkLoop(sim, arcs, [L.startNode, L.endNode]));
    while (arcs.length > 0) {
      const seg = arcs.pop()!;
      loops.push(...pinched(walkLoop(sim, arcs, [seg.a, seg.b])));
    }
    const outerPts = loops[0]!;
    if (outerPts.length < 3 || Math.abs(ringArea(outerPts)) < 1e-12) {
      throw new SkeletonFail('face degenerada (área zero)');
    }
    const outer = toRingZ(outerPts, true);
    const holes: Vec2[][] = [];
    const holeZ: number[][] = [];
    for (const hPts of loops.slice(1)) {
      if (hPts.length < 3 || Math.abs(ringArea(hPts)) < 1e-12) continue;
      const h = toRingZ(hPts, false);
      holes.push(h.ring);
      holeZ.push(h.z);
    }
    faceIdx.set(L.id, faces.length);
    faces.push({
      ring: L.ring,
      edge: L.edge,
      polygon: outer.ring,
      z: outer.z,
      ...(holes.length ? { holes, holeZ } : {}),
    });
  }
  const arcs: RawArc[] = [];
  for (const s of sim.arcs) {
    const fa = faceIdx.get(s.left);
    const fb = faceIdx.get(s.right);
    if (fa === undefined || fb === undefined || fa === fb) continue;
    const na = sim.nodes[s.a]!;
    const nb = sim.nodes[s.b]!;
    if (dist(na, nb) <= 1e-9) continue;
    arcs.push({ a: { x: na.x, y: na.y }, b: { x: nb.x, y: nb.y }, za: na.z, zb: nb.z, faces: [fa, fb] });
  }
  return { faces, arcs };
}
