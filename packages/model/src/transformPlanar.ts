import { applyTransform, type Transform, type Vec2 } from '@hestia/geom';
import { followsRoom } from './ceiling.ts';
import type { CadDrawing } from './cad.ts';
import { type Ceiling, type Floor, type OrigemMassa, type Roof, type Slab } from './types.ts';

/** Solta o vínculo do contorno quando o elemento é movido/girado/espelhado (a cópia herda a origem; decisão 0023 §8.2b). */
const detach = <T extends { outlineSource?: { linked: boolean } }>(e: T, copy: boolean): T =>
  !copy && e.outlineSource?.linked ? { ...e, outlineSource: { ...e.outlineSource, linked: false } } : e;

/**
 * Tira `origemMassa` de uma cópia (ficha D2, emenda E16 item 3): a cópia de um piso, laje ou parede gerado não é gerada pela massa,
 * então uma geração nova não a apaga. Sem o campo, devolve o próprio elemento. Mover, girar e espelhar não passam por aqui.
 */
export function semOrigemMassa<E extends { origemMassa?: OrigemMassa }>(e: E): E {
  if (!e.origemMassa) return e;
  const { origemMassa: _origem, ...resto } = e;
  return resto as E;
}

/** Move/gira/espelha um piso; espelhar inverte o sentido do contorno (a orientação não importa ao motor, mas fica estável). */
export function transformFloor(f: Floor, t: Transform, copy = false): Floor {
  const pts = (ring: Vec2[]): Vec2[] => {
    const out = ring.map((q) => applyTransform(t, q));
    return t.kind === 'mirror' ? out.reverse() : out;
  };
  const movido = detach({ ...f, boundary: pts(f.boundary), holes: f.holes.map(pts) }, copy);
  return copy ? semOrigemMassa(movido) : movido;
}

/** Move/gira/espelha uma laje: contorno, furos e a linha de inclinação (origem e direção). */
export function transformSlab(s: Slab, t: Transform, copy = false): Slab {
  const pts = (ring: Vec2[]): Vec2[] => {
    const out = ring.map((q) => applyTransform(t, q));
    return t.kind === 'mirror' ? out.reverse() : out;
  };
  let slope = s.slope;
  if (slope) {
    const o = applyTransform(t, slope.origin);
    const e = applyTransform(t, { x: slope.origin.x + slope.dir.x, y: slope.origin.y + slope.dir.y });
    const dx = e.x - o.x;
    const dy = e.y - o.y;
    const l = Math.hypot(dx, dy) || 1;
    slope = { origin: o, dir: { x: dx / l, y: dy / l }, percent: slope.percent };
  }
  const movida = detach({ ...s, boundary: pts(s.boundary), holes: s.holes.map(pts), slope }, copy);
  return copy ? semOrigemMassa(movida) : movida;
}

/**
 * Move/gira/espelha um forro: contorno e furos (o nível e a cota não mudam). Forro que acompanha o ambiente se solta ao
 * mover (como o piso); a cópia herda o vínculo.
 */
export function transformCeiling(c: Ceiling, t: Transform, copy = false): Ceiling {
  const pts = (ring: Vec2[]): Vec2[] => {
    const out = ring.map((q) => applyTransform(t, q));
    return t.kind === 'mirror' ? out.reverse() : out;
  };
  const moved = { ...c, boundary: pts(c.boundary), holes: c.holes.map(pts) };
  return !copy && followsRoom(c) ? { ...moved, roomLinked: false } : moved;
}

/** Move/gira/espelha um desenho CAD importado: todos os pontos dos caminhos e o ponto de cada texto. No espelho os
 * caminhos fechados invertem o sentido (como piso e laje); devolve sempre uma cópia, sem mexer no original. */
export function transformCad(cad: CadDrawing, t: Transform, copy = false): CadDrawing {
  // O CAD não tem vínculo de contorno a soltar; `copy` só existe para casar com os demais transformadores.
  void copy;
  return {
    ...cad,
    paths: cad.paths.map((path) => {
      const pts = path.pts.map((q) => applyTransform(t, q));
      return { ...path, pts: t.kind === 'mirror' && path.closed ? pts.reverse() : pts };
    }),
    texts: cad.texts.map((text) => ({ ...text, at: applyTransform(t, text.at) })),
  };
}

/**
 * Move/gira/espelha um telhado: contorno, pegada, furos, direção e águas livres (origem e direção de subida). No espelho
 * o contorno inverte o sentido, então as listas por aresta (inclinação, balanço e flecha do arco) trocam de posição para continuar
 * na mesma aresta: a nova aresta k é a antiga n−2−k (mód. n).
 */
export function transformRoof(r: Roof, t: Transform): Roof {
  const pts = (ring: Vec2[]): Vec2[] => {
    const out = ring.map((q) => applyTransform(t, q));
    return t.kind === 'mirror' ? out.reverse() : out;
  };
  const dirOf = (o: Vec2, d: Vec2): Vec2 => {
    const e = applyTransform(t, { x: o.x + d.x, y: o.y + d.y });
    const a = applyTransform(t, o);
    const l = Math.hypot(e.x - a.x, e.y - a.y) || 1;
    return { x: (e.x - a.x) / l, y: (e.y - a.y) / l };
  };
  const byEdge = <T>(xs: T[]): T[] => {
    if (t.kind !== 'mirror' || xs.length < 2) return xs;
    const n = xs.length;
    return xs.map((_, k) => xs[(((n - 2 - k) % n) + n) % n]!);
  };
  return {
    ...r,
    boundary: pts(r.boundary),
    holes: r.holes.map(pts),
    ...(r.footprint ? { footprint: pts(r.footprint) } : {}),
    edgeSlopes: byEdge(r.edgeSlopes),
    edgeOverhangs: byEdge(r.edgeOverhangs),
    dir: dirOf(r.boundary[0] ?? { x: 0, y: 0 }, r.dir),
    planes: r.planes.map((pl) => ({ ...pl, polygon: pts(pl.polygon), origin: applyTransform(t, pl.origin), up: dirOf(pl.origin, pl.up) })),
  };
}
