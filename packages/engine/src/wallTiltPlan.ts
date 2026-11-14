import { arcFromSagitta, closeGapsSafe, unionClipper, type MultiPolygon, type Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import type { Region, ResolvedLayer, ResolvedLevel, ResolvedWall } from './types.ts';
import type { WallTiltJoin } from './wallTiltJoinLevel.ts';

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

/** Com junção inclinada (F2.4): vértice que coincide com o anel vertical `raw` da camada vai para p0 + (pH − p0)·z/H. */
export function joinedPlanMap(base: PlanMap, join: WallTiltJoin | undefined, layerIndex: number): PlanMap {
  const layer = join?.layers.find((l) => l.layerIndex === layerIndex);
  if (!join || !layer) return base;
  return (x, y, z) => {
    for (let i = 0; i < layer.raw.length; i++) {
      const r = layer.raw[i]!;
      if (Math.abs(r.x - x) < MATCH && Math.abs(r.y - y) < MATCH) {
        const k = z / join.H;
        const a = layer.p0[i]!, c = layer.pH[i]!;
        return [a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k];
      }
    }
    return base(x, y, z);
  };
}

/** Aplica o mapa de planta, na cota z, a todos os vértices de um multipolígono. */
export function mapMulti(m: MultiPolygon, map: PlanMap, z: number): MultiPolygon {
  return m.map((pl) => pl.map((r) => r.map((v) => { const [x, y] = map(v.x, v.y, z); return { x, y }; })));
}

/** Mapa de uma camada da parede resolvida (com a junção inclinada, se houver). Sem inclinação e sem junção: identidade. */
export function layerPlanMap(rw: Pick<ResolvedWall, 'a' | 'b' | 'n' | 'sag' | 'tilt'>, layerIndex: number, join?: WallTiltJoin): PlanMap {
  return joinedPlanMap(tiltPlanMap(rw, rw.tilt ?? 0), join, layerIndex);
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
    const zc = planZ.get(rw.wallId) ?? 0;
    const layers: ResolvedLayer[] = rw.layers.map((l) => ({ ...l, cut: mapMulti(l.cut, layerPlanMap(rw, l.layerIndex, join), zc) }));
    const foot = unionClipper(...rw.layers.flatMap((l) => l.bands.map((b) => b.poly)));
    const at = (z: number): MultiPolygon => unionClipper(...rw.layers.map((l) => mapMulti(l.bands.flatMap((b) => b.poly), layerPlanMap(rw, l.layerIndex, join), z)));
    rw.layers = layers;
    if (foot.length) rw.tiltPlan = { z: zc, base: at(0), top: at(join?.H ?? rw.height) };
  }
  level.clusters = level.clusters.map((c) => {
    if (!c.wallIds.some((id) => touched(level.walls[id]!))) return c;
    const byMaterial = new Map<Id, MultiPolygon[]>();
    for (const id of c.wallIds) for (const l of level.walls[id]?.layers ?? []) if (l.cut.length) byMaterial.set(l.materialId, [...(byMaterial.get(l.materialId) ?? []), l.cut]);
    const regions: Region[] = [...byMaterial.entries()].map(([materialId, parts]) => ({ materialId, polygons: closeGapsSafe(unionClipper(...parts)) }));
    return { ...c, regions, silhouette: closeGapsSafe(unionClipper(...regions.map((r) => r.polygons))) };
  });
}
