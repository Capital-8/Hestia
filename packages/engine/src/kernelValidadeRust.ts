/** Validade do resultado do Rust para a regra de topologia da 0049. Extraída de `kernelComparaA3c.ts` para o arquivo caber no limite de linhas. */
import type { MultiPolygon } from '@hestia/geom';

// ---- Validade do resultado do Rust (0049, "Topologia equivalente por região", 2026-11-05) ---------------------------------------
// A regra só aceita topologia diferente por região quando o Rust é VÁLIDO: cada anel é simples (sem vértice repetido fora de sequência no mesmo
// anel, sem aresta tocando outra não adjacente do mesmo anel, nem cruzamento próprio entre anéis do mesmo polígono; vértices repetidos seguidos
// são aresta de comprimento zero e não contam) e cada furo está dentro do anel externo que o contém (teste de ponto num ponto interior do furo).

type PontoV = { readonly x: number; readonly y: number };

const mesmoPontoV = (p: PontoV, q: PontoV): boolean => p.x === q.x && p.y === q.y;
const orientacao = (a: PontoV, b: PontoV, c: PontoV): number => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const sobreSegmento = (a: PontoV, b: PontoV, c: PontoV): boolean =>
  Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);

/** Segmentos que se cruzam ou se tocam (inclusive em vértice ou sobre o outro). */
function segmentosTocam(p1: PontoV, p2: PontoV, p3: PontoV, p4: PontoV): boolean {
  const d1 = orientacao(p3, p4, p1);
  const d2 = orientacao(p3, p4, p2);
  const d3 = orientacao(p1, p2, p3);
  const d4 = orientacao(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && sobreSegmento(p3, p4, p1)) return true;
  if (d2 === 0 && sobreSegmento(p3, p4, p2)) return true;
  if (d3 === 0 && sobreSegmento(p1, p2, p3)) return true;
  if (d4 === 0 && sobreSegmento(p1, p2, p4)) return true;
  return false;
}

/** Cruzamento próprio (os dois lados passam um pelo interior do outro); toque em vértice não conta. */
function segmentosCruzam(p1: PontoV, p2: PontoV, p3: PontoV, p4: PontoV): boolean {
  const d1 = orientacao(p3, p4, p1);
  const d2 = orientacao(p3, p4, p2);
  const d3 = orientacao(p1, p2, p3);
  const d4 = orientacao(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Anel sem vértices repetidos SEGUIDOS (inclusive o de fechamento): aresta de comprimento zero não muda a forma. */
const semRepetidosSeguidos = (r: ReadonlyArray<PontoV>): ReadonlyArray<PontoV> => r.filter((q, i) => !mesmoPontoV(q, r[(i - 1 + r.length) % r.length]!));

/** Ponto estritamente dentro de um anel (paridade, por rastreamento horizontal). */
function dentroDoAnel(p: PontoV, r: ReadonlyArray<PontoV>): boolean {
  let dentro = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i]!;
    const b = r[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dentro = !dentro;
  }
  return dentro;
}

/** Um ponto no interior de um anel simples: meio do primeiro trecho interno de uma linha horizontal no meio do maior vão em y. */
function pontoInteriorDoAnel(r: ReadonlyArray<PontoV>): PontoV | null {
  const ys = [...new Set(r.map((q) => q.y))].sort((a, b) => a - b);
  if (ys.length < 2) return null;
  let melhor = -1;
  let y = 0;
  for (let i = 0; i + 1 < ys.length; i++) {
    const gap = ys[i + 1]! - ys[i]!;
    if (gap > melhor) {
      melhor = gap;
      y = (ys[i]! + ys[i + 1]!) / 2;
    }
  }
  const xs: number[] = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % r.length]!;
    if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  xs.sort((p, q) => p - q);
  if (xs.length < 2 || !(xs[1]! > xs[0]!)) return null;
  return { x: (xs[0]! + xs[1]!) / 2, y };
}

/** Resultado do Rust válido para a regra de topologia equivalente por região (ver o bloco acima). */
export function resultadoRustValido(m: MultiPolygon): boolean {
  for (const p of m) {
    const aneis = p.map(semRepetidosSeguidos);
    if (aneis.some((r) => r.length < 3)) return false;
    for (const r of aneis) {
      for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) if (mesmoPontoV(r[i]!, r[j]!)) return false;
    }
    const arestas = aneis.flatMap((r, ai) => r.map((q, i) => ({ ai, i, n: r.length, a: q, b: r[(i + 1) % r.length]! })));
    for (let x = 0; x < arestas.length; x++) {
      for (let y = x + 1; y < arestas.length; y++) {
        const e = arestas[x]!;
        const f = arestas[y]!;
        if (e.ai === f.ai) {
          if ((e.i + 1) % e.n === f.i || (f.i + 1) % f.n === e.i) continue;
          if (segmentosTocam(e.a, e.b, f.a, f.b)) return false;
        } else if (segmentosCruzam(e.a, e.b, f.a, f.b)) return false;
      }
    }
    const [externo, ...furos] = aneis;
    for (const h of furos) {
      const pt = pontoInteriorDoAnel(h);
      if (!pt || !dentroDoAnel(pt, externo!)) return false;
    }
  }
  return true;
}
