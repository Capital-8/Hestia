import type { Vec2 } from '@hestia/geom';
import { coreSpan, wallThicknessOf, type Id, type Project, type Wall } from '@hestia/model';
import { sAtDepth } from './frame.ts';
import { computeEnds } from './joins.ts';
import { endPoint, layerQuad } from './layerGeom.ts';
import { levelFrames } from './resolve.ts';

export type Seg = [Vec2, Vec2];

/** Faces de uma parede para captura (snap): arestas das faces de acabamento, do núcleo e das pontas, já esquadrejadas. */
export interface WallFaces {
  wallId: Id;
  /** Arestas das faces de acabamento (os dois lados) e das pontas livres. */
  faces: Seg[];
  /** Arestas das faces do núcleo (estrutura). */
  core: Seg[];
  /** Contorno real da parede inteira (todas as camadas), com as cadeias e degraus das pontas e os arcos. */
  outline: Vec2[];
  /** Contorno real só da faixa do NÚCLEO (primeira à última camada de estrutura), mesma construção do `outline`. */
  coreOutline: Vec2[];
}

/**
 * Geometria das faces de todas as paredes do nível, com os cantos das junções (esquadria, encosto, T) como o motor
 * os resolve. Barata: só `computeEnds` e alguns pontos por parede. Parede curva entrega só os pontos das pontas.
 */
export function wallFaces(p: Project, levelId: Id): WallFaces[] {
  const frames = levelFrames(p, levelId);
  const ends = computeEnds(frames, p.settings?.joinTolerance);
  return frames.map((f) => {
    const e = ends.get(f.wall.id)!;
    const cs = coreSpan(f.type);
    const line = (s: number): Seg => [endPoint(f, 'a', e.a, s), endPoint(f, 'b', e.b, s)];
    const cap = (which: 'a' | 'b'): Seg => [endPoint(f, which, which === 'a' ? e.a : e.b, f.sHi), endPoint(f, which, which === 'a' ? e.a : e.b, f.sLo)];
    const sCore = [sAtDepth(f, cs.from), sAtDepth(f, cs.to)];
    const sides = f.arc ? [] : [line(f.sHi), line(f.sLo)];
    const core = f.arc ? [] : sCore.map(line);
    const outline = layerQuad(f, e, f.sLo, f.sHi);
    const coreOutline = layerQuad(f, e, sCore[0]!, sCore[1]!);
    return { wallId: f.wall.id, faces: [...sides, cap('a'), cap('b')], core, outline, coreOutline };
  });
}

/** Faces do nível em cache por projeto (o projeto é imutável, com Immer): captura, alças e desenho usam a mesma conta. */
const facesCache = new WeakMap<Project, Map<Id, WallFaces[]>>();
export function wallFacesCached(p: Project, levelId: Id): WallFaces[] {
  let byLevel = facesCache.get(p);
  if (!byLevel) {
    byLevel = new Map();
    facesCache.set(p, byLevel);
  }
  let f = byLevel.get(levelId);
  if (!f) {
    f = wallFaces(p, levelId);
    byLevel.set(levelId, f);
  }
  return f;
}

/**
 * Cantos visíveis das duas extremidades de uma parede: os vértices do contorno real que ficam na ponta, a até um
 * espessura da linha de locação. A ponta que o usuário enxerga não é o eixo (que é a linha de locação).
 */
export function wallEndCorners(p: Project, w: Wall): { a: Vec2[]; b: Vec2[] } {
  const out = { a: [] as Vec2[], b: [] as Vec2[] };
  const wf = wallFacesCached(p, w.levelId).find((x) => x.wallId === w.id);
  const type = p.wallTypes[w.typeId];
  if (!wf || !type) return out;
  const reach = wallThicknessOf(type) * 0.8;
  for (const q of wf.outline) {
    const da = Math.hypot(q.x - w.a.x, q.y - w.a.y);
    const db = Math.hypot(q.x - w.b.x, q.y - w.b.y);
    if (da <= reach && da <= db) out.a.push(q);
    else if (db <= reach) out.b.push(q);
  }
  return out;
}
