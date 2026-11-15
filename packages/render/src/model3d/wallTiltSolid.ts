import { arcFromSagitta, difference, union, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { tiltCutZ, type JunctionLevel, type NodeWarp, type LayerBand, type ResolvedWall, type WallTiltJoin, type WallTiltJoinLayer } from '@hestia/engine';
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

/** Nível de junção efetivo de uma camada: cota e anel (um ponto por vértice de `raw`). */
export interface TiltLevel { z: number; ring: Vec2[] }

/**
 * Níveis efetivos (J3) da camada: os níveis da junção (J2) sem os que são só interpolação linear dos vizinhos (1e-9 m).
 * Reta×reta ([0, H/2, H], meio interpolado) cai em 2 níveis, isto é, na interpolação p0→pH de sempre (malha idêntica).
 * `keepAll` (parede em arco): mantém todos os níveis, para os vértices coincidirem com os da vizinha em cada cota.
 * Sem `levels` (junção montada à mão): p0 e pH.
 */
export function tiltLevelsOf(join: { all: WallTiltJoin; layer: WallTiltJoinLayer }, keepAll = false): TiltLevel[] {
  const { all, layer } = join;
  const idx = all.layers.indexOf(layer);
  const lv = all.levels;
  const ends: TiltLevel[] = [{ z: 0, ring: layer.p0 }, { z: all.H, ring: layer.pH }];
  if (!lv || idx < 0 || lv.length < 3 || lv.some((x) => !x.rings[idx] || x.rings[idx]!.length !== layer.raw.length)) return ends;
  const all3: TiltLevel[] = lv.map((x) => ({ z: x.z, ring: x.rings[idx]! }));
  const out: TiltLevel[] = [all3[0]!];
  for (let k = 1; k < all3.length - 1; k++) {
    const a = out[out.length - 1]!, c = all3[k + 1]!, m = all3[k]!;
    const t = (m.z - a.z) / (c.z - a.z);
    let lin = true;
    for (let i = 0; i < m.ring.length && lin; i++) {
      const pa = a.ring[i]!, pc = c.ring[i]!, pm = m.ring[i]!;
      if (Math.abs(pa.x + (pc.x - pa.x) * t - pm.x) > 1e-9 || Math.abs(pa.y + (pc.y - pa.y) * t - pm.y) > 1e-9) lin = false;
    }
    if (!lin || keepAll) out.push(m);
  }
  out.push(all3[all3.length - 1]!);
  return out.length > 2 ? out : ends;
}

/** Assinatura numérica estável (FNV-1a de 32 bits sobre valores em nm) dos níveis intermediários; '' quando só há p0/pH. */
export function tiltLevelsSignature(join: { all: WallTiltJoin; layer: WallTiltJoinLayer }, keepAll = false): string {
  const lv = tiltLevelsOf(join, keepAll);
  if (lv.length <= 2) return '';
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    const q = Math.round(v * 1e9);
    h = Math.imul(h ^ (q % 0x100000000), 0x01000193) >>> 0;
    h = Math.imul(h ^ Math.floor(q / 0x100000000), 0x01000193) >>> 0;
  };
  for (const l of lv) { mix(l.z); for (const p of l.ring) { mix(p.x); mix(p.y); } }
  return `${lv.length}:${h.toString(36)}`;
}

/**
 * Mapa com a junção inclinada (F2.4/J3): vértice da faixa que coincide com um vértice do anel vertical `raw` da camada vai
 * para o anel do nível (interpolação linear entre os dois níveis vizinhos de z; com 2 níveis é p0 + (pH − p0)·z/H); os demais
 * seguem o mapa geral da parede, cujas faces estão nos mesmos planos/cones.
 */
function joinedMap(base: (x: number, y: number, z: number) => [number, number], join: WallTiltJoin, layer: WallTiltJoinLayer, levels: TiltLevel[], wallId: string): (x: number, y: number, z: number) => [number, number] {
  const nodes = join.nodes ?? [];
  return (x, y, z) => {
    if (nodes.length) {
      const w = warpNos(nodes, wallId, x, y, z, base);
      if (w) return w;
    }
    for (let i = 0; i < layer.raw.length; i++) {
      const r = layer.raw[i]!;
      if (Math.abs(r.x - x) < MATCH && Math.abs(r.y - y) < MATCH) {
        let k = 0;
        while (k < levels.length - 2 && z > levels[k + 1]!.z) k++;
        const l0 = levels[k]!, l1 = levels[k + 1]!;
        const t = (z - l0.z) / (l1.z - l0.z);
        const a = l0.ring[i]!, c = l1.ring[i]!;
        return [a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t];
      }
    }
    return base(x, y, z);
  };
}

const EPS_NO = 1e-7;

/**
 * Segmentos onde o mapa do nó muda de peça (arestas dos triângulos do miolo e borda do nó de cada faixa), na planta vertical.
 * A aresta de uma faixa de parede que os cruza ganha ali um vértice (a imagem de cada trecho fica numa só peça, e as duas paredes
 * vizinhas, que dividem a aresta, inserem o mesmo ponto).
 */
function fronteirasDoNo(nodes: readonly NodeWarp[]): Array<[Vec2, Vec2]> {
  const segs: Array<[Vec2, Vec2]> = [];
  for (const nd of nodes) {
    for (const w of nd.walls) segs.push([w.Rv, w.Lv]);
    for (const h of nd.hubs) for (const [i, j, k] of h.tri) segs.push([h.vert[i]!, h.vert[j]!], [h.vert[j]!, h.vert[k]!], [h.vert[k]!, h.vert[i]!]);
  }
  return segs;
}
function refinaNo(poly: MultiPolygon, segs: ReadonlyArray<[Vec2, Vec2]>): MultiPolygon {
  if (!segs.length) return poly;
  return poly.map((pl) => pl.map((ring) => {
    const out: Vec2[] = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
      out.push(p);
      const dx = q.x - p.x, dy = q.y - p.y;
      const hits: number[] = [];
      for (const [a, b] of segs) {
        const ex = b.x - a.x, ey = b.y - a.y;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-14) continue;
        const t = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
        const u = ((a.x - p.x) * dy - (a.y - p.y) * dx) / den;
        if (t > 1e-9 && t < 1 - 1e-9 && u > -1e-9 && u < 1 + 1e-9) hits.push(t);
      }
      hits.sort((m, n) => m - n);
      let last = -1;
      for (const t of hits) if (t - last > 1e-9) { out.push({ x: p.x + dx * t, y: p.y + dy * t }); last = t; }
    }
    return out;
  }));
}
/**
 * Deformação do nó de 3+ paredes (N1): ponto da planta vertical (x, y) na cota z, ou null fora da zona do nó.
 * Miolo: afim por triângulo (mesmos triângulos na planta vertical e na da cota). Faixa de uma parede: o mapa geral da parede (`tiltMap`)
 * mais um deslizamento ao longo do eixo que leva a borda do nó da faixa ao canto da cota (linear em λ, que vai da face direita à esquerda)
 * e cai linearmente a zero até a ponta longe; a face fica no plano, a ordem dos vértices se mantém (o deslizamento é menor que o comprimento).
 * O ponto na faixa de OUTRA parede do nó usa o mapa dela (o corte do resolvedor vertical na zona do nó é arbitrário, e todas as paredes
 * precisam do mesmo mapa nesse ponto: fresta 0, sobreposição 0). A ponta longe (w = 0) cai no casamento por `raw` do outro extremo.
 */
function warpNos(nodes: NodeWarp[], wallId: string, x: number, y: number, z: number, own: (x: number, y: number, z: number) => [number, number]): [number, number] | null {
  let slide: { u: Vec2; d: number } | null = null;
  let outro: [number, number] | null = null;
  for (const nd of nodes) {
    for (const h of nd.hubs) {
      for (const [i, j, k] of h.tri) {
        const a = h.vert[i]!, b = h.vert[j]!, c = h.vert[k]!;
        const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        const l1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / den;
        const l2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < -EPS_NO || l2 < -EPS_NO || l3 < -EPS_NO) continue;
        const P = (q: number): Vec2 => ({ x: h.p0[q]!.x + h.dp[q]!.x * z, y: h.p0[q]!.y + h.dp[q]!.y * z });
        const pa = P(i), pb = P(j), pc = P(k);
        return [l1 * pa.x + l2 * pb.x + l3 * pc.x, l1 * pa.y + l2 * pb.y + l3 * pc.y];
      }
    }
  }
  for (const nd of nodes) {
    for (const w of nd.walls) {
      const n = { x: -w.u.y, y: w.u.x };
      const dx = x - w.o.x, dy = y - w.o.y;
      const t = dx * w.u.x + dy * w.u.y, s = dx * n.x + dy * n.y;
      const lam = (s - w.lo) / (w.hi - w.lo);
      if (lam < -EPS_NO || lam > 1 + EPS_NO || t > w.len + EPS_NO) continue;
      const tR = (w.Rv.x - w.o.x) * w.u.x + (w.Rv.y - w.o.y) * w.u.y, tL = (w.Lv.x - w.o.x) * w.u.x + (w.Lv.y - w.o.y) * w.u.y;
      const edge = tR + lam * (tL - tR);
      if (t < edge - EPS_NO) continue;
      // Mapa geral dessa parede e deslizamento do canto.
      const T = (px: number, py: number): Vec2 => {
        const e = (px - w.o.x) * n.x + (py - w.o.y) * n.y;
        const m = e * (w.inv - 1) + z * w.tan;
        return { x: px + n.x * m, y: py + n.y * m };
      };
      const slideAt = (c0: Vec2, dc: Vec2, cv: Vec2): number => {
        const q = T(cv.x, cv.y);
        return (c0.x + dc.x * z - q.x) * w.u.x + (c0.y + dc.y * z - q.y) * w.u.y;
      };
      const dR = slideAt(w.R0, w.dR, w.Rv), dL = slideAt(w.L0, w.dL, w.Lv);
      const wt = w.len - edge > 1e-9 ? Math.max(0, 1 - (t - edge) / (w.len - edge)) : 0;
      const d = (dR + lam * (dL - dR)) * wt;
      if (w.id !== wallId) {
        // Ponto na borda de duas faixas (canto sobre a face da barra): vale a da própria parede, se houver; senão a da outra.
        if (!outro) { const q = T(x, y); outro = [q.x + w.u.x * d, q.y + w.u.y * d]; }
        continue;
      }
      if (wt > 1e-12) slide = slide ? { u: slide.u, d: slide.d + d } : { u: w.u, d };
    }
  }
  if (!slide) return outro;
  const q = own(x, y, z);
  return [q[0] + slide.u.x * slide.d, q[1] + slide.u.y * slide.d];
}

/**
 * Sólido de uma camada de parede inclinada: cada faixa liga o polígono de planta em z0 ao deslocado em z1 (faces
 * regradas; em reta é exato, em arco cada quadrilátero vira dois triângulos). Topo e base planos. Com `join` (F2.4)
 * os cantos e encostos usam as faixas de junção inclinadas; sem ela, o corte vertical sobre a base é deslocado.
 */
export function extrudeLayerTilted(b: SolidBatch, bands: LayerBand[], rw: ResolvedWall, tiltDeg: number, h: TiltHelpers, join?: { all: WallTiltJoin; layer: WallTiltJoinLayer }): void {
  const { push, emitFace, oriented, unionAll, zEps: Z_EPS } = h;
  const generic = tiltMap(rw, tiltDeg);
  const jLevels = join ? tiltLevelsOf(join, !!rw.sag) : [];
  const map = join ? joinedMap(generic, join.all, join.layer, jLevels, rw.wallId) : generic;
  // Cotas intermediárias da junção (J3): as faces laterais se partem nelas (faixas regradas entre níveis consecutivos).
  const splitZ = jLevels.slice(1, -1).map((l) => l.z);
  // Vãos 'inclinado' (F2.8): os vértices do furo na cota do peitoril/topo escorregam ao longo do plano da face (cota pré-mapa).
  const cuts = rw.tiltCuts ?? [];
  const zOf = (v: Vec2, z: number): number => (cuts.length ? tiltCutZ(cuts, v.x, v.y, z) : z);
  const fronteiras = join?.all.nodes ? fronteirasDoNo(join.all.nodes) : [];
  const cleaned = weldBands(weldBands(bands).map((x) => ({ ...x, poly: refinaNo(union(x.poly), fronteiras) })));
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
  const pk = (v: Vec2): string => `${v.x.toFixed(7)},${v.y.toFixed(7)}`; // units-ok: chave interna de vértice
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
    if (splitZ.length) {
      pieces = pieces.flatMap(([a0, a1]) => {
        const cuts2 = splitZ.filter((z) => z > a0 + Z_EPS && z < a1 - Z_EPS);
        const edges = [a0, ...cuts2, a1];
        return edges.slice(0, -1).map((e, i) => [e, edges[i + 1]!] as [number, number]);
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
    const key = (x: number, y: number): string => `${x.toFixed(9)},${y.toFixed(9)}`; // units-ok: chave interna de vértice
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
