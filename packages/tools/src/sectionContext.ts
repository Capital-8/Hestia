import type { Vec2 } from '@hestia/geom';
import { projectGrids, type Id, type Project } from '@hestia/model';
import type { SectionResult } from '@hestia/engine';
import type { ExtraTrack, InferContext, SnapPoint } from './infer.ts';
import { sectionSnapIndex, type SectionSnapSegment } from './sectionSnapIndex.ts';

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

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;
const EPS = 1e-9;

/** Concatena sem copiar quando só há uma fonte (o índice cacheado é reaproveitado entre movimentos do mouse). */
function concat<T>(...lists: Array<readonly T[] | undefined>): T[] {
  const present = lists.filter((l): l is readonly T[] => l !== undefined && l.length > 0);
  if (present.length === 0) return [];
  if (present.length === 1) return present[0] as T[];
  return present.flatMap((l) => l as T[]);
}

const isHidden = (hidden: ReadonlySet<Id> | undefined, hostId: Id | undefined): boolean =>
  hidden !== undefined && hostId !== undefined && hidden.has(hostId);

/**
 * Inferência da vista de corte/elevação em coordenadas (t, z): x = distância ao longo da linha, y = cota absoluta.
 *
 * O `SectionResult` já vem recortado e ocluído pelo motor; aqui ele vira pontos, arestas e trilhas de captura. A
 * geometria da vista fica num índice cacheado por identidade (§`sectionSnapIndex`): mover o mouse não reindexa nada.
 * Nada do projeto em planta entra: paredes, faces, grades de planta e CAD ficam de fora (`isVisible` falso e `section`
 * verdadeiro), então um canto de parede que por acaso cai nas mesmas coordenadas (t, z) não captura por engano.
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
  const index = sectionSnapIndex(section);

  // Elementos ocultos na vista saem dos pontos, arestas e trilhas. O filtro devolve o próprio array do índice quando
  // não há nada oculto, para não alocar a cada movimento.
  const visiblePoints = hidden && hidden.size > 0 ? index.points.filter((p) => !isHidden(hidden, p.hostId)) : index.points;
  const visibleSegments = hidden && hidden.size > 0 ? index.segments.filter((e) => !isHidden(hidden, e.hostId)) : index.segments;
  const visibleTracks = hidden && hidden.size > 0 ? index.tracks.filter((tr) => !isHidden(hidden, tr.hostId)) : index.tracks;

  // Grades do projeto projetadas no plano do corte: cada eixo que cruza o plano vira uma vertical em t.
  const gridSegments = grids && line ? projectGridSegments(project, section, line, hidden) : [];

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
    extraPoints: concat<SnapPoint>(visiblePoints, runtime.extraPoints, extra.extraPoints),
    extraSegments: concat<SectionSnapSegment>(visibleSegments, gridSegments, runtime.extraSegments as SectionSnapSegment[] | undefined, extra.extraSegments as SectionSnapSegment[] | undefined),
    // Trilhas de alinhamento (arestas h/v): o rastreamento estende a linha além das pontas, como nas faces da planta.
    extraTracks: concat<ExtraTrack>(visibleTracks, runtime.extraTracks, extra.extraTracks),
  };
}

/**
 * Grades em (t, z): a reta de cada trecho da grade cruza o plano do corte num `t`; ali nasce uma linha vertical entre
 * `zMin` e `zMax`. Grades ocultas na vista ficam de fora. A projeção usa a reta inteira do trecho (não só o segmento),
 * porque na elevação a grade costuma terminar antes da linha de vista.
 */
function projectGridSegments(
  project: Project,
  section: SectionResult,
  line: { a: Vec2; b: Vec2; depth?: number },
  hidden: ReadonlySet<Id> | undefined,
): SectionSnapSegment[] {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  const length = Math.hypot(dx, dy);
  if (length < EPS) return [];
  const d = { x: dx / length, y: dy / length };
  const tol = 1e-6;
  const out: SectionSnapSegment[] = [];
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
      out.push({ a: { x: t, y: section.zMin }, b: { x: t, y: section.zMax }, hostId: grid.id, kind: 'nearest' });
    }
  }
  return out;
}
