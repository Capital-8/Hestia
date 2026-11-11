import { asMulti, closeGapsSafe, difference, dist, dot, intersection, mid, mul, multiArea, offsetMulti, norm, perp, ringArea, sub, union, add, type Ring, type Vec2 } from '@hestia/geom';
import { stairFinishOf, type Id } from '@hestia/model';
import type { ResolvedStair, ResolvedStairRiser, ResolvedStairStep } from './stairs.ts';

/**
 * Acabamentos da escada (piso, espelho e bocel), medidos na face ACABADA. A geometria resolvida (`steps`, `risers`, cotas
 * `z = base + k·h`) já é a acabada: o espelho acabado é `h = H ÷ N` em todos os degraus e a pisada é medida entre as
 * faces acabadas dos espelhos. A estrutura é que desconta as espessuras:
 * - o piso acabado do degrau k é o sólido de `z_k − tp` a `z_k`, com a planta do degrau, mais a faixa do bocel sobre a
 *   face do espelho k, mais a faixa sob o espelho acabado de cima (o piso corre até encostar na estrutura; UM sólido). O bocel é medido a partir da face acabada do espelho e não muda a planta;
 * - o espelho acabado k é a faixa de espessura `te` ATRÁS da face (para o lado do degrau de cima), de `z_(k−1)`
 *   (o topo do piso acabado de baixo, que corre por baixo dele) até `z_k − tp` (o fundo do piso acabado de cima). O 1º espelho
 *   nasce no piso de baixo (`baseZ`) e o último chega ao nível de cima (`topZ`): são os degraus compensados;
 * - a estrutura de cada degrau perde `tp` no topo e troca a faixa do espelho de trás (que passa a ser acabamento) pela
 *   faixa do espelho da frente, onde o acabamento do espelho se apoia.
 * Piso e espelho terminam alinhados à lateral do degrau (as faixas saem da própria linha do espelho aparada).
 * Estilo montado: sem acabamento (piso e espelho do tipo já são o acabamento). Poste: só piso.
 */
export interface StairFinishSolid {
  kind: 'tread' | 'riser';
  /** Piso: degrau ou patamar de onde sai; espelho: o lance dono do espelho. */
  componentIndex: number;
  /** Piso: nº do degrau (espelho que ele alcança); espelho: nº global do espelho. */
  number: number;
  /** Degrau ou patamar (só piso). */
  stepKind?: 'tread' | 'landing';
  /** Planta do sólido (piso: degrau + bocel). */
  polygon: Ring;
  z0: number;
  z1: number;
  materialId: Id;
  /**
   * Piso: comprimento da aresta frontal que leva bocel (m); 0 sem bocel ou sem espelho de trás. Espelho: comprimento da
   * face acabada (m), para a área.
   */
  edgeLength: number;
}

export interface StairFinishModel {
  solids: StairFinishSolid[];
  /** Planta do acabamento do espelho k (nº global): a faixa atrás da face, com as laterais na borda do degrau. */
  bands: Map<number, Ring>;
  /** Planta da estrutura de cada degrau/patamar (a estrutura perde a faixa do espelho de trás e ganha a da frente). */
  structure: Map<ResolvedStairStep, Ring[]>;
  /** Espessura do acabamento do espelho (m): a chegada começa depois dela. */
  riserThickness: number;
}

const Z_TOL = 1e-6;
const EPS = 1e-9;
/** Quanto a faixa prolonga além das pontas da linha do espelho antes de ser recortada pelo degrau vizinho (m). */
const EXTEND = 0.5;

/** Normais à esquerda de cada vértice da polilinha (diferença central; unilateral nas pontas). */
function leftNormals(pts: Vec2[]): Vec2[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    return perp(norm(sub(b, a)));
  });
}

/** Faixa de espessura `t` ao lado da polilinha (`side` +1 = esquerda): a polilinha e a cópia deslocada. Anel anti-horário. */
function band(pts: Vec2[], side: 1 | -1, t: number): Ring {
  const ns = leftNormals(pts);
  const off = pts.map((p, i) => add(p, mul(ns[i]!, side * t)));
  const ring = [...pts, ...off.reverse()];
  return ringArea(ring) < 0 ? ring.reverse() : ring;
}


/** Prolonga a polilinha nas duas pontas, na direção da tangente (a faixa é depois recortada pelo degrau vizinho). */
function extended(pts: Vec2[], e: number): Vec2[] {
  const out = pts.slice();
  const a = pts[0]!;
  const b = pts[1]!;
  const y = pts[pts.length - 2]!;
  const z = pts[pts.length - 1]!;
  out[0] = add(a, mul(norm(sub(a, b)), e));
  out[out.length - 1] = add(z, mul(norm(sub(z, y)), e));
  return out;
}

/**
 * Faixa de espessura `t` ao lado da linha do espelho, com as laterais ALINHADAS À BORDA do degrau vizinho: a faixa
 * perpendicular (prolongada) é recortada pela planta dos degraus que ficam daquele lado (`neighbours`). Assim, em espelho
 * oblíquo ou em leque, a faixa nunca passa da lateral nem deixa vão. Sem vizinho: a faixa é inclinada para a direção de
 * subida `dir` (espessura medida na normal), e sem direção, perpendicular.
 */
function alignedBand(pts: Vec2[], side: 1 | -1, t: number, neighbours: Ring[], dir: Vec2 | null): Ring {
  if (neighbours.length > 0) {
    const big = band(extended(pts, EXTEND), side, t);
    const clipped = intersection(asMulti(big), neighbours.map((r) => [r]));
    const rings = clipped.map((poly) => poly[0]!).filter((r) => r.length >= 3);
    if (rings.length === 1 && multiArea(asMulti(rings[0]!)) > 0.5 * t * polyLength(pts)) return rings[0]!;
  }
  if (dir && pts.length === 2) {
    const n = leftNormals(pts)[0]!;
    const c = dot(dir, n) * side;
    if (Math.abs(c) > 0.2) {
      const sh = mul(dir, Math.sign(c) * (t / Math.abs(c)));
      const ring = [pts[0]!, pts[1]!, add(pts[1]!, sh), add(pts[0]!, sh)];
      return ringArea(ring) < 0 ? ring.reverse() : ring;
    }
  }
  return band(pts, side, t);
}

const polyLength = (pts: Vec2[]): number => pts.reduce((s, q, i) => (i === 0 ? 0 : s + dist(pts[i - 1]!, q)), 0);

const centroidOf = (r: Ring): Vec2 => ({ x: r.reduce((s, p) => s + p.x, 0) / r.length, y: r.reduce((s, p) => s + p.y, 0) / r.length });

/** Lado (+1 esquerda, −1 direita) da linha do espelho para onde fica o degrau de cima. null se nenhum degrau o indica. */
function upSide(stair: ResolvedStair, r: ResolvedStairRiser, pts: Vec2[]): 1 | -1 | null {
  const ns = leftNormals(pts);
  const k = Math.floor(ns.length / 2);
  const n = ns[k]!;
  const m = pts[k]!;
  const at = (z: number): ResolvedStairStep | undefined => stair.steps.find((st) => Math.abs(st.z - z) < Z_TOL);
  const above = at(r.z1);
  if (above) return dot(n, sub(centroidOf(above.polygon), m)) >= 0 ? 1 : -1;
  const below = at(r.z0);
  if (below) return dot(n, sub(centroidOf(below.polygon), m)) >= 0 ? -1 : 1;
  return null;
}

/**
 * Une dois anéis que dividem uma aresta de comprimento `shared` (a linha do espelho) em UM anel, ou null se não se juntam.
 * A aresta oblíqua compartilhada sai do arredondamento da grade do Clipper com frestas de µm: nesse caso o fechamento de
 * frestas da própria biblioteca (`closeGapsSafe`) cola os dois, mas só quando há aresta em comum de fato (encostar só num
 * canto, como um patamar vizinho, não une nada).
 */
function joinAlong(a: Ring, b: Ring, shared: number): Ring | null {
  const plain = union(asMulti(a), asMulti(b));
  if (plain.length === 1) return plain[0]![0]!;
  const reach = 5e-6;
  const touch = multiArea(intersection(offsetMulti(asMulti(a), reach), asMulti(b)));
  if (!(touch >= 0.5 * reach * shared)) return null;
  const glued = closeGapsSafe(plain);
  return glued.length === 1 ? glued[0]![0]! : null;
}

const cache = new WeakMap<ResolvedStair, StairFinishModel | null>();

/** Modelo dos acabamentos da escada resolvida; null sem acabamento (nada ligado, estilo montado ou escada sem degraus). */
export function stairFinishModel(stair: ResolvedStair): StairFinishModel | null {
  if (cache.has(stair)) return cache.get(stair)!;
  const out = buildModel(stair);
  cache.set(stair, out);
  return out;
}

function buildModel(stair: ResolvedStair): StairFinishModel | null {
  const fin = stairFinishOf(stair.type);
  const h = stair.riserHeight;
  if (!(fin.treadOn || fin.riserOn) || !(h > 0) || stair.steps.length === 0) return null;
  const tp = fin.treadThickness;
  const te = fin.riserThickness;
  const N = stair.riserCount;
  const baseZ = stair.baseZ;
  const num = (z: number): number => Math.round((z - baseZ) / h);

  // Espelhos pelo nº global: cada linha de emenda existe uma vez.
  const info = new Map<number, { r: ResolvedStairRiser; pts: Vec2[]; side: 1 | -1 }>();
  for (const r of stair.risers) {
    const pts = r.points.length >= 2 ? r.points : [r.a, r.b];
    const side = upSide(stair, r, pts);
    if (side === null || !(polyLength(pts) > EPS)) continue;
    info.set(Math.round((r.z0 - baseZ) / h) + 1, { r, pts, side });
  }
  const stepsAt = (z: number): Ring[] => stair.steps.filter((st) => Math.abs(st.z - z) < Z_TOL).map((st) => st.polygon);
  /** Direção de subida na linha do espelho k: do espelho vizinho de baixo ao de cima (a de baixo no último espelho). */
  const climb = (k: number): Vec2 | null => {
    const here = info.get(k);
    const other = info.get(k + 1) ?? info.get(k - 1);
    if (!here || !other) return null;
    const a = mid(here.pts[0]!, here.pts[here.pts.length - 1]!);
    const b = mid(other.pts[0]!, other.pts[other.pts.length - 1]!);
    const d = info.get(k + 1) ? sub(b, a) : sub(a, b);
    return dist(a, b) > EPS ? norm(d) : null;
  };
  const bandUp = new Map<number, Ring>();
  if (fin.riserOn) for (const [k, i] of info) bandUp.set(k, alignedBand(i.pts, i.side, te, stepsAt(i.r.z1), climb(k)));

  const solids: StairFinishSolid[] = [];
  if (fin.riserOn) {
    for (const [k, i] of info) {
      solids.push({
        kind: 'riser',
        componentIndex: i.r.componentIndex,
        number: k,
        polygon: bandUp.get(k)!,
        z0: k === 1 ? baseZ : fin.treadOn ? i.r.z0 : i.r.z0 - tp,
        z1: k === N ? i.r.z1 : i.r.z1 - tp,
        materialId: fin.riserMaterialId,
        edgeLength: polyLength(i.pts),
      });
    }
  }

  const structure = new Map<ResolvedStairStep, Ring[]>();
  for (const st of stair.steps) {
    const back = num(st.z);
    const front = info.get(back + 1);
    if (fin.treadOn) {
      const bi = info.get(back);
      let polygon = st.polygon;
      let edgeLength = 0;
      // O piso corre por baixo do espelho acabado de cima, até encostar na estrutura (a faixa do espelho da frente).
      const underRiser = fin.riserOn && front && Math.abs(front.r.z0 - st.z) < Z_TOL ? bandUp.get(back + 1) : undefined;
      if (underRiser) {
        const ext = joinAlong(st.polygon, underRiser, polyLength(front!.pts));
        if (ext) polygon = ext;
      }
      if (fin.bocel > 0 && bi) {
        const strip = alignedBand(bi.pts, bi.side === 1 ? -1 : 1, fin.bocel, stepsAt(bi.r.z0), climb(back));
        const joined = joinAlong(polygon, strip, polyLength(bi.pts));
        if (joined) {
          polygon = joined;
          edgeLength = polyLength(bi.pts);
        }
      }
      solids.push({
        kind: 'tread',
        componentIndex: st.componentIndex,
        number: back,
        stepKind: st.kind,
        polygon,
        z0: st.z - tp,
        z1: st.z,
        materialId: fin.treadMaterialId,
        edgeLength,
      });
    }
    if (fin.riserOn) {
      let m = asMulti(st.polygon);
      const bb = bandUp.get(back);
      if (bb) m = difference(m, asMulti(bb));
      const fb = front && Math.abs(front.r.z0 - st.z) < Z_TOL ? bandUp.get(back + 1) : undefined;
      if (fb) m = union(m, asMulti(fb));
      structure.set(st, m.map((poly) => poly[0]!).filter((r) => r.length >= 3));
    }
  }
  return { solids, bands: bandUp, structure, riserThickness: te };
}

/** Áreas e metros dos acabamentos de uma escada (zero sem acabamento). Piso: área em planta (inclui o bocel). */
export interface StairFinishQuantities {
  /** Área do acabamento do piso (metros quadrados): planta de cada piso acabado, com o bocel. */
  treadArea: number;
  /** Área do acabamento do espelho (metros quadrados): comprimento × altura de cada espelho acabado. */
  riserArea: number;
  /** Comprimento total do bocel (m). */
  bocelLength: number;
  /** Volumes (metros cúbicos), por material. */
  volumeByMaterial: Record<Id, number>;
}

export function stairFinishQuantities(stair: ResolvedStair): StairFinishQuantities {
  const out: StairFinishQuantities = { treadArea: 0, riserArea: 0, bocelLength: 0, volumeByMaterial: {} };
  const model = stairFinishModel(stair);
  if (!model) return out;
  for (const s of model.solids) {
    const area = multiArea(asMulti(s.polygon));
    out.volumeByMaterial[s.materialId] = (out.volumeByMaterial[s.materialId] ?? 0) + area * (s.z1 - s.z0);
    if (s.kind === 'tread') {
      out.treadArea += area;
      out.bocelLength += s.edgeLength;
    } else {
      out.riserArea += s.edgeLength * (s.z1 - s.z0);
    }
  }
  return out;
}

