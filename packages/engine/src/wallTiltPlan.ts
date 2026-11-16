import { arcFromSagitta, closeGapsSafe, unionClipper, type MultiPolygon, type Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import type { Region, ResolvedLevel, ResolvedWall } from './types.ts';
import { analyzeLevelTilt, type WallTiltJoin, type WallTiltJoinLayer } from './wallTiltJoinLevel.ts';
import type { WallFrame } from './frame.ts';

/**
 * Planta e seção da parede inclinada (F2.5/F2.6). Mapa de planta (x, y) da cota z, relativa à base: o mesmo da F2.3 (sólido
 * 3D), mantido aqui porque o engine não importa o render. A base fica onde está; o plano médio desloca d(z) = z·tanθ para
 * a esquerda de a→b e a distância à linha de localização cresce 1/cosθ (espessura horizontal t/cosθ). Arco: raio
 * R + k·d + (ρ − R)/cosθ, mesmo centro (k = +1 com o centro à direita de a→b, convenção de `arcFromSagitta`).
 */
export type PlanMap = (x: number, y: number, z: number) => [number, number];
export interface TiltAxis { a: Vec2; b: Vec2; n: Vec2; sag?: number }

export function tiltPlanMap(w: TiltAxis, tiltDeg: number): PlanMap {
  if (!tiltDeg) return (x, y) => [x, y];
  const th = (tiltDeg * Math.PI) / 180;
  const tan = Math.tan(th);
  const inv = 1 / Math.cos(th);
  const arc = arcFromSagitta(w.a, w.b, w.sag ?? 0);
  if (arc) {
    const { center, radius: R, k } = arc;
    return (x, y, z) => {
      const dx = x - center.x;
      const dy = y - center.y;
      const rho = Math.hypot(dx, dy);
      if (rho < 1e-12) return [x, y];
      const f = (R + k * z * tan + (rho - R) * inv) / rho;
      return [center.x + dx * f, center.y + dy * f];
    };
  }
  return (x, y, z) => {
    const e = (x - w.a.x) * w.n.x + (y - w.a.y) * w.n.y;
    const m = e * (inv - 1) + z * tan;
    return [x + w.n.x * m, y + w.n.y * m];
  };
}

/** Casamento de vértice com o anel `raw` da junção (m), igual ao do sólido. */
const MATCH = 5e-4;

/**
 * Índice do primeiro vértice de `raw` a menos de `MATCH` (em x e em y) de (x, y), ou -1: o mesmo que varrer `raw` em ordem,
 * mas por grade de células de lado `MATCH` (cada consulta olha 3×3 células). O sólido, a planta e o IFC chamam o casamento
 * por vértice mapeado (centenas de milhares de vezes em arcos), e a varredura linear de `raw` (centenas de vértices) dominava.
 */
const casadores = new WeakMap<readonly Vec2[], (x: number, y: number) => number>();
export function casadorDeVertices(raw: readonly Vec2[]): (x: number, y: number) => number {
  const feito = casadores.get(raw);
  if (feito) return feito;
  const TAM = 4096;
  const grade: Array<number[] | undefined> = new Array(TAM);
  const cel = (v: number): number => Math.floor(v / MATCH);
  // chave numérica da célula (inteira e curta); colisão só junta listas, e todo candidato é conferido com a regra exata
  const chave = (cx: number, cy: number): number => (Math.imul(cx | 0, 73856093) ^ Math.imul(cy | 0, 19349663)) & (TAM - 1);
  raw.forEach((r, i) => {
    const k = chave(cel(r.x), cel(r.y));
    const l = grade[k];
    if (l) l.push(i); else grade[k] = [i];
  });
  const casa = (x: number, y: number): number => {
    const cx = cel(x), cy = cel(y);
    let melhor = -1;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const l = grade[chave(cx + dx, cy + dy)];
      if (!l) continue;
      for (const i of l) {
        if (melhor >= 0 && i >= melhor) continue;
        const r = raw[i]!;
        if (Math.abs(r.x - x) < MATCH && Math.abs(r.y - y) < MATCH) melhor = i;
      }
    }
    return melhor;
  };
  casadores.set(raw, casa);
  return casa;
}

/** Nível de junção de uma camada: cota (relativa à base) e anel (um ponto por vértice de `raw`). */
export interface JoinPlanLevel { z: number; ring: Vec2[] }

/**
 * Níveis efetivos (J4) da camada: os níveis da junção (J2) sem os que são só interpolação linear dos vizinhos (1e-9 m).
 * Reta×reta ([0, H/2, H], meio interpolado) cai em p0 e pH, isto é, no comportamento de sempre. `keepAll` mantém todos
 * (o sólido 3D e o IFC de parede em arco partem as faces em todas as cotas). Sem `levels`: p0 e pH. Mesma regra de `tiltLevelsOf` (render).
 */
export function joinLevelsOf(join: WallTiltJoin, layer: WallTiltJoinLayer, keepAll = false): JoinPlanLevel[] {
  const idx = join.layers.indexOf(layer);
  const lv = join.levels;
  const ends: JoinPlanLevel[] = [{ z: 0, ring: layer.p0 }, { z: join.H, ring: layer.pH }];
  if (!lv || idx < 0 || lv.length < 3 || lv.some((x) => !x.rings[idx] || x.rings[idx]!.length !== layer.raw.length)) return ends;
  const all: JoinPlanLevel[] = lv.map((x) => ({ z: x.z, ring: x.rings[idx]! }));
  const out: JoinPlanLevel[] = [all[0]!];
  for (let k = 1; k < all.length - 1; k++) {
    const a = out[out.length - 1]!, c = all[k + 1]!, m = all[k]!;
    const t = (m.z - a.z) / (c.z - a.z);
    let lin = true;
    for (let i = 0; i < m.ring.length && lin; i++) {
      const pa = a.ring[i]!, pc = c.ring[i]!, pm = m.ring[i]!;
      if (Math.abs(pa.x + (pc.x - pa.x) * t - pm.x) > 1e-9 || Math.abs(pa.y + (pc.y - pa.y) * t - pm.y) > 1e-9) lin = false;
    }
    if (!lin || keepAll) out.push(m);
  }
  out.push(all[all.length - 1]!);
  return out.length > 2 ? out : ends;
}

/** Mapa de planta que também informa as cotas intermediárias dos níveis da junção (corte e elevação as usam como degraus). */
export type JoinedPlanMap = PlanMap & { levelZs?: number[] };

const levelPoint = (levels: JoinPlanLevel[], i: number, z: number): [number, number] => {
  let k = 0;
  while (k < levels.length - 2 && z > levels[k + 1]!.z) k++;
  const l0 = levels[k]!, l1 = levels[k + 1]!;
  const t = (z - l0.z) / (l1.z - l0.z);
  const a = l0.ring[i]!, c = l1.ring[i]!;
  return [a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t];
};

/**
 * Com junção inclinada (F2.4/J4): vértice que coincide com o anel vertical `raw` da camada vai para o anel do nível da cota
 * (interpolação entre os dois níveis vizinhos de `levels`; sem `levels`, ou reta×reta, p0 + (pH − p0)·z/H). Os demais seguem `base`.
 */
export function joinedPlanMap(base: PlanMap, join: WallTiltJoin | undefined, layerIndex: number): JoinedPlanMap {
  const layer = join?.layers.find((l) => l.layerIndex === layerIndex);
  if (!join || !layer) return base;
  const levels = joinLevelsOf(join, layer);
  const casa = casadorDeVertices(layer.raw);
  const f: JoinedPlanMap = (x, y, z) => {
    const i = casa(x, y);
    return i >= 0 ? levelPoint(levels, i, z) : base(x, y, z);
  };
  if (levels.length > 2) f.levelZs = levels.slice(1, -1).map((l) => l.z);
  return f;
}

/**
 * Mapa da parede inteira (todas as camadas) com a junção exata e as cotas em que o sólido parte as faces (`keepAll`):
 * serve ao IFC, cujo contorno é a união dos fragmentos das camadas. Sem nível efetivo além de p0/pH em nenhuma camada
 * (reta×reta, sem arco) devolve `undefined`: o chamador mantém o caminho de sempre.
 */
export function wallJoinPlanMap(rw: Pick<ResolvedWall, 'a' | 'b' | 'n' | 'sag' | 'tilt'>, join: WallTiltJoin | undefined): { map: PlanMap; zs: number[] } | undefined {
  if (!join?.levels) return undefined;
  const per = join.layers.map((layer) => ({ layer, levels: joinLevelsOf(join, layer, !!rw.sag) }));
  const exato = per.some((x) => x.levels.length > 2 || (!!rw.sag && join.levels!.length > 2));
  if (!exato) return undefined;
  const base = tiltPlanMap(rw, rw.tilt ?? 0);
  const zs = [...new Set(per.flatMap((x) => x.levels.slice(1, -1).map((l) => l.z)))].sort((a, b) => a - b);
  const casas = per.map((x) => casadorDeVertices(x.layer.raw));
  const map: PlanMap = (x, y, z) => {
    for (let k = 0; k < per.length; k++) {
      const i = casas[k]!(x, y);
      if (i >= 0) return levelPoint(per[k]!.levels, i, z);
    }
    return base(x, y, z);
  };
  return { map, zs };
}

/** Aplica o mapa de planta, na cota z, a todos os vértices de um multipolígono. */
export function mapMulti(m: MultiPolygon, map: PlanMap, z: number): MultiPolygon {
  return m.map((pl) => pl.map((r) => r.map((v) => { const [x, y] = map(v.x, v.y, z); return { x, y }; })));
}

/** Mapa de uma camada da parede resolvida (com a junção inclinada, se houver). Sem inclinação e sem junção: identidade. */
export function layerPlanMap(rw: Pick<ResolvedWall, 'a' | 'b' | 'n' | 'sag' | 'tilt'>, layerIndex: number, join?: WallTiltJoin): JoinedPlanMap {
  return joinedPlanMap(tiltPlanMap(rw, rw.tilt ?? 0), join, layerIndex);
}

/**
 * Memo da planta inclinada (Etapa P). O resolvedor refaz `applyTiltToPlan` a cada chamada (corte, elevação, junção e planta
 * resolvem o mesmo nível), e o custo está nas uniões do Clipper. As entradas vêm do cache de conteúdo do aglomerado, então as
 * identidades de `cut`/`bands` por camada e a da junção (memo de `analyzeLevelTilt`) são chaves baratas e estáveis; o que
 * não é objeto entra numa assinatura curta. Qualquer mudança de forma, tilt, junção ou cota gera objetos novos e erra o memo.
 */
interface MemoParede { cuts: readonly MultiPolygon[]; bands: readonly unknown[]; join: WallTiltJoin | undefined; sig: string; layers: MultiPolygon[]; tiltPlan: ResolvedWall['tiltPlan'] }
const memoParede = new WeakMap<object, MemoParede>();
interface MemoAglomerado { cuts: readonly MultiPolygon[]; regions: Region[]; silhouette: MultiPolygon }
const memoAglomerado = new WeakMap<object, MemoAglomerado>();
const mesmas = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

interface MemoPegada { bands: readonly unknown[]; join: WallTiltJoin | undefined; sig: string; base?: MultiPolygon; top?: MultiPolygon }
const memoPegada = new WeakMap<object, MemoPegada>();
function pegadaPreguicosa(rw: ResolvedWall, join: WallTiltJoin | undefined, zc: number, H: number, bands: readonly unknown[], chave: object | undefined): NonNullable<ResolvedWall['tiltPlan']> {
  const sig = [rw.tilt ?? 0, rw.sag ?? 0, rw.a.x, rw.a.y, rw.b.x, rw.b.y, rw.n.x, rw.n.y, H].join(',');
  const prev = chave ? memoPegada.get(chave) : undefined;
  const m: MemoPegada = prev && prev.sig === sig && prev.join === join && mesmas(prev.bands, bands) ? prev : { bands, join, sig };
  if (chave && m !== prev) memoPegada.set(chave, m);
  const capt = rw.layers.map((l) => ({ layerIndex: l.layerIndex, poly: l.bands.flatMap((b) => b.poly) }));
  const at = (z: number): MultiPolygon => unionClipper(...capt.map((l) => mapMulti(l.poly, layerPlanMap(rw, l.layerIndex, join), z)));
  const out = { z: zc } as { z: number; base: MultiPolygon; top: MultiPolygon };
  Object.defineProperty(out, 'base', { enumerable: true, configurable: true, get: () => (m.base ??= at(0)) });
  Object.defineProperty(out, 'top', { enumerable: true, configurable: true, get: () => (m.top ??= at(H)) });
  return out;
}

function plantaDaParede(rw: ResolvedWall, join: WallTiltJoin | undefined, zc: number): { layers: MultiPolygon[]; tiltPlan: ResolvedWall['tiltPlan'] } {
  const H = join?.H ?? rw.height;
  const sig = [rw.tilt ?? 0, rw.sag ?? 0, rw.a.x, rw.a.y, rw.b.x, rw.b.y, rw.n.x, rw.n.y, zc, H].join(',');
  const cuts = rw.layers.map((l) => l.cut);
  const bands = rw.layers.map((l) => l.bands);
  const chave = rw.layers[0]?.bands;
  const hit = chave ? memoParede.get(chave) : undefined;
  if (hit && hit.sig === sig && hit.join === join && mesmas(hit.cuts, cuts) && mesmas(hit.bands, bands)) return hit;
  const layers = rw.layers.map((l) => mapMulti(l.cut, layerPlanMap(rw, l.layerIndex, join), zc));
  // Só a existência da pegada importa para decidir se há `tiltPlan`; a projeção (base e topo, uniões do Clipper) é preguiçosa
  // (só a planta com marcação de inclinação e o IFC a leem) e não depende da cota de corte `zc`: memo próprio sem `zc`.
  const temPegada = rw.layers.some((l) => l.bands.some((b) => b.poly.length > 0));
  const tiltPlan = temPegada ? pegadaPreguicosa(rw, join, zc, H, bands, chave) : undefined;
  const novo: MemoParede = { cuts, bands, join, sig, layers, tiltPlan };
  if (chave) memoParede.set(chave, novo);
  return novo;
}

/**
 * Leva a planta resolvida de um nível ao plano de corte: nas paredes inclinadas (ou ligadas a uma inclinada por junção
 * de dois níveis) o polígono de cada camada é mapeado na cota `planZ` (relativa à base), as regiões e a silhueta dos
 * grupos afetados são refeitos e `tiltPlan` recebe a projeção da base (z=0) e do topo (z=H). Sem parede afetada nada
 * muda (nem o objeto). `ResolvedLayer.fragment`, `bands` e `raw` ficam verticais: são a base do 3D e do corte.
 */
export function applyTiltToPlan(level: ResolvedLevel, planZ: ReadonlyMap<Id, number>, joins?: ReadonlyMap<Id, WallTiltJoin>): void {
  const touched = (rw: ResolvedWall): boolean => !!rw.tilt || !!joins?.get(rw.wallId);
  if (!Object.values(level.walls).some(touched)) return;
  for (const rw of Object.values(level.walls)) {
    if (!touched(rw)) continue;
    const join = joins?.get(rw.wallId);
    const r = plantaDaParede(rw, join, planZ.get(rw.wallId) ?? 0);
    const mapeadas = r.layers;
    rw.layers = rw.layers.map((l, i) => ({ ...l, cut: mapeadas[i]! }));
    if (r.tiltPlan) rw.tiltPlan = r.tiltPlan;
  }
  level.clusters = level.clusters.map((c) => {
    if (!c.wallIds.some((id) => touched(level.walls[id]!))) return c;
    const cuts: MultiPolygon[] = [];
    const byMaterial = new Map<Id, MultiPolygon[]>();
    for (const id of c.wallIds) for (const l of level.walls[id]?.layers ?? []) if (l.cut.length) { cuts.push(l.cut); byMaterial.set(l.materialId, [...(byMaterial.get(l.materialId) ?? []), l.cut]); }
    const chave = cuts[0];
    const hit = chave ? memoAglomerado.get(chave) : undefined;
    if (hit && mesmas(hit.cuts, cuts)) return { ...c, regions: hit.regions, silhouette: hit.silhouette };
    const regions: Region[] = [...byMaterial.entries()].map(([materialId, parts]) => ({ materialId, polygons: closeGapsSafe(unionClipper(...parts)) }));
    const silhouette = closeGapsSafe(unionClipper(...regions.map((r) => r.polygons)));
    if (chave) memoAglomerado.set(chave, { cuts, regions, silhouette });
    return { ...c, regions, silhouette };
  });
}

/** Atalho do resolvedor: cota de corte absoluta `cutZ` ou `PLAN_CUT` acima da base de cada parede; junções por `analyzeLevelTilt`. */
export function applyTiltToLevelPlan(level: ResolvedLevel, frames: readonly WallFrame[], cutZ: number | undefined, planCut: number, tol?: number): void {
  if (!frames.some((f) => f.wall.tilt)) return;
  const heights = new Map(Object.entries(level.walls).map(([id, w]) => [id, w.height] as const));
  const planZ = new Map(Object.entries(level.walls).map(([id, w]) => [id, (cutZ ?? w.baseZ + planCut) - w.baseZ] as const));
  applyTiltToPlan(level, planZ, analyzeLevelTilt(frames, heights, tol).joins);
}
