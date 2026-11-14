import { intersection, type MultiPolygon, type Polygon, type Ring, type Vec2 } from '@hestia/geom';
import { EPS_T, lineIntervals, rect } from './sectionGeom.ts';
import { layerPlanMap, mapMulti, type PlanMap } from './wallTiltPlan.ts';
import type { ResolvedWall } from './types.ts';
import type { WallTiltJoin } from './wallTiltJoinLevel.ts';

/**
 * Corte e elevação da parede inclinada (F2.6). A faixa (polígono vertical z0..z1) vira sólido regrado pelo mapa de planta
 * de `wallTiltPlan.ts`; o plano de corte (t = distância ao longo da linha, y = cota absoluta) o corta num paralelogramo
 * (reta: lados lineares em z; arco: poligonal com `ARC_STEPS` degraus de cota). Perpendicular ao eixo: base horizontal
 * t/cosθ e topo deslocado H·tanθ. Parede vertical sem junção inclinada: não passa por aqui (caminho de sempre).
 */
export interface SectionBasis { a: Vec2; d: Vec2; n: Vec2; length: number }

const ARC_STEPS = 8;

/** Mapa da camada se a parede é inclinada ou tem junção inclinada; senão `undefined` (resultado de hoje). */
export function tiltSectionMap(rw: ResolvedWall, layerIndex: number, join?: WallTiltJoin): PlanMap | undefined {
  return rw.tilt || join ? layerPlanMap(rw, layerIndex, join) : undefined;
}

const stepsOf = (rw: ResolvedWall, z0: number, z1: number): number[] => {
  const n = rw.sag ? ARC_STEPS : 1;
  return Array.from({ length: n + 1 }, (_, i) => z0 + ((z1 - z0) * i) / n);
};

/** Polígonos (t, z absoluta) do corte de uma faixa pelo plano; `z0`, `z1` relativas à base. */
export function tiltBandCut(rw: ResolvedWall, map: PlanMap, poly: Polygon, bas: SectionBasis, z0: number, z1: number): Ring[] {
  const zs = stepsOf(rw, z0, z1);
  const spans = zs.map((z) => lineIntervals(mapMulti([poly], map, z)[0]!, bas.a, bas.d, bas.n));
  const k = spans[0]!.length;
  const out: Ring[] = [];
  if (spans.every((s) => s.length === k)) {
    for (let j = 0; j < k; j++) {
      const left = zs.map((z, i) => ({ x: spans[i]![j]![0], y: rw.baseZ + z }));
      const right = zs.map((z, i) => ({ x: spans[i]![j]![1], y: rw.baseZ + z })).reverse();
      out.push([...left, ...right]);
    }
  } else {
    // Topologia de interseção muda entre cotas (vão, canto): cai para o corte na meia altura, vertical.
    const mid = lineIntervals(mapMulti([poly], map, (z0 + z1) / 2)[0]!, bas.a, bas.d, bas.n);
    for (const [t0, t1] of mid) out.push(rect(t0, t1, rw.baseZ + z0, rw.baseZ + z1));
  }
  return out.flatMap((r) => clipT(r, bas.length)).filter((r) => Math.max(...r.map((v) => v.x)) - Math.min(...r.map((v) => v.x)) >= EPS_T);
}

/** Recorta o anel ao intervalo 0..length do plano (só quando sai dele). */
function clipT(r: Ring, length: number): Ring[] {
  if (r.every((v) => v.x >= -1e-12 && v.x <= length + 1e-12)) return [r];
  const ys = r.map((v) => v.y);
  const box: Ring = rect(0, length, Math.min(...ys) - 1, Math.max(...ys) + 1);
  return intersection([[r]], [[box]]).map((pl) => pl[0]!).filter((x) => x.length >= 3);
}

/**
 * Elevação: partes da faixa que o plano enxerga (a janela `slab` de profundidade). O polígono mapeado em z0 ou z1 toca a
 * janela; a projeção (t, z) é a poligonal das faixas de `t` de cada cota, recortada em 0..length; `depth` é a menor
 * distância ao plano nas cotas z0 e z1.
 */
export function tiltBandBeyond(rw: ResolvedWall, map: PlanMap, poly: MultiPolygon, slab: MultiPolygon, bas: SectionBasis, z0: number, z1: number): Array<{ depth: number; polygons: MultiPolygon }> {
  const zs = stepsOf(rw, z0, z1);
  const dist = (v: Vec2): number => (v.x - bas.a.x) * bas.n.x + (v.y - bas.a.y) * bas.n.y;
  const alongOf = (v: Vec2): number => (v.x - bas.a.x) * bas.d.x + (v.y - bas.a.y) * bas.d.y;
  const out: Array<{ depth: number; polygons: MultiPolygon }> = [];
  for (const pl of poly) {
    const outer = pl[0];
    if (!outer || outer.length < 3) continue;
    const seen = [z0, z1].some((z) => intersection(mapMulti([pl], map, z), slab).length > 0);
    if (!seen) continue;
    const ext = zs.map((z) => {
      const ts = outer.map((v) => { const [x, y] = map(v.x, v.y, z); return alongOf({ x, y }); });
      return [Math.min(...ts), Math.max(...ts)] as const;
    });
    const left = zs.map((z, i) => ({ x: ext[i]![0], y: rw.baseZ + z }));
    const right = zs.map((z, i) => ({ x: ext[i]![1], y: rw.baseZ + z })).reverse();
    const polygons = clipT([...left, ...right], bas.length).map((r) => [r]);
    if (polygons.length === 0) continue;
    const depth = Math.max(0, Math.min(...[z0, z1].flatMap((z) => outer.map((v) => { const [x, y] = map(v.x, v.y, z); return dist({ x, y }); }))));
    out.push({ depth, polygons });
  }
  return out;
}
