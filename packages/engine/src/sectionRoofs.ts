import { closestOnSegment, intersection, pointInMulti, triangulate, union, type MultiPolygon, type Polygon, type Ring, type Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import { planeZ, roofTopAt, type ResolvedRoof } from './roofs.ts';
import { EPS_T, lineIntervals, sectionFrame, type SectionLine } from './sectionGeom.ts';
import type { SectionBeyond } from './section.ts';

/** Telhado no corte (D3): quadriláteros da linha de corte por material e, além do plano, as faixas por camada. */
export interface RoofSection {
  /** Corte por água e camada, com o telhado de origem (`roofId`). */
  cut: Array<{ materialId: Id; polygon: Polygon; roofId: Id }>;
  beyond: SectionBeyond[];
  /** Arestas 3D do telhado (cumeeira, espigão, rincão, beiral, empena) projetadas, com os trechos visíveis entre as águas do próprio telhado. */
  edges: RoofEdgeCandidate[];
  /** Cotas extremas (Infinity/-Infinity sem telhado na linha). */
  zMin: number;
  zMax: number;
}

/**
 * Aresta 3D de um telhado projetada em (t, z). `spans` são os trechos (fração 0..1 de a→b) que nenhuma água do mesmo telhado cobre
 * mais perto do plano; a oclusão por paredes, pisos etc. é resolvida na montagem do corte. Dados puros (passam pelo worker).
 */
export interface RoofEdgeCandidate {
  roofId: Id;
  kind: 'ridge' | 'hip' | 'valley' | 'eave' | 'gable' | 'break';
  a: Vec2;
  b: Vec2;
  /** Profundidade ao plano em a e em b. */
  da: number;
  db: number;
  spans: Array<[number, number]>;
}

/** Folga (m) de profundidade: a aresta só some atrás de uma água que esteja mais perto que isto. */
const EDGE_DEPTH_EPS = 0.02;
/** Passo (m) de amostragem ao longo de uma aresta. */
const EDGE_STEP = 0.03;

/** Envoltória convexa (cadeia monótona), anel anti-horário; com menos de 3 vértices, pontos colineares. */
function convexHull(pts: Vec2[]): Ring {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const chain = (seq: Vec2[]): Vec2[] => {
    const h: Vec2[] = [];
    for (const q of seq) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...chain(s), ...chain([...s].reverse())];
}

/**
 * Corte esquadro (Revit: Rafter Cut 'square') no beiral: a base da camada recua ao longo da água, de modo que o corte
 * fica perpendicular ao plano. Com G = % / 100 e T a espessura vertical da camada, o deslocamento ao longo da subida é
 * s = G·T/(1+G²); o comprimento do corte (perpendicular ao plano) é T·cos θ. Para 100 % e T = 10 cm: s = 5,00 cm e
 * corte de 7,07 cm.
 */
export function squareCutRun(percent: number, thickness: number): number {
  return ((percent / 100) * thickness) / (1 + (percent / 100) ** 2);
}

/**
 * Telhados no corte e na elevação (D3), como as lajes. Por água e por camada, a faixa vertical de cada ponto p vai de
 * top(p) − below − thickness a top(p) − below. No corte, a linha dá intervalos de t dentro da água e cada faixa é um
 * quadrilátero (topo e base são lineares em t). Além do plano, cada triângulo da água projeta-se em (t, z) com
 * seis pontos (topo e base); a envoltória convexa de cada um e a união delas é a silhueta da camada (exata para
 * águas convexas, que é o caso das formas predefinidas).
 */
export function sectionOfRoofs(roofs: ResolvedRoof[], line: SectionLine): RoofSection {
  const out: RoofSection = { cut: [], beyond: [], edges: [], zMin: Infinity, zMax: -Infinity };
  const { length, d, n, slab } = sectionFrame(line);
  if (length < 1e-6) return out;
  const along = (v: Vec2): number => (v.x - line.a.x) * d.x + (v.y - line.a.y) * d.y;
  const dist = (v: Vec2): number => (v.x - line.a.x) * n.x + (v.y - line.a.y) * n.y;
  const at = (t: number): Vec2 => ({ x: line.a.x + d.x * t, y: line.a.y + d.y * t });
  for (const r of roofs) {
    const layers = r.layers.filter((l) => l.thickness > 1e-9);
    // Corte esquadro só nas extremidades sobre uma aresta de beiral (linha 'eave'); prumo (padrão) não muda nada.
    const square = r.rafterCut === 'square';
    const eaves = r.lines.filter((l) => l.kind === 'eave');
    const onEave = (v: Vec2): boolean => square && eaves.some((l) => Math.hypot(closestOnSegment(v, l.a, l.b).x - v.x, closestOnSegment(v, l.a, l.b).y - v.y) < 1e-6);
    for (const pl of r.planes) {
      const cuts = pl.polygon
        .flatMap((poly) => lineIntervals(poly, line.a, d, n))
        .map(([t0, t1]): [number, number] => [Math.max(0, t0), Math.min(length, t1)])
        .filter(([lo, hi]) => hi - lo >= EPS_T);
      const view = intersection(pl.polygon, slab);
      for (const l of layers) {
        const top = (v: Vec2): number => planeZ(pl, v) - l.below;
        const G = pl.percent / 100;
        const run = square ? squareCutRun(pl.percent, l.thickness) : 0;
        // Cosseno entre a seção e a subida da água: no corte esquadro, a base desloca s / cos ao longo da seção.
        const c = d.x * pl.up.x + d.y * pl.up.y;
        for (const [lo, hi] of cuts) {
          const u0 = top(at(lo));
          const u1 = top(at(hi));
          let bl: Vec2 = { x: lo, y: u0 - l.thickness };
          let br: Vec2 = { x: hi, y: u1 - l.thickness };
          if (square && Math.abs(c) > 1e-9) {
            const k = run / c;
            if (c > 0 && lo + k < hi && onEave(at(lo))) bl = { x: lo + k, y: top(at(lo + k)) - l.thickness };
            if (c < 0 && hi + k > lo && onEave(at(hi))) br = { x: hi + k, y: top(at(hi + k)) - l.thickness };
          }
          out.cut.push({ materialId: l.materialId, polygon: [[bl, br, { x: hi, y: u1 }, { x: lo, y: u0 }]], roofId: r.roofId });
          out.zMin = Math.min(out.zMin, u0 - l.thickness, u1 - l.thickness);
          out.zMax = Math.max(out.zMax, u0, u1);
        }
        const parts: MultiPolygon[] = [];
        let depth = Infinity;
        let farDepth = 0;
        for (const piece of view) {
          const outer = piece[0];
          if (!outer || outer.length < 3) continue;
          depth = Math.min(depth, ...outer.map(dist));
          farDepth = Math.max(farDepth, ...outer.map(dist));
          const mesh = triangulate(piece);
          for (let i = 0; i < mesh.indices.length; i += 3) {
            const pts = [0, 1, 2].flatMap((k) => {
              const j = mesh.indices[i + k]!;
              const v = { x: mesh.positions[2 * j]!, y: mesh.positions[2 * j + 1]! };
              // Corte esquadro no beiral: a base recua s ao longo da subida (projeta-se em s·cos e sobe G·s).
              const base = square && onEave(v) ? { x: along(v) + run * c, y: top(v) + G * run - l.thickness } : { x: along(v), y: top(v) - l.thickness };
              return [{ x: along(v), y: top(v) }, base];
            });
            const hull = convexHull(pts);
            if (hull.length >= 3) parts.push([[hull]]);
          }
        }
        if (!parts.length) continue;
        const polygons = union(...parts);
        // Água de perfil (a subida é paralela à linha de corte): ela se projeta numa faixa só com a espessura, que a água da frente
        // (ou a vizinha) já cobre. Com a profundidade do ponto mais próximo ela empatava com a da frente e, pela ordem da lista,
        // às vezes a escondia, deixando uma diagonal em faixas de um lado só. Pela profundidade do ponto mais longe ela fica
        // atrás de quem a cobre e continua visível quando nada a cobre (empena vista de topo).
        const edgeOn = Math.abs(Math.abs(c) - 1) < 1e-6;
        // De perfil ou quase (até ~3° da vista de ponta): a face não esconde nada e a profundidade por ponto não é confiável.
        const profile = Math.abs(n.x * pl.up.x + n.y * pl.up.y) < 0.05;
        // Profundidade em cada ponto (t, z) da água: s = (z − K − G·ud·t) / (G·un), com K a cota da face de cima da camada em a, ud e un os
        // cossenos da subida com o eixo e com a normal do corte. A água de perfil (un ≈ 0) fica sem plano (profundidade constante).
        const un = n.x * pl.up.x + n.y * pl.up.y;
        const Gun = G * un;
        const K = pl.z0 - l.below + G * ((line.a.x - pl.origin.x) * pl.up.x + (line.a.y - pl.origin.y) * pl.up.y);
        const depthPlane = Math.abs(Gun) > 1e-9 && !profile ? { c: -K / Gun, a: -(G * c) / Gun, b: 1 / Gun } : undefined;
        out.beyond.push({ roofId: r.roofId, materialId: l.materialId, layerIndex: l.layerIndex, depth: Math.max(0, edgeOn ? farDepth : depth), ...(depthPlane ? { depthPlane } : {}), ...(profile ? { passive: true } : {}), polygons });
        for (const ring of polygons.flat()) {
          for (const v of ring) {
            out.zMin = Math.min(out.zMin, v.y);
            out.zMax = Math.max(out.zMax, v.y);
          }
        }
      }
    }
  }
  for (const r of roofs) out.edges.push(...edgesOfRoof(r, line, length, n, at, along, dist));
  return out;
}

/** Arestas 3D de um telhado no corte ou na elevação: projeção, recorte ao quadro e visibilidade entre as águas do próprio telhado. */
function edgesOfRoof(
  r: ResolvedRoof,
  line: SectionLine,
  length: number,
  n: Vec2,
  at: (t: number) => Vec2,
  along: (v: Vec2) => number,
  dist: (v: Vec2) => number,
): RoofEdgeCandidate[] {
  const out: RoofEdgeCandidate[] = [];
  const topZ = (p: Vec2, toward: Vec2): number | null => {
    const z = roofTopAt(r, p);
    if (z !== null) return z;
    return roofTopAt(r, { x: p.x + (toward.x - p.x) * 1e-3, y: p.y + (toward.y - p.y) * 1e-3 });
  };
  for (const l of r.lines) {
    const za = topZ(l.a, l.b);
    const zb = topZ(l.b, l.a);
    if (za === null || zb === null) continue;
    // Recorte ao quadro: dist em [0, depth] e t em [0, length], linear ao longo da aresta.
    let u0 = 0;
    let u1 = 1;
    const clip = (va: number, vb: number, lo: number, hi: number): boolean => {
      // mantém lo <= va + (vb - va) u <= hi
      const dv = vb - va;
      if (Math.abs(dv) < 1e-12) return va >= lo - 1e-9 && va <= hi + 1e-9;
      let ua = (lo - va) / dv;
      let ub = (hi - va) / dv;
      if (ua > ub) [ua, ub] = [ub, ua];
      u0 = Math.max(u0, ua);
      u1 = Math.min(u1, ub);
      return u1 - u0 > 1e-9;
    };
    if (!clip(dist(l.a), dist(l.b), 0, line.depth) || !clip(along(l.a), along(l.b), 0, length)) continue;
    const P = (u: number): { p: Vec2; z: number } => ({ p: { x: l.a.x + (l.b.x - l.a.x) * u, y: l.a.y + (l.b.y - l.a.y) * u }, z: za + (zb - za) * u });
    const A = P(u0);
    const B = P(u1);
    const len3 = Math.hypot(B.p.x - A.p.x, B.p.y - A.p.y, B.z - A.z);
    if (len3 < 1e-4) continue;
    // A projeção de uma aresta que aponta para o observador vira um ponto: não há o que desenhar.
    if (Math.hypot(along(B.p) - along(A.p), B.z - A.z) < 1e-4) continue;
    const steps = Math.max(2, Math.ceil(len3 / EDGE_STEP));
    const vis: boolean[] = [];
    for (let k = 0; k <= steps; k++) {
      const u = u0 + ((u1 - u0) * k) / steps;
      const { p, z } = P(u);
      const t = along(p);
      const dp = dist(p);
      const base = at(t);
      let hidden = false;
      for (const pl of r.planes) {
        const G = pl.percent / 100;
        const Bn = G * (n.x * pl.up.x + n.y * pl.up.y);
        if (Math.abs(Bn) < 1e-9) continue;
        const s = (z - planeZ(pl, base)) / Bn;
        if (s < -1e-9 || s >= dp - EDGE_DEPTH_EPS) continue;
        // 1 mm além do ponto de entrada: a aresta de uma água (o beiral da frente) fica na borda do polígono e a borda não conta como dentro.
        if (pointInMulti({ x: base.x + n.x * (s + 1e-3), y: base.y + n.y * (s + 1e-3) }, pl.polygon)) {
          hidden = true;
          break;
        }
      }
      vis.push(!hidden);
    }
    const spans: Array<[number, number]> = [];
    let start = -1;
    for (let k = 0; k <= steps; k++) {
      if (vis[k] && start < 0) start = k;
      if ((!vis[k] || k === steps) && start >= 0) {
        const end = vis[k] ? k : k - 1;
        if (end > start) spans.push([start / steps, end / steps]);
        start = -1;
      }
    }
    if (spans.length === 0) continue;
    out.push({ roofId: r.roofId, kind: l.kind, a: { x: along(A.p), y: A.z }, b: { x: along(B.p), y: B.z }, da: dist(A.p), db: dist(B.p), spans });
  }
  return out;
}
