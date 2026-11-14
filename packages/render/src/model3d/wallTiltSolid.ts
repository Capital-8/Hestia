import { arcFromSagitta, difference, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import type { LayerBand, ResolvedWall } from '@hestia/engine';
import { weldBands } from './layerTopology.ts';
import type { SolidBatch } from './solids.ts';

/** Auxiliares privados de `solids.ts`, passados por parâmetro para não haver import circular. */
export interface TiltHelpers {
  push: (b: SolidBatch, v: number[], n: [number, number, number], tris: number[]) => void;
  emitFace: (b: SolidBatch, poly: MultiPolygon, to3: (u: number, v: number) => [number, number, number], n: [number, number, number]) => void;
  oriented: (r: Ring, ccw: boolean) => Ring;
  unionAll: (ms: MultiPolygon[]) => MultiPolygon;
  zEps: number;
}

/**
 * Mapa de planta (x, y) da cota z (relativa à base) para a parede inclinada (F2.3): a base fica onde está; o plano médio
 * desloca d(z) = z·tan(tilt) para a esquerda de a→b e a distância à linha de localização cresce 1/cosθ (a espessura
 * perpendicular à face fica t). Reta: desloca pela normal esquerda. Arco: raio R + k·d + (ρ − R)/cosθ, mesmo centro
 * (k = +1 quando o centro fica à direita de a→b, convenção de `arcFromSagitta`).
 */
function tiltMap(rw: ResolvedWall, tiltDeg: number): (x: number, y: number, z: number) => [number, number] {
  const th = (tiltDeg * Math.PI) / 180;
  const tan = Math.tan(th);
  const inv = 1 / Math.cos(th);
  const arc = arcFromSagitta(rw.a, rw.b, rw.sag ?? 0);
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
    const e = (x - rw.a.x) * rw.n.x + (y - rw.a.y) * rw.n.y;
    const m = e * (inv - 1) + z * tan;
    return [x + rw.n.x * m, y + rw.n.y * m];
  };
}

/**
 * Sólido de uma camada de parede inclinada, sem junção inclinada (F2.4): cada faixa liga o polígono de planta em z0 ao
 * deslocado em z1 (faces regradas; em reta é exato, em arco cada quadrilátero vira dois triângulos). Topo e base planos.
 * Junções e vãos seguem o corte vertical sobre a base, como nas paredes retas.
 */
export function extrudeLayerTilted(b: SolidBatch, bands: LayerBand[], rw: ResolvedWall, tiltDeg: number, h: TiltHelpers): void {
  const { push, emitFace, oriented, unionAll, zEps: Z_EPS } = h;
  const map = tiltMap(rw, tiltDeg);
  const cleaned = weldBands(weldBands(bands).map((x) => ({ ...x, poly: union(x.poly) })));
  const tops: Array<{ z: number; poly: MultiPolygon }> = [];
  const bottoms: Array<{ z: number; poly: MultiPolygon }> = [];
  const zs: number[] = [];
  for (const band of cleaned) {
    if (band.poly.length === 0 || band.z1 - band.z0 < Z_EPS) continue;
    for (const z of [band.z0, band.z1]) if (!zs.some((q) => Math.abs(q - z) < Z_EPS)) zs.push(z);
    bottoms.push({ z: band.z0, poly: band.poly });
    tops.push({ z: band.z1, poly: band.poly });
    for (const pl of band.poly) {
      for (const ring of pl.map((r, i) => oriented(r, i === 0))) {
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i]!;
          const q = ring[(i + 1) % ring.length]!;
          if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-9) continue;
          const at = (v: Vec2, z: number): [number, number, number] => [...map(v.x, v.y, z), rw.baseZ + z] as [number, number, number];
          const p0 = at(p, band.z0);
          const q0 = at(q, band.z0);
          const p1 = at(p, band.z1);
          const q1 = at(q, band.z1);
          for (const t of [[p0, q0, q1], [p0, q1, p1]] as const) {
            const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
            const w = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
            const n: [number, number, number] = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
            const l = Math.hypot(...n);
            if (l < 1e-14) continue;
            push(b, [...t[0], ...t[1], ...t[2]], [n[0] / l, n[1] / l, n[2] / l], [0, 1, 2]);
          }
        }
      }
    }
  }
  for (const Z of zs) {
    const tp = unionAll(tops.filter((f) => Math.abs(f.z - Z) < Z_EPS).map((f) => f.poly));
    const bt = unionAll(bottoms.filter((f) => Math.abs(f.z - Z) < Z_EPS).map((f) => f.poly));
    // Triangula o polígono JÁ deslocado: o mapa é não linear no arco, e a triangulação da planta poderia inverter triângulos.
    const lift = (m: MultiPolygon): MultiPolygon => m.map((pl) => pl.map((r) => r.map((v) => { const [x, y] = map(v.x, v.y, Z); return { x, y }; })));
    const to3 = (x: number, y: number): [number, number, number] => [x, y, rw.baseZ + Z];
    emitFace(b, lift(tp.length && bt.length ? difference(tp, bt) : tp), to3, [0, 0, 1]);
    emitFace(b, lift(bt.length && tp.length ? difference(bt, tp) : bt), to3, [0, 0, -1]);
  }
}
