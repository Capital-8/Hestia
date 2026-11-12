import { closestOnSegment, intersectSegments, v2, type Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import type { InferContext } from './infer.ts';
import type { AddCandidate } from './snapExtras.ts';
import type { SnapKind, SnapOptions } from './types.ts';

/**
 * Pontos e arestas de captura já INDEXADOS: o conjunto grande e estável (escadas, rampas e guarda-corpos do nível, com
 * milhares de pontos) é indexado uma vez por projeto e nível, e cada consulta do cursor custa só o que está perto dele.
 * Sem o índice, cada movimento do mouse varria todos os pontos e arestas (e alocava uma referência por ponto): com 100
 * escadas isso passava de 25 ms por consulta. Os candidatos que saem daqui são os MESMOS de `addExtraPoints`,
 * `addExtraSegments` e dos cruzamentos de planta: só a busca é outra.
 *
 * - Pontos: ordenados por x e por y. A faixa `|x - cursor.x| <= tol` serve à captura (o ponto está perto do cursor) e ao
 *   alinhamento vertical (qualquer ponto na faixa dá uma linha x = ref); a faixa em y, ao alinhamento horizontal.
 * - Arestas: grade de células de 1 m; cada aresta fica em todas as células que sua caixa toca.
 */
export interface PontoIndexado extends Vec2 {
  hostId?: Id;
  kind?: SnapKind;
}

export interface ArestaIndexada {
  a: Vec2;
  b: Vec2;
  hostId?: Id;
  kind?: SnapKind;
}

const CELULA = 1;
const celula = (v: number): number => Math.floor(v / CELULA);
/** Chave numérica da célula (coordenadas inteiras limitadas a ±1e6 células). */
const chave = (ix: number, iy: number): number => (ix + 1_000_000) * 2_000_000 + (iy + 1_000_000);

const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** Primeiro índice de `arr` (ordenado por `key`) com valor >= `v`. */
function primeiro<T>(arr: readonly T[], key: (t: T) => number, v: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]!) < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export class SnapIndexado {
  readonly pontos: readonly PontoIndexado[];
  readonly arestas: readonly ArestaIndexada[];
  private readonly porX: PontoIndexado[];
  private readonly porY: PontoIndexado[];
  private readonly celulas = new Map<number, number[]>();
  /** Marca da última consulta que viu cada aresta (uma aresta que toca várias células conta uma vez por consulta). */
  private readonly visto: Int32Array;
  private consulta = 0;

  constructor(pontos: readonly PontoIndexado[], arestas: readonly ArestaIndexada[]) {
    this.pontos = pontos;
    this.arestas = arestas;
    this.porX = [...pontos].sort((p, q) => p.x - q.x);
    this.porY = [...pontos].sort((p, q) => p.y - q.y);
    this.visto = new Int32Array(arestas.length);
    arestas.forEach((e, i) => {
      for (let ix = celula(Math.min(e.a.x, e.b.x)); ix <= celula(Math.max(e.a.x, e.b.x)); ix++) {
        for (let iy = celula(Math.min(e.a.y, e.b.y)); iy <= celula(Math.max(e.a.y, e.b.y)); iy++) {
          const k = chave(ix, iy);
          const lista = this.celulas.get(k);
          if (lista) lista.push(i);
          else this.celulas.set(k, [i]);
        }
      }
    });
  }

  /** Pontos com |x - cx| <= tol (faixa vertical em volta do cursor). */
  naFaixaX(cx: number, tol: number, f: (q: PontoIndexado) => void): void {
    for (let i = primeiro(this.porX, (q) => q.x, cx - tol); i < this.porX.length && this.porX[i]!.x <= cx + tol; i++) f(this.porX[i]!);
  }

  /** Pontos com |y - cy| <= tol (faixa horizontal em volta do cursor). */
  naFaixaY(cy: number, tol: number, f: (q: PontoIndexado) => void): void {
    for (let i = primeiro(this.porY, (q) => q.y, cy - tol); i < this.porY.length && this.porY[i]!.y <= cy + tol; i++) f(this.porY[i]!);
  }

  /** Arestas cuja caixa (expandida por `reach`) contém o cursor; o filtro fino (distância) fica com quem chama. */
  pertoDe(cursor: Vec2, reach: number, f: (e: ArestaIndexada) => void): void {
    const marca = ++this.consulta;
    for (let ix = celula(cursor.x - reach); ix <= celula(cursor.x + reach); ix++) {
      for (let iy = celula(cursor.y - reach); iy <= celula(cursor.y + reach); iy++) {
        const lista = this.celulas.get(chave(ix, iy));
        if (!lista) continue;
        for (const i of lista) {
          if (this.visto[i] === marca) continue;
          this.visto[i] = marca;
          const e = this.arestas[i]!;
          if (cursor.x < Math.min(e.a.x, e.b.x) - reach || cursor.x > Math.max(e.a.x, e.b.x) + reach) continue;
          if (cursor.y < Math.min(e.a.y, e.b.y) - reach || cursor.y > Math.max(e.a.y, e.b.y) + reach) continue;
          f(e);
        }
      }
    }
  }
}

/** O dono do ponto/aresta está fora da captura (em `ignore` ou oculto na vista)? */
const fora = (ctx: InferContext, hostId: Id | undefined): boolean => hostId !== undefined && (ctx.ignore?.has(hostId) === true || ctx.hiddenIds?.has(hostId) === true);

/** Pontos indexados ao alcance do cursor: mesmos tipos e mesmas chaves de ligação de `addExtraPoints`. */
export function addIndexedPoints(ctx: InferContext, sn: SnapOptions, cursor: Vec2, tol: number, add: AddCandidate): void {
  if (ctx.onWallsOnly) return;
  const reach = tol * tol;
  for (const ix of ctx.indexed ?? []) {
    ix.naFaixaX(cursor.x, tol, (q) => {
      if (fora(ctx, q.hostId) || dist2(cursor, q) > reach) return;
      const kind = q.kind ?? 'endpoint';
      if ((kind === 'endpoint' && sn.endpoint === false) || ((kind === 'center' || kind === 'midpoint') && sn.midpoint === false) || (kind === 'face' && !sn.faces)) return;
      add(v2(q.x, q.y), kind, [], q.hostId);
    });
  }
}

/** Arestas indexadas ao alcance do cursor: pé da perpendicular (`nearest`) e pé a partir do ponto anterior, como em `addExtraSegments`. */
export function addIndexedSegments(ctx: InferContext, sn: SnapOptions, cursor: Vec2, tol: number, add: AddCandidate): void {
  if (ctx.onWallsOnly || (!sn.faces && !(sn.perpendicular && ctx.from))) return;
  const reach = tol * tol;
  for (const ix of ctx.indexed ?? []) {
    ix.pertoDe(cursor, tol, (e) => {
      if (fora(ctx, e.hostId) || dist2(e.a, e.b) < 1e-18) return;
      const kind = e.kind ?? 'nearest';
      const foot = closestOnSegment(cursor, e.a, e.b);
      if (sn.faces && dist2(cursor, foot) <= reach) add(foot, kind, [], e.hostId);
      if (sn.perpendicular && ctx.from) {
        const pf = closestOnSegment(ctx.from, e.a, e.b);
        if (dist2(cursor, pf) <= reach && dist2(pf, ctx.from) > 1e-12) add(pf, 'perpendicular', [{ from: ctx.from, to: pf, kind: 'perpendicular' }], e.hostId);
      }
    });
  }
}

/** Cruzamento de duas arestas (fora dos vértices): 1 nm de folga, como em `addPlanCrossings`. */
const SAME_POINT_2 = 1e-18;

/**
 * Arestas ao alcance do cursor, de TODAS as fontes (as extras sem índice e as indexadas): entrada do cruzamento de planta.
 */
export function arestasProximas(ctx: InferContext, cursor: Vec2, reach: number): ArestaIndexada[] {
  const out: ArestaIndexada[] = [];
  const reach2 = reach * reach;
  const aceita = (e: ArestaIndexada): void => {
    if (fora(ctx, e.hostId) || dist2(e.a, e.b) < 1e-18) return;
    if (dist2(cursor, closestOnSegment(cursor, e.a, e.b)) <= reach2) out.push(e);
  };
  for (const e of ctx.extraSegments ?? []) {
    if (cursor.x < Math.min(e.a.x, e.b.x) - reach || cursor.x > Math.max(e.a.x, e.b.x) + reach) continue;
    if (cursor.y < Math.min(e.a.y, e.b.y) - reach || cursor.y > Math.max(e.a.y, e.b.y) + reach) continue;
    aceita(e);
  }
  for (const ix of ctx.indexed ?? []) ix.pertoDe(cursor, reach, aceita);
  return out;
}

/** Cruza as arestas ao alcance do cursor duas a duas: o ponto fora dos vértices vira `intersection`. */
export function cruzamentosDePlanta(ctx: InferContext, cursor: Vec2, tol: number, add: AddCandidate): void {
  const reach = tol * Math.SQRT2;
  const reach2 = reach * reach;
  const near = arestasProximas(ctx, cursor, reach);
  for (let i = 0; i < near.length; i++) {
    for (let j = i + 1; j < near.length; j++) {
      const p = intersectSegments(near[i]!.a, near[i]!.b, near[j]!.a, near[j]!.b);
      if (!p || dist2(cursor, p) > reach2) continue;
      if ([near[i]!.a, near[i]!.b, near[j]!.a, near[j]!.b].some((q) => dist2(q, p) <= SAME_POINT_2)) continue;
      add(p, 'intersection', [], near[i]!.hostId ?? near[j]!.hostId);
    }
  }
}

/** Referências de alinhamento dos pontos indexados: só os que estão numa das duas faixas em volta do cursor podem gerar linha. */
export function indexedAlignmentRefs(ctx: InferContext, cursor: Vec2, tol: number, push: (q: Vec2) => void): void {
  if (ctx.onWallsOnly) return;
  for (const ix of ctx.indexed ?? []) {
    const f = (q: PontoIndexado): void => {
      if (!fora(ctx, q.hostId)) push(q);
    };
    ix.naFaixaX(cursor.x, tol, f);
    ix.naFaixaY(cursor.y, tol, f);
  }
}
