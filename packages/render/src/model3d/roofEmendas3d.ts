import { pointInMulti, type Polygon, type Vec2 } from '@hestia/geom';
import { planeZ, type ResolvedRoof } from '@hestia/engine';

/** Trecho de aresta em planta. */
export type Trecho = [Vec2, Vec2];

/**
 * Tolerâncias relativas ao tamanho do telhado (diagonal do retângulo envolvente, no mínimo 1 m): o motor (Clipper) arredonda
 * as coordenadas das águas e a mesma aresta comum chega a duas águas com ruído de ~1e-6 m, que cresce com o tamanho do telhado.
 */
interface Tols {
  /** Distância (m) para um ponto estar sobre uma aresta. */
  pos: number;
  /** Diferença (m) de cota para as duas águas serem a mesma superfície. */
  z: number;
}

function tolsOf(r: ResolvedRoof): Tols {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pl of r.planes) for (const poly of pl.polygon) for (const ring of poly) for (const v of ring) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  const diag = Number.isFinite(minX) ? Math.hypot(maxX - minX, maxY - minY) : 1;
  const scale = Math.max(1, diag);
  return { pos: 2e-6 * scale, z: 1e-5 * scale };
}

/** Parâmetro t (0..1) do ponto mais próximo de `v` no segmento p→q, e a distância até ele. */
function projeta(v: Vec2, p: Vec2, q: Vec2): { t: number; d: number } {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-18) return { t: 0, d: Math.hypot(v.x - p.x, v.y - p.y) };
  const t = Math.max(0, Math.min(1, ((v.x - p.x) * dx + (v.y - p.y) * dy) / l2));
  return { t, d: Math.hypot(v.x - (p.x + t * dx), v.y - (p.y + t * dy)) };
}

/** Vértices de todas as águas, menos os da água `k` (candidatos a junção em T sobre as arestas de `k`). */
function verticesDasOutras(r: ResolvedRoof, k: number): Vec2[] {
  const out: Vec2[] = [];
  r.planes.forEach((pl, j) => {
    if (j === k) return;
    for (const poly of pl.polygon) for (const ring of poly) out.push(...ring);
  });
  return out;
}

/** Parâmetros (0 < t < 1) dos vértices das outras águas que caem sobre p→q (junção em T), em ordem crescente. */
function paradasEm(p: Vec2, q: Vec2, outros: Vec2[], tol: number): number[] {
  const L = Math.hypot(q.x - p.x, q.y - p.y);
  if (L < 1e-9) return [];
  const margem = tol / L;
  const ts: number[] = [];
  for (const v of outros) {
    const { t, d } = projeta(v, p, q);
    if (d <= tol && t > margem && t < 1 - margem) ts.push(t);
  }
  ts.sort((a, b) => a - b);
  // Vértices repetidos (a mesma junção vista por várias águas) viram um só.
  return ts.filter((t, i) => i === 0 || (t - ts[i - 1]!) * L > tol);
}

/**
 * Trechos da aresta p→q da água `k` (sentido anti-horário, normal para fora à direita) que NÃO encostam em outra água de
 * mesma superfície: só neles vai a parede vertical. A aresta é partida onde as águas vizinhas têm vértice (junção em T:
 * uma água de um lado, duas do outro), e cada pedaço é decidido pelo seu meio: do outro lado há água com a mesma cota nos
 * dois extremos do pedaço e no meio. Degrau de cota continua com parede. Vazio = a aresta toda é emenda.
 */
export function trechosSemEmenda(r: ResolvedRoof, k: number): (p: Vec2, q: Vec2) => Trecho[] {
  const pl = r.planes[k]!;
  const tol = tolsOf(r);
  const outros = verticesDasOutras(r, k);
  return (p, q) => {
    const L = Math.hypot(q.x - p.x, q.y - p.y);
    if (L < 1e-9) return [];
    const nx = (q.y - p.y) / L;
    const ny = -(q.x - p.x) / L;
    const ts = [0, ...paradasEm(p, q, outros, tol.pos), 1];
    const at = (t: number): Vec2 => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    const descobertos: Trecho[] = [];
    for (let i = 0; i + 1 < ts.length; i++) {
      const a = at(ts[i]!);
      const b = at(ts[i + 1]!);
      const m = at((ts[i]! + ts[i + 1]!) / 2);
      const fora = { x: m.x + nx * tol.pos * 10, y: m.y + ny * tol.pos * 10 };
      const coberto = r.planes.some(
        (o, j) =>
          j !== k &&
          pointInMulti(fora, o.polygon) &&
          [a, m, b].every((v) => Math.abs(planeZ(o, v) - planeZ(pl, v)) < tol.z),
      );
      if (coberto) continue;
      // Junta pedaços seguidos sem emenda numa parede só.
      const ult = descobertos[descobertos.length - 1];
      if (ult && Math.hypot(ult[1].x - a.x, ult[1].y - a.y) < 1e-12) ult[1] = b;
      else descobertos.push([a, b]);
    }
    return descobertos;
  };
}

/**
 * Emenda entre águas do mesmo telhado: a aresta p→q (sentido anti-horário, normal para fora à direita) da água `k` que
 * encosta em outra água com a mesma cota é interna ao telhado. Sua parede vertical some das faces e, com as arestas da vista
 * ligadas, vira um raio entre facetas (arco amostrado em muitos lados). Degrau de cota continua com parede. Devolve o
 * predicado sobre a aresta inteira (só é emenda se nenhum trecho dela ficar descoberto).
 */
export function emendaDaAgua(r: ResolvedRoof, k: number): (p: Vec2, q: Vec2) => boolean {
  const trechos = trechosSemEmenda(r, k);
  return (p, q) => Math.hypot(q.x - p.x, q.y - p.y) >= 1e-9 && trechos(p, q).length === 0;
}

/**
 * Polígono da água `k` com os vértices das águas vizinhas que caem sobre as suas arestas (junção em T): as duas águas passam
 * a repartir os mesmos vértices na aresta comum, sem fresta na malha. A forma não muda (o vértice entra sobre a aresta).
 */
export function poligonoSoldado(r: ResolvedRoof, k: number, poly: Polygon): Polygon {
  const tol = tolsOf(r);
  const outros = verticesDasOutras(r, k);
  if (outros.length === 0) return poly;
  return poly.map((ring) => {
    const out: Vec2[] = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      out.push(p);
      const ts = paradasEm(p, q, outros, tol.pos);
      for (const t of ts) out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
    return out;
  });
}
