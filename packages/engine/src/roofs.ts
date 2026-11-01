import { asMulti, difference, dot, multiArea, sub, type MultiPolygon, type SkeletonStep, type Vec2 } from '@hestia/geom';
import { levelElevation, roofsOnLevel, unitsOf, type Id, type Project, type RafterCut, type Roof, type RoofEave, type RoofType } from '@hestia/model';
import { planeHas, WATER_MIN_AREA } from './roofGeom.ts';
import { expandRoofArcs } from './roofArcs.ts';
import { joinRoofs, type JoinItem } from './roofJoin.ts';
import { roofLines } from './roofLines.ts';
import { boundaryKindsOf, waterPlanesOf } from './roofShapes.ts';
import { holeGableLines } from './roofSkeleton.ts';

/** Água resolvida: região em planta e plano da face superior (cota absoluta z0 em `origin`, subida `up`, `percent`). */
export interface ResolvedRoofPlane {
  polygon: MultiPolygon;
  origin: Vec2;
  /** Direção unitária de subida. */
  up: Vec2;
  percent: number;
  /** Cota absoluta da face superior em `origin`. */
  z0: number;
}

/** Linha notável do telhado em planta (para desenho e quantitativos). 'gable' é a empena (aresta sem inclinação); 'break' é o desnível entre duas águas de mesma subida e inclinações diferentes (mansarda). */
export interface RoofLine {
  kind: 'ridge' | 'hip' | 'valley' | 'eave' | 'gable' | 'break';
  a: Vec2;
  b: Vec2;
}

export interface ResolvedRoofLayer {
  layerIndex: number;
  materialId: Id;
  /** Espessura vertical. */
  thickness: number;
  /** Distância vertical da face superior do telhado ao topo desta camada (soma das camadas acima). */
  below: number;
}

export interface ResolvedRoof {
  roofId: Id;
  typeId: Id;
  levelId: Id;
  planes: ResolvedRoofPlane[];
  lines: RoofLine[];
  layers: ResolvedRoofLayer[];
  /** Cota absoluta do beiral (nível + deslocamento). */
  eaveZ: number;
  /** Área em planta (metros quadrados) cortada das águas pela junção com outro telhado do nível; sai da planta e do volume. */
  joinedArea: number;
  /** Motivo de o telhado não ter águas (contorno que o cálculo não fecha); ausente quando há águas. */
  problem?: string;
  /** Degraus da superfície (vértices reentrantes, em planta e em m); ausente quando a superfície é contínua. */
  steps?: SkeletonStep[];
  /** Acabamentos do beiral (testeira, calha, forro) do telhado; sem ele, nada é desenhado no beiral. */
  eave?: RoofEave;
  /** Corte das camadas no beiral: 'plumb' (vertical, padrão) ou 'square' (perpendicular à água). */
  rafterCut?: RafterCut;
  /** Balanço médio das arestas de beiral (as que têm água), m; base da largura do forro. */
  eaveOverhang?: number;
}

/** Balanço médio das arestas de beiral (as que têm água); 0 quando não há nenhuma. */
function eaveOverhangOf(r: Roof): number {
  const over = boundaryKindsOf(r).flatMap((k, i) => (k === 'eave' ? [r.edgeOverhangs[i] ?? 0] : []));
  return over.length ? over.reduce((a, b) => a + b, 0) / over.length : 0;
}

/** Cota absoluta da face superior de uma água em p (a água define o plano, sem conferir se p está dentro). */
export const planeZ = (pl: ResolvedRoofPlane, p: Vec2): number => pl.z0 + (pl.percent / 100) * dot(sub(p, pl.origin), pl.up);

/** Cota absoluta da face superior do telhado em `p`, ou null fora de todas as águas (sobre a borda vale). */
export function roofTopAt(r: ResolvedRoof, p: Vec2): number | null {
  for (const pl of r.planes) if (planeHas(pl.polygon, p)) return planeZ(pl, p);
  return null;
}

/** Espessura vertical total do telhado (soma das camadas). */
export const roofThickness = (r: ResolvedRoof): number => r.layers.reduce((s, l) => s + l.thickness, 0);

/** Telhado antes da junção: águas da forma menos os furos. Sem tipo ou contorno de três pontos, null. */
type Base = JoinItem & { roof: Roof; type: RoofType; eaveZ: number; problem?: string; steps?: SkeletonStep[]; holeLines: RoofLine[] };

function baseOf(p: Project, raw: Roof): Base | null {
  // Arcos do contorno viram trechos retos só aqui dentro; o modelo gravado fica como está.
  const r = expandRoofArcs(raw);
  const type = p.roofTypes[r.typeId];
  if (!type || r.boundary.length < 3) return null;
  const eaveZ = levelElevation(p, r.levelId) + r.heightOffset;
  // Nunca lança: um telhado malformado (arquivo antigo ou campo ausente) vira `problem`, não uma tela em branco.
  let water: ReturnType<typeof waterPlanesOf>;
  try {
    water = waterPlanesOf(r, eaveZ, unitsOf(p));
  } catch (e) {
    water = { planes: [], problem: `telhado inválido: ${e instanceof Error ? e.message : 'erro desconhecido'}` };
  }
  const holes = r.holes.filter((h) => h.length >= 3).map((h): MultiPolygon => asMulti(h));
  const planes = water.planes
    .map((pl) => ({ ...pl, polygon: holes.length ? difference(pl.polygon, ...holes) : pl.polygon }))
    .filter((pl) => multiArea(pl.polygon) > WATER_MIN_AREA);
  const holeLines = holeGableLines(r.holes, water.planes);
  return {
    roof: r,
    type,
    eaveZ,
    planes,
    joinOthers: r.joinOthers === true,
    joinedArea: 0,
    holeLines,
    ...(water.problem ? { problem: water.problem } : {}),
    ...(water.steps ? { steps: water.steps } : {}),
  };
}

/** Telhado resolvido depois da junção: linhas do próprio telhado mais as divisas que recebe da junção. */
function finish(b: Base, joinLines: ResolvedRoof['lines']): ResolvedRoof {
  const layers: ResolvedRoofLayer[] = [];
  let below = 0;
  b.type.layers.forEach((l, i) => {
    if (l.thickness < 1e-6) return;
    layers.push({ layerIndex: i, materialId: l.materialId, thickness: l.thickness, below });
    below += l.thickness;
  });
  const r = b.roof;
  return {
    roofId: r.id,
    typeId: r.typeId,
    levelId: r.levelId,
    planes: b.planes,
    lines: [...roofLines(r, b.planes, boundaryKindsOf(r)), ...b.holeLines, ...joinLines],
    layers,
    eaveZ: b.eaveZ,
    joinedArea: b.joinedArea,
    eave: r.eave,
    rafterCut: r.rafterCut,
    eaveOverhang: eaveOverhangOf(r),
    ...(b.problem ? { problem: b.problem } : {}),
    ...(b.steps ? { steps: b.steps } : {}),
  };
}

/** Águas, linhas e camadas dos telhados de um nível (ordem de criação), com a junção entre os que se unem. */
export function resolveRoofs(p: Project, levelId: Id): ResolvedRoof[] {
  const bases = roofsOnLevel(p, levelId).flatMap((r) => {
    const b = baseOf(p, r);
    return b ? [b] : [];
  });
  const joined = joinRoofs(bases);
  return bases.map((b, k) => finish(b, joined[k]!));
}

/** Telhados de todos os níveis do projeto (a parede anexada cruza níveis, como com lajes). */
const todosTelhadosPorProjeto = new WeakMap<Project, ResolvedRoof[]>();

/** Cache por projeto (ver `resolveAllFloors`). O vetor é compartilhado: quem chama não o altera. */
export const resolveAllRoofs = (p: Project): ResolvedRoof[] => {
  let r = todosTelhadosPorProjeto.get(p);
  if (!r) todosTelhadosPorProjeto.set(p, (r = p.levels.flatMap((l) => resolveRoofs(p, l.id))));
  return r;
};
