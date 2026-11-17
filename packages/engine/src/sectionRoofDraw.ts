import { difference, offsetMulti, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import type { SectionBeyond, SectionRoofEdge } from './section.ts';
import { semFrestas } from './sectionGeom.ts';

/**
 * Telhado visto de fora (elevação e corte), como desenho: a tela e o DXF usam a mesma geometria.
 *
 * O motor entrega um item por água e por camada (`SectionBeyond` com `roofId`), com a parte visível de cada um. Desenhado assim,
 * cada camada leva contorno e a obra mostra linhas que não existem vistas de fora (a divisa entre telha, ripa e caibro, e as fatias das
 * águas de perfil). Aqui o telhado vira o que se vê: a superfície de cima fechada, as camadas de baixo só onde sobram fora dela
 * (beiral, empena), a silhueta do conjunto e as linhas das divisas entre águas (cumeeira, espigão e rincão), uma só por divisa.
 */

/**
 * De onde vêm as linhas internas do telhado (cumeeira, espigão, rincão):
 * - `edges3d` (padrão): das arestas 3D do telhado (`SectionResult.roofEdges`), projetadas e com a visibilidade por ponto. É o que o Lapin
 *   e o CreaBIM fazem, e não depende de deduzir a divisa dos polígonos das águas.
 * - `polygons`: o método anterior, deduzido dos contornos das águas de frente e das arestas de cima das águas de perfil.
 * Reverter é trocar o padrão aqui, ou chamar `setRoofLinesMode('polygons')`; nada mais depende da escolha.
 */
export type RoofLinesMode = 'edges3d' | 'polygons';
let roofLinesMode: RoofLinesMode = 'edges3d';
export const setRoofLinesMode = (m: RoofLinesMode): void => {
  roofLinesMode = m;
};
export const getRoofLinesMode = (): RoofLinesMode => roofLinesMode;

/** Superfície de um material do telhado: `top` é a face de cima (camada 0); as demais são as camadas de baixo, só fora dela. */
export interface RoofFill {
  materialId: Id;
  top: boolean;
  /** Um item de origem, para a cor, a hachura e a categoria. */
  sample: SectionBeyond;
  polygons: MultiPolygon;
}

export interface RoofDrawing {
  roofId: Id;
  /** Profundidade do ponto mais próximo do telhado (peso de linha por proximidade). */
  depth: number;
  fills: RoofFill[];
  /** Contorno externo do conjunto (anéis). */
  silhouette: MultiPolygon;
  /** Linhas internas: divisas entre águas e arestas das águas de perfil, sem repetir a silhueta nem uma à outra. */
  segments: Array<[Vec2, Vec2]>;
}

/** Furos da face de cima abaixo disto (largura equivalente, m) são frestas entre águas, não vãos: fecham. */
const FURO_TELHADO = 0.2;
/** Abertura morfológica (m): some o que é mais fino que 2·r (fatias e espigões entre águas). */
const RAIO_ABERTURA = 0.025;
/** Largura equivalente (m) abaixo da qual um anel é uma fatia (água de perfil), não uma face. */
const SLIVER_MAX = 0.04;
/** Segmentos a menos disto (m) um do outro são a mesma linha. */
const SEG_TOL = 0.03;

const abrir = (m: MultiPolygon, r: number): MultiPolygon => (m.length === 0 ? m : offsetMulti(offsetMulti(m, -r), r));

/** Para uma fatia fina, a aresta longa de cima; null quando o anel é uma face de verdade (largura ≥ `max`). */
function sliverTopEdge(ring: Ring, max: number): [Vec2, Vec2] | null {
  let a2 = 0;
  let per = 0;
  const edges: Array<[Vec2, Vec2, number]> = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a2 += p.x * q.y - q.x * p.y;
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    per += len;
    edges.push([p, q, len]);
  }
  if (per < 1e-9 || Math.abs(a2) / per >= max) return null;
  const longest = Math.max(...edges.map((e) => e[2]));
  const top = edges.filter((e) => e[2] >= longest * 0.5).sort((u, w) => w[0].y + w[1].y - (u[0].y + u[1].y))[0];
  return top ? [top[0], top[1]] : null;
}

const near = (u: Vec2, e: [Vec2, Vec2]): boolean => {
  const dx = e[1].x - e[0].x;
  const dy = e[1].y - e[0].y;
  const len2 = dx * dx + dy * dy;
  const k = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((u.x - e[0].x) * dx + (u.y - e[0].y) * dy) / len2));
  return Math.hypot(e[0].x + dx * k - u.x, e[0].y + dy * k - u.y) < SEG_TOL;
};

/** Desenho de cada telhado a partir dos itens visíveis (`beyond` com `roofId`); os demais itens são ignorados. */
export function roofDrawingsOf(beyond: readonly SectionBeyond[], edges?: readonly SectionRoofEdge[], mode: RoofLinesMode = roofLinesMode): RoofDrawing[] {
  const byRoof = new Map<Id, SectionBeyond[]>();
  for (const b of beyond) if (b.roofId !== undefined) byRoof.set(b.roofId, [...(byRoof.get(b.roofId) ?? []), b]);
  const out: RoofDrawing[] = [];
  for (const [roofId, items] of byRoof) {
    const solid = items.filter((b) => !b.passive);
    const topItems = solid.filter((b) => b.layerIndex === 0);
    const top = topItems.length > 0 ? semFrestas(union(...topItems.map((b) => b.polygons)), FURO_TELHADO) : [];
    const lowerItems = solid.filter((b) => b.layerIndex !== 0);
    const lowerAll = lowerItems.length > 0 ? union(...lowerItems.map((b) => b.polygons)) : [];
    const lower = lowerAll.length > 0 ? (top.length > 0 ? difference(lowerAll, top) : lowerAll) : [];
    // Água de perfil (de ponta): a faixa da espessura dela só aparece onde sobra FORA do conjunto que a cobre. No beiral ou na empena
    // vista de topo (nada na frente) é a borda do telhado, com as duas linhas da espessura; no meio do telhado (rincão, espigão) ela
    // está debaixo da face e só vale a aresta de cima.
    const passiveItems = items.filter((b) => b.passive);
    const covered = semFrestas(union(top, lower), FURO_TELHADO);
    const passiveAll = passiveItems.length > 0 ? union(...passiveItems.map((b) => b.polygons)) : [];
    const edgeBand = passiveAll.length > 0 ? abrir(covered.length > 0 ? difference(passiveAll, covered) : passiveAll, 0.01) : [];
    const silhouette = abrir(semFrestas(union(top, lower, edgeBand)), RAIO_ABERTURA);
    // Preenchimento por material: a face de cima inteira e, por material, as camadas de baixo só fora dela.
    const fills: RoofFill[] = [];
    const groups = new Map<string, { sample: SectionBeyond; top: boolean; parts: MultiPolygon[] }>();
    for (const b of solid) {
      const isTop = b.layerIndex === 0;
      const key = `${b.materialId}|${isTop ? 't' : 'l'}`;
      const g = groups.get(key);
      if (g) g.parts.push(b.polygons);
      else groups.set(key, { sample: b, top: isTop, parts: [b.polygons] });
    }
    if (edgeBand.length > 0) {
      const sample = passiveItems[0]!;
      const key = `${sample.materialId}|l`;
      const g = groups.get(key);
      if (g) g.parts.push(edgeBand);
      else groups.set(key, { sample, top: false, parts: [edgeBand] });
    }
    for (const g of groups.values()) {
      const joined = union(...g.parts);
      const polygons = g.top ? semFrestas(joined, FURO_TELHADO) : top.length > 0 ? semFrestas(difference(joined, top)) : semFrestas(joined);
      if (polygons.length > 0) fills.push({ materialId: g.sample.materialId, top: g.top, sample: g.sample, polygons });
    }
    // Linhas internas: arestas de cima das águas de perfil e contorno de cada água de frente, sem repetir.
    const cand: Array<[Vec2, Vec2]> = [];
    // Modo `edges3d` com arestas disponíveis: as linhas internas são as arestas 3D visíveis (sem deduzir nada dos polígonos).
    if (mode === 'edges3d' && edges !== undefined) {
      for (const e of edges) if (e.roofId === roofId) cand.push([e.a, e.b]);
    } else {
      for (const b of items.filter((x) => x.layerIndex === 0)) {
        for (const poly of semFrestas(b.polygons)) {
          const outer = poly[0];
          if (!outer) continue;
          const edge = sliverTopEdge(outer, b.passive ? Infinity : SLIVER_MAX);
          if (edge) cand.push(edge);
          else if (!b.passive) for (const ring of abrir([poly], RAIO_ABERTURA).flat()) ring.forEach((p, i) => cand.push([p, ring[(i + 1) % ring.length]!]));
        }
      }
    }
    const kept: Array<[Vec2, Vec2]> = [];
    for (const ring of silhouette.flat()) ring.forEach((p, i) => kept.push([p, ring[(i + 1) % ring.length]!]));
    const segments: Array<[Vec2, Vec2]> = [];
    cand.sort((u, w) => Math.hypot(w[1].x - w[0].x, w[1].y - w[0].y) - Math.hypot(u[1].x - u[0].x, u[1].y - u[0].y));
    for (const e of cand) {
      if (Math.hypot(e[1].x - e[0].x, e[1].y - e[0].y) < 1e-4) continue;
      if (kept.some((q) => near(e[0], q) && near(e[1], q))) continue;
      kept.push(e);
      segments.push(e);
    }
    out.push({ roofId, depth: Math.min(...items.map((b) => b.depth)), fills, silhouette, segments });
  }
  return out;
}
