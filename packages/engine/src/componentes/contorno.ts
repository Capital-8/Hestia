/*
 * Geometria 2D de contornos de peça (ADR 0049 §3.3). FICHA E2-contorno: implementar as funções abaixo. Testes em
 * `contorno.test.ts`. Funções puras e numéricas; pontos achatados `[u0, v0, u1, v1, …]` em METROS, no plano da chapa
 * (origem no canto mínimo). Esta é geometria que o Rust vai espelhar (fatia C): mantenha cada função pequena e sem
 * dependências além dos números. Convenção do plano: ver `PecaResolvida.contorno` em `pecas.ts`.
 */

export const CONTORNO_MAX_PONTOS = 256;
/** Área mínima (m2) para um contorno contar como tendo área. */
export const CONTORNO_AREA_MIN = 1e-9;

export interface CaixaPlana { u0: number; v0: number; u1: number; v1: number }

/** Tolerância (m) para igualdade de pontos, colinearidade e toque entre arestas. */
const TOLERANCIA = 1e-9;

function pontoU(pts: readonly number[], i: number): number {
  return pts[i * 2]!;
}

function pontoV(pts: readonly number[], i: number): number {
  return pts[i * 2 + 1]!;
}

function pontosIguais(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) <= TOLERANCIA && Math.abs(ay - by) <= TOLERANCIA;
}

/** Produto vetorial (b - a) × (c - a): positivo se c está à esquerda de a→b. */
function orientacao(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Ponto sobre o segmento (inclusive extremos), com tolerância de `TOLERANCIA` metros. */
function pontoSobreSegmento(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  const du = bx - ax;
  const dv = by - ay;
  const comprimento = Math.hypot(du, dv);
  if (comprimento <= TOLERANCIA) return pontosIguais(px, py, ax, ay);
  const distancia = Math.abs(orientacao(ax, ay, bx, by, px, py)) / comprimento;
  if (distancia > TOLERANCIA) return false;
  const projecao = (px - ax) * du + (py - ay) * dv;
  const limite = TOLERANCIA * comprimento;
  return projecao >= -limite && projecao <= comprimento * comprimento + limite;
}

function caixasSobrepostas(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const minAx = Math.min(ax, bx);
  const maxAx = Math.max(ax, bx);
  const minAy = Math.min(ay, by);
  const maxAy = Math.max(ay, by);
  const minCx = Math.min(cx, dx);
  const maxCx = Math.max(cx, dx);
  const minCy = Math.min(cy, dy);
  const maxCy = Math.max(cy, dy);
  return minAx - TOLERANCIA <= maxCx && minCx - TOLERANCIA <= maxAx && minAy - TOLERANCIA <= maxCy && minCy - TOLERANCIA <= maxAy;
}

/** Segmentos AB e CD se cruzam ou se tocam em qualquer ponto (inclui colinear sobreposto). */
function segmentosSeTocam(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  if (!caixasSobrepostas(ax, ay, bx, by, cx, cy, dx, dy)) return false;
  const d1 = orientacao(ax, ay, bx, by, cx, cy);
  const d2 = orientacao(ax, ay, bx, by, dx, dy);
  const d3 = orientacao(cx, cy, dx, dy, ax, ay);
  const d4 = orientacao(cx, cy, dx, dy, bx, by);
  const opostos = (p: number, q: number): boolean => (p > 0 && q < 0) || (p < 0 && q > 0);
  if (opostos(d1, d2) && opostos(d3, d4)) return true;
  if (pontoSobreSegmento(cx, cy, ax, ay, bx, by)) return true;
  if (pontoSobreSegmento(dx, dy, ax, ay, bx, by)) return true;
  if (pontoSobreSegmento(ax, ay, cx, cy, dx, dy)) return true;
  if (pontoSobreSegmento(bx, by, cx, cy, dx, dy)) return true;
  return false;
}

/** Duas arestas vizinhas (que compartilham um vértice) só podem tocar nesse vértice; colineares sobrepostas reprovam. */
function vizinhasSobrepostas(pts: readonly number[], arestaA: number, arestaB: number, compartilhado: number): boolean {
  const n = pts.length / 2;
  const a0 = arestaA;
  const a1 = (arestaA + 1) % n;
  const b0 = arestaB;
  const b1 = (arestaB + 1) % n;
  const outroA = compartilhado === a0 ? a1 : a0;
  const outroB = compartilhado === b0 ? b1 : b0;
  return pontoSobreSegmento(pontoU(pts, outroA), pontoV(pts, outroA), pontoU(pts, b0), pontoV(pts, b0), pontoU(pts, b1), pontoV(pts, b1))
    || pontoSobreSegmento(pontoU(pts, outroB), pontoV(pts, outroB), pontoU(pts, a0), pontoV(pts, a0), pontoU(pts, a1), pontoV(pts, a1));
}

/** Área com sinal pela fórmula do cadarço (shoelace): positiva no sentido anti-horário. Menos de 3 pontos = 0. */
export function areaContorno(pts: readonly number[]): number {
  const n = Math.floor(pts.length / 2);
  if (n < 3) return 0;
  let soma = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    soma += pontoU(pts, i) * pontoV(pts, j) - pontoU(pts, j) * pontoV(pts, i);
  }
  return soma / 2;
}

/**
 * Motivo (em português) pelo qual o contorno é inválido, ou `null` se é válido. Verificações, NESTA ordem:
 *  1. quantidade ímpar de números, ou menos de 3 pontos → 'contorno precisa de ao menos 3 pontos';
 *  2. mais de CONTORNO_MAX_PONTOS pontos → 'contorno com pontos demais';
 *  3. algum valor não finito → 'contorno com valor inválido';
 *  4. dois pontos consecutivos iguais (inclusive o último e o primeiro) → 'contorno com pontos repetidos';
 *  5. |área| < CONTORNO_AREA_MIN → 'contorno sem área';
 *  6. duas arestas não vizinhas que se cruzam OU se tocam (inclusive um vértice sobre outra aresta) → 'contorno se cruza'.
 *     Arestas vizinhas só podem compartilhar o vértice comum; se forem colineares sobrepostas também é 'contorno se cruza'.
 * Tolerância de 1e-9 m nas comparações de igualdade e de toque.
 */
export function validarContorno(pts: readonly number[]): string | null {
  if (pts.length % 2 !== 0 || pts.length < 6) return 'contorno precisa de ao menos 3 pontos';
  const n = pts.length / 2;
  if (n > CONTORNO_MAX_PONTOS) return 'contorno com pontos demais';
  for (const valor of pts) {
    if (!Number.isFinite(valor)) return 'contorno com valor inválido';
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (pontosIguais(pontoU(pts, i), pontoV(pts, i), pontoU(pts, j), pontoV(pts, j))) return 'contorno com pontos repetidos';
  }
  if (Math.abs(areaContorno(pts)) < CONTORNO_AREA_MIN) return 'contorno sem área';
  for (let i = 0; i < n; i++) {
    const a1 = (i + 1) % n;
    for (let j = i + 1; j < n; j++) {
      const b1 = (j + 1) % n;
      const vizinhas = j === i + 1 || (i === 0 && j === n - 1);
      if (vizinhas) {
        const compartilhado = j === i + 1 ? j : 0;
        if (vizinhasSobrepostas(pts, i, j, compartilhado)) return 'contorno se cruza';
        continue;
      }
      if (segmentosSeTocam(pontoU(pts, i), pontoV(pts, i), pontoU(pts, a1), pontoV(pts, a1), pontoU(pts, j), pontoV(pts, j), pontoU(pts, b1), pontoV(pts, b1))) {
        return 'contorno se cruza';
      }
    }
  }
  return null;
}

/** Cópia em sentido anti-horário: se a área é negativa, inverte a ordem dos PONTOS (pares), senão devolve cópia igual. */
export function orientarAntiHorario(pts: readonly number[]): number[] {
  const copia = [...pts];
  if (areaContorno(copia) >= 0) return copia;
  const invertido: number[] = [];
  for (let i = copia.length - 2; i >= 0; i -= 2) invertido.push(copia[i]!, copia[i + 1]!);
  return invertido;
}

/** Retângulo `a × b` com origem no canto mínimo, anti-horário: `[0,0, a,0, a,b, 0,b]`. */
export function retanguloComoContorno(a: number, b: number): number[] {
  return [0, 0, a, 0, a, b, 0, b];
}

/** Caixa que envolve os pontos. Sem pontos: lança `Error('contorno vazio')`. */
export function caixaDoContorno(pts: readonly number[]): CaixaPlana {
  if (pts.length === 0) throw new Error('contorno vazio');
  let u0 = pts[0]!;
  let v0 = pts[1]!;
  let u1 = u0;
  let v1 = v0;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const u = pts[i]!;
    const v = pts[i + 1]!;
    if (u < u0) u0 = u;
    if (u > u1) u1 = u;
    if (v < v0) v0 = v;
    if (v > v1) v1 = v;
  }
  return { u0, v0, u1, v1 };
}

/** Ponto dentro do polígono pela regra par-ímpar; ponto sobre a borda conta como dentro (tolerância 1e-9). */
export function pontoDentro(pts: readonly number[], u: number, v: number): boolean {
  const n = Math.floor(pts.length / 2);
  if (n < 3) return false;
  let dentro = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ui = pontoU(pts, i);
    const vi = pontoV(pts, i);
    const uj = pontoU(pts, j);
    const vj = pontoV(pts, j);
    if (pontoSobreSegmento(u, v, uj, vj, ui, vi)) return true;
    if ((vi > v) !== (vj > v)) {
      const cruzamento = ((uj - ui) * (v - vi)) / (vj - vi) + ui;
      if (u < cruzamento) dentro = !dentro;
    }
  }
  return dentro;
}
