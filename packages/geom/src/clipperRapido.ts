import * as ClipperLib from 'clipper-lib';

/**
 * D4 · aceleração do Clipper-lib sem mudar nenhum resultado.
 * Em uniões de camadas que se tocam em arcos (centenas de vértices coincidentes), o `JoinCommonEdges` do Clipper faz centenas de
 * junções e cada `FixupFirstLefts1/2` testa todos os contornos vivos com `PointInPolygon` contra o anel inteiro (O(n) por teste):
 * medido no projeto principal do dono, 67 mil testes em anéis de ~340 vértices = ~1 s numa única união.
 * Aqui o anel de referência é indexado por faixas de Y UMA vez por `FixupFirstLefts` (os anéis não mudam dentro do laço) e cada
 * teste olha só as arestas da faixa do ponto, com a mesma aritmética e o mesmo critério de fronteira: resultado idêntico.
 */
interface OutPtLike { Pt: { X: number; Y: number }; Next: OutPtLike }
interface OutRecLike { Pts: OutPtLike | null; FirstLeft: OutRecLike | null }
interface ClipperLike {
  m_PolyOuts: OutRecLike[];
  PointInPolygon(pt: { X: number; Y: number }, op: OutPtLike): number;
  Poly2ContainsPoly1(a: OutPtLike, b: OutPtLike): boolean;
  FixupFirstLefts1(oldOut: OutRecLike, newOut: OutRecLike): void;
  FixupFirstLefts2(inner: OutRecLike, outer: OutRecLike): void;
}
/** Anel indexado por faixas de Y: o teste de um ponto só olha as arestas que cruzam (ou tocam) a altura do ponto. */
interface Anel {
  ini: OutPtLike;
  x0: number; y0: number; x1: number; y1: number;
  /** arestas (x0,y0,x1,y1 consecutivos) e, por faixa, os índices das arestas que a tocam */
  e: Float64Array;
  faixas: Int32Array[];
  h: number;
}

function indexar(ini: OutPtLike): Anel {
  const xs: number[] = [], ys: number[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let o = ini;
  do {
    const { X, Y } = o.Pt;
    xs.push(X); ys.push(Y);
    if (X < x0) x0 = X;
    if (X > x1) x1 = X;
    if (Y < y0) y0 = Y;
    if (Y > y1) y1 = Y;
    o = o.Next;
  } while (o !== ini);
  const n = xs.length;
  const nf = Math.max(1, Math.min(64, n >> 2));
  const h = (y1 - y0) / nf || 1;
  const e = new Float64Array(n * 4);
  const listas: number[][] = Array.from({ length: nf }, () => []);
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    e[i * 4] = xs[i]!; e[i * 4 + 1] = ys[i]!; e[i * 4 + 2] = xs[j]!; e[i * 4 + 3] = ys[j]!;
    const a = Math.min(nf - 1, Math.floor((Math.min(ys[i]!, ys[j]!) - y0) / h));
    const b = Math.min(nf - 1, Math.floor((Math.max(ys[i]!, ys[j]!) - y0) / h));
    for (let k = a; k <= b; k++) listas[k]!.push(i);
  }
  return { ini, x0, y0, x1, y1, e, faixas: listas.map((l) => Int32Array.from(l)), h };
}

/** `PointInPolygon` do Clipper (0 fora, 1 dentro, -1 na fronteira) restrito às arestas da faixa do ponto: mesmo resultado (a paridade e a fronteira não dependem da ordem). */
function pip(px: number, py: number, r: Anel): number {
  if (px < r.x0 || px > r.x1 || py < r.y0 || py > r.y1) return 0;
  const f = r.faixas[Math.min(r.faixas.length - 1, Math.floor((py - r.y0) / r.h))]!;
  const e = r.e;
  let result = 0;
  for (let q = 0; q < f.length; q++) {
    const k = f[q]! * 4;
    const ax = e[k]!, ay = e[k + 1]!, bx = e[k + 2]!, by = e[k + 3]!;
    if (by === py) {
      if (bx === px || (ay === py && (bx > px) === (ax < px))) return -1;
    }
    if ((ay < py) !== (by < py)) {
      if (ax >= px) {
        if (bx > px) result = 1 - result;
        else {
          const d = (ax - px) * (by - py) - (bx - px) * (ay - py);
          if (d === 0) return -1;
          if ((d > 0) === (by > ay)) result = 1 - result;
        }
      } else if (bx > px) {
        const d = (ax - px) * (by - py) - (bx - px) * (ay - py);
        if (d === 0) return -1;
        if ((d > 0) === (by > ay)) result = 1 - result;
      }
    }
  }
  return result;
}

/** Mesmo que `Poly2ContainsPoly1(p1, p2)`, com o anel de `p2` já indexado. */
function contem(p1: OutPtLike, r: Anel): boolean {
  let op = p1;
  do {
    const res = pip(op.Pt.X, op.Pt.Y, r);
    if (res >= 0) return res > 0;
    op = op.Next;
  } while (op !== p1);
  return true;
}

const parseFirstLeft = (f: OutRecLike | null): OutRecLike | null => {
  while (f !== null && f.Pts === null) f = f.FirstLeft;
  return f;
};

let instalado = false;
export function instalarClipperRapido(): void {
  if (instalado) return;
  instalado = true;
  const P = ClipperLib.Clipper.prototype as unknown as ClipperLike;
  P.FixupFirstLefts1 = function (this: ClipperLike, oldOut, newOut): void {
    let rn: Anel | null = null;
    for (let i = 0, n = this.m_PolyOuts.length; i < n; i++) {
      const o = this.m_PolyOuts[i]!;
      const fl = parseFirstLeft(o.FirstLeft);
      if (o.Pts !== null && fl === oldOut && newOut.Pts) {
        rn ??= indexar(newOut.Pts);
        if (contem(o.Pts, rn)) o.FirstLeft = newOut;
      }
    }
  };
  P.FixupFirstLefts2 = function (this: ClipperLike, inner, outer): void {
    const orfl = outer.FirstLeft;
    let bi: Anel | null = null, bo: Anel | null = null;
    for (let i = 0, n = this.m_PolyOuts.length; i < n; i++) {
      const o = this.m_PolyOuts[i]!;
      if (o.Pts === null || o === outer || o === inner) continue;
      const fl = parseFirstLeft(o.FirstLeft);
      if (fl !== orfl && fl !== inner && fl !== outer) continue;
      bi ??= indexar(inner.Pts!);
      if (contem(o.Pts, bi)) o.FirstLeft = inner;
      else {
        bo ??= indexar(outer.Pts!);
        if (contem(o.Pts, bo)) o.FirstLeft = outer;
        else if (o.FirstLeft === inner || o.FirstLeft === outer) o.FirstLeft = orfl;
      }
    }
  };
}
