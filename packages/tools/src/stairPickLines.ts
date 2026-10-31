import { add, arcFromSagitta, closestOnSegment, cross, dist, intersectLines, mul, norm, perp, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall, sAtDepth, sampleCurve, wallFaces, type WallFaces } from '@hestia/engine';
import { coreSpan, floorsOnLevel, rampsOnLevel, slabsOnLevel, stairsOnLevel, wallsOnLevel, type Id, type Project, type StairCurve } from '@hestia/model';
import type { SnapOptions } from './types.ts';

/** Folga do clique para "a linha sob o cursor" (px), a mesma ordem do pick de paredes. */
export const PICK_PX = 6;
/** Distância máxima entre pontas para duas curvas formarem uma corrente (m). Acima disso é uma quebra. */
export const JOIN_TOL = 0.005;
/** Distância máxima entre o cruzamento dos offsets e o ponto médio das pontas para usar o cruzamento (m). */
const JOINT_MAX = 0.5;

/**
 * Linha que pode ser pega: a curva, o elemento de origem e o grupo. Só curvas do MESMO grupo formam corrente
 * (paredes pelo eixo, pelas faces ou pelo núcleo; cada limite de escada; cada anel de laje ou piso).
 */
export interface PickLine {
  owner: Id;
  group: string;
  curve: StairCurve;
}

const copyCurve = (c: StairCurve): StairCurve => ({ a: { ...c.a }, b: { ...c.b }, sag: c.sag });
const cache = new WeakMap<Project, Map<string, PickLine[]>>();

/**
 * Linhas pegáveis do nível: paredes (eixo, faces e núcleo, conforme a captura), linhas das outras escadas (sem a que
 * está em edição) e arestas de lajes e pisos. Cache por projeto (o projeto é imutável).
 */
export function pickLinesOf(p: Project, levelId: Id, snap: SnapOptions, exclude?: Id): PickLine[] {
  const key = `${levelId}|${snap.axis ? 1 : 0}${snap.faces ? 1 : 0}${snap.core ? 1 : 0}|${exclude ?? ''}`;
  let byKey = cache.get(p);
  if (!byKey) {
    byKey = new Map();
    cache.set(p, byKey);
  }
  let lines = byKey.get(key);
  if (!lines) {
    lines = [...wallLines(p, levelId, snap), ...stairLines(p, levelId, exclude), ...rampLines(p, levelId, exclude), ...ringLines(p, levelId)];
    byKey.set(key, lines);
  }
  return lines;
}

function wallLines(p: Project, levelId: Id, snap: SnapOptions): PickLine[] {
  const out: PickLine[] = [];
  const faces = snap.faces || snap.core ? new Map<Id, WallFaces>(wallFaces(p, levelId).map((w) => [w.wallId, w])) : null;
  for (const w of wallsOnLevel(p, levelId)) {
    const axis: StairCurve = { a: { ...w.a }, b: { ...w.b }, sag: w.sag };
    if (snap.axis) out.push({ owner: w.id, group: 'wall-axis', curve: axis });
    if (!faces) continue;
    const f = frameOfWall(p, w.id);
    if (!f) continue;
    const wf = faces.get(w.id);
    // Parede reta: faces e núcleo vêm do motor (já unidos nos cantos). Parede em arco: o motor não entrega as faces
    // de arco, então cada face é o arco concêntrico à profundidade `s` (a mesma regra de `faceCurve`).
    const joinedFaces = f.arc === null ? wf?.faces : undefined;
    if (snap.faces) {
      for (const c of sideCurves([f.sHi, f.sLo], joinedFaces, axis)) out.push({ owner: w.id, group: 'wall-face', curve: c });
    }
    if (snap.core) {
      const cs = coreSpan(f.type);
      const joinedCore = f.arc === null ? wf?.core : undefined;
      for (const c of sideCurves([sAtDepth(f, cs.from), sAtDepth(f, cs.to)], joinedCore, axis)) {
        out.push({ owner: w.id, group: 'wall-core', curve: c });
      }
    }
  }
  return out;
}

/** Curvas de faces à profundidade de cada `depths`: as unidas do motor quando há (parede reta), senão o deslocamento do eixo. */
function sideCurves(depths: number[], joined: Array<[Vec2, Vec2]> | undefined, axis: StairCurve): StairCurve[] {
  const out: StairCurve[] = [];
  depths.forEach((s, i) => {
    const j = joined?.[i];
    const c = j ? { a: { ...j[0] }, b: { ...j[1] }, sag: 0 } : offsetCurve(axis, s);
    if (c && dist(c.a, c.b) > 1e-9) out.push(c);
  });
  return out;
}

function stairLines(p: Project, levelId: Id, exclude?: Id): PickLine[] {
  const out: PickLine[] = [];
  for (const s of stairsOnLevel(p, levelId)) {
    if (s.id === exclude) continue;
    s.components.forEach((c, i) => {
      const g = `stair:${s.id}:${i}`;
      if (c.kind === 'landing') {
        for (const x of c.boundary) out.push({ owner: s.id, group: `${g}:B`, curve: copyCurve(x) });
        return;
      }
      for (const x of c.boundaryLeft) out.push({ owner: s.id, group: `${g}:L`, curve: copyCurve(x) });
      for (const x of c.boundaryRight) out.push({ owner: s.id, group: `${g}:R`, curve: copyCurve(x) });
      for (const x of c.path) out.push({ owner: s.id, group: `${g}:P`, curve: copyCurve(x) });
      // Cada espelho é um grupo próprio: espelho não forma corrente com outro espelho.
      c.risers.forEach((r, j) => out.push({ owner: s.id, group: `${g}:r${j}`, curve: copyCurve(r) }));
    });
  }
  return out;
}

/** As rampas usam os mesmos componentes da escada: mesmos grupos, com prefixo próprio para não se misturarem. */
function rampLines(p: Project, levelId: Id, exclude?: Id): PickLine[] {
  const out: PickLine[] = [];
  for (const r of rampsOnLevel(p, levelId)) {
    if (r.id === exclude) continue;
    r.components.forEach((c, i) => {
      const g = `ramp:${r.id}:${i}`;
      if (c.kind === 'landing') {
        for (const x of c.boundary) out.push({ owner: r.id, group: `${g}:B`, curve: copyCurve(x) });
        return;
      }
      for (const x of c.boundaryLeft) out.push({ owner: r.id, group: `${g}:L`, curve: copyCurve(x) });
      for (const x of c.boundaryRight) out.push({ owner: r.id, group: `${g}:R`, curve: copyCurve(x) });
      for (const x of c.path) out.push({ owner: r.id, group: `${g}:P`, curve: copyCurve(x) });
      c.risers.forEach((x, j) => out.push({ owner: r.id, group: `${g}:r${j}`, curve: copyCurve(x) }));
    });
  }
  return out;
}

function ringLines(p: Project, levelId: Id): PickLine[] {
  const out: PickLine[] = [];
  for (const s of slabsOnLevel(p, levelId)) {
    addRing(out, s.id, `slab:${s.id}:0`, s.boundary);
    s.holes.forEach((h, k) => addRing(out, s.id, `slab:${s.id}:h${k}`, h));
  }
  for (const f of floorsOnLevel(p, levelId)) {
    addRing(out, f.id, `floor:${f.id}:0`, f.boundary);
    f.holes.forEach((h, k) => addRing(out, f.id, `floor:${f.id}:h${k}`, h));
  }
  return out;
}

/** Arestas de um anel (laje ou piso): retas entre vértices consecutivos; a última fecha no primeiro. */
function addRing(out: PickLine[], owner: Id, group: string, ring: Vec2[]): void {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if (dist(a, b) < 1e-9) continue;
    out.push({ owner, group, curve: { a: { ...a }, b: { ...b }, sag: 0 } });
  }
}

/** Distância de um ponto a uma curva (reta, ou arco amostrado com erro de corda de 0,3 mm). */
export function distToCurve(c: StairCurve, at: Vec2): number {
  if (Math.abs(c.sag) < 1e-9) return dist(at, closestOnSegment(at, c.a, c.b));
  const pts = sampleCurve(c);
  if (pts.length === 1) return dist(pts[0]!, at);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, dist(at, closestOnSegment(at, pts[i - 1]!, pts[i]!)));
  return best;
}

/** Índice da linha mais próxima do cursor dentro da tolerância (empate: a primeira da lista), ou −1. */
export function nearestPickLine(lines: PickLine[], at: Vec2, tol: number): number {
  let best = -1;
  let bestD = tol;
  lines.forEach((l, i) => {
    const d = distToCurve(l.curve, at);
    if (d <= bestD && (best < 0 || d < bestD)) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** A mesma curva no sentido contrário (a→b vira b→a; o arco mantém o traço, com o sag trocado de sinal). */
export const reverseCurve = (c: StairCurve): StairCurve => ({ a: { ...c.b }, b: { ...c.a }, sag: -c.sag });

const unitChord = (c: StairCurve): Vec2 => norm(sub(c.b, c.a));

/**
 * Corrente a partir da linha `idx`: anda para frente e para trás pelas pontas (tolerância `JOIN_TOL`), só entre linhas do
 * mesmo grupo, e para no fim ou ao fechar o laço. Em um encontro com mais de uma opção, vence a de direção mais contínua.
 * As curvas saem na ordem do percurso, orientadas no sentido do percurso (a linha `idx` mantém a orientação dela).
 */
export function chainAt(lines: PickLine[], idx: number): { curves: StairCurve[]; closed: boolean } {
  const start = lines[idx]!;
  const group: number[] = [];
  lines.forEach((l, i) => {
    if (l.group === start.group) group.push(i);
  });
  const used = new Set<number>([idx]);

  /** Próxima curva a partir do ponto `at` (fim do percurso `cur`, ou início para trás), orientada no sentido do percurso. */
  const nextAt = (at: Vec2, cur: StairCurve, forward: boolean): StairCurve | null => {
    let best: { i: number; c: StairCurve; score: number } | null = null;
    const ref = unitChord(cur);
    for (const i of group) {
      if (used.has(i)) continue;
      const raw = lines[i]!.curve;
      // Para frente, a candidata começa em `at`; para trás, termina em `at`.
      const oriented = orientTo(raw, at, forward);
      if (!oriented || dist(oriented.a, oriented.b) < 1e-9) continue;
      const u = unitChord(oriented);
      const score = ref.x * u.x + ref.y * u.y;
      if (!best || score > best.score) best = { i, c: oriented, score };
    }
    if (!best) return null;
    used.add(best.i);
    return best.c;
  };

  const fwd: StairCurve[] = [];
  let cur = start.curve;
  let nxt = nextAt(cur.b, cur, true);
  while (nxt) {
    fwd.push(nxt);
    cur = nxt;
    nxt = nextAt(cur.b, cur, true);
  }
  // Laço: a última ponta volta ao início da linha de partida (só com mais de uma curva além dela).
  const closed = fwd.length >= 1 && dist(cur.b, start.curve.a) <= JOIN_TOL;
  const bwd: StairCurve[] = [];
  if (!closed) {
    cur = start.curve;
    let prv = nextAt(cur.a, cur, false);
    while (prv) {
      bwd.push(prv);
      cur = prv;
      prv = nextAt(cur.a, cur, false);
    }
  }
  return { curves: [...bwd.reverse(), start.curve, ...fwd], closed };
}

/** Orienta `c` para que encoste em `at` pelo início (para frente) ou pelo fim (para trás); null se não encosta. */
function orientTo(c: StairCurve, at: Vec2, forward: boolean): StairCurve | null {
  const touchA = dist(c.a, at) <= JOIN_TOL;
  const touchB = dist(c.b, at) <= JOIN_TOL;
  if (forward) return touchA ? c : touchB ? reverseCurve(c) : null;
  return touchB ? c : touchA ? reverseCurve(c) : null;
}

/** Lado do cursor em relação à curva: +1 à esquerda do sentido a→b (para fora do arco, se abaula à esquerda), −1 à direita. */
export function leftSide(c: StairCurve, at: Vec2): 1 | -1 {
  if (Math.abs(c.sag) < 1e-9) return cross(sub(c.b, c.a), sub(at, c.a)) >= 0 ? 1 : -1;
  const arc = arcFromSagitta(c.a, c.b, c.sag);
  if (!arc) return 1;
  const outside = dist(at, arc.center) > arc.radius;
  return (c.sag > 0) === outside ? 1 : -1;
}

/**
 * Desloca uma curva `d` metros para a ESQUERDA do sentido a→b (negativo, para a direita). Reta: paralela. Arco: mesmo
 * centro, raio ± d do lado que abaula (sinal do sag) e o mesmo ângulo central. Devolve null se o arco deixaria de
 * existir (raio ≤ 0): o único caso em que pegar recusa, porque a curva não pode ser construída.
 */
export function offsetCurve(c: StairCurve, d: number): StairCurve | null {
  if (Math.abs(c.sag) < 1e-9) {
    if (dist(c.a, c.b) < 1e-9) return null;
    const n = perp(unitChord(c));
    return { a: add(c.a, mul(n, d)), b: add(c.b, mul(n, d)), sag: 0 };
  }
  const arc = arcFromSagitta(c.a, c.b, c.sag);
  if (!arc) return null;
  const sigma = c.sag > 0 ? 1 : -1;
  const R = arc.radius + sigma * d;
  if (!(R > 1e-3)) return null;
  const phi = Math.abs(arc.sweep) / 2;
  return {
    a: add(arc.center, mul(norm(sub(c.a, arc.center)), R)),
    b: add(arc.center, mul(norm(sub(c.b, arc.center)), R)),
    sag: sigma * R * (1 - Math.cos(phi)),
  };
}

/**
 * Desloca uma cadeia (na ordem do percurso) e recompõe as juntas: duas retas se encontram no cruzamento dos offsets;
 * nos outros casos, no ponto médio das pontas. Assim a cadeia deslocada continua contínua para o validador (1e-6).
 * `closed` fecha a última junta com a primeira. Null se alguma curva não pode ser deslocada.
 */
export function offsetChain(curves: StairCurve[], d: number, closed: boolean): StairCurve[] | null {
  const out: StairCurve[] = [];
  for (const c of curves) {
    const o = offsetCurve(c, d);
    if (!o) return null;
    out.push(o);
  }
  const n = out.length;
  const joints = closed ? n : n - 1;
  for (let i = 0; i < joints; i++) {
    const j = (i + 1) % n;
    const p = out[i]!;
    const q = out[j]!;
    if (dist(p.b, q.a) < 1e-9) continue;
    const J = jointPoint(p, q);
    out[i] = { ...p, b: J };
    out[j] = { ...q, a: J };
  }
  return out;
}

function jointPoint(p: StairCurve, q: StairCurve): Vec2 {
  const mid = mul(add(p.b, q.a), 0.5);
  if (Math.abs(p.sag) < 1e-9 && Math.abs(q.sag) < 1e-9) {
    const r = intersectLines(p.a, sub(p.b, p.a), q.a, sub(q.b, q.a));
    if (r && dist(r.point, mid) <= JOINT_MAX) return r.point;
  }
  return mid;
}
