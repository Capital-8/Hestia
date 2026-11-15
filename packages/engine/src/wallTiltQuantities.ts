/**
 * Quantitativos de parede inclinada pela face real (F2.7). As faixas do sólido seguem verticais, então o volume vertical
 * (planta × altura) é escalado pelo fator da face: reta 1/cosθ; arco (1/cosθ)·(1 + s·H·tanθ/(2R)), com R do eixo.
 * Fórmulas: docs/parede-formas/METODOLOGIA.md 4.1. Limite: camada deslocada do eixo usa o fator do eixo.
 */
import { arcFromSagitta, multiArea, type MultiPolygon } from '@hestia/geom';
import { openingPlaneOf, type Opening, type Project, type Wall } from '@hestia/model';
import { arcTiltSide, faceAreaArc, faceAreaStraight } from './wallTilt.ts';
import type { LayerBand, ResolvedLayer, ResolvedWall } from './types.ts';
import { bandVolume } from './profile.ts';
import { joinLevelsOf, layerPlanMap } from './wallTiltPlan.ts';
import type { WallTiltJoin } from './wallTiltJoinLevel.ts';

const rad = (d: number): number => (d * Math.PI) / 180;

export interface TiltFactors {
  /** Volume real ÷ volume vertical. */
  volume: number;
  /** Área real da face bruta (substitui L·H). */
  grossFace: number;
  /** Área de face real ÷ área vertical (para descontar vãos de plano vertical). */
  face: number;
  /**
   * Fator de volume de UMA camada. Reta: o mesmo `volume`. Arco: usa o raio médio ρ da camada (vértices do fragmento, que
   * ficam sobre os círculos) e corrige a facetagem da poligonal (área do setor ÷ área do polígono) quando só ela explica a
   * diferença (< 0,1%); com ponta cortada por junção mantém só o fator de raio.
   */
  layer: (fragment: MultiPolygon) => number;
}

/** Fatores da parede inclinada; null para parede vertical (tilt ausente ou 0): os números ficam idênticos. */
export function tiltFactors(w: Wall, rw: ResolvedWall, H: number, L: number): TiltFactors | null {
  const tilt = rw.tilt;
  if (!tilt || !(H > 0)) return null;
  const c = 1 / Math.cos(rad(tilt));
  const arc = (rw.sag ?? w.sag) !== 0 ? arcFromSagitta(w.a, w.b, rw.sag ?? w.sag) : null;
  if (!arc) return { volume: c, face: c, grossFace: faceAreaStraight({ L, H, t: 0, tiltDeg: tilt }), layer: () => c };
  const s = arcTiltSide(rw.sag ?? w.sag, tilt);
  const m = 1 + (s * H * Math.tan(rad(Math.abs(tilt)))) / (2 * arc.radius);
  const grossFace = faceAreaArc({ R: arc.radius, phi: Math.abs(arc.sweep), H, tiltDeg: tilt, s });
  const phi = Math.abs(arc.sweep);
  const R = arc.radius;
  const tanA = Math.tan(rad(Math.abs(tilt)));
  const layer = (fragment: MultiPolygon): number => {
    let lo = Infinity, hi = 0;
    for (const poly of fragment) for (const ring of poly) for (const v of ring) {
      const d = Math.hypot(v.x - arc.center.x, v.y - arc.center.y);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    if (!(hi > lo)) return c * m;
    const rm = (lo + hi) / 2;
    const f = (c * (R + (s * H * tanA) / 2 + (rm - R) * c)) / rm;
    const poligono = multiArea(fragment);
    const setor = (phi / 2) * (hi * hi - lo * lo);
    return Math.abs(setor / poligono - 1) < 1e-3 ? f * (setor / poligono) : f;
  };
  return { volume: c * m, face: c * m, grossFace, layer };
}

/** O vão é cortado perpendicular às faces (F2.8): plano inclinado efetivo (arco largo cai no vertical e não tem corte). */
export function openingIsTilted(p: Project, rw: ResolvedWall, o: Opening, width: number): boolean {
  void p;
  return openingPlaneOf(o) === 'inclinado' && !!rw.tiltCuts?.some((c) => Math.abs(2 * c.halfW - width) < 1e-6);
}

/**
 * Volume exato da camada de uma parede ligada por junção de arco inclinado (J4): a malha do sólido 3D (J3) e do IFC. Cada faixa
 * vira um poliedro fechado, com o polígono mapeado pelo anel do nível da cota; as laterais se partem nas cotas dos níveis da
 * junção (todas, em parede de arco) e cada quadrilátero vale dois triângulos (a0,b0,b1) e (a0,b1,a1). O volume é a soma da
 * divergência, (1/6)·Σ p0·((p1−p0)×(p2−p0)); as faces internas entre faixas se anulam. `factor` é o volume ÷ o vertical
 * (planta × altura) da camada; `undefined` quando a junção não tem nível efetivo (reta×reta, vertical: números de sempre) ou há faixa em rampa.
 */
export function tiltJoinLayerVolume(rw: ResolvedWall, layer: ResolvedLayer, join: WallTiltJoin | undefined): { volume: number; factor: number } | undefined {
  const jl = join?.layers.find((x) => x.layerIndex === layer.layerIndex);
  if (!join || !jl || !join.levels || layer.bands.some((b: LayerBand) => b.slope)) return undefined;
  const levels = joinLevelsOf(join, jl, !!rw.sag);
  if (levels.length <= 2 && !(rw.sag && join.levels.length > 2)) return undefined;
  const vertical = layer.bands.reduce((s, b) => s + bandVolume(b), 0);
  if (!(vertical > 0)) return undefined;
  const map = layerPlanMap(rw, layer.layerIndex, join);
  const cuts = levels.slice(1, -1).map((l) => l.z);
  let v = 0;
  const tri = (a: number[], b: number[], c: number[]): void => {
    const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!, wx = c[0]! - a[0]!, wy = c[1]! - a[1]!, wz = c[2]! - a[2]!;
    v += (a[0]! * (uy * wz - uz * wy) + a[1]! * (uz * wx - ux * wz) + a[2]! * (ux * wy - uy * wx)) / 6;
  };
  const area = (rings: Array<Array<[number, number]>>, ccw: boolean[]): number => rings.reduce((s, r, i) => {
    let a = 0;
    for (let k = 0; k < r.length; k++) { const p = r[k]!, q = r[(k + 1) % r.length]!; a += p[0] * q[1] - q[0] * p[1]; }
    return s + (ccw[i] ? 1 : -1) * Math.abs(a / 2);
  }, 0);
  for (const band of layer.bands) {
    if (band.z1 - band.z0 < 1e-9) continue;
    const zs = [band.z0, ...cuts.filter((z) => z > band.z0 + 1e-9 && z < band.z1 - 1e-9), band.z1];
    for (const pl of band.poly) {
      const rings = pl.map((r, i) => {
        let a = 0;
        for (let k = 0; k < r.length; k++) { const p = r[k]!, q = r[(k + 1) % r.length]!; a += p.x * q.y - q.x * p.y; }
        const out = (i === 0) === (a > 0) ? r : [...r].reverse();
        return out;
      });
      for (const ring of rings) {
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k]!, b = ring[(k + 1) % ring.length]!;
          for (let j = 0; j + 1 < zs.length; j++) {
            const pt = (u: { x: number; y: number }, z: number): number[] => [...map(u.x, u.y, z), z];
            const a0 = pt(a, zs[j]!), b0 = pt(b, zs[j]!), b1 = pt(b, zs[j + 1]!), a1 = pt(a, zs[j + 1]!);
            tri(a0, b0, b1);
            tri(a0, b1, a1);
          }
        }
      }
      const flat = (z: number): Array<Array<[number, number]>> => rings.map((r) => r.map((u) => map(u.x, u.y, z)));
      const ccw = rings.map((_, i) => i === 0);
      v += (band.z1 * area(flat(band.z1), ccw)) / 3 - (band.z0 * area(flat(band.z0), ccw)) / 3;
    }
  }
  return { volume: v, factor: v / vertical };
}
