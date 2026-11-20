import { type Vec2 } from '@hestia/geom';
import { openingsOfWall, wallsOfPlan, type Id, type Opening, type Project } from '@hestia/model';
import { frameOfWall, openingGeometry, type OpeningGeometry, type WallFrame } from '@hestia/engine';

/**
 * Índice espacial das paredes de um nível para a seleção na planta (clique e cursor). Guarda, por parede, a moldura e as
 * aberturas já calculadas, e uma grade de células com a caixa de cada parede reta. Consulta: só as paredes cuja caixa
 * toca a região do cursor (com folga de 2 tolerâncias) entram na varredura, na ordem de `wallsOfPlan`; o resto não
 * tem como acertar (ver `pickAt`). Paredes curvas não têm caixa simples: entram sempre, para não perder nenhuma.
 *
 * Teto de memória: a grade tem no máximo `GRADE_MAX` células por lado, e o cache guarda até `LEVELS_MAX` níveis por
 * projeto. O projeto é imutável (cada edição cria outro objeto), então a entrada de um projeto antigo sai com ele.
 */

/** Folga, em metros, para o arredondamento de ponto flutuante na comparação de caixas. */
const EPS = 1e-9;
const GRADE_MAX = 64;
const LEVELS_MAX = 8;

export interface IndexedOpening {
  id: Id;
  kind: Opening['kind'];
  g: OpeningGeometry;
}

export interface IndexedWall {
  id: Id;
  frame: WallFrame;
  opens: IndexedOpening[];
  /** Caixa da região que a parede pode ocupar (sem a folga do cursor). Null: parede curva, sempre candidata. */
  box: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

export interface LevelIndex {
  /** Paredes do nível, na ordem de `wallsOfPlan` (é a ordem da varredura, que decide os empates). */
  walls: IndexedWall[];
  /** Índices (em `walls`) das paredes sem caixa: entram em toda consulta. */
  sempre: number[];
  /** Grade: célula → índices (em `walls`) das paredes cuja caixa a toca. Vazia quando não há paredes retas. */
  cells: Map<number, number[]>;
  origin: Vec2;
  cell: number;
  nx: number;
  ny: number;
}

const byProject = new WeakMap<Project, Map<Id, LevelIndex>>();

/** Índice do nível, montado uma vez por projeto (o cache é por objeto de projeto). */
export function wallIndexOf(p: Project, levelId: Id): LevelIndex {
  let byLevel = byProject.get(p);
  if (!byLevel) {
    byLevel = new Map();
    byProject.set(p, byLevel);
  }
  const hit = byLevel.get(levelId);
  if (hit) return hit;
  const built = buildLevelIndex(p, levelId);
  if (byLevel.size >= LEVELS_MAX) byLevel.delete(byLevel.keys().next().value as Id);
  byLevel.set(levelId, built);
  return built;
}

/** Monta moldura, aberturas, caixas e grade do nível. */
export function buildLevelIndex(p: Project, levelId: Id): LevelIndex {
  const walls: IndexedWall[] = [];
  for (const w of wallsOfPlan(p, levelId)) {
    const frame = frameOfWall(p, w.id);
    if (!frame) continue;
    const opens: IndexedOpening[] = openingsOfWall(p, w.id).map((o) => ({ id: o.id, kind: o.kind, g: openingGeometry(p, o, frame) }));
    walls.push({ id: w.id, frame, opens, box: frame.arc ? null : boxOfWall(frame, opens) });
  }
  const sempre: number[] = [];
  const straight = walls.flatMap((w, i) => (w.box ? [{ i, box: w.box }] : []));
  walls.forEach((w, i) => {
    if (!w.box) sempre.push(i);
  });
  if (straight.length === 0) return { walls, sempre, cells: new Map(), origin: { x: 0, y: 0 }, cell: 1, nx: 0, ny: 0 };
  const minX = Math.min(...straight.map((s) => s.box.minX));
  const minY = Math.min(...straight.map((s) => s.box.minY));
  const maxX = Math.max(...straight.map((s) => s.box.maxX));
  const maxY = Math.max(...straight.map((s) => s.box.maxY));
  const extent = Math.max(maxX - minX, maxY - minY, 1e-6);
  // Célula de pelo menos 0,2 m (paredes pequenas não viram grade fina demais) e no máximo GRADE_MAX células por lado.
  const cell = Math.max(extent / GRADE_MAX, 0.2);
  const nx = Math.max(1, Math.min(GRADE_MAX, Math.floor((maxX - minX) / cell) + 1));
  const ny = Math.max(1, Math.min(GRADE_MAX, Math.floor((maxY - minY) / cell) + 1));
  const index: LevelIndex = { walls, sempre, cells: new Map(), origin: { x: minX, y: minY }, cell, nx, ny };
  for (const { i, box } of straight) {
    const c0 = cellX(index, box.minX);
    const c1 = cellX(index, box.maxX);
    const r0 = cellY(index, box.minY);
    const r1 = cellY(index, box.maxY);
    for (let cx = c0; cx <= c1; cx++) {
      for (let cy = r0; cy <= r1; cy++) {
        const key = cy * nx + cx;
        const list = index.cells.get(key);
        if (list) list.push(i);
        else index.cells.set(key, [i]);
      }
    }
  }
  return index;
}

const cellX = (ix: LevelIndex, x: number): number => Math.min(ix.nx - 1, Math.max(0, Math.floor((x - ix.origin.x) / ix.cell)));
const cellY = (ix: LevelIndex, y: number): number => Math.min(ix.ny - 1, Math.max(0, Math.floor((y - ix.origin.y) / ix.cell)));

/**
 * Caixa do mundo que a parede reta ocupa: a faixa de t (do início ao fim, e a das aberturas, que podem passar do
 * comprimento) por s (da face interna à externa). A região é um retângulo na moldura; a caixa é a dele no mundo.
 */
function boxOfWall(f: WallFrame, opens: IndexedOpening[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let t0 = 0;
  let t1 = f.length;
  for (const o of opens) {
    t0 = Math.min(t0, o.g.offset - o.g.width / 2);
    t1 = Math.max(t1, o.g.offset + o.g.width / 2);
  }
  const corners = [
    worldOf(f, t0, f.sLo),
    worldOf(f, t1, f.sLo),
    worldOf(f, t1, f.sHi),
    worldOf(f, t0, f.sHi),
  ];
  if (corners.some((c) => c === null)) return null;
  const pts = corners as Vec2[];
  return {
    minX: Math.min(...pts.map((q) => q.x)),
    minY: Math.min(...pts.map((q) => q.y)),
    maxX: Math.max(...pts.map((q) => q.x)),
    maxY: Math.max(...pts.map((q) => q.y)),
  };
}

/** Ponto do mundo de coordenadas locais (t, s) de uma parede reta: a inversa de `toLocal`. Null se a moldura é degenerada. */
function worldOf(f: WallFrame, t: number, s: number): Vec2 | null {
  const det = f.u.x * f.n.y - f.u.y * f.n.x;
  if (Math.abs(det) < 1e-12) return null;
  const dx = (t * f.n.y - f.u.y * s) / det;
  const dy = (f.u.x * s - f.n.x * t) / det;
  return { x: f.a.x + dx, y: f.a.y + dy };
}

/**
 * Paredes (na ordem da varredura) que podem acertar `at` com a folga `reach` (a tolerância do pick). Sempre inclui as
 * curvas. Sem repetição; a ordem é a de `walls`, então o primeiro acerto é o mesmo da varredura completa.
 */
export function candidatesAt(ix: LevelIndex, at: Vec2, reach: number): number[] {
  const out: number[] = [...ix.sempre];
  if (ix.nx > 0) {
    const r = reach + EPS;
    const x0 = cellX(ix, at.x - r);
    const x1 = cellX(ix, at.x + r);
    const y0 = cellY(ix, at.y - r);
    const y1 = cellY(ix, at.y + r);
    const seen = new Set<number>(out);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        for (const i of ix.cells.get(cy * ix.nx + cx) ?? []) {
          if (seen.has(i)) continue;
          const b = ix.walls[i]!.box!;
          if (at.x < b.minX - r || at.x > b.maxX + r || at.y < b.minY - r || at.y > b.maxY + r) continue;
          seen.add(i);
          out.push(i);
        }
      }
    }
  }
  return out.sort((a, b) => a - b);
}
