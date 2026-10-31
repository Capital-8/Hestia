import { boxOf, closestOnSegment, pointInMulti, type Box, type Vec2 } from '@hestia/geom';
import type { SectionOpening, SectionResult } from '@hestia/engine';
import {
  angularDimensionGeometry,
  dimensionGeometry,
  type DetailRegion,
  type Dimension,
  type Id,
  type SectionAnnotations,
  type TextNote,
} from '@hestia/model';
import { textBlockModel } from '../plan/notes.ts';

/**
 * Alças e seleção das anotações de cortes e elevações. Trabalha só com o resultado do motor (caixas e polígonos já
 * visíveis) e com as anotações da vista: nada aqui recalcula geometria do modelo.
 *
 * Convenção da vista: `(t, z)`, com `t` ao longo da linha do corte e `z` a cota absoluta. A tela desenha `x = −viewSide·t`,
 * mas as funções deste módulo recebem e devolvem pontos no espaço do `SectionResult` (o mesmo de `pickSection`).
 */

/** Alça de uma abertura: peitoril, topo (verga) ou um dos dois lados (montantes). */
export type SectionHandleKind = 'sill' | 'head' | 'jamb-a' | 'jamb-b';

/** Alça de uma abertura visível no corte/elevação, em `(t, z)`. */
export interface SectionHandle {
  openingId: Id;
  kind: SectionHandleKind;
  /** Ponto da alça: meio do peitoril/topo ou meio de cada montante. */
  at: Vec2;
}

/** Tipo de anotação de seção que pode ser selecionada. */
export type SectionAnnotationKind = 'dimension' | 'text' | 'detailLine' | 'detailRegion' | 'tag';

/** Anotação sob o ponto: o id e o tipo (cota, texto, linha, região ou etiqueta). */
export interface SectionAnnotationPick {
  id: Id;
  kind: SectionAnnotationKind;
}

const finite4 = (o: SectionOpening): boolean =>
  Number.isFinite(o.t0) && Number.isFinite(o.t1) && Number.isFinite(o.z0) && Number.isFinite(o.z1);

/**
 * Caixa da abertura em `(t, z)`. Usa a caixa do próprio vão (`t0..t1`, `z0..z1`, que sobrevive à oclusão) e, por
 * segurança, também o bbox dos polígonos visíveis: uma abertura parcialmente escondida continua com as alças na
 * posição real, e uma abertura antiga sem caixa ainda é editável pelo que aparece no desenho.
 */
function openingBox(o: SectionOpening): Box | null {
  const points: Vec2[] = [];
  for (const polygon of o.polygons) for (const ring of polygon) points.push(...ring);
  if (finite4(o)) {
    points.push({ x: o.t0, y: o.z0 }, { x: o.t1, y: o.z1 }, { x: o.t0, y: o.z1 }, { x: o.t1, y: o.z0 });
  }
  if (points.length === 0) return null;
  const b = boxOf(points);
  return Number.isFinite(b.minX) && Number.isFinite(b.minY) && Number.isFinite(b.maxX) && Number.isFinite(b.maxY) ? b : null;
}

/** Alças de uma caixa de vão: peitoril e topo no meio de `t`, montantes no meio de `z`. */
function handlesOf(o: SectionOpening, b: Box): SectionHandle[] {
  const tMid = (b.minX + b.maxX) / 2;
  const zMid = (b.minY + b.maxY) / 2;
  return [
    { openingId: o.openingId, kind: 'sill', at: { x: tMid, y: b.minY } },
    { openingId: o.openingId, kind: 'head', at: { x: tMid, y: b.maxY } },
    { openingId: o.openingId, kind: 'jamb-a', at: { x: b.minX, y: zMid } },
    { openingId: o.openingId, kind: 'jamb-b', at: { x: b.maxX, y: zMid } },
  ];
}

/**
 * Alças de uma abertura visível: quatro pontos em `(t, z)` — `sill` no meio da base, `head` no meio do topo, `jamb-a`
 * no meio do lado de menor `t` e `jamb-b` no meio do lado de maior `t`. Devolve lista vazia quando a abertura não
 * aparece no resultado (totalmente oculta ou inexistente na vista).
 */
export function sectionOpeningHandles(result: SectionResult, openingId: Id): SectionHandle[] {
  const matches = result.openings.filter((o) => o.openingId === openingId);
  if (matches.length === 0) return [];
  let box: Box | null = null;
  for (const o of matches) {
    const b = openingBox(o);
    if (!b) continue;
    box = box
      ? { minX: Math.min(box.minX, b.minX), minY: Math.min(box.minY, b.minY), maxX: Math.max(box.maxX, b.maxX), maxY: Math.max(box.maxY, b.maxY) }
      : b;
  }
  return box ? handlesOf(matches[0]!, box) : [];
}

const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Alça mais próxima do ponto dentro da `tolerance` (unidades do desenho: o chamador converte os pixels com
 * `px / zoom`). Sem `openingId`, considera todas as aberturas visíveis; com ele, só aquela. Empate fica com a ordem
 * `sill`, `head`, `jamb-a`, `jamb-b`. Aceita `tolerance` zero (só o ponto exato).
 */
export function pickSectionHandle(result: SectionResult, point: Vec2, tolerance: number, openingId?: Id): SectionHandle | null {
  const tol = Math.max(0, tolerance);
  let best: SectionHandle | null = null;
  let bestD = Infinity;
  const seen = new Set<Id>();
  for (const o of result.openings) {
    if (openingId !== undefined && o.openingId !== openingId) continue;
    if (seen.has(o.openingId)) continue;
    seen.add(o.openingId);
    for (const handle of sectionOpeningHandles(result, o.openingId)) {
      const d = distance(point, handle.at);
      if (d <= tol && d < bestD) {
        best = handle;
        bestD = d;
      }
    }
  }
  return best;
}

/** Distância do ponto ao segmento (zero quando ele está sobre o segmento). */
function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const c = closestOnSegment(p, a, b);
  return distance(p, c);
}

/** Ponto sobre o segmento dentro da tolerância. */
function hitSegment(p: Vec2, a: Vec2, b: Vec2, tol: number): boolean {
  return distanceToSegment(p, a, b) <= tol;
}

/**
 * Texto sob o ponto: caixa girada do bloco (a mesma de `textBlockModel`, com a escala da vista) mais a tolerância, e
 * os segmentos da chamada (`leader`). Sem escala confiável, o chamador pode passar a escala da vista.
 */
function textHit(t: TextNote, point: Vec2, tol: number, scale: number, textTol: number): boolean {
  const block = textBlockModel(t, scale);
  const r = (t.rotation * Math.PI) / 180;
  const dx = point.x - t.at.x;
  const dy = point.y - t.at.y;
  // Coordenadas do ponto no referencial girado do texto.
  const u = dx * Math.cos(r) + dy * Math.sin(r);
  const v = -dx * Math.sin(r) + dy * Math.cos(r);
  if (Math.abs(u) <= block.w / 2 + textTol && Math.abs(v) <= block.h / 2 + textTol) return true;
  const leader = t.leader ?? [];
  for (let i = 1; i < leader.length; i++) if (hitSegment(point, leader[i - 1]!, leader[i]!, tol)) return true;
  return false;
}

/** Região de detalhe sob o ponto: interior do polígono ou borda dentro da tolerância. */
function regionHit(region: DetailRegion, point: Vec2, tol: number): boolean {
  const ring = region.boundary;
  if (ring.length === 0) return false;
  const b = boxOf(ring);
  if (point.x < b.minX - tol || point.x > b.maxX + tol || point.y < b.minY - tol || point.y > b.maxY + tol) return false;
  if (ring.length >= 3 && pointInMulti(point, [[ring]])) return true;
  if (tol <= 0) return false;
  for (let i = 0; i < ring.length; i++) if (hitSegment(point, ring[i]!, ring[(i + 1) % ring.length]!, tol)) return true;
  return false;
}

/**
 * Pontos medidos de uma cota linear no plano `(t,z)`: `horizontal`/`vertical` prendem `b` no eixo de `a`. As cotas do
 * corte não resolvem `refs` (ver `sectionDimensions` em `annotations.ts`), então vale o `a`/`b` gravado.
 */
export function sectionDimensionPoints(d: Dimension): { a: Vec2; b: Vec2 } {
  const a = d.a;
  const b = d.mode === 'horizontal' ? { x: d.b.x, y: a.y } : d.mode === 'vertical' ? { x: a.x, y: d.b.y } : d.b;
  return { a, b };
}

/** Alça de uma cota selecionada no corte: `offset` (meio da linha de cota) ou `text` (ponto do texto). */
export interface SectionDimensionGrip {
  id: Id;
  kind: 'offset' | 'text';
  at: Vec2;
}

/**
 * Alça da cota selecionada sob o ponto. Só vale com uma única cota na seleção. O texto tem prioridade sobre o meio da
 * linha (como na planta). A cota angular só tem alça de texto: o arco já é o deslocamento dela.
 */
export function pickSectionDimensionGrip(
  annotations: SectionAnnotations,
  selected: readonly Id[],
  point: Vec2,
  tolerance: number,
  textTolerance = tolerance,
  scale = 100,
): SectionDimensionGrip | null {
  if (selected.length !== 1) return null;
  const d = annotations.dimensions.find((x) => x.id === selected[0]);
  if (!d) return null;
  const s = Number.isFinite(scale) && scale > 0 ? scale : 100;
  const textTol = Math.max(0, textTolerance);
  if (d.angular) {
    const g = angularDimensionGeometry(d);
    return g && distance(point, g.textAt) <= textTol ? { id: d.id, kind: 'text', at: g.textAt } : null;
  }
  const { a, b } = sectionDimensionPoints(d);
  const g = dimensionGeometry(a, b, d.offset, s / 1000, d.textHeight, d.textAt);
  if (distance(point, g.textAt) <= textTol) return { id: d.id, kind: 'text', at: g.textAt };
  const mid = { x: (g.line[0]!.x + g.line[1]!.x) / 2, y: (g.line[0]!.y + g.line[1]!.y) / 2 };
  return distance(point, mid) <= Math.max(0, tolerance) ? { id: d.id, kind: 'offset', at: mid } : null;
}

/**
 * Cota sob o ponto (`textTol` vale só para o texto; as linhas usam `tol`). A cota linear é aproximada pela linha
 * deslocada (`offset`), pelas linhas de chamada e pelo texto; a angular, pelo arco, pelas chamadas e pelo texto (mesma
 * geometria de `angularDimensionGeometry`). Referências a paredes (`refs`) não são resolvidas aqui: a função não recebe
 * o projeto, então vale o `a`/`b` gravado.
 */
function dimensionHit(d: Dimension, point: Vec2, tol: number, scale: number, textTol: number): boolean {
  if (d.angular) {
    const g = angularDimensionGeometry(d);
    if (!g) return false;
    if (distance(point, g.textAt) <= textTol) return true;
    for (let i = 1; i < g.arc.length; i++) if (hitSegment(point, g.arc[i - 1]!, g.arc[i]!, tol)) return true;
    for (const [s, e] of g.extensions) if (hitSegment(point, s, e, tol)) return true;
    return false;
  }
  const { a, b } = sectionDimensionPoints(d);
  const g = dimensionGeometry(a, b, d.offset, scale / 1000, d.textHeight, d.textAt);
  if (distance(point, g.textAt) <= textTol) return true;
  for (const [s, e] of [g.line, ...g.extensions]) if (hitSegment(point, s!, e!, tol)) return true;
  return false;
}

/**
 * Anotação da vista sob o ponto, com a ordem de pintura (de cima para baixo): etiqueta, texto, linha de detalhe,
 * região de detalhe e cota. `tolerance` em unidades do desenho (o chamador converte os pixels com `px / zoom`);
 * `scale` é a escala de papel usada no tamanho do texto e da cota — padrão 100, a mesma escala fixa com que o desenho
 * das anotações de seção é montado (`SECTION_ANNOTATION_SCALE`, em `annotations.ts`).
 *
 * Uma cota angular sem geometria válida (raio zero) é ignorada. Etiquetas e o texto da cota valem pelo ponto de
 * inserção, não pela caixa do valor desenhado.
 */
export function pickSectionAnnotation(
  annotations: SectionAnnotations,
  point: Vec2,
  tolerance: number,
  scale = 100,
  textTolerance = tolerance,
): SectionAnnotationPick | null {
  const tol = Math.max(0, tolerance);
  const textTol = Math.max(0, textTolerance);
  const s = Number.isFinite(scale) && scale > 0 ? scale : 100;
  for (const tag of annotations.tags) if (distance(point, tag.at) <= tol) return { id: tag.id, kind: 'tag' };
  for (const text of annotations.texts) if (textHit(text, point, tol, s, textTol)) return { id: text.id, kind: 'text' };
  for (const line of annotations.detailLines) if (hitSegment(point, line.a, line.b, tol)) return { id: line.id, kind: 'detailLine' };
  for (const region of annotations.detailRegions) if (regionHit(region, point, tol)) return { id: region.id, kind: 'detailRegion' };
  for (const dim of annotations.dimensions) if (dimensionHit(dim, point, tol, s, textTol)) return { id: dim.id, kind: 'dimension' };
  return null;
}
