import { cross, dist, dot, pointInMulti, sub, type Vec2 } from '@hestia/geom';
import {
  openingTypeById,
  isOpening,
  isSlab,
  isWall,
  formatQuantity,
  slabRiseAt,
  terminoOf,
  unitsOf,
  wallBaseElevation,
  wallMaxHeight,
  type Id,
  type Project,
  type Slab,
  type ValidationIssue,
  type Wall,
} from '@hestia/model';
import { resolveAllFloors } from './floors.ts';
import { t, type Lang } from './i18nMessages.ts';
import { resolveAllRoofs } from './roofs.ts';
import { resolveAllSlabs, type ResolvedSlab } from './slabs.ts';
import { wallZRange } from './wallZ.ts';

/** Tolerância de comprimento (m): 1 mm. */
const EPS = 1e-3;
/** Ângulo máximo entre dois eixos para serem "praticamente colineares" (1°). */
const COLLINEAR_ANGLE = (1 * Math.PI) / 180;
/** Distância lateral máxima entre eixos colineares (1 cm). */
const COLLINEAR_OFFSET = 0.01;

const label = (e: { id: string; mark: string }): string => (e.mark ? `"${e.mark}" (${e.id})` : `"${e.id}"`);

/**
 * Avisos do projeto que dependem da geometria resolvida (decisão 0029):
 * - `abertura-fora-da-parede`: o offset somado à largura do tipo passa do eixo da parede.
 * - `parede-topo-desnivelado`: duas paredes retas, colineares e do mesmo nível têm topos diferentes.
 * - `parede-dentro-da-laje`: a faixa de cota da parede cruza uma camada de laje com término `passa`, que continua
 *   sob a parede e pode contar o mesmo trecho duas vezes.
 * O motor calcula; a interface junta. A validação do modelo (`validateProject`) não é alterada. Pisos, lajes e telhados
 * só são resolvidos quando há um par candidato de topos ou uma camada `passa`; modelos sem esses casos não pagam a conta.
 */
export function projectIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const out = openingOutside(p, lang);
  out.push(...wallTopIssues(p, lang));
  if (hasPassaLayer(p)) {
    const floors = resolveAllFloors(p);
    const slabs = resolveAllSlabs(p);
    out.push(...wallInsideSlab(p, floors, slabs, lang));
  }
  return out;
}

/** Abertura cujo `offset + largura` passa do comprimento do eixo da parede (1 mm de folga). */
function openingOutside(p: Project, lang: Lang): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isOpening(e)) continue;
    const host = p.elements[e.hostId];
    const type = openingTypeById(p, e.typeId);
    if (!isWall(host) || !type) continue;
    const L = dist(host.a, host.b);
    const end = e.offset + type.width;
    if (e.offset >= -EPS && end <= L + EPS) continue;
    out.push({
      severity: 'warning',
      code: 'abertura-fora-da-parede',
      message: t(lang, 'egb_issue_opening_outside_wall', {
        opening: label(e),
        wall: label(host),
        offset: formatQuantity(unitsOf(p), 'length', e.offset),
        width: formatQuantity(unitsOf(p), 'length', type.width),
        end: formatQuantity(unitsOf(p), 'length', end),
        length: formatQuantity(unitsOf(p), 'length', L),
      }),
      elementId: e.id,
      ids: [e.id, host.id],
    });
  }
  return out;
}

/** Eixo de uma parede reta com topo uniforme (perfil editado e topo no telhado ficam fora). */
interface WallAxis {
  wall: Wall;
  u: Vec2;
  length: number;
}

function wallAxis(w: Wall): WallAxis | null {
  if (w.sag !== 0 || w.topProfile !== null || w.attachTopToRoof === true) return null;
  const length = dist(w.a, w.b);
  if (length < EPS) return null;
  return { wall: w, u: { x: (w.b.x - w.a.x) / length, y: (w.b.y - w.a.y) / length }, length };
}

/** As duas paredes estão no mesmo nível, são colineares (1° e 1 cm) e se sobrepõem ou se tocam ao longo do eixo. */
function collinearAxis(a: WallAxis, b: WallAxis): boolean {
  if (a.wall.levelId !== b.wall.levelId) return false;
  if (Math.abs(cross(a.u, b.u)) > Math.sin(COLLINEAR_ANGLE)) return false;
  for (const q of [b.wall.a, b.wall.b]) {
    if (Math.abs(cross(a.u, sub(q, a.wall.a))) > COLLINEAR_OFFSET) return false;
  }
  const at = (q: Vec2): number => dot(sub(q, a.wall.a), a.u);
  const lo = Math.min(at(b.wall.a), at(b.wall.b));
  const hi = Math.max(at(b.wall.a), at(b.wall.b));
  return Math.min(a.length, hi) - Math.max(0, lo) >= -EPS;
}

/** O topo só depende do piso/laje quando está anexado ao nível de topo; os demais saem da cota do modelo. */
const needsResolvedTop = (w: Wall): boolean => w.attachTopToFloor === true && w.topLevelId !== null;

/** Topo uniforme da parede, ou null quando o anexo a piso/laje deixa o topo em degraus. */
function wallTop(p: Project, w: Wall, floors?: ReturnType<typeof resolveAllFloors>, slabs?: ResolvedSlab[], roofs?: ReturnType<typeof resolveAllRoofs>): number | null {
  if (!needsResolvedTop(w)) return wallBaseElevation(p, w) + wallMaxHeight(p, w);
  if (!floors || !slabs) return null;
  const z = wallZRange(p, w, floors, slabs, roofs);
  return z.profile ? null : z.z0 + z.height;
}

/** Paredes colineares e do mesmo nível com topos diferentes (mais de 1 mm). */
function wallTopIssues(p: Project, lang: Lang): ValidationIssue[] {
  const axes = Object.values(p.elements)
    .filter(isWall)
    .map(wallAxis)
    .filter((a): a is WallAxis => a !== null);
  const pairs: Array<[WallAxis, WallAxis]> = [];
  for (let i = 0; i < axes.length; i++) {
    for (let j = i + 1; j < axes.length; j++) {
      if (collinearAxis(axes[i]!, axes[j]!)) pairs.push([axes[i]!, axes[j]!]);
    }
  }
  if (pairs.length === 0) return [];

  const involved = new Set<Id>();
  for (const [a, b] of pairs) {
    involved.add(a.wall.id);
    involved.add(b.wall.id);
  }
  const walls = [...involved].map((id) => p.elements[id]).filter(isWall);
  const resolve = walls.some(needsResolvedTop);
  const floors = resolve ? resolveAllFloors(p) : undefined;
  const slabs = resolve ? resolveAllSlabs(p) : undefined;
  const roofs = resolve ? resolveAllRoofs(p) : undefined;
  const tops = new Map<Id, number | null>();
  for (const w of walls) tops.set(w.id, wallTop(p, w, floors, slabs, roofs));

  const out: ValidationIssue[] = [];
  for (const [a, b] of pairs) {
    const topA = tops.get(a.wall.id);
    const topB = tops.get(b.wall.id);
    if (topA == null || topB == null || Math.abs(topA - topB) <= EPS) continue;
    const levelName = p.levels.find((l) => l.id === a.wall.levelId)?.name ?? a.wall.levelId;
    out.push({
      severity: 'warning',
      code: 'parede-topo-desnivelado',
      message: t(lang, 'egb_issue_wall_top_uneven', {
        a: label(a.wall),
        b: label(b.wall),
        level: levelName,
        topA: formatQuantity(unitsOf(p), 'length', topA),
        topB: formatQuantity(unitsOf(p), 'length', topB),
      }),
      elementId: a.wall.id,
      ids: [a.wall.id, b.wall.id],
    });
  }
  return out;
}

/** Há alguma laje existente cujo tipo tenha camada de término `passa`? Sem isso, a laje não entra na conta. */
const hasPassaLayer = (p: Project): boolean =>
  Object.values(p.elements).some((e) => isSlab(e) && (p.slabTypes[e.typeId]?.layers.some((l) => terminoOf(l) === 'passa') ?? false));

/** Camada de laje com término `passa` (a camada continua sob a parede, sem recorte). */
interface PassaLayer {
  slab: Slab;
  resolved: ResolvedSlab;
  layerIndex: number;
}

/** Paredes cuja faixa de cota cruza uma camada `passa` que cobre o eixo: o trecho comum pode ser contado duas vezes. */
function wallInsideSlab(p: Project, floors: ReturnType<typeof resolveAllFloors>, slabs: ResolvedSlab[], lang: Lang): ValidationIssue[] {
  const layers: PassaLayer[] = [];
  for (const r of slabs) {
    const slab = p.elements[r.slabId];
    if (!isSlab(slab)) continue;
    const type = p.slabTypes[slab.typeId];
    if (!type) continue;
    r.layers.forEach((_, i) => {
      if (terminoOf(type.layers[i]!) === 'passa') layers.push({ slab, resolved: r, layerIndex: i });
    });
  }
  if (layers.length === 0) return [];

  const out: ValidationIssue[] = [];
  for (const w of Object.values(p.elements).filter(isWall)) {
    const z = wallZRange(p, w, floors, slabs);
    const top = z.z0 + z.height;
    const L = dist(w.a, w.b);
    if (top - z.z0 < EPS || L < EPS) continue;
    // Cinco amostras do eixo bastam: a camada `passa` cobre a parede inteira ou não cobre.
    const samples: Vec2[] = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t }));
    const best = new Map<Id, { layer: PassaLayer; overlap: number }>();
    for (const layer of layers) {
      let overlap = 0;
      for (const q of samples) {
        const polygon = layer.resolved.layers[layer.layerIndex]!.polygon;
        if (!pointInMulti(q, polygon)) continue;
        const rise = slabRiseAt(layer.resolved.slope, q);
        const z0 = layer.resolved.layers[layer.layerIndex]!.z0 + rise;
        const z1 = layer.resolved.layers[layer.layerIndex]!.z1 + rise;
        overlap = Math.max(overlap, Math.min(top, z1) - Math.max(z.z0, z0));
      }
      if (overlap <= EPS) continue;
      const cur = best.get(layer.slab.id);
      if (!cur || overlap > cur.overlap) best.set(layer.slab.id, { layer, overlap });
    }
    for (const { layer, overlap } of best.values()) {
      out.push({
        severity: 'warning',
        code: 'parede-dentro-da-laje',
        message: t(lang, 'egb_issue_wall_inside_slab', {
          wall: label(w),
          slab: label(layer.slab),
          layer: layer.layerIndex + 1,
          length: formatQuantity(unitsOf(p), 'length', overlap),
        }),
        elementId: w.id,
        ids: [w.id, layer.slab.id],
      });
    }
  }
  return out;
}
