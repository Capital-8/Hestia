import { difference, ringArea, triangulate, union, type MultiPolygon, type Polygon, type Ring, type Vec2 } from '@hestia/geom';
import { bandTopAt, fuseBands, layerPartsOf, planeZ, slabRiseAt, wallLayerBandsAfterJunction, type JunctionLevel, type LayerBand, type ResolvedCeiling, type ResolvedFloor, type ResolvedLevel, type ResolvedRoof, type ResolvedSlab, type ResolvedWall } from '@hestia/engine';
import type { GraphicsCategory, Id } from '@hestia/model';
import { splitTJunctions, weldBands } from './layerTopology.ts';
import { emendaDaAgua } from './roofEmendas3d.ts';

/**
 * Faixa de `indices` de um lote que pertence a um elemento: `indices[start .. start + count)`, sempre múltiplo de 3
 * (triângulos inteiros). Um elemento pode ter várias faixas no mesmo lote (uma por camada ou por peça).
 */
export interface ElementRange {
  id: Id;
  start: number;
  count: number;
}

/** Malha de um material: vértices próprios por face (sombreamento chapado, arestas nítidas). */
export interface SolidBatch {
  materialId: Id;
  /** Categoria gráfica da peça (visibilidade, transparência e meio-tom da vista 3D, decisão 0015 §2.4). */
  category: GraphicsCategory;
  positions: number[];
  normals: number[];
  indices: number[];
  /** Elemento de cada faixa de `indices` (picking e realce na vista 3D, decisão 0016). */
  ids: ElementRange[];
  /** Peças do mesmo `group` formam uma peça física: as arestas internas do grupo não são desenhadas. */
  group?: string;
}

/**
 * Lote só para leitura (consumidores: GPU, arestas, fantasma, picking). `SolidBatch` é atribuível a ele. Aceita arrays
 * tipados e, sem `normals`, o lote é de sombreamento chapado por derivadas no shader (`flatShading`): malha indexada
 * soldada, sem normais por vértice (objetos genéricos importados, `buildGenericSolids`).
 */
export interface LoteSolido {
  materialId: Id;
  category: GraphicsCategory;
  positions: ArrayLike<number>;
  normals?: ArrayLike<number>;
  indices: ArrayLike<number>;
  ids: ElementRange[];
  group?: string;
}

/** Registra as faixas de `indices` que `fn` acrescenta ao lote `b` como pertencentes ao elemento `id`. */
export function ofElement(b: SolidBatch, id: Id, fn: () => void): void {
  const start = b.indices.length;
  fn();
  if (b.indices.length > start) b.ids.push({ id, start, count: b.indices.length - start });
}

function oriented(r: Ring, ccw: boolean): Ring {
  const a = ringArea(r);
  return (a > 0) === ccw ? r : [...r].reverse();
}

function push(b: SolidBatch, v: number[], n: [number, number, number], tris: number[]): void {
  const base = b.positions.length / 3;
  for (let i = 0; i < v.length; i += 3) {
    b.positions.push(v[i]!, v[i + 1]!, v[i + 2]!);
    b.normals.push(n[0], n[1], n[2]);
  }
  for (const t of tris) b.indices.push(base + t);
}

/**
 * Extrusão vertical de um polígono com furos entre z0 e z1. Com `topAt`/`bottomAt` (cota por ponto, planos
 * inclinados), o topo e a base seguem essas funções em vez de z1 e z0; a espessura vertical é a mesma em todo lugar.
 */
export function extrudePolygon(
  b: SolidBatch,
  poly: Polygon,
  z0: number,
  z1: number,
  topAt?: (x: number, y: number) => number,
  bottomAt?: (x: number, y: number) => number,
): void {
  if (z1 - z0 < 1e-6 || !poly[0]) return;
  extrudeCaps(b, poly, z0, z1, topAt, bottomAt);
  const zBot = (x: number, y: number): number => (bottomAt ? bottomAt(x, y) : z0);
  const zTop = (x: number, y: number): number => (topAt ? topAt(x, y) : z1);
  for (const ring of poly.map((r, i) => oriented(r, i === 0))) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      pushWall(b, p, q, zBot(p.x, p.y), zBot(q.x, q.y), zTop(p.x, p.y), zTop(q.x, q.y));
    }
  }
}

/**
 * Parede vertical entre p e q, com cota de fundo (bp, bq) e de topo (tp, tq) em cada extremo. O anel deve andar no
 * sentido anti-horário: a normal aponta para fora, à direita de p→q.
 */
export function pushWall(b: SolidBatch, p: Vec2, q: Vec2, bp: number, bq: number, tp: number, tq: number): void {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return;
  push(b, [p.x, p.y, bp, q.x, q.y, bq, q.x, q.y, tq, p.x, p.y, tp], [dy / L, -dx / L, 0], [0, 1, 2, 0, 2, 3]);
}

/** Topo e base de uma extrusão (sem as paredes): a triangulação do polígono com furos, na cota de cada ponto. */
export function extrudeCaps(
  b: SolidBatch,
  poly: Polygon,
  z0: number,
  z1: number,
  topAt?: (x: number, y: number) => number,
  bottomAt?: (x: number, y: number) => number,
): void {
  const rings = poly.map((r, i) => oriented(r, i === 0));
  const norm: Polygon = rings;
  const m = triangulate(norm);
  const top: number[] = [];
  const bottom: number[] = [];
  const zTop = (x: number, y: number): number => (topAt ? topAt(x, y) : z1);
  const zBot = (x: number, y: number): number => (bottomAt ? bottomAt(x, y) : z0);
  for (let i = 0; i < m.positions.length; i += 2) {
    top.push(m.positions[i]!, m.positions[i + 1]!, zTop(m.positions[i]!, m.positions[i + 1]!));
    bottom.push(m.positions[i]!, m.positions[i + 1]!, zBot(m.positions[i]!, m.positions[i + 1]!));
  }
  const up: number[] = [];
  const down: number[] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    let a = m.indices[i]!;
    let bb = m.indices[i + 1]!;
    const c = m.indices[i + 2]!;
    const cr = (m.positions[bb * 2]! - m.positions[a * 2]!) * (m.positions[c * 2 + 1]! - m.positions[a * 2 + 1]!) - (m.positions[bb * 2 + 1]! - m.positions[a * 2 + 1]!) * (m.positions[c * 2]! - m.positions[a * 2]!);
    if (cr < 0) [a, bb] = [bb, a];
    up.push(a, bb, c);
    down.push(a, c, bb);
  }
  // Normais dos planos (lineares por construção): com z = g·p + c, a de cima é (-gx, -gy, 1) e a de baixo (gx, gy, -1).
  const o = poly[0]![0]!;
  const gradient = (at: (x: number, y: number) => number): [number, number] => [at(o.x + 1, o.y) - at(o.x, o.y), at(o.x, o.y + 1) - at(o.x, o.y)];
  let topN: [number, number, number] = [0, 0, 1];
  if (topAt) {
    const [gx, gy] = gradient(topAt);
    const l = Math.hypot(gx, gy, 1);
    topN = [-gx / l, -gy / l, 1 / l];
  }
  let bottomN: [number, number, number] = [0, 0, -1];
  if (bottomAt) {
    const [gx, gy] = gradient(bottomAt);
    const l = Math.hypot(gx, gy, 1);
    bottomN = [gx / l, gy / l, -1 / l];
  }
  push(b, top, topN, up);
  push(b, bottom, bottomN, down);
}

/** Tolerância (m) para duas arestas de planta estarem na mesma reta, e (m) para duas cotas serem a mesma. */
const LINE_EPS = 3e-7;
const Z_EPS = 1e-9;

/** Triângulos com a normal voltada para `n` (a ordem dos vértices é corrigida pelo produto vetorial). */
function emitFace(b: SolidBatch, poly: MultiPolygon, to3: (u: number, v: number) => [number, number, number], n: [number, number, number]): void {
  for (const p of poly) {
    if (!p[0]) continue;
    const m = triangulate(p);
    const v: number[] = [];
    for (let i = 0; i < m.positions.length; i += 2) v.push(...to3(m.positions[i]!, m.positions[i + 1]!));
    const tris: number[] = [];
    for (let i = 0; i < m.indices.length; i += 3) {
      const a = m.indices[i]!;
      let bb = m.indices[i + 1]!;
      let c = m.indices[i + 2]!;
      const ax = v[a * 3]!;
      const ay = v[a * 3 + 1]!;
      const az = v[a * 3 + 2]!;
      const ux = v[bb * 3]! - ax;
      const uy = v[bb * 3 + 1]! - ay;
      const uz = v[bb * 3 + 2]! - az;
      const wx = v[c * 3]! - ax;
      const wy = v[c * 3 + 1]! - ay;
      const wz = v[c * 3 + 2]! - az;
      const cr = (uy * wz - uz * wy) * n[0] + (uz * wx - ux * wz) * n[1] + (ux * wy - uy * wx) * n[2];
      if (Math.abs(cr) < 1e-18) continue;
      if (cr < 0) [bb, c] = [c, bb];
      tris.push(a, bb, c);
    }
    push(b, v, n, tris);
  }
}

/** União que pula a booleana quando há no máximo uma região (o caso comum de uma face só). */
const unionAll = (ms: MultiPolygon[]): MultiPolygon => {
  const parts = ms.filter((m) => m.length > 0);
  if (parts.length === 0) return [];
  return parts.length === 1 ? parts[0]! : union(...parts);
};

/** Reta de planta com as faces voltadas para +m (`plus`) e para -m (`minus`), em coordenadas (s, z). */
interface PlanLine {
  m: Vec2;
  c: number;
  plus: MultiPolygon[];
  minus: MultiPolygon[];
}

/**
 * Sólido de uma camada de parede a partir das suas faixas (já fundidas). Em vez de um prisma por faixa, cada face
 * lateral vira UMA região em (s, z) sobre a reta de planta, e as faces coplanares de faixas vizinhas se unem nela:
 * a parede fica inteira de base a topo, e o vão só aparece como furo na face (contorno dele, sem prolongamento).
 *
 * Faces voltadas para +m e -m numa mesma reta são subtraídas uma da outra: uma aresta compartilhada por duas
 * peças da camada é interna e some. Topo e base são as áreas planas expostas de cada cota; topo inclinado segue
 * o plano do perfil. O volume é o das faixas (mesmos polígonos, nenhuma área criada ou perdida).
 */
function extrudeLayer(b: SolidBatch, bands: LayerBand[], baseZ: number): void {
  const firstTri = b.indices.length;
  const firstVert = b.positions.length / 3;
  const lines: PlanLine[] = [];
  const flatTops: Array<{ z: number; poly: MultiPolygon }> = [];
  const bottoms: Array<{ z: number; poly: MultiPolygon }> = [];
  const zs: number[] = [];
  const addZ = (z: number): void => {
    if (!zs.some((q) => Math.abs(q - z) < Z_EPS)) zs.push(z);
  };

  // Solda, limpa (a união cancela espículas e cria vértices de interseção) e solda de novo: os vértices novos da
  // união também podem ficar a 0,1 mm de vizinhos de outra faixa.
  const cleaned = weldBands(weldBands(bands).map((b) => ({ ...b, poly: union(b.poly) })));
  // Faixas planas viram uma região por fatia de cota (união das que cobrem a fatia): sobreposições minúsculas do motor
  // (1e-8 em área, arredondamento das booleanas) somem, e as arestas quase coincidentes se fundem. Faixas inclinadas seguem.
  const flat = cleaned.filter((b) => !b.slope);
  const zsFlat: number[] = [];
  for (const b of flat) for (const z of [b.z0, b.z1]) if (!zsFlat.some((q) => Math.abs(q - z) < Z_EPS)) zsFlat.push(z);
  zsFlat.sort((x, y) => x - y);
  const slabs: LayerBand[] = [];
  for (let k = 0; k + 1 < zsFlat.length; k++) {
    const za = zsFlat[k]!;
    const zb = zsFlat[k + 1]!;
    const act = flat.filter((b) => b.z0 <= za + Z_EPS && b.z1 >= zb - Z_EPS).map((b) => b.poly);
    const poly = unionAll(act);
    if (poly.length) slabs.push({ z0: za, z1: zb, poly });
  }
  const pieces = [...slabs, ...cleaned.filter((b) => b.slope)];
  for (const band of pieces) {
    if (band.poly.length === 0) continue;
    const z0 = baseZ + band.z0;
    const flatTop = baseZ + band.z1;
    const slope = band.slope;
    const topAt = slope ? (x: number, y: number): number => baseZ + bandTopAt(band, { x, y }) : undefined;
    const zTop = (x: number, y: number): number => (topAt ? topAt(x, y) : flatTop);
    bottoms.push({ z: z0, poly: band.poly });
    addZ(z0);
    if (slope) {
      // Plano do perfil: z = gx·x + gy·y + c, com g = k·d (k = Δh/Δt). A normal aponta para cima.
      const k = (slope.h1 - slope.h0) / (slope.t1 - slope.t0);
      const gx = k * slope.d.x;
      const gy = k * slope.d.y;
      const l = Math.hypot(gx, gy, 1);
      emitFace(b, band.poly, (x, y) => [x, y, zTop(x, y)], [-gx / l, -gy / l, 1 / l]);
    } else {
      flatTops.push({ z: flatTop, poly: band.poly });
      addZ(flatTop);
    }

    for (const pl of band.poly) {
      for (const ring of pl.map((r, i) => oriented(r, i === 0))) {
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i]!;
          const q = ring[(i + 1) % ring.length]!;
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const L = Math.hypot(dx, dy);
          if (L < 1e-9) continue;
          // Normal para fora: à direita de p→q (anéis externos anti-horários, furos horários).
          let nx = dy / L;
          let ny = -dx / L;
          let plus = true;
          if (nx < -1e-12 || (Math.abs(nx) <= 1e-12 && ny < 0)) {
            nx = -nx;
            ny = -ny;
            plus = false;
          }
          const m: Vec2 = { x: nx, y: ny };
          const c = nx * p.x + ny * p.y;
          const onLine = (ln: PlanLine): boolean =>
            Math.abs(ln.m.x * ny - ln.m.y * nx) < LINE_EPS &&
            Math.abs(ln.m.x * p.x + ln.m.y * p.y - ln.c) < LINE_EPS &&
            Math.abs(ln.m.x * q.x + ln.m.y * q.y - ln.c) < LINE_EPS;
          let ln = lines.find(onLine);
          if (!ln) {
            ln = { m, c, plus: [], minus: [] };
            lines.push(ln);
          }
          // Coordenadas da reta: s ao longo de d = (-m.y, m.x); z de topo nas duas pontas.
          const sp = -ln.m.y * p.x + ln.m.x * p.y;
          const sq = -ln.m.y * q.x + ln.m.x * q.y;
          const tp = zTop(p.x, p.y);
          const tq = zTop(q.x, q.y);
          const [sLo, sHi, tLo, tHi] = sp <= sq ? [sp, sq, tp, tq] : [sq, sp, tq, tp];
          if (sHi - sLo < 1e-9 || (tLo - z0 < Z_EPS && tHi - z0 < Z_EPS)) continue;
          const ring2: Ring = [
            { x: sLo, y: z0 },
            { x: sHi, y: z0 },
            { x: sHi, y: tHi },
            { x: sLo, y: tLo },
          ];
          (plus ? ln.plus : ln.minus).push([[ring2]]);
        }
      }
    }
  }

  // Faces laterais: por reta, a parte voltada para +m menos a voltada para -m (as arestas compartilhadas somem).
  for (const ln of lines) {
    const pl = unionAll(ln.plus);
    const mi = unionAll(ln.minus);
    const d: Vec2 = { x: -ln.m.y, y: ln.m.x };
    const to3 = (s: number, z: number): [number, number, number] => [ln.c * ln.m.x + s * d.x, ln.c * ln.m.y + s * d.y, z];
    if (pl.length) emitFace(b, mi.length ? difference(pl, mi) : pl, to3, [ln.m.x, ln.m.y, 0]);
    if (mi.length) emitFace(b, pl.length ? difference(mi, pl) : mi, to3, [-ln.m.x, -ln.m.y, 0]);
  }

  // Topo e base planos: em cada cota, o que é topo de uma faixa e não tem faixa por cima (e o simétrico na base).
  for (const Z of zs) {
    const tops = unionAll(flatTops.filter((f) => Math.abs(f.z - Z) < Z_EPS).map((f) => f.poly));
    const bots = unionAll(bottoms.filter((f) => Math.abs(f.z - Z) < Z_EPS).map((f) => f.poly));
    emitFace(b, tops.length && bots.length ? difference(tops, bots) : tops, (x, y) => [x, y, Z], [0, 0, 1]);
    emitFace(b, bots.length && tops.length ? difference(bots, tops) : bots, (x, y) => [x, y, Z], [0, 0, -1]);
  }
  splitTJunctions(b, firstTri, firstVert);
}

export interface LevelSolids {
  batches: SolidBatch[];
}

/** Lote do material `m` (e da categoria `cat`) dentro do mapa, criado na primeira vez. */
export function batchOf(byMat: Map<Id, SolidBatch>, m: Id, cat: GraphicsCategory): SolidBatch {
  let b = byMat.get(m);
  if (!b) {
    b = { materialId: m, category: cat, positions: [], normals: [], indices: [], ids: [] };
    byMat.set(m, b);
  }
  return b;
}

/** Teto de memória estimada para os sólidos reaproveitáveis de paredes. */
const WALL_CACHE_BYTES_MAX = 64 * 1024 * 1024;

/** Sólido de uma camada de parede, com índices locais (começam em 0), por chave de conteúdo (`wallLayerKey`). */
const wallLayerCache = new Map<string, SolidBatch>();
let wallLayerStats = { hits: 0, misses: 0 };
let wallLayerCacheBytes = 0;

/** Arrays numéricos do cache são arrays JS (8 bytes por número); ids e objetos recebem margem conservadora. */
function estimatedBatchBytes(batch: SolidBatch): number {
  return 256 + 8 * (batch.positions.length + batch.normals.length + batch.indices.length) + 48 * batch.ids.length;
}

function estimatedCacheEntryBytes(key: string, batch: SolidBatch): number {
  // Chaves contêm o JSON das faixas e ficam retidas pelo Map junto com a malha.
  return estimatedBatchBytes(batch) + 128 + key.length * 2;
}

/**
 * Chave de conteúdo de uma camada: o que a extrusão lê (id da parede, material, cota da base e faixas). Parede que não
 * mudou (sem anexo de telhado, sem edição) dá a mesma chave e reaproveita o sólido, em vez de refazer as uniões.
 */
function wallLayerKey(rw: ResolvedWall, l: ResolvedWall['layers'][number], jl?: JunctionLevel): string {
  return `${rw.wallId}|${l.materialId}|${rw.baseZ}|${JSON.stringify(wallLayerBandsAfterJunction(jl, rw, l))}`;
}

/** Sólido da camada (do cache, ou extrudado agora e guardado). Quem chama copia os dados; o cache não é alterado. */
export function wallLayerSolid(rw: ResolvedWall, l: ResolvedWall['layers'][number], jl?: JunctionLevel): SolidBatch {
  const key = wallLayerKey(rw, l, jl);
  const hit = wallLayerCache.get(key);
  if (hit) {
    wallLayerStats.hits++;
    wallLayerCache.delete(key);
    wallLayerCache.set(key, hit);
    return hit;
  }
  wallLayerStats.misses++;
  const local: SolidBatch = { materialId: l.materialId, category: 'wall', positions: [], normals: [], indices: [], ids: [] };
  ofElement(local, rw.wallId, () => extrudeLayer(local, fuseBands(wallLayerBandsAfterJunction(jl, rw, l)), rw.baseZ));
  const bytes = estimatedCacheEntryBytes(key, local);
  if (bytes > WALL_CACHE_BYTES_MAX) return local;
  while (wallLayerCache.size && wallLayerCacheBytes + bytes > WALL_CACHE_BYTES_MAX) {
    const oldest = wallLayerCache.entries().next().value;
    if (!oldest) break;
    wallLayerCacheBytes -= estimatedCacheEntryBytes(oldest[0], oldest[1]);
    wallLayerCache.delete(oldest[0]);
  }
  wallLayerCache.set(key, local);
  wallLayerCacheBytes += bytes;
  return local;
}

/** Acrescenta o sólido local `f` ao lote `b`, deslocando vértices, índices e faixas (cópia: `f` fica intacto). */
export function appendSolid(b: SolidBatch, f: SolidBatch): void {
  const v0 = b.positions.length / 3;
  const i0 = b.indices.length;
  for (const x of f.positions) b.positions.push(x);
  for (const n of f.normals) b.normals.push(n);
  for (const i of f.indices) b.indices.push(i + v0);
  for (const r of f.ids) b.ids.push({ id: r.id, start: r.start + i0, count: r.count });
}

/**
 * Nível só com as paredes aceitas pelo predicado. É o filtro de visibilidade (Hide in View) antes dos sólidos e das
 * aberturas: a parede oculta não gera malha, caixa, aresta nem picking. Sem nada removido, devolve o mesmo nível.
 */
export function filtrarParedesDoNivel(lv: ResolvedLevel, manter: (id: Id) => boolean): ResolvedLevel {
  const walls: ResolvedLevel['walls'] = {};
  let removeu = false;
  for (const [id, w] of Object.entries(lv.walls)) {
    if (manter(id)) walls[id] = w;
    else removeu = true;
  }
  return removeu ? { ...lv, walls } : lv;
}

/**
 * Sólidos de todas as camadas das paredes do nível, por material. Cada camada sai de `wallLayerSolid` (cache por
 * conteúdo): ao anexar uma parede ao telhado, só as camadas dela são extrudadas de novo (decisão 0016, desempenho).
 */
export function buildLevelSolids(r: ResolvedLevel, jl?: JunctionLevel): LevelSolids {
  const byMat = new Map<Id, SolidBatch>();
  for (const rw of Object.values(r.walls)) {
    for (const l of rw.layers) appendSolid(batchOf(byMat, l.materialId, 'wall'), wallLayerSolid(rw, l, jl));
  }
  return { batches: [...byMat.values()] };
}

/** Contadores do cache de camadas de parede (acertos e erros desde o início ou o último `clearWallLayerCache`). */
export function wallLayerCacheStats(): { hits: number; misses: number; size: number; estimatedBytes: number; maxBytes: number } {
  return { ...wallLayerStats, size: wallLayerCache.size, estimatedBytes: wallLayerCacheBytes, maxBytes: WALL_CACHE_BYTES_MAX };
}

/** Esvazia o cache de camadas de parede e zera os contadores (testes e troca de projeto). */
export function clearWallLayerCache(): void {
  wallLayerCache.clear();
  wallLayerCacheBytes = 0;
  wallLayerStats = { hits: 0, misses: 0 };
}

/**
 * Sólidos dos pisos: uma extrusão por camada entre as cotas absolutas (furos incluídos), agrupada por material. Com a
 * junção resolvida (`jl`, decisão 0023 §3, P7b), cada camada é extrudada só nas partes em que ela existe: sem faces
 * coincidentes sobrepostas (z-fighting) e com o volume que os quantitativos líquidos reportam.
 */
export function buildFloorSolids(floors: ResolvedFloor[], jl?: JunctionLevel): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  for (const f of floors) {
    // Membrana não tem volume nem sólido (decisão 0023 §5): fica só na planta e no corte.
    for (const l of f.layers) {
      if (l.membrane) continue;
      const b = batchOf(byMat, l.materialId, 'floor');
      const parts = layerPartsOf(jl?.elements.get(f.floorId), l.layerIndex, [{ poly: l.polygon, z0: l.z0, z1: l.z1 }]);
      ofElement(b, f.floorId, () => {
        for (const part of parts) for (const poly of part.poly) extrudePolygon(b, poly, part.z0, part.z1);
      });
    }
  }
  return [...byMat.values()];
}

/**
 * Sólidos dos forros (decisão 0021): uma extrusão por camada entre as cotas absolutas, com a mesma categoria dos pisos
 * (visibilidade e transparência da vista 3D). Forro é elemento de `elements`, então a seleção no 3D o encontra pelo id.
 */
export function buildCeilingSolids(ceilings: ResolvedCeiling[]): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  for (const c of ceilings) {
    for (const l of c.layers) {
      const b = batchOf(byMat, l.materialId, 'floor');
      ofElement(b, c.ceilingId, () => {
        for (const poly of c.polygon) extrudePolygon(b, poly, l.z0, l.z1);
      });
    }
  }
  return [...byMat.values()];
}

/**
 * Sólidos das lajes (D2): uma extrusão por camada, por material, com furos. Com inclinação, topo e base da camada
 * seguem o mesmo plano (a subida de `slabRiseAt`), então a espessura vertical fica constante.
 */
export function buildSlabSolids(slabs: ResolvedSlab[], jl?: JunctionLevel): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  for (const s of slabs) {
    const sl = s.slope;
    for (const l of s.layers) {
      if (l.membrane) continue;
      const b = batchOf(byMat, l.materialId, 'slab');
      // Laje com caimento não entra na junção: a parte é a camada inteira, como antes.
      const parts = layerPartsOf(jl?.elements.get(s.slabId), l.layerIndex, [{ poly: l.polygon, z0: l.z0, z1: l.z1 }]);
      ofElement(b, s.slabId, () => {
        for (const part of parts) {
          const topAt = sl ? (x: number, y: number): number => part.z1 + slabRiseAt(sl, { x, y }) : undefined;
          const bottomAt = sl ? (x: number, y: number): number => part.z0 + slabRiseAt(sl, { x, y }) : undefined;
          for (const poly of part.poly) extrudePolygon(b, poly, part.z0, part.z1, topAt, bottomAt);
        }
      });
    }
  }
  return [...byMat.values()];
}

/**
 * Sólidos dos telhados (D2): por água e por camada, uma extrusão cujo topo segue o plano da água menos `below` e cuja
 * base está `thickness` abaixo, na vertical. Empenas não entram aqui: a parede ajusta o topo no motor.
 */
export function buildRoofSolids(roofs: ResolvedRoof[]): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  for (const r of roofs) {
    r.planes.forEach((pl, k) => {
      // As emendas entre águas de mesma cota (facetas de um arco) não levam parede: sem elas, a vista de arestas não
      // desenha um raio em cada lado amostrado.
      const emenda = emendaDaAgua(r, k);
      for (const l of r.layers) {
        if (l.thickness < 1e-6) continue;
        const b = batchOf(byMat, l.materialId, 'roof');
        const topAt = (x: number, y: number): number => planeZ(pl, { x, y }) - l.below;
        const bottomAt = (x: number, y: number): number => topAt(x, y) - l.thickness;
        ofElement(b, r.roofId, () => {
          for (const poly of pl.polygon) extrudeRoofPolygon(b, poly, l.thickness, topAt, bottomAt, emenda);
        });
      }
    });
  }
  return [...byMat.values()];
}

/** Extrusão de uma água por camada (como `extrudePolygon`), sem a parede das emendas com outra água (`emenda`). */
function extrudeRoofPolygon(b: SolidBatch, poly: Polygon, espessura: number, topAt: (x: number, y: number) => number, bottomAt: (x: number, y: number) => number, emenda: (p: Vec2, q: Vec2) => boolean): void {
  if (espessura < 1e-6 || !poly[0]) return;
  extrudeCaps(b, poly, 0, espessura, topAt, bottomAt);
  for (const ring of poly.map((r, i) => oriented(r, i === 0))) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      if (emenda(p, q)) continue;
      pushWall(b, p, q, bottomAt(p.x, p.y), bottomAt(q.x, q.y), topAt(p.x, p.y), topAt(q.x, q.y));
    }
  }
}
