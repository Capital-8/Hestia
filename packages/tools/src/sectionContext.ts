import type { Vec2 } from '@hestia/geom';
import { projectGrids, type Id, type Project } from '@hestia/model';
import type { SectionOrigin, SectionResult } from '@hestia/engine';
import type { InferContext, SnapPoint } from './infer.ts';
import type { SnapKind } from './types.ts';

/**
 * Opções da inferência numa vista de corte/elevação. Além dos campos da vista, aceita qualquer campo de `InferContext`
 * (`from`, `previous`, `cycle`, `ignore`, `extraPoints`...) — o editor passa as opções da ferramenta misturadas aqui.
 * `line` é o eixo do corte em planta (a→b, profundidade): é o que permite projetar as grades do projeto em (t, z).
 * Sem `line`, as grades ficam de fora.
 */
export interface SectionInferOptions extends Partial<Omit<InferContext, 'project' | 'levelId' | 'mpp' | 'gridStep'>> {
  /** Eixo do corte/elevação em planta. `depth` é a profundidade visível além do plano (como em `SectionResult`). */
  line?: { a: Vec2; b: Vec2; depth?: number };
  /** Projeta as grades do projeto como linhas verticais em (t, z). Ausente = ligado (se houver `line`). */
  grids?: boolean;
  /** Elementos ocultos nesta vista (Hide in View): não viram alvo de captura. */
  hidden?: ReadonlySet<Id>;
}

interface Segment {
  a: Vec2;
  b: Vec2;
  hostId?: Id;
  kind?: SnapKind;
}

interface Draft {
  points: SnapPoint[];
  seenPoints: Set<string>;
  segments: Segment[];
  seenSegments: Set<string>;
}

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const pointKey = (p: Vec2): string => `${round6(p.x)}:${round6(p.y)}`;
const EPS = 1e-9;

function addPoint(draft: Draft, p: Vec2, kind: SnapKind, hostId?: Id): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
  const key = `${kind}|${pointKey(p)}`;
  if (draft.seenPoints.has(key)) return;
  draft.seenPoints.add(key);
  draft.points.push({ x: p.x, y: p.y, kind, ...(hostId !== undefined ? { hostId } : {}) });
}

function addSegment(draft: Draft, a: Vec2, b: Vec2, hostId?: Id, kind: SnapKind = 'nearest'): void {
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
  if (Math.hypot(b.x - a.x, b.y - a.y) < EPS) return;
  const key = `${pointKey(a)}|${pointKey(b)}|${hostId ?? ''}|${kind}`;
  if (draft.seenSegments.has(key)) return;
  draft.seenSegments.add(key);
  draft.segments.push({ a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, ...(hostId !== undefined ? { hostId } : {}), kind });
}

/** Aresta com as pontas e o ponto médio como capturas próprias (extremidade e ponto médio). */
function addEdge(draft: Draft, a: Vec2, b: Vec2, hostId?: Id): void {
  addSegment(draft, a, b, hostId);
  addPoint(draft, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 'midpoint', hostId);
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

/** Id do elemento de origem, quando há um só (para o `ignore` das ferramentas). */
function originId(o: SectionOrigin): Id | undefined {
  return o.wallId ?? o.floorId ?? o.slabId ?? o.ceilingId ?? o.roofId ?? o.stairId ?? o.rampId ?? o.openingId;
}

const finitePoint = (a: Vec2, b: Vec2): boolean => [a.x, a.y, b.x, b.y].every(Number.isFinite);

/**
 * Inferência da vista de corte/elevação em coordenadas (t, z): x = distância ao longo da linha, y = cota absoluta.
 *
 * O `SectionResult` já vem recortado e ocluído pelo motor; aqui ele vira pontos e arestas de captura. Nada do projeto
 * em planta entra: paredes, faces, grades de planta e CAD ficam de fora (`isVisible` falso e `section` verdadeiro), então
 * um canto de parede que por acaso cai nas mesmas coordenadas (t, z) não captura por engano.
 */
export function sectionInferContext(
  section: SectionResult,
  project: Project,
  levelId: Id,
  mpp: number,
  gridStep: number,
  options: SectionInferOptions = {},
  extra: Partial<InferContext> = {},
): InferContext {
  const { line, grids = true, hidden, ...runtime } = options;
  const draft: Draft = { points: [], seenPoints: new Set(), segments: [], seenSegments: new Set() };

  // Cortes por material: contornos visíveis das paredes, pisos, lajes e telhados atravessados pelo plano.
  for (const region of section.cut) {
    const host = region.sources.length === 1 ? originId(region.sources[0]!) : undefined;
    addPolygons(draft, region.polygons, host);
  }
  // Além do plano: elevação visível de paredes, pisos, lajes, telhados, escadas e rampas.
  for (const item of section.beyond) addPolygons(draft, item.polygons, originId(item));
  // Vãos: a caixa (peitoril, topo e ombreiras) e as peças visíveis da esquadria.
  for (const opening of section.openings) {
    if (finitePoint({ x: opening.t0, y: opening.z0 }, { x: opening.t1, y: opening.z1 })) {
      addRing(
        draft,
        [
          { x: opening.t0, y: opening.z0 },
          { x: opening.t1, y: opening.z0 },
          { x: opening.t1, y: opening.z1 },
          { x: opening.t0, y: opening.z1 },
        ],
        opening.openingId,
      );
    }
    addPolygons(draft, opening.polygons, opening.openingId);
  }
  // Membranas de piso/laje: a linha na cota da face.
  for (const m of section.membranes) {
    const [a, b] = m.pts;
    addPoint(draft, a, 'endpoint', originId(m));
    addPoint(draft, b, 'endpoint', originId(m));
    addEdge(draft, a, b, originId(m));
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
  // Grades do projeto projetadas no plano do corte: cada eixo que cruza o plano vira uma vertical em t.
  if (grids && line) addGrids(draft, project, section, line, hidden);

  const points = [...draft.points, ...(runtime.extraPoints ?? []), ...(extra.extraPoints ?? [])];
  const segments = [...draft.segments, ...(runtime.extraSegments ?? []), ...(extra.extraSegments ?? [])];
  return {
    ...runtime,
    ...extra,
    project,
    levelId,
    mpp,
    gridStep,
    // Proteções da vista: nada da planta e nenhuma grade de planta (as grades entram projetadas acima).
    section: true,
    isVisible: () => false,
    noGrid: true,
    underlayLevelId: null,
    cad: [],
    orthoLock: (extra.orthoLock ?? runtime.orthoLock) ?? false,
    polar: (extra.polar ?? runtime.polar) ?? false,
    snap: extra.snap ?? runtime.snap,
    extraPoints: points,
    extraSegments: segments,
  };
}

/**
 * Grades em (t, z): a reta de cada trecho da grade cruza o plano do corte num `t`; ali nasce uma linha vertical entre
 * `zMin` e `zMax`. Grades ocultas na vista ficam de fora. A projeção usa a reta inteira do trecho (não só o segmento),
 * porque na elevação a grade costuma terminar antes da linha de vista.
 */
function addGrids(
  draft: Draft,
  project: Project,
  section: SectionResult,
  line: { a: Vec2; b: Vec2; depth?: number },
  hidden: ReadonlySet<Id> | undefined,
): void {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const length = Math.hypot(dx, dy);
  if (length < EPS) return;
  const d = { x: dx / length, y: dy / length };
  const tol = 1e-6;
  for (const grid of projectGrids(project)) {
    if (hidden?.has(grid.id)) continue;
    // Grade em arco (2 pontos com flecha) não é projetada: a corda daria um `t` falso.
    if (grid.sag !== 0 && grid.points.length === 2) continue;
    const seen = new Set<number>();
    for (let i = 1; i < grid.points.length; i++) {
      const p1 = grid.points[i - 1]!;
      const p2 = grid.points[i]!;
      const gx = p2.x - p1.x;
      const gy = p2.y - p1.y;
      const cross = d.x * gy - d.y * gx;
      // Grade paralela ao plano do corte fica no plano (ou num plano paralelo): não vira uma linha vertical.
      if (Math.abs(cross) < 1e-12) continue;
      const k = ((p1.x - line.a.x) * gy - (p1.y - line.a.y) * gx) / cross;
      if (k < -tol || k > section.length + tol) continue;
      const t = round6(Math.max(0, Math.min(section.length, k)));
      if (seen.has(t)) continue;
      seen.add(t);
      addSegment(draft, { x: t, y: section.zMin }, { x: t, y: section.zMax }, grid.id, 'nearest');
    }
  }
}
