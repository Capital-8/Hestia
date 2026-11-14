import { arcFromSagitta, difference, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { tiltCutZ, type JunctionLevel, type LayerBand, type ResolvedWall, type WallTiltJoin, type WallTiltJoinLayer } from '@hestia/engine';
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

/** Junção inclinada (F2.4) da camada: só quando a junção do nível a traz (parede ligada a outra com tilt). */
export function tiltJoinOf(rw: ResolvedWall, l: ResolvedWall['layers'][number], jl?: JunctionLevel): { all: WallTiltJoin; layer: WallTiltJoinLayer } | undefined {
  const all = jl?.walls.get(rw.wallId)?.tilt;
  const layer = all?.layers.find((x) => x.layerIndex === l.layerIndex);
  return all && layer ? { all, layer } : undefined;
}

type Pt = [number, number, number];

/** Casamento de vértice da faixa com o anel `raw` da junção (m): as faixas passam por solda de 0,1 mm. */
const MATCH = 5e-4;

/**
 * Mapa com a junção inclinada (F2.4): vértice da faixa que coincide com um vértice do anel vertical `raw` da camada vai
 * para a interpolação p0 + (pH − p0)·z/H (cantos e encostos exatos); os demais seguem o mapa geral da parede, cujas
 * faces estão nos mesmos planos.
 */
function joinedMap(base: (x: number, y: number, z: number) => [number, number], join: WallTiltJoin, layer: WallTiltJoinLayer): (x: number, y: number, z: number) => [number, number] {
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

/**
 * Sólido de uma camada de parede inclinada: cada faixa liga o polígono de planta em z0 ao deslocado em z1 (faces
 * regradas; em reta é exato, em arco cada quadrilátero vira dois triângulos). Topo e base planos. Com `join` (F2.4)
 * os cantos e encostos usam as faixas de junção inclinadas; sem ela, o corte vertical sobre a base é deslocado.
 */
export function extrudeLayerTilted(b: SolidBatch, bands: LayerBand[], rw: ResolvedWall, tiltDeg: number, h: TiltHelpers, join?: { all: WallTiltJoin; layer: WallTiltJoinLayer }): void {
  const { push, emitFace, oriented, unionAll, zEps: Z_EPS } = h;
  const generic = tiltMap(rw, tiltDeg);
  const map = join ? joinedMap(generic, join.all, join.layer) : generic;
  // Vãos 'inclinado' (F2.8): os vértices do furo na cota do peitoril/topo escorregam ao longo do plano da face (cota pré-mapa).
  const cuts = rw.tiltCuts ?? [];
  const zOf = (v: Vec2, z: number): number => (cuts.length ? tiltCutZ(cuts, v.x, v.y, z) : z);
  const cleaned = weldBands(weldBands(bands).map((x) => ({ ...x, poly: union(x.poly) })));
  const vertsAt = (z: number): Vec2[] => {
    const out: Vec2[] = [];
    for (const x of cleaned) if (Math.abs(x.z0 - z) < Z_EPS || Math.abs(x.z1 - z) < Z_EPS) for (const pl of x.poly) for (const r of pl) out.push(...r);
    return out;
  };
  const segs: Array<{ p: Vec2; q: Vec2; z0: number; z1: number }> = [];
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
          segs.push({ p, q, z0: band.z0, z1: band.z1 });
        }
      }
    }
  }
  // Faces laterais. Duas faixas vizinhas dividem uma face interna (arestas opostas coincidentes): o trecho de cota em comum some
  // dos dois lados. Vértices de faixas vizinhas que caem sobre as bordas (cantos de vão, degraus) entram na face (T-junctions).
  const at = (v: Vec2, z: number): [number, number, number] => {
    const zz = zOf(v, z);
    return [...map(v.x, v.y, zz), rw.baseZ + zz] as [number, number, number];
  };
  const pk = (v: Vec2): string => `${v.x.toFixed(7)},${v.y.toFixed(7)}`;
  const byKey = new Map<string, Array<[number, number]>>();
  for (const sg of segs) byKey.set(`${pk(sg.p)}>${pk(sg.q)}`, [...(byKey.get(`${pk(sg.p)}>${pk(sg.q)}`) ?? []), [sg.z0, sg.z1]]);
  const levelsAt = new Map<string, number[]>();
  for (const band of cleaned) for (const pl of band.poly) for (const r of pl) for (const v of r) levelsAt.set(pk(v), [...(levelsAt.get(pk(v)) ?? []), band.z0, band.z1]);
  const onEdge = (p: Vec2, q: Vec2, z: number): Vec2[] => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const l2 = dx * dx + dy * dy;
    const hits: Array<{ t: number; v: Vec2 }> = [];
    for (const v of vertsAt(z)) {
      const tt = ((v.x - p.x) * dx + (v.y - p.y) * dy) / l2;
      if (tt <= 1e-9 || tt >= 1 - 1e-9) continue;
      if (Math.hypot(p.x + dx * tt - v.x, p.y + dy * tt - v.y) > 5e-7) continue;
      if (!hits.some((h) => Math.abs(h.t - tt) < 1e-9)) hits.push({ t: tt, v });
    }
    return hits.sort((m, n) => m.t - n.t).map((h) => h.v);
  };
  const between = (v: Vec2, z0: number, z1: number): number[] => [...new Set((levelsAt.get(pk(v)) ?? []).filter((z) => z > z0 + Z_EPS && z < z1 - Z_EPS).map((z) => Math.round(z / Z_EPS) * Z_EPS))].sort((m, n) => m - n);
  for (const sg of segs) {
    const opp = byKey.get(`${pk(sg.q)}>${pk(sg.p)}`) ?? [];
    let pieces: Array<[number, number]> = [[sg.z0, sg.z1]];
    for (const [o0, o1] of opp) {
      pieces = pieces.flatMap(([a0, a1]) => {
        if (o1 <= a0 + Z_EPS || o0 >= a1 - Z_EPS) return [[a0, a1] as [number, number]];
        const out: Array<[number, number]> = [];
        if (o0 > a0 + Z_EPS) out.push([a0, o0]);
        if (o1 < a1 - Z_EPS) out.push([o1, a1]);
        return out;
      });
    }
    for (const [z0, z1] of pieces) {
      const { p, q } = sg;
      const loop = [
        at(p, z0),
        ...onEdge(p, q, z0).map((v) => at(v, z0)),
        at(q, z0),
        ...between(q, z0, z1).map((z) => at(q, z)),
        at(q, z1),
        ...onEdge(p, q, z1).reverse().map((v) => at(v, z1)),
        at(p, z1),
        ...between(p, z0, z1).reverse().map((z) => at(p, z)),
      ];
      // Quadrilátero comum: as duas diagonais de sempre. Com vértices extras nas bordas, leque a partir do centro (um leque a
      // partir de um canto degeneraria nas bordas com vértices alinhados).
      const tris: Array<[Pt, Pt, Pt]> = [];
      if (loop.length === 4) tris.push([loop[0]!, loop[1]!, loop[2]!], [loop[0]!, loop[2]!, loop[3]!]);
      else {
        const c = [0, 1, 2].map((j) => loop.reduce((a, v) => a + v[j]!, 0) / loop.length) as Pt;
        for (let k = 0; k < loop.length; k++) tris.push([c, loop[k]!, loop[(k + 1) % loop.length]!]);
      }
      for (const t of tris) {
        const u = [t[1][0] - t[0][0], t[1][1] - t[0][1], t[1][2] - t[0][2]];
        const w = [t[2][0] - t[0][0], t[2][1] - t[0][1], t[2][2] - t[0][2]];
        const n: [number, number, number] = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
        const l = Math.hypot(...n);
        if (l < 1e-14) continue;
        push(b, [...t[0], ...t[1], ...t[2]], [n[0] / l, n[1] / l, n[2] / l], [0, 1, 2]);
      }
    }
  }
  for (const Z of zs) {
    const tl = tops.filter((f) => Math.abs(f.z - Z) < Z_EPS).map((f) => f.poly);
    const bl = bottoms.filter((f) => Math.abs(f.z - Z) < Z_EPS).map((f) => f.poly);
    const tp = unionAll(tl);
    const bt = unionAll(bl);
    // Triangula o polígono JÁ deslocado: o mapa é não linear no arco, e a triangulação da planta poderia inverter triângulos.
    const zAt = new Map<string, number>();
    const key = (x: number, y: number): string => `${x.toFixed(9)},${y.toFixed(9)}`;
    const lift = (m: MultiPolygon): MultiPolygon => m.map((pl) => pl.map((r) => r.map((v) => {
      const zz = zOf(v, Z);
      const [x, y] = map(v.x, v.y, zz);
      if (zz !== Z) zAt.set(key(x, y), zz);
      return { x, y };
    })));
    const to3 = (x: number, y: number): [number, number, number] => [x, y, rw.baseZ + (cuts.length ? (zAt.get(key(x, y)) ?? Z) : Z)];
    // Sem face oposta na cota, cada faixa emite o seu polígono (a união apagaria os vértices que as faces laterais usam);
    // com face oposta, só o que sobra da diferença.
    const both = tp.length > 0 && bt.length > 0;
    for (const m of both ? [difference(tp, bt)] : tl) emitFace(b, lift(m), to3, [0, 0, 1]);
    for (const m of both ? [difference(bt, tp)] : bl) emitFace(b, lift(m), to3, [0, 0, -1]);
  }
}
