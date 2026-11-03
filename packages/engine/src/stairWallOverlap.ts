import { boxOf, boxesOverlap, intersection, multiArea, union, type Box, type MultiPolygon } from '@hestia/geom';
import { formatQuantity, memoSemEsquadrias, unitsOf, isWall, wallsOnLevel, type Id, type Project, type Wall } from '@hestia/model';
import { t, type Lang } from './i18nMessages.ts';
import { resolveLevel } from './resolve.ts';
import { makeStairIssue, type StairIssueItem } from './stairIssues.ts';
import { resolveStairs, type ResolvedStair } from './stairs.ts';

/**
 * Aviso `stair-wall-overlap`: a projeção em planta dos degraus e patamares de uma escada invade o corpo de uma parede.
 * A comparação é com a geometria resolvida das paredes (todas as camadas, sem os recortes de vãos), nos níveis cuja altura
 * a escada atravessa — o nível de topo só entra se a parede começar abaixo do topo da escada. Paredes fora da projeção
 * (inclusive as anexadas ao topo ou à base, quando não há sobreposição vertical) não geram aviso.
 */

/** Área mínima (metros quadrados) de interseção para contar como invasão; abaixo disso é ruído de junção. */
export const STAIR_WALL_OVERLAP_MIN = 0.005;
/** Tolerância (m) para a sobreposição vertical entre a escada e a parede. */
const EPS_Z = 1e-6;

const label = (w: Wall): string => (w.mark ? `"${w.mark}" (${w.id})` : `"${w.id}"`);

/** Parede resolvida como corpo em planta (união das camadas) e faixa de altura em que existe. */
interface WallSolid {
  wall: Wall;
  polygon: MultiPolygon;
  box: Box;
  baseZ: number;
  topZ: number;
}

/** Corpo em planta de cada parede do nível. `raw` é a camada antes do recorte de vãos e de prioridade. */
function wallSolids(p: Project, levelId: Id): WallSolid[] {
  // Só lê o contorno bruto das camadas (`raw`): editar uma esquadria não o muda.
  return memoSemEsquadrias(`corpos:${levelId}`, p, () => calcularCorpos(p, levelId));
}

function calcularCorpos(p: Project, levelId: Id): WallSolid[] {
  if (wallsOnLevel(p, levelId).length === 0) return [];
  const out: WallSolid[] = [];
  for (const rw of Object.values(resolveLevel(p, levelId).walls)) {
    const wall = p.elements[rw.wallId];
    if (!isWall(wall)) continue;
    const parts = rw.layers.map((l) => l.raw).filter((m) => m.length > 0);
    if (parts.length === 0) continue;
    const polygon = parts.length === 1 ? parts[0]! : union(...parts);
    if (polygon.length === 0) continue;
    out.push({
      wall,
      polygon,
      box: boxOf(polygon.flat(2)),
      baseZ: rw.baseZ,
      topZ: rw.baseZ + rw.height,
    });
  }
  return out;
}

/**
 * Avisos de invasão entre cada escada resolvida e as paredes que ela atravessa. `resolved` evita repetir `resolveStairs`
 * quando quem chama já tem a lista (é o caso de `stairIssueList`).
 */
export function stairWallOverlapIssues(p: Project, resolved?: ResolvedStair[], lang: Lang = 'pt'): StairIssueItem[] {
  const list = resolved ?? resolveStairs(p, lang);
  if (list.length === 0) return [];
  const solidsByLevel = new Map<Id, WallSolid[]>(p.levels.map((l) => [l.id, wallSolids(p, l.id)] as const));
  const out: StairIssueItem[] = [];
  for (const r of list) {
    if (r.footprint.length === 0) continue;
    const stairBox = boxOf(r.footprint.flat(2));
    for (const solids of solidsByLevel.values()) {
      for (const s of solids) {
        if (s.baseZ >= r.topZ - EPS_Z || s.topZ <= r.baseZ + EPS_Z) continue;
        if (!boxesOverlap(stairBox, s.box)) continue;
        const area = multiArea(intersection(r.footprint, s.polygon));
        if (!(area > STAIR_WALL_OVERLAP_MIN)) continue;
        const issue = makeStairIssue(
          r.id,
          'stair-wall-overlap',
          'warning',
          t(lang, 'egb_issue_stair_wall_overlap', {
            id: r.id,
            wall: label(s.wall),
            area: formatQuantity(unitsOf(p), 'area', area),
          }),
        );
        issue.ids = [r.id, s.wall.id];
        out.push(issue);
      }
    }
  }
  return out;
}
