import type { Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import type { SectionOrigin, SectionResult } from '@hestia/engine';
import type { SnapKind } from './types.ts';

/**
 * Geometria de captura da vista de corte/elevação, já em (t, z) e independente do projeto.
 *
 * O índice guarda o que a vista oferece uma vez só: pontos (extremidades e meios), arestas (todos os contornos) e
 * trilhas de alinhamento (toda aresta visível, horizontal, vertical ou inclinada). A reta de cada trilha é estendida
 * pelo rastreamento; a inclinação é só mais uma direção de referência, não um caso especial. A vista é recalculada
 * pelo motor a cada mudança do modelo; o índice é descartado junto com o `SectionResult` (WeakMap).
 */
export interface SectionSnapPoint extends Vec2 {
  kind: SnapKind;
  hostId?: Id;
}

export interface SectionSnapSegment {
  a: Vec2;
  b: Vec2;
  kind: SnapKind;
  hostId?: Id;
}

/**
 * Aresta usada como trilha de alinhamento: `h` (horizontal), `v` (vertical) ou `d` (inclinada). `kind: 'face'` é o
 * mesmo marcador das faces da planta: o rastreamento projeta o cursor na reta e estende a linha além das pontas.
 */
export interface SectionSnapTrack {
  a: Vec2;
  b: Vec2;
  axis: 'h' | 'v' | 'd';
  kind: 'face';
  hostId?: Id;
}

/** Itens de captura de um elemento (para esconder/ignorar sem varrer o índice inteiro). */
export interface SectionSnapHost {
  points: SectionSnapPoint[];
  segments: SectionSnapSegment[];
  tracks: SectionSnapTrack[];
}

export interface SectionSnapIndex {
  points: SectionSnapPoint[];
  segments: SectionSnapSegment[];
  tracks: SectionSnapTrack[];
  /** Índice por elemento de origem; só entram itens com `hostId`. */
  byHost: ReadonlyMap<Id, SectionSnapHost>;
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const pointKey = (p: Vec2): string => `${round6(p.x)}:${round6(p.y)}`;
const EPS = 1e-9;
/** Tolerância para considerar uma aresta horizontal/vertical (o motor pode devolver diferenças de arredondamento). */
const AXIS_EPS = 1e-7;

/** Id do elemento de origem (a esquadria tem id próprio, não o da parede hospedeira: ocultar a parede não esconde o vão) (para `ignore`/`hidden` e para o tooltip). */
export function sectionOriginId(o: SectionOrigin): Id | undefined {
  return o.openingId ?? o.wallId ?? o.floorId ?? o.slabId ?? o.ceilingId ?? o.roofId ?? o.stairId ?? o.rampId;
}

const finite = (p: Vec2): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

/** Eixo de uma aresta: horizontal (`h`), vertical (`v`) ou inclinada (`d`). Zero-length nunca chega aqui. */
function axisOf(a: Vec2, b: Vec2): 'h' | 'v' | 'd' {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dy <= AXIS_EPS) return 'h';
  if (dx <= AXIS_EPS) return 'v';
  return 'd';
}

interface Draft {
  points: SectionSnapPoint[];
  seenPoints: Set<string>;
  segments: SectionSnapSegment[];
  seenSegments: Set<string>;
  tracks: SectionSnapTrack[];
  seenTracks: Set<string>;
  byHost: Map<Id, SectionSnapHost>;
}

function hostOf(draft: Draft, hostId: Id | undefined): SectionSnapHost | null {
  if (hostId === undefined) return null;
  let bucket = draft.byHost.get(hostId);
  if (!bucket) {
    bucket = { points: [], segments: [], tracks: [] };
    draft.byHost.set(hostId, bucket);
  }
  return bucket;
}

function addPoint(draft: Draft, p: Vec2, kind: SnapKind, hostId?: Id, perHost = false): void {
  if (!finite(p)) return;
  // Por padrão o ponto é único na vista; com `perHost` é único por elemento (esconder um não apaga a captura do outro).
  const key = perHost ? `${kind}|${hostId ?? ''}|${pointKey(p)}` : `${kind}|${pointKey(p)}`;
  if (draft.seenPoints.has(key)) return;
  draft.seenPoints.add(key);
  const point: SectionSnapPoint = { x: p.x, y: p.y, kind, ...(hostId !== undefined ? { hostId } : {}) };
  draft.points.push(point);
  hostOf(draft, hostId)?.points.push(point);
}

function addTrack(draft: Draft, a: Vec2, b: Vec2, axis: 'h' | 'v' | 'd', hostId?: Id): void {
  const key = `${pointKey(a)}|${pointKey(b)}|${axis}|${hostId ?? ''}`;
  if (draft.seenTracks.has(key)) return;
  draft.seenTracks.add(key);
  const track: SectionSnapTrack = { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, axis, kind: 'face', ...(hostId !== undefined ? { hostId } : {}) };
  draft.tracks.push(track);
  hostOf(draft, hostId)?.tracks.push(track);
}

function addSegment(draft: Draft, a: Vec2, b: Vec2, hostId?: Id, kind: SnapKind = 'nearest'): void {
  if (!finite(a) || !finite(b)) return;
  if (Math.hypot(b.x - a.x, b.y - a.y) < EPS) return;
  const key = `${pointKey(a)}|${pointKey(b)}|${hostId ?? ''}|${kind}`;
  if (draft.seenSegments.has(key)) return;
  draft.seenSegments.add(key);
  const segment: SectionSnapSegment = { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, kind, ...(hostId !== undefined ? { hostId } : {}) };
  draft.segments.push(segment);
  hostOf(draft, hostId)?.segments.push(segment);
  // Toda aresta visível vira trilha, inclusive a inclinada (água de telhado, rampa). A reta é estendida por `infer`;
  // o eixo só orienta o filtro local e a prioridade de aresta dentro do segmento.
  addTrack(draft, a, b, axisOf(a, b), hostId);
}

/** Aresta com as pontas e o ponto médio como capturas próprias. */
function addEdge(draft: Draft, a: Vec2, b: Vec2, hostId?: Id, perHost = false): void {
  addSegment(draft, a, b, hostId);
  if (!finite(a) || !finite(b)) return;
  // Aresta degenerada (anel que repete o primeiro ponto no fim) não tem meio: o ponto médio seria a própria ponta.
  if (Math.hypot(b.x - a.x, b.y - a.y) < EPS) return;
  addPoint(draft, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'midpoint', hostId, perHost);
}

function addRing(draft: Draft, ring: readonly Vec2[], hostId?: Id): void {
  if (ring.length === 0) return;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    addPoint(draft, a, 'endpoint', hostId);
    addEdge(draft, a, b, hostId);
  }
}

function addPolygons(draft: Draft, polys: ReadonlyArray<ReadonlyArray<readonly Vec2[]>> | undefined, hostId?: Id): void {
  for (const poly of polys ?? []) for (const ring of poly) addRing(draft, ring, hostId);
}

function newDraft(): Draft {
  return { points: [], seenPoints: new Set(), segments: [], seenSegments: new Set(), tracks: [], seenTracks: new Set(), byHost: new Map() };
}

const finish = (draft: Draft): SectionSnapIndex => ({ points: draft.points, segments: draft.segments, tracks: draft.tracks, byHost: draft.byHost });

/** Linha 2D (t, z) de um elemento que não vem no `SectionResult` (o guarda-corpo, desenhado pelo kernel): contorno fechado de peça ou polilinha aberta. */
export interface SectionSnapLine {
  hostId: Id;
  /** Contorno fechado de peça (a última ponta liga à primeira); falso = polilinha aberta (eixo). */
  closed: boolean;
  pts: ReadonlyArray<Vec2>;
}

/**
 * Índice só com linhas de elementos de fora do `SectionResult`. Cada ponto é único por elemento (a captura de um elemento
 * escondido não some por outro estar no mesmo ponto). Vértices são extremidades; cada aresta traz o ponto médio, o
 * segmento (perpendicular, mais próximo, cruzamentos) e a trilha de alinhamento.
 */
export function buildSnapIndexFromLines(lines: Iterable<SectionSnapLine>): SectionSnapIndex {
  const draft = newDraft();
  for (const line of lines) {
    const { pts, hostId } = line;
    const n = pts.length;
    if (n < 2) continue;
    // Peça com 3 pontos ou mais fecha; 2 pontos é um traço (a volta repetiria a mesma aresta ao contrário).
    const closed = line.closed && n >= 3;
    for (let i = 0; i < n; i++) {
      addPoint(draft, pts[i]!, 'endpoint', hostId, true);
      if (i + 1 < n || closed) addEdge(draft, pts[i]!, pts[(i + 1) % n]!, hostId, true);
    }
  }
  return finish(draft);
}

/** Junta dois índices (o segundo acrescenta elementos; ids repetidos somam). Não altera os de entrada. */
export function mergeSectionSnapIndex(base: SectionSnapIndex, extra: SectionSnapIndex): SectionSnapIndex {
  const byHost = new Map<Id, SectionSnapHost>(base.byHost);
  for (const [id, h] of extra.byHost) {
    const b = byHost.get(id);
    byHost.set(id, b ? { points: [...b.points, ...h.points], segments: [...b.segments, ...h.segments], tracks: [...b.tracks, ...h.tracks] } : h);
  }
  return { points: [...base.points, ...extra.points], segments: [...base.segments, ...extra.segments], tracks: [...base.tracks, ...extra.tracks], byHost };
}

/** Constrói o índice de captura a partir do `SectionResult` (sem tocar no projeto). */
export function buildSectionSnapIndex(section: SectionResult): SectionSnapIndex {
  const draft = newDraft();

  // Cortes por material: contornos visíveis das paredes, pisos, lajes e telhados atravessados pelo plano.
  for (const region of section.cut) {
    const host = region.sources.length === 1 ? sectionOriginId(region.sources[0]!) : undefined;
    addPolygons(draft, region.polygons, host);
  }
  // Além do plano: elevação visível de paredes, pisos, lajes, telhados, escadas e rampas.
  for (const item of section.beyond) addPolygons(draft, item.polygons, sectionOriginId(item));
  // Escadas e rampas: aneis de degraus, espelhos, patamares e pecas antes da uniao/envoltoria (vertices concavos).
  for (const sr of section.snapRings ?? []) addRing(draft, sr.ring, sr.hostId);
  // Vãos: a caixa (peitoril, topo e ombreiras) e as peças visíveis da esquadria.
  for (const opening of section.openings) {
    const box = [
      { x: opening.t0, y: opening.z0 },
      { x: opening.t1, y: opening.z0 },
      { x: opening.t1, y: opening.z1 },
      { x: opening.t0, y: opening.z1 },
    ];
    if (box.every(finite)) addRing(draft, box, opening.openingId);
    addPolygons(draft, opening.polygons, opening.openingId);
  }
  // Membranas de piso/laje: a linha na cota da face.
  for (const m of section.membranes) {
    const [a, b] = m.pts;
    const host = sectionOriginId(m);
    addPoint(draft, a, 'endpoint', host);
    addPoint(draft, b, 'endpoint', host);
    addEdge(draft, a, b, host);
  }
  // Níveis: a linha horizontal na cota, de ponta a ponta do corte.
  for (const level of section.levels) {
    if (!Number.isFinite(level.z) || !(section.length > 0)) continue;
    const a = { x: 0, y: level.z };
    const b = { x: section.length, y: level.z };
    addPoint(draft, a, 'endpoint', level.levelId);
    addPoint(draft, b, 'endpoint', level.levelId);
    addPoint(draft, { x: section.length / 2, y: level.z }, 'midpoint', level.levelId);
    addSegment(draft, a, b, level.levelId, 'nearest');
  }

  return finish(draft);
}

/** Índice cacheado por identidade do `SectionResult`: o mesmo resultado nunca é reindexado entre movimentos. */
const cache = new WeakMap<SectionResult, SectionSnapIndex>();

export function sectionSnapIndex(section: SectionResult): SectionSnapIndex {
  const cached = cache.get(section);
  if (cached) return cached;
  const built = buildSectionSnapIndex(section);
  cache.set(section, built);
  return built;
}
