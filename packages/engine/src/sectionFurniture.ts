import { union, type MultiPolygon, type Polygon } from '@hestia/geom';
import {
  assetParts,
  furnitureDefArrays,
  furniturePartWorldTransform,
  isFurniture,
  levelElevation,
  type Furniture,
  type FurnitureAsset,
  type Id,
  type Project,
} from '@hestia/model';
import type { SectionBeyond, SectionOrigin } from './section.ts';
import { EPS_T, rect, sectionFrame, type SectionLine } from './sectionGeom.ts';

/**
 * Corte e elevação dos móveis importados (`Furniture`, malha de arquivo) de um nível.
 *
 * - Elevação/além do plano (`beyond`): a SILHUETA da projeção da malha em (t, z) (todos os triângulos que ficam atrás do
 *   plano, até a profundidade de visão), rasterizada numa grade e unida em polígonos. Não é o casco convexo: cadeira com
 *   vão entre as pernas fica com vão.
 * - Plano atravessando o bloco (`cut`): a região cortada, por interseção triângulo-plano (segmentos em (t, z)) e
 *   preenchimento por paridade em cada linha da grade. Malha aberta (sem fecho) pode dar linhas ímpares: nelas o
 *   preenchimento vai do primeiro ao último cruzamento.
 * - Cor/estilo: o material dominante do bloco (mais triângulos), que já é um `Material` do projeto.
 * - Dono: `furnitureId` na origem (seleção, ocultar/isolar e `ignore` por id, como `componentId`).
 * - Cache por móvel + bloco + linha + elevação (objetos imutáveis: nada recalcula por quadro).
 */
export interface FurnitureSection {
  cut: Array<{ materialId: Id; polygon: Polygon; origin: SectionOrigin }>;
  beyond: SectionBeyond[];
  zMin: number;
  zMax: number;
}

/** Células na maior dimensão da grade (resolução da silhueta e do corte). */
const GRADE = 160;
/** Célula mínima (m): abaixo disto não vale a pena refinar. */
const CELULA_MIN = 0.002;

const cache = new WeakMap<Furniture, { asset: FurnitureAsset; key: string; res: PerFurniture | null }>();

interface PerFurniture {
  materialId: Id;
  cut: Polygon[];
  beyond: { polygons: MultiPolygon; depth: number } | null;
  zMin: number;
  zMax: number;
}

function dominantMaterial(asset: FurnitureAsset): Id | null {
  const count = new Map<number, number>();
  for (const d of asset.defs) for (const g of d.groups) count.set(g.materialIndex, (count.get(g.materialIndex) ?? 0) + g.count / 3);
  let best = -1;
  let bestN = -1;
  for (const [i, n] of count) if (n > bestN) { best = i; bestN = n; }
  return asset.materials[best]?.id ?? asset.materials[0]?.id ?? null;
}

/** Grade de ocupação em (t, z). */
class Grade {
  readonly w: number;
  readonly h: number;
  readonly cells: Uint8Array;
  constructor(readonly t0: number, readonly z0: number, readonly cell: number, w: number, h: number) {
    this.w = w;
    this.h = h;
    this.cells = new Uint8Array(w * h);
  }
  /** Marca as células da linha `row` entre as coordenadas t `a` e `b`. */
  span(row: number, a: number, b: number): void {
    if (row < 0 || row >= this.h) return;
    let i0 = Math.floor((Math.min(a, b) - this.t0) / this.cell);
    let i1 = Math.floor((Math.max(a, b) - this.t0) / this.cell);
    if (i1 < 0 || i0 >= this.w) return;
    i0 = Math.max(0, i0);
    i1 = Math.min(this.w - 1, i1);
    this.cells.fill(1, row * this.w + i0, row * this.w + i1 + 1);
  }
  /** Retângulos (corridas por linha, fundidas na vertical quando iguais) unidos em polígonos. */
  toPolygons(): MultiPolygon {
    const rects: Polygon[] = [];
    let open = new Map<string, { i0: number; i1: number; r0: number }>();
    for (let r = 0; r <= this.h; r++) {
      const now = new Map<string, { i0: number; i1: number; r0: number }>();
      if (r < this.h) {
        let i = 0;
        while (i < this.w) {
          if (!this.cells[r * this.w + i]) { i++; continue; }
          const s = i;
          while (i < this.w && this.cells[r * this.w + i]) i++;
          const key = `${s}:${i}`;
          now.set(key, open.get(key) ?? { i0: s, i1: i, r0: r });
        }
      }
      for (const [k, v] of open) {
        if (!now.has(k)) rects.push([rect(this.t0 + v.i0 * this.cell, this.t0 + v.i1 * this.cell, this.z0 + v.r0 * this.cell, this.z0 + r * this.cell)]);
      }
      open = now;
    }
    return rects.length === 0 ? [] : union(...rects.map((p) => [p] as MultiPolygon));
  }
}

function compute(p: Project, f: Furniture, asset: FurnitureAsset, line: SectionLine): PerFurniture | null {
  const materialId = dominantMaterial(asset);
  if (!materialId) return null;
  const { length, d, n } = sectionFrame(line);
  const elev = levelElevation(p, f.levelId);
  // Vértices no espaço da vista: (t, z, w) com w = distância ao plano (positiva atrás dele).
  const parts = assetParts(asset);
  const defs = new Map(asset.defs.map((x) => [x.id, x]));
  // Descarte barato pela caixa do bloco.
  const bb = asset.bbox;
  let tLo = Infinity, tHi = -Infinity, wLo = Infinity, wHi = -Infinity;
  const m0 = furniturePartWorldTransform(f, { defId: '', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, asset, elev);
  for (let i = 0; i < 8; i++) {
    const x = i & 1 ? bb.max[0] : bb.min[0], y = i & 2 ? bb.max[1] : bb.min[1], z = i & 4 ? bb.max[2] : bb.min[2];
    const wx = m0[0]! * x + m0[4]! * y + m0[8]! * z + m0[12]!;
    const wy = m0[1]! * x + m0[5]! * y + m0[9]! * z + m0[13]!;
    const t = (wx - line.a.x) * d.x + (wy - line.a.y) * d.y;
    const w = (wx - line.a.x) * n.x + (wy - line.a.y) * n.y;
    tLo = Math.min(tLo, t); tHi = Math.max(tHi, t); wLo = Math.min(wLo, w); wHi = Math.max(wHi, w);
  }
  // A caixa do asset está no espaço local; as peças podem sair dela só por arredondamento: folga de 1 cm.
  if (tHi < -0.01 || tLo > length + 0.01 || wHi < -0.01 || wLo > line.depth + 0.01) return null;

  const tri: number[] = []; // 9 números por triângulo: (t, z, w) x 3
  for (const part of parts) {
    const def = defs.get(part.defId);
    if (!def) continue;
    const { positions, indices } = furnitureDefArrays(def);
    const m = furniturePartWorldTransform(f, part, asset, elev);
    const nv = positions.length / 3;
    const v = new Float64Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
      const wx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
      const wy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
      v[i * 3] = (wx - line.a.x) * d.x + (wy - line.a.y) * d.y;
      v[i * 3 + 1] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
      v[i * 3 + 2] = (wx - line.a.x) * n.x + (wy - line.a.y) * n.y;
    }
    for (let k = 0; k + 2 < indices.length; k += 3) {
      const a = indices[k]! * 3, b = indices[k + 1]! * 3, c = indices[k + 2]! * 3;
      const w0 = v[a + 2]!, w1 = v[b + 2]!, w2 = v[c + 2]!;
      if (Math.max(w0, w1, w2) <= 0 || Math.min(w0, w1, w2) >= line.depth) continue;
      tri.push(v[a]!, v[a + 1]!, w0, v[b]!, v[b + 1]!, w1, v[c]!, v[c + 1]!, w2);
    }
  }
  const nt = tri.length / 9;
  if (nt === 0) return null;

  let t0 = Infinity, t1 = -Infinity, z0 = Infinity, z1 = -Infinity, wMin = Infinity;
  for (let i = 0; i < tri.length; i += 3) {
    t0 = Math.min(t0, tri[i]!); t1 = Math.max(t1, tri[i]!);
    z0 = Math.min(z0, tri[i + 1]!); z1 = Math.max(z1, tri[i + 1]!);
    wMin = Math.min(wMin, tri[i + 2]!);
  }
  t0 = Math.max(0, t0);
  t1 = Math.min(length, t1);
  if (t1 - t0 < EPS_T || z1 - z0 < 1e-6) return null;
  const cell = Math.max(CELULA_MIN, Math.max(t1 - t0, z1 - z0) / GRADE);
  const w = Math.max(1, Math.ceil((t1 - t0) / cell));
  const h = Math.max(1, Math.ceil((z1 - z0) / cell));

  // Silhueta: cada triângulo enche as células que cobre (amostra na linha, limitada ao intervalo z do triângulo).
  const sil = new Grade(t0, z0, cell, w, h);
  const cutSegs: Array<[number, number, number, number]> = []; // (t, z) dos dois extremos
  for (let i = 0; i < tri.length; i += 9) {
    const X = [tri[i]!, tri[i + 3]!, tri[i + 6]!], Z = [tri[i + 1]!, tri[i + 4]!, tri[i + 7]!], W = [tri[i + 2]!, tri[i + 5]!, tri[i + 8]!];
    const zlo = Math.min(Z[0]!, Z[1]!, Z[2]!), zhi = Math.max(Z[0]!, Z[1]!, Z[2]!);
    const r0 = Math.max(0, Math.floor((zlo - z0) / cell)), r1 = Math.min(h - 1, Math.floor((zhi - z0) / cell));
    for (let r = r0; r <= r1; r++) {
      const zc = Math.min(zhi, Math.max(zlo, z0 + (r + 0.5) * cell));
      let a = Infinity, b = -Infinity;
      for (let e = 0; e < 3; e++) {
        const j = (e + 1) % 3;
        const za = Z[e]!, zb = Z[j]!;
        if ((za - zc) * (zb - zc) > 0) continue;
        const x = za === zb ? undefined : X[e]! + ((X[j]! - X[e]!) * (zc - za)) / (zb - za);
        if (x === undefined) { a = Math.min(a, X[e]!, X[j]!); b = Math.max(b, X[e]!, X[j]!); } else { a = Math.min(a, x); b = Math.max(b, x); }
      }
      if (a <= b) sil.span(r, a, b);
    }
    // Interseção com o plano w = 0 (só triângulos que o atravessam).
    if (Math.min(W[0]!, W[1]!, W[2]!) < 0 && Math.max(W[0]!, W[1]!, W[2]!) > 0) {
      const pts: Array<[number, number]> = [];
      for (let e = 0; e < 3; e++) {
        const j = (e + 1) % 3;
        const wa = W[e]!, wb = W[j]!;
        if ((wa < 0 && wb > 0) || (wa > 0 && wb < 0)) {
          const s = wa / (wa - wb);
          pts.push([X[e]! + (X[j]! - X[e]!) * s, Z[e]! + (Z[j]! - Z[e]!) * s]);
        }
      }
      if (pts.length === 2) cutSegs.push([pts[0]![0], pts[0]![1], pts[1]![0], pts[1]![1]]);
    }
  }
  const beyondPolys = sil.toPolygons();

  // Corte: cruzamentos por linha da grade, preenchimento por paridade.
  let cutPolys: Polygon[] = [];
  if (cutSegs.length > 0) {
    const cg = new Grade(t0, z0, cell, w, h);
    const cross: number[][] = Array.from({ length: h }, () => []);
    for (const [ta, za, tb, zb] of cutSegs) {
      if (za === zb) continue;
      const lo = Math.min(za, zb), hi = Math.max(za, zb);
      const r0 = Math.max(0, Math.ceil((lo - z0) / cell - 0.5)), r1 = Math.min(h - 1, Math.floor((hi - z0) / cell - 0.5));
      for (let r = r0; r <= r1; r++) {
        const zc = z0 + (r + 0.5) * cell;
        cross[r]!.push(ta + ((tb - ta) * (zc - za)) / (zb - za));
      }
    }
    for (let r = 0; r < h; r++) {
      const xs = cross[r]!.sort((a, b) => a - b);
      if (xs.length < 2) continue;
      if (xs.length % 2 === 0) for (let k = 0; k < xs.length; k += 2) cg.span(r, xs[k]!, xs[k + 1]!);
      else cg.span(r, xs[0]!, xs[xs.length - 1]!);
    }
    cutPolys = cg.toPolygons().filter((q) => q[0] && q[0].length >= 3);
  }
  return {
    materialId,
    cut: cutPolys,
    beyond: beyondPolys.length ? { polygons: beyondPolys, depth: Math.max(0, wMin) } : null,
    zMin: z0,
    zMax: z1,
  };
}

/** Corte e projeção dos móveis importados de um nível na vista de corte ou elevação. */
export function sectionOfFurniture(p: Project, levelId: Id, line: SectionLine): FurnitureSection {
  const out: FurnitureSection = { cut: [], beyond: [], zMin: Infinity, zMax: -Infinity };
  const { length } = sectionFrame(line);
  if (length < 1e-6 || !p.furniture) return out;
  const key = `${line.a.x},${line.a.y},${line.b.x},${line.b.y},${line.depth},${levelElevation(p, levelId)}`;
  const list = Object.values(p.elements).filter((e): e is Furniture => isFurniture(e) && e.levelId === levelId).sort((a, b) => a.order - b.order);
  for (const f of list) {
    const asset = p.furniture.assets[f.assetId];
    if (!asset) continue;
    let hit = cache.get(f);
    if (!hit || hit.asset !== asset || hit.key !== key) {
      hit = { asset, key, res: compute(p, f, asset, line) };
      cache.set(f, hit);
    }
    const r = hit.res;
    if (!r) continue;
    const origin: SectionOrigin = { furnitureId: f.id };
    for (const polygon of r.cut) out.cut.push({ materialId: r.materialId, polygon, origin });
    if (r.beyond) out.beyond.push({ furnitureId: f.id, materialId: r.materialId, layerIndex: 0, depth: r.beyond.depth, polygons: r.beyond.polygons });
    out.zMin = Math.min(out.zMin, r.zMin);
    out.zMax = Math.max(out.zMax, r.zMax);
  }
  return out;
}
