import polygonClipping from 'polygon-clipping';
import * as ClipperLib from 'clipper-lib';
import { multiArea, ringArea, type MultiPolygon, type Polygon, type Ring } from './polygon.ts';

type Pair = [number, number];
type PcRing = Pair[];
type PcPolygon = PcRing[];
type PcMulti = PcPolygon[];

/** Resolução de arredondamento: 1e-7 m (0,1 µm) estabiliza coordenadas quase coincidentes. */
const SNAP = 1e7;
const snap = (n: number): number => Math.round(n * SNAP) / SNAP;

function toPc(m: MultiPolygon): PcMulti {
  return m
    .map((p) => p.filter((r) => r.length >= 3).map((r): PcRing => r.map((v): Pair => [snap(v.x), snap(v.y)])))
    .filter((p) => p.length > 0);
}

function fromPc(m: PcMulti): MultiPolygon {
  return m.map(
    (p): Polygon =>
      p.map((r): Ring => {
        const pts = r.map(([x, y]) => ({ x, y }));
        const first = pts[0];
        const last = pts[pts.length - 1];
        if (first && last && first.x === last.x && first.y === last.y) pts.pop();
        return pts;
      }),
  );
}

export const asMulti = (r: Ring): MultiPolygon => [[r]];

/** Operação booleana pública (chaves da telemetria). */
export type BoolOp = 'union' | 'difference' | 'intersection';

/**
 * Telemetria do plano A (polygon-clipping) e do plano B (Clipper). Contadores e cronômetros de `performance.now`
 * por chamada: custo desprezível comparado à operação, e nenhum efeito no resultado.
 */
export interface BooleanStats {
  /** Chamadas que chegaram ao polygon-clipping (sem atalhos triviais de vazio). */
  calls: Record<BoolOp, number>;
  /** Tentativas exatas feitas (polygon-clipping), e as que lançaram (cada uma cai no Clipper). */
  exactTries: number;
  exactFails: number;
  /** Diferenças pedidas direto ao Clipper (`differenceClipper`), sem tentar o polygon-clipping. */
  clipperDirect: number;
  /** Tempo (ms) somado nas tentativas que lançaram e nas que deram certo. */
  failMs: number;
  okMs: number;
  /** Vértices de entrada somados nas tentativas que lançaram. */
  failVertices: number;
  /** Motivo do erro do polygon-clipping (sem números) → quantas quedas para o Clipper. */
  failReasons: Record<string, number>;
}

const emptyStats = (): BooleanStats => ({
  calls: { union: 0, difference: 0, intersection: 0 },
  exactTries: 0,
  exactFails: 0,
  clipperDirect: 0,
  failMs: 0,
  okMs: 0,
  failVertices: 0,
  failReasons: {},
});

let stats = emptyStats();

/** Cópia da telemetria acumulada desde o último `resetBooleanStats`. */
export function booleanStats(): BooleanStats {
  return { ...stats, calls: { ...stats.calls }, failReasons: { ...stats.failReasons } };
}

export function resetBooleanStats(): void {
  stats = emptyStats();
}

/** Motivo estável do erro: sem números, `#`, `[` ou `(` (o polygon-clipping põe coordenadas na mensagem). */
const reasonOf = (e: unknown): string => {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/[#[(].*$/, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'erro sem mensagem';
};

const vertexCount = (m: PcMulti): number => m.reduce((s, p) => s + p.reduce((t, r) => t + r.length, 0), 0);

/**
 * polygon-clipping é exato, mas lança em entradas quase degeneradas (anéis que quase se tocam, arestas
 * colineares com erro de micrômetros). Nesse caso refazemos a operação com Clipper, que trabalha em inteiros e
 * nunca lança: o resultado perde a precisão abaixo de 1 µm, o que é irrelevante para paredes.
 */
function robust(op: BoolOp, ops: PcMulti[], exact: () => PcMulti, fallback: () => MultiPolygon): MultiPolygon {
  stats.calls[op]++;
  const t0 = performance.now();
  try {
    const out = fromPc(exact());
    stats.exactTries++;
    stats.okMs += performance.now() - t0;
    return out;
  } catch (e) {
    stats.exactTries++;
    stats.exactFails++;
    stats.failMs += performance.now() - t0;
    stats.failVertices += ops.reduce((s, m) => s + vertexCount(m), 0);
    const reason = reasonOf(e);
    stats.failReasons[reason] = (stats.failReasons[reason] ?? 0) + 1;
    return fallback();
  }
}

/**
 * Diferença direto pelo Clipper (plano B), sem tentar o polygon-clipping. Mesmo resultado que o fallback de
 * `difference`: `clipperBinary` em sequência sobre cada subtraendo. Para subtrações pequenas e de precisão de
 * parede (retornos de acabamento no vão), evita o sweep line do polygon-clipping, que pode entrar em laço.
 */
export function differenceClipper(a: MultiPolygon, ...bs: MultiPolygon[]): MultiPolygon {
  if (a.length === 0) return [];
  const subs = bs.filter((m) => m.length > 0);
  if (subs.length === 0) return a;
  stats.clipperDirect++;
  return subs.reduce((acc, m) => clipperBinary(acc, m, ClipperLib.ClipType.ctDifference), a);
}

export function union(...ms: MultiPolygon[]): MultiPolygon {
  const parts = ms.filter((m) => m.length > 0);
  if (parts.length === 0) return [];
  const pcs = parts.map(toPc);
  const [first, ...rest] = pcs;
  return robust(
    'union',
    pcs,
    () => polygonClipping.union(first!, ...rest),
    () => parts.slice(1).reduce((acc, m) => clipperBinary(acc, m, ClipperLib.ClipType.ctUnion), parts[0]!),
  );
}

export function difference(a: MultiPolygon, ...bs: MultiPolygon[]): MultiPolygon {
  if (a.length === 0) return [];
  const subs = bs.filter((m) => m.length > 0);
  if (subs.length === 0) return a;
  const pcs = [toPc(a), ...subs.map(toPc)];
  return robust(
    'difference',
    pcs,
    () => polygonClipping.difference(pcs[0]!, ...pcs.slice(1)),
    () => differenceClipper(a, ...subs),
  );
}

export function intersection(a: MultiPolygon, b: MultiPolygon): MultiPolygon {
  if (a.length === 0 || b.length === 0) return [];
  const pcs = [toPc(a), toPc(b)];
  return robust(
    'intersection',
    pcs,
    () => polygonClipping.intersection(pcs[0]!, pcs[1]!),
    () => clipperBinary(a, b, ClipperLib.ClipType.ctIntersection),
  );
}

const CLIP_SCALE = 1e6;

/** Limite do Clipper em `Number` (`ClipperBase.loRange`): acima dele cada produto vira Int128/BigInteger (muito mais lento). */
const CLIP_LO_RANGE = 47453132;
type ClipPath = Array<{ X: number; Y: number }>;

/**
 * Cena grande (linha de corte/elevação de dezenas de metros a 1 µm passa de 47 m em inteiros): translada os caminhos, em
 * lugar, por um inteiro para centrar a caixa. Só age quando alguma coordenada passa do limite; com a caixa cabendo, o
 * Clipper fica na aritmética rápida. A translação é inteira, o resultado volta somando o mesmo deslocamento.
 */
function centrarCaminhos(grupos: ReadonlyArray<readonly ClipPath[]>): { ox: number; oy: number } {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const g of grupos) for (const path of g) for (const q of path) {
    if (q.X < x0) x0 = q.X;
    if (q.X > x1) x1 = q.X;
    if (q.Y < y0) y0 = q.Y;
    if (q.Y > y1) y1 = q.Y;
  }
  if (!(Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1)) > CLIP_LO_RANGE)) return { ox: 0, oy: 0 };
  const ox = Math.round((x0 + x1) / 2), oy = Math.round((y0 + y1) / 2);
  for (const g of grupos) for (const path of g) for (const q of path) { q.X -= ox; q.Y -= oy; }
  return { ox, oy };
}

const toClipPath = (r: Ring): Array<{ X: number; Y: number }> => r.map((v) => ({ X: Math.round(v.x * CLIP_SCALE), Y: Math.round(v.y * CLIP_SCALE) }));

/** Resultado do Clipper (árvore) como multipolígono com furos. */
function fromTree(tree: ClipperLib.PolyTree, ox = 0, oy = 0): MultiPolygon {
  const out: MultiPolygon = [];
  const toRing = (path: Array<{ X: number; Y: number }>): Ring => path.map((q) => ({ x: (q.X + ox) / CLIP_SCALE, y: (q.Y + oy) / CLIP_SCALE }));
  const walk = (node: ClipperLib.PolyNode): void => {
    for (const child of node.Childs()) {
      if (child.IsHole()) continue;
      const poly: Polygon = [toRing(child.Contour())];
      for (const h of child.Childs()) {
        poly.push(toRing(h.Contour()));
        walk(h);
      }
      out.push(poly);
    }
  };
  walk(tree);
  return out;
}

/**
 * Caminhos de um operando com orientação normalizada (externo anti-horário, furos horários) para a regra de
 * enrolamento não-zero: polígonos sobrepostos dentro do mesmo operando somam (não se anulam, como na regra
 * par-ímpar) e cada furo só vale dentro do seu próprio polígono.
 */
function operandPaths(m: MultiPolygon): Array<Array<{ X: number; Y: number }>> {
  return m.flatMap((poly) =>
    poly.map((ring, i) => {
      const ccw = ringArea(ring) > 0;
      const oriented = ccw === (i === 0) ? ring : [...ring].reverse();
      return toClipPath(oriented);
    }),
  );
}

/**
 * União de vários multipolígonos numa única chamada do Clipper (inteiros a 1 µm, enrolamento não-zero).
 * Mais lenta que `union`, mas não perde área em silêncio: o polygon-clipping, em uniões grandes de peças quase
 * coincidentes, às vezes devolve um resultado menor sem lançar erro (medido nas sementes 3, 9, 10 e 14 dos testes
 * de propriedade). Use onde a área total importa: regiões e silhuetas do aglomerado.
 */
export function unionClipper(...ms: MultiPolygon[]): MultiPolygon {
  const parts = ms.filter((m) => m.length > 0);
  if (parts.length === 0) return [];
  const paths = parts.flatMap(operandPaths);
  const { ox, oy } = centrarCaminhos([paths]);
  const clip = new ClipperLib.Clipper();
  clip.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  clip.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromTree(tree, ox, oy);
}

/** Operação booleana binária com Clipper (inteiros, não lança). */
function clipperBinary(a: MultiPolygon, b: MultiPolygon, type: ClipperLib.ClipType): MultiPolygon {
  const pa = operandPaths(a);
  const pb = operandPaths(b);
  const { ox, oy } = centrarCaminhos([pa, pb]);
  const clip = new ClipperLib.Clipper();
  clip.AddPaths(pa, ClipperLib.PolyType.ptSubject, true);
  clip.AddPaths(pb, ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  clip.Execute(type, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromTree(tree, ox, oy);
}

/**
 * Fechamento morfológico (dilata e contrai por `eps` metros) com Clipper, que trabalha em inteiros.
 * Cola polígonos que se tocam por frestas numéricas de micrômetros — as junções de paredes produzem
 * vértices em "T" que o arredondamento deixa levemente fora da aresta vizinha.
 */
export function closeGaps(m: MultiPolygon, eps = 3e-6): MultiPolygon {
  if (m.length === 0) return m;
  const toPath = (r: Ring): Array<{ X: number; Y: number }> => r.map((v) => ({ X: Math.round(v.x * CLIP_SCALE), Y: Math.round(v.y * CLIP_SCALE) }));
  const paths = m.flatMap((p) => p.map(toPath));
  const { ox, oy } = centrarCaminhos([paths]);
  const up: ClipperLib.Paths = [];
  const co = new ClipperLib.ClipperOffset(2, 0.25 * CLIP_SCALE * eps);
  co.AddPaths(paths, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  co.Execute(up, eps * CLIP_SCALE);
  // união dos caminhos dilatados (preenchimento não-zero) e depois contração
  const clip = new ClipperLib.Clipper();
  clip.AddPaths(up, ClipperLib.PolyType.ptSubject, true);
  const merged: ClipperLib.Paths = [];
  clip.Execute(ClipperLib.ClipType.ctUnion, merged, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const down: ClipperLib.Paths = [];
  const co2 = new ClipperLib.ClipperOffset(2, 0.25 * CLIP_SCALE * eps);
  co2.AddPaths(merged, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  co2.Execute(down, -eps * CLIP_SCALE);
  const tree = new ClipperLib.PolyTree();
  const clip2 = new ClipperLib.Clipper();
  clip2.AddPaths(down, ClipperLib.PolyType.ptSubject, true);
  clip2.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  const out: MultiPolygon = [];
  const toRing = (path: Array<{ X: number; Y: number }>): Ring => path.map((q) => ({ x: (q.X + ox) / CLIP_SCALE, y: (q.Y + oy) / CLIP_SCALE }));
  const walk = (node: ClipperLib.PolyNode): void => {
    for (const child of node.Childs()) {
      if (!child.IsHole()) {
        const poly: Polygon = [toRing(child.Contour())];
        for (const h of child.Childs()) {
          poly.push(toRing(h.Contour()));
          walk(h);
        }
        out.push(poly);
      }
    }
  };
  walk(tree);
  return out;
}

/**
 * `closeGaps` que nunca perde área: o fechamento morfológico descarta anéis finos em zigue-zague (quase
 * colineares), o que apagaria trechos reais de parede da silhueta. Se a área mudar além do ruído de
 * micrômetros, devolve a entrada intacta.
 */
export function closeGapsSafe(m: MultiPolygon, eps = 3e-6, maxLoss = 2e-5): MultiPolygon {
  const closed = closeGaps(m, eps);
  const delta = multiArea(closed) - multiArea(m);
  // Ganho = frestas coladas (esperado, micrômetros); perda = anéis finos descartados (inaceitável).
  return delta >= -maxLoss && delta <= 1e-3 ? closed : m;
}

/** Dilata (delta > 0) ou contrai (delta < 0) um multipolígono com Clipper, cantos em esquadria. Furos acompanham. */
export function offsetMulti(m: MultiPolygon, delta: number): MultiPolygon {
  if (m.length === 0) return [];
  const co = new ClipperLib.ClipperOffset(2, 0.25 * CLIP_SCALE * Math.abs(delta));
  co.AddPaths(m.flatMap((_, i) => operandPaths([m[i]!])), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, delta * CLIP_SCALE);
  return fromTree(tree);
}
