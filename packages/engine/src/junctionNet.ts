import { boxOf, boxesOverlap, intersection, multiArea, multiPoints, triangulate, union, type MultiPolygon, type Vec2 } from '@hestia/geom';
import { levelAbove, type Id, type Project } from '@hestia/model';
import { bandTopAt } from './profile.ts';
import { fontesDoCortador } from './junctionIndex.ts';
import { cacheDeCortadores, type EntradaCortadores } from './cutterCache.ts';
import { resolveFloors, type ResolvedFloor, type ResolvedFloorLayer } from './floors.ts';
import { resolveSlabs, slabRiseAt, type ResolvedSlab } from './slabs.ts';
import { winsOver, type JunctionKind, type JunctionMeta } from './junctionPlanar.ts';
import { resolveLevel } from './resolve.ts';
import type { LayerBand, ResolvedWall } from './types.ts';

export type { JunctionKind } from './junctionPlanar.ts';

/**
 * Quantitativos líquidos (decisão 0023 §4, P5). Um elemento cortado perde o volume que está dentro do elemento que o
 * corta, nas faixas de cota que se cruzam. O padrão por tipo vale para todo o projeto (P-4 adiada: sem inversão por par):
 * laje corta piso e parede; piso corta parede; parede não corta ninguém; laje não é cortada por nenhum elemento.
 */

/** Quem corta um elemento deste tipo sem atributo de camada (padrão por tipo, §1.3). Só para peças sem `meta`. */
const CUTTERS: Record<JunctionKind, readonly JunctionKind[]> = {
  wall: ['floor', 'slab'],
  floor: ['slab'],
  slab: [],
};

/** Atributos de junção da camada e o elemento dono (a camada não corta as outras do próprio elemento). */
export interface PieceMeta extends JunctionMeta {
  owner: string;
  /** Camada do elemento (piso, laje e parede) e faixa de altura (só parede): chaves para devolver a parte resolvida (F1b). */
  layerIndex?: number;
  bandIndex?: number;
}

/**
 * Pedaço sólido: a forma em planta e a faixa de cota (base e topo absolutos, em m) em cada ponto. `flat` indica cota
 * constante (sem inclinação nem perfil de topo); então a conta é exata por área.
 */
export interface SolidPiece {
  poly: MultiPolygon;
  span: (p: Vec2) => readonly [number, number];
  flat: boolean;
  /** Prioridade, núcleo e dono da camada (P7). Sem ele, vale o padrão por tipo (`CUTTERS`). */
  meta?: PieceMeta;
  /**
   * Peça de outro nível (0023 §10, P7c): só corta, nunca é cortada, e a junção entre níveis vale só entre parede e
   * piso/laje — piso × piso e laje × laje entre níveis não se cortam.
   */
  external?: boolean;
}

/** Elemento que corta outros, como os pedaços de cada camada dele. */
export interface CutterSolid {
  kind: JunctionKind;
  pieces: SolidPiece[];
}

/** Tolerância (m) para a face de espessura zero (membrana) estar dentro da faixa de um cortador. */
const Z_EPS = 1e-6;
/** Tolerância (m²) para considerar que um cortador cobre a forma inteira em planta. */
const AREA_EPS = 1e-6;

/**
 * `c` (com a peça `cp`) corta a peça `piece`? Com atributos de camada, vale a prioridade (0023 §1, P7) e o outro elemento
 * do próprio dono não corta. Sem atributos, vale o padrão por tipo.
 */
function cuts(c: CutterSolid, cp: SolidPiece, piece: SolidPiece, kind: JunctionKind): boolean {
  // Junção entre níveis (0023 §10, P7c): a peça do nível vizinho só corta, e só contra a outra natureza (parede ×
  // piso/laje). Piso × piso e laje × laje entre níveis não se cortam.
  if (piece.external) return false;
  if (cp.external && (cp.meta?.kind === 'wall') === (piece.meta?.kind === 'wall')) return false;
  if (cp.meta && piece.meta) {
    if (cp.meta.owner === piece.meta.owner) return false;
    return winsOver(cp.meta, piece.meta) === true;
  }
  return CUTTERS[kind].includes(c.kind);
}

const ORIGIN: Vec2 = { x: 0, y: 0 };

/** Pedaço de faixa constante `z0..z1` sobre a forma `poly`. */
export const flatPiece = (poly: MultiPolygon, z0: number, z1: number): SolidPiece => ({ poly, span: () => [z0, z1], flat: true });

/**
 * Integral de `f` sobre a forma: triangula cada polígono e usa a média de `f` nos três vértices de cada triângulo,
 * ponderada pela área. É exata quando `f` é afim dentro do triângulo (inclinação sem quebra de faixa).
 */
function integrate(m: MultiPolygon, f: (p: Vec2) => number): number {
  let total = 0;
  for (const poly of m) {
    const mesh = triangulate(poly);
    const v = mesh.positions;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const pts = [0, 1, 2].map((k) => {
        const j = mesh.indices[i + k]! * 2;
        return { x: v[j]!, y: v[j + 1]! };
      });
      const [a, b, c] = pts as [Vec2, Vec2, Vec2];
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      total += (area * (f(a) + f(b) + f(c))) / 3;
    }
  }
  return total;
}

/** Faixa de cota (menor base e maior topo) de um pedaço, pelos vértices. Cacheada: o pedaço não muda depois de montado. */
const envelopes = new WeakMap<SolidPiece, readonly [number, number]>();
function zEnvelope(sp: SolidPiece): readonly [number, number] {
  const hit = envelopes.get(sp);
  if (hit) return hit;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const poly of sp.poly) for (const ring of poly) for (const v of ring) {
    const [a, b] = sp.span(v);
    z0 = Math.min(z0, a);
    z1 = Math.max(z1, b);
  }
  const env = [z0, z1] as const;
  envelopes.set(sp, env);
  return env;
}

/** Função afim sobre a planta: gx·x + gy·y + gc. */
interface Afim {
  gx: number;
  gy: number;
  gc: number;
}

/**
 * Ajusta `f` como função afim sobre a região `m`. Testa a afinidade em cinco pontos (cantos do retângulo envolvente e
 * o centro). Devolve `null` se não for afim (ex.: topo de perfil com quebra): aí quem chama mantém o cálculo antigo.
 */
function ajustarAfim(f: (p: Vec2) => number, m: MultiPolygon): Afim | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of multiPoints(m)) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  const s = Math.max(x1 - x0, y1 - y0, 1);
  const f00 = f({ x: x0, y: y0 });
  const f10 = f({ x: x0 + s, y: y0 });
  const f01 = f({ x: x0, y: y0 + s });
  const f11 = f({ x: x0 + s, y: y0 + s });
  const gx = (f10 - f00) / s;
  const gy = (f01 - f00) / s;
  const gc = f00 - gx * x0 - gy * y0;
  const cx = x0 + s / 2;
  const cy = y0 + s / 2;
  const fc = f({ x: cx, y: cy });
  const esc = Math.max(1, Math.abs(f00), Math.abs(f11), Math.abs(fc));
  if (Math.abs(f11 - (gx * (x0 + s) + gy * (y0 + s) + gc)) > 1e-9 * esc) return null;
  if (Math.abs(fc - (gx * cx + gy * cy + gc)) > 1e-9 * esc) return null;
  return { gx, gy, gc };
}

/** Recorte de um anel pelo semiplano s·(gx·x + gy·y + gc) >= 0 (Sutherland–Hodgman). Preserva a área orientada. */
function recortarAnel(anel: readonly Vec2[], d: Afim, s: 1 | -1): Vec2[] {
  const out: Vec2[] = [];
  const f = (p: Vec2): number => s * (d.gx * p.x + d.gy * p.y + d.gc);
  for (let k = 0; k < anel.length; k++) {
    const p = anel[k]!;
    const q = anel[(k + 1) % anel.length]!;
    const fp = f(p);
    const fq = f(q);
    if (fp >= 0) out.push(p);
    if (fp >= 0 !== fq >= 0) {
      const t = fp / (fp - fq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

/**
 * Volume de sobreposição exato quando as alturas são afins. As retas onde duas alturas se igualam (topo com topo, base
 * com base, topo com base) dividem a planta em células convexas. Dentro de cada célula a altura é afim, então a integral
 * é a área da célula vezes a altura no centróide dela (fórmula do polígono, com furos). Devolve `null` se alguma altura
 * não for afim (aí quem chama mantém o cálculo antigo).
 */
function volumeExatoAfim(common: MultiPolygon, a: SolidPiece, b: SolidPiece, altura: (p: Vec2) => number): number | null {
  const ajustes = [
    ajustarAfim((p) => a.span(p)[0], common),
    ajustarAfim((p) => a.span(p)[1], common),
    ajustarAfim((p) => b.span(p)[0], common),
    ajustarAfim((p) => b.span(p)[1], common),
  ];
  if (ajustes.some((x) => x === null)) return null;
  const [a0, a1, b0, b1] = ajustes as [Afim, Afim, Afim, Afim];
  const diferenca = (f: Afim, g: Afim): Afim | null => {
    const d = { gx: f.gx - g.gx, gy: f.gy - g.gy, gc: f.gc - g.gc };
    return Math.hypot(d.gx, d.gy) < 1e-12 ? null : d;
  };
  const retas = [diferenca(a1, b0), diferenca(a1, a0), diferenca(b1, a0), diferenca(b1, b0), diferenca(a1, b1), diferenca(a0, b0)].filter(
    (d): d is Afim => d !== null,
  );
  let total = 0;
  for (let mascara = 0; mascara < 1 << retas.length; mascara++) {
    let area = 0;
    let mx = 0;
    let my = 0;
    for (const poly of common) {
      for (const anelOriginal of poly) {
        let anel: Vec2[] = anelOriginal.slice();
        retas.forEach((d, k) => {
          if (anel.length >= 3) anel = recortarAnel(anel, d, (mascara >> k) & 1 ? 1 : -1);
        });
        if (anel.length < 3) continue;
        let a2 = 0;
        let sx = 0;
        let sy = 0;
        for (let k = 0; k < anel.length; k++) {
          const p = anel[k]!;
          const q = anel[(k + 1) % anel.length]!;
          const cr = p.x * q.y - q.x * p.y;
          a2 += cr;
          sx += (p.x + q.x) * cr;
          sy += (p.y + q.y) * cr;
        }
        area += a2 / 2;
        mx += sx / 6;
        my += sy / 6;
      }
    }
    if (Math.abs(area) < 1e-18) continue;
    total += area * altura({ x: mx / area, y: my / area });
  }
  return total;
}

/** Volume (metros cúbicos) de `a` que está dentro de `b`: área da interseção em planta vezes a sobreposição de cota. */
export function overlapVolume(a: SolidPiece, b: SolidPiece): number {
  const [a0, a1] = zEnvelope(a);
  const [b0, b1] = zEnvelope(b);
  if (Math.min(a1, b1) - Math.max(a0, b0) <= 0) return 0;
  if (!boxesOverlap(boxOf(multiPoints(a.poly)), boxOf(multiPoints(b.poly)))) return 0;
  const common = intersection(a.poly, b.poly);
  if (common.length === 0) return 0;
  const height = (p: Vec2): number => {
    const [a0, a1] = a.span(p);
    const [b0, b1] = b.span(p);
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  };
  if (a.flat && b.flat) return multiArea(common) * height(ORIGIN);
  const exato = volumeExatoAfim(common, a, b, height);
  return exato ?? integrate(common, height);
}

/**
 * Volume (m³) de um pedaço de tipo `kind` que cai dentro dos elementos que o cortam (padrão por tipo). `skip` são
 * cortadores que não entram na conta (piso embutido na laje, ver `slabCoversFloor`).
 */
export function cutVolume(piece: SolidPiece, kind: JunctionKind, cutters: readonly CutterSolid[], skip?: ReadonlySet<CutterSolid>): number {
  let cut = 0;
  for (const c of cutters) {
    if (skip?.has(c)) continue;
    for (const cp of c.pieces) if (cuts(c, cp, piece, kind)) cut += overlapVolume(piece, cp);
  }
  return cut;
}

/**
 * Área (m²) de uma face de espessura zero (membrana) em `piece` que está numa faixa de cortador na cota `z`: a face
 * some onde o cortador a engloba. Sem sobreposição de cota vale zero. `skip`: idem `cutVolume`.
 */
export function coveredFaceArea(piece: SolidPiece, kind: JunctionKind, cutters: readonly CutterSolid[], skip?: ReadonlySet<CutterSolid>): number {
  let area = 0;
  for (const c of cutters) {
    if (skip?.has(c)) continue;
    for (const cp of c.pieces) {
      if (!cuts(c, cp, piece, kind)) continue;
      const common = intersection(piece.poly, cp.poly);
      const first = common[0]?.[0]?.[0];
      if (!first) continue;
      const [z, zTop] = piece.span(first);
      const [c0, c1] = cp.span(first);
      if (z >= c0 - Z_EPS && zTop <= c1 + Z_EPS) area += multiArea(common);
    }
  }
  return area;
}

/** Pedaço de uma camada de laje: a forma em planta da camada (P8) e a faixa de cota dela (inclinação incluída). */
export function slabLayerPiece(rs: ResolvedSlab, l: ResolvedSlab['layers'][number]): SolidPiece {
  return {
    poly: l.polygon,
    span: (q: Vec2) => [l.z0 + slabRiseAt(rs.slope, q), l.z1 + slabRiseAt(rs.slope, q)] as const,
    flat: rs.slope === null,
    meta: { kind: 'slab', priority: l.priority, core: l.core, owner: rs.slabId, layerIndex: l.layerIndex, explicit: l.explicit, venceParede: l.venceParede },
  };
}

/** Pedaço de uma camada de piso: a forma em planta da camada (P8, pode ir ao núcleo da parede) e a faixa de cota dela. */
export function floorLayerPiece(rf: ResolvedFloor, l: ResolvedFloorLayer): SolidPiece {
  return {
    ...flatPiece(l.polygon, l.z0, l.z1),
    meta: { kind: 'floor', priority: l.priority, core: l.core, owner: rf.floorId, layerIndex: l.layerIndex, explicit: l.explicit, venceParede: l.venceParede },
  };
}

/** União em planta das camadas de um cortador (cacheada: o cortador não muda depois de montado). */
const cutterPlanCache = new WeakMap<CutterSolid, MultiPolygon>();
function cutterPlan(c: CutterSolid): MultiPolygon {
  const hit = cutterPlanCache.get(c);
  if (hit !== undefined) return hit;
  const plan = union(...c.pieces.map((p) => p.poly));
  cutterPlanCache.set(c, plan);
  return plan;
}

/**
 * A laje cobre o piso inteiro e tem a mesma face superior (piso embutido na laje).
 *
 * É o piso de acabamento modelado no mesmo nível da laje: as duas faces superiores coincidem e todas as camadas do piso
 * ficam dentro do volume da laje. Não é uma junta entre construções diferentes — o piso é a mesma construção da laje,
 * só que repetida no modelo. Descontar a laje apagaria o piso do quantitativo; a duplicidade é apontada pelos avisos
 * `slab-floor-overlap` e `piso-estrutura-sobre-laje` (`validateSlabs.ts`). A decisão 0023 §4 continua valendo para
 * volumes que se cruzam de fato (laje mais fina que o piso, laje que só cobre parte do piso, ou piso abaixo do topo da
 * laje). Só vale para laje plana, do próprio nível e que cobre todas as camadas do piso em planta.
 */
export function slabCoversFloor(c: CutterSolid, rf: ResolvedFloor): boolean {
  if (c.kind !== 'slab' || c.pieces.length === 0) return false;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of c.pieces) {
    // Laje inclinada, ou de outro nível, não é a mesma construção: o corte por faixa continua.
    if (!p.flat || p.external) return false;
    const r = spanRange(p);
    if (!r) return false;
    z0 = Math.min(z0, r[0]);
    z1 = Math.max(z1, r[1]);
  }
  // Mesma face superior e a laje contém toda a faixa de cota do piso.
  if (Math.abs(z1 - rf.topZ) > Z_EPS || z0 > rf.bottomZ + Z_EPS) return false;
  const plan = cutterPlan(c);
  return rf.layers.every((l) => Math.abs(multiArea(intersection(plan, l.polygon)) - multiArea(l.polygon)) <= AREA_EPS);
}

/**
 * Níveis adjacentes (0023 §10, P7c): o de elevação imediatamente acima e o imediatamente abaixo. Sem nível vizinho,
 * a lista sai menor. Nível inexistente sai vazio.
 */
export function adjacentLevelIds(p: Project, levelId: Id): Id[] {
  const base = p.levels.find((l) => l.id === levelId);
  if (!base) return [];
  let below: { id: Id; elevation: number } | null = null;
  for (const l of p.levels) if (l.elevation < base.elevation && (!below || l.elevation > below.elevation)) below = l;
  const above = levelAbove(p, levelId);
  return [above?.id, below?.id].filter((id): id is Id => id !== undefined);
}

/** Pedaço de uma faixa de altura de parede: a base absoluta da parede mais a faixa (o topo pode ser inclinado). */
export function bandPiece(rw: ResolvedWall, b: LayerBand, meta?: Pick<PieceMeta, 'priority' | 'core' | 'layerIndex' | 'bandIndex'>): SolidPiece {
  return {
    poly: b.poly,
    span: (q: Vec2) => [rw.baseZ + b.z0, rw.baseZ + bandTopAt(b, q)] as const,
    flat: !b.slope,
    ...(meta ? { meta: { kind: 'wall' as const, owner: rw.wallId, ...meta } } : {}),
  };
}

/** Cota absoluta em que um pedaço existe: envolvente dos vértices (topo inclinado incluído). Sem vértices: null. */
const spanRangeCache = new WeakMap<SolidPiece, readonly [number, number] | null>();

export function spanRange(sp: SolidPiece): readonly [number, number] | null {
  const cached = spanRangeCache.get(sp);
  if (cached !== undefined) return cached;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const poly of sp.poly) {
    for (const ring of poly) {
      for (const v of ring) {
        const [a, b] = sp.span(v);
        z0 = Math.min(z0, a);
        z1 = Math.max(z1, b);
      }
    }
  }
  const result = z0 <= z1 ? [z0, z1] as const : null;
  spanRangeCache.set(sp, result);
  return result;
}

/**
 * Pedaços de cada categoria de um nível, sem filtro: pisos e lajes por camada; paredes por faixa (`wallBandPieces`).
 */
const levelCuttersCache = new WeakMap<Project, Map<Id, LevelCutters>>();

/**
 * Chave do cache de cortadores: o nível E o conjunto de níveis do projeto consultado. A junção pede os mesmos cortadores
 * ao projeto inteiro e a um projeto reduzido (`projetoDaJuncao`), cujas fontes diferem (nível ausente entra pelo id). Com uma
 * única entrada por nível, as duas versões se sobrescreviam: numa edição, `piso3` e `piso4` eram recalculados duas vezes e
 * níveis que não mudaram voltavam a ser calculados. Uma entrada por variante evita o vaivém.
 */
function chaveDeCortadores(tipo: 'conteudo' | 'conjunto', p: Project, levelId: Id): string {
  return `${tipo}:${levelId}:${p.levels.map((l) => l.id).join(',')}`;
}

type TipoCortadores = 'conteudo' | 'conjunto';

/** Procura primeiro a entrada da variante (conjunto de níveis) e depois a genérica do nível; vale a que tem as mesmas fontes. */
function buscarCortadores(tipo: TipoCortadores, p: Project, levelId: Id, sources: readonly unknown[]): EntradaCortadores | undefined {
  for (const chave of [chaveDeCortadores(tipo, p, levelId), `${tipo}:${levelId}`]) {
    const e = cacheDeCortadores.get(chave);
    if (e && sameSources(e.sources, sources)) return e;
  }
  return undefined;
}

/** Guarda na entrada da variante e na genérica do nível (a variante evita o vaivém; a genérica é compartilhada entre variantes iguais). */
function guardarCortadores(tipo: TipoCortadores, p: Project, levelId: Id, entrada: EntradaCortadores): void {
  cacheDeCortadores.set(chaveDeCortadores(tipo, p, levelId), entrada);
  cacheDeCortadores.set(`${tipo}:${levelId}`, entrada);
}
const sameSources = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Cortadores de um nível são puros para um snapshot imutável do projeto. `levelCutterSet` consulta todos os níveis
 * para cada nível pedido; guardar a resolução local evita refazer pisos, lajes e `resolveLevel` em padrão N².
 */
function levelCutters(p: Project, levelId: Id): LevelCutters {
  let byLevel = levelCuttersCache.get(p);
  if (!byLevel) {
    byLevel = new Map();
    levelCuttersCache.set(p, byLevel);
  }
  const cached = byLevel.get(levelId);
  if (cached) return cached;
  const sources = fontesDoCortador(p, levelId);
  const content = buscarCortadores('conteudo', p, levelId, sources);
  if (content) {
    byLevel.set(levelId, content.value);
    return content.value;
  }
  const result: LevelCutters = {
    floors: resolveFloors(p, levelId).map((rf) => ({ kind: 'floor', pieces: rf.layers.map((l) => floorLayerPiece(rf, l)) })),
    slabs: resolveSlabs(p, levelId).map((rs) => ({ kind: 'slab', pieces: rs.layers.map((l) => slabLayerPiece(rs, l)) })),
    walls: [{ kind: 'wall', pieces: wallBandPieces(p, levelId).map((w) => w.piece) }],
  };
  byLevel.set(levelId, result);
  guardarCortadores('conteudo', p, levelId, { sources, value: result });
  return result;
}

/** Cortadores separados por categoria, como os usam quantitativos e junção. */
export interface LevelCutters {
  floors: CutterSolid[];
  slabs: CutterSolid[];
  walls: CutterSolid[];
}

const levelCutterSetByProject = new WeakMap<Project, Map<Id, LevelCutters>>();

/**
 * Cortadores de um nível (0023 §1, F1b): pisos, lajes e paredes do próprio nível, mais os de OUTROS níveis que tocam a
 * faixa de cota do nível. Assim a laje do pavimento de cima corta a parede do térreo que a atravessa, e a parede que sobe
 * corta a laje de cima. Peças de outro nível sem cota comum com o nível não entram. Peças próprias entram sempre.
 */
export function levelCutterSet(p: Project, levelId: Id): LevelCutters {
  const exact = levelCutterSetByProject.get(p)?.get(levelId);
  if (exact) return exact;
  const remember = (value: LevelCutters): LevelCutters => {
    let byLevel = levelCutterSetByProject.get(p);
    if (!byLevel) {
      byLevel = new Map();
      levelCutterSetByProject.set(p, byLevel);
    }
    byLevel.set(levelId, value);
    return value;
  };
  const own = levelCutters(p, levelId);
  const ownRanges = [...own.floors, ...own.slabs, ...own.walls]
    .flatMap((c) => c.pieces.map(spanRange))
    .filter((r): r is readonly [number, number] => r !== null);
  if (ownRanges.length === 0) return remember(own);
  const lo = Math.min(...ownRanges.map((r) => r[0]));
  const hi = Math.max(...ownRanges.map((r) => r[1]));
  const reaches = (sp: SolidPiece): boolean => {
    const r = spanRange(sp);
    return r !== null && r[1] > lo + Z_EPS && r[0] < hi - Z_EPS;
  };
  const out: LevelCutters = { floors: [...own.floors], slabs: [...own.slabs], walls: [...own.walls] };
  // Fontes do conjunto: o próprio cortador e o de cada outro nível que contribui (o resultado é função só deles, então o
  // array de níveis do projeto, que muda na redução, não entra).
  const sources: unknown[] = [own];
  for (const other of p.levels) {
    if (other.id === levelId) continue;
    const c = levelCutters(p, other.id);
    const keep = (solids: CutterSolid[]): CutterSolid[] =>
      solids
        .map((s) => ({ kind: s.kind, pieces: s.pieces.filter(reaches).map((sp) => ({ ...sp, external: true })) }))
        .filter((s) => s.pieces.length > 0);
    const floors = keep(c.floors);
    const slabs = keep(c.slabs);
    const walls = keep(c.walls);
    if (floors.length || slabs.length || walls.length) sources.push(c);
    out.floors.push(...floors);
    out.slabs.push(...slabs);
    out.walls.push(...walls);
  }
  const cached = buscarCortadores('conjunto', p, levelId, sources);
  if (cached) return remember(cached.value);
  guardarCortadores('conjunto', p, levelId, { sources, value: out });
  return remember(out);
}

/** Pedaços dos pisos do nível e dos níveis que o alcançam (F1b), camada a camada. */
export function floorCutters(p: Project, levelId: Id): CutterSolid[] {
  return levelCutterSet(p, levelId).floors;
}

/** Pedaços das lajes do nível e dos níveis que o alcançam (F1b), camada a camada (a inclinação entra na faixa). */
export function slabCutters(p: Project, levelId: Id): CutterSolid[] {
  return levelCutterSet(p, levelId).slabs;
}

/** Pedaços das faixas de parede do nível e dos níveis que o alcançam (F1b): piso e laje também cortam parede (0023 §1). */
export function wallCutters(p: Project, levelId: Id): CutterSolid[] {
  return levelCutterSet(p, levelId).walls;
}

/**
 * Pedaço de uma faixa de parede com a origem dela (parede, camada e faixa), para devolver a parte resolvida à faixa certa
 * (decisão 0023 §3, F1). Faixa com topo inclinado vem com `slope` e não entra na junção.
 */
export interface WallBandPiece {
  wallId: Id;
  layerIndex: number;
  bandIndex: number;
  piece: SolidPiece;
}

/** Pedaços de todas as faixas de parede do próprio nível, com a origem de cada um. */
export function wallBandPieces(p: Project, levelId: Id): WallBandPiece[] {
  const r = resolveLevel(p, levelId);
  return Object.values(r.walls).flatMap((rw) =>
    rw.layers.flatMap((l) =>
      l.bands.map((b, bandIndex) => ({
        wallId: rw.wallId,
        layerIndex: l.layerIndex,
        bandIndex,
        piece: bandPiece(rw, b, { priority: l.priority, core: l.core, layerIndex: l.layerIndex, bandIndex }),
      })),
    ),
  );
}
