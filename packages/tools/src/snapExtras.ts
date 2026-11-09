import { closestOnSegment, v2, type Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import type { ExtraTrack, InferContext } from './infer.ts';
import type { Guide, SnapKind, SnapOptions } from './types.ts';

/** Assinatura do registrador de candidatos do motor de captura. */
export type AddCandidate = (point: Vec2, kind: SnapKind, guides?: Guide[], hostId?: Id, weight?: number) => void;

/** Distância ao quadrado (evita a raiz em filtros que só comparam com a tolerância). */
const dist2 = (a: Vec2, b: Vec2): number => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** A caixa do segmento, expandida pela tolerância, contém o cursor? Descarte barato antes do pé da perpendicular. */
function boxNear(a: Vec2, b: Vec2, cursor: Vec2, tol: number): boolean {
  return cursor.x >= Math.min(a.x, b.x) - tol && cursor.x <= Math.max(a.x, b.x) + tol && cursor.y >= Math.min(a.y, b.y) - tol && cursor.y <= Math.max(a.y, b.y) + tol;
}

/**
 * Pontos extras (vértices de pisos, contorno em construção, aberturas) fora do modo só-paredes. O tipo vem do ponto
 * (`kind`): canto é extremidade, centro é centro e face segue as capturas de face.
 */
export function addExtraPoints(ctx: InferContext, sn: SnapOptions, cursor: Vec2, tol: number, add: AddCandidate): void {
  if (ctx.onWallsOnly) return;
  const reach = tol * tol;
  for (const q of ctx.extraPoints ?? []) {
    if (q.hostId !== undefined && ctx.ignore?.has(q.hostId)) continue;
    const kind = q.kind ?? 'endpoint';
    if ((kind === 'endpoint' && sn.endpoint === false) || ((kind === 'center' || kind === 'midpoint') && sn.midpoint === false) || (kind === 'face' && !sn.faces)) continue;
    if (dist2(cursor, q) <= reach) add(v2(q.x, q.y), kind, [], q.hostId);
  }
}

/**
 * Arestas extras (contornos de pisos e lajes, ombreiras de aberturas): o pé da perpendicular e o ponto mais próximo.
 * As ombreiras (`kind: 'face'`) também dão o pé da perpendicular a partir do ponto anterior.
 */
export function addExtraSegments(ctx: InferContext, sn: SnapOptions, cursor: Vec2, tol: number, add: AddCandidate): void {
  // A perpendicular é captura própria: não depende de Faces (nem do tipo da aresta). Com só ela ligada, o pé sobre
  // qualquer aresta extra (contorno de piso/laje, ombreira, aresta do corte) continua valendo.
  if (!sn.faces && !(sn.perpendicular && ctx.from)) return;
  const reach = tol * tol;
  for (const e of ctx.extraSegments ?? []) {
    if (e.hostId !== undefined && ctx.ignore?.has(e.hostId)) continue;
    if (!boxNear(e.a, e.b, cursor, tol)) continue;
    if (dist2(e.a, e.b) < 1e-18) continue;
    const kind = e.kind ?? 'nearest';
    const foot = closestOnSegment(cursor, e.a, e.b);
    if (sn.faces && dist2(cursor, foot) <= reach) add(foot, kind, [], e.hostId);
    if (sn.perpendicular && ctx.from) {
      const pf = closestOnSegment(ctx.from, e.a, e.b);
      if (dist2(cursor, pf) <= reach && dist2(pf, ctx.from) > 1e-12) add(pf, 'perpendicular', [{ from: ctx.from, to: pf, kind: 'perpendicular' }], e.hostId);
    }
  }
}

/**
 * Trilhas de alinhamento: as ombreiras das aberturas da planta (arestas `face` de `extraSegments`) e as arestas da
 * seção (`extraTracks`, h/v e inclinadas). As trilhas da seção passam por um filtro barato de cursor: só as que têm a
 * reta suporte dentro da faixa de tolerância entram, então uma vista com milhares de arestas não é varrida por inteiro
 * em cada movimento. A extensão da linha além das pontas é feita depois por `infer`, sobre a reta de cada trilha.
 */
export function addExtraTracks(
  ctx: InferContext,
  tracks: ExtraTrack[],
  refs: Vec2[],
  cursor?: Vec2,
  tol = 0,
): void {
  // Ombreiras da planta: a linha atravessa a espessura da parede. O comportamento da planta fica igual (todas as
  // pontas continuam servindo de referência de alinhamento).
  for (const e of ctx.extraSegments ?? []) {
    if (e.kind !== 'face') continue;
    if (e.hostId !== undefined && ctx.ignore?.has(e.hostId)) continue;
    if (dist2(e.a, e.b) < 1e-18) continue;
    tracks.push({ a: e.a, b: e.b, ...(e.hostId !== undefined ? { hostId: e.hostId } : {}) });
    refs.push(e.a, e.b);
  }
  // Arestas da seção: só as que passam perto do cursor, para não montar um par a par gigante longe dele.
  const reach = Math.max(0, tol) * Math.SQRT2;
  // Dedupe moderado só na seção: várias arestas colineares (a mesma face fatiada por vãos, ou as duas metades de uma
  // água de telhado) valem uma trilha só, porque `infer` estende a mesma reta. A planta não passa por aqui.
  const seenLines = ctx.section ? new Set<string>() : null;
  for (const e of ctx.extraTracks ?? []) {
    if (e.hostId !== undefined && ctx.ignore?.has(e.hostId)) continue;
    if (dist2(e.a, e.b) < 1e-18) continue;
    if (cursor && !trackNear(e, cursor, reach)) continue;
    if (seenLines) {
      const lineKey = lineKeyOf(e);
      if (lineKey) {
        if (seenLines.has(lineKey)) continue;
        seenLines.add(lineKey);
      }
    }
    tracks.push({ a: e.a, b: e.b, ...(e.hostId !== undefined ? { hostId: e.hostId } : {}), ...(e.axis !== undefined ? { axis: e.axis } : {}), ...(e.kind !== undefined ? { kind: e.kind } : {}) });
    refs.push(e.a, e.b);
  }
}

/**
 * Chave da reta suporte de uma trilha da seção: h/v pela coordenada e inclinada pela direção canônica + distância à
 * origem. Duas arestas colineares (mesmo sentido ou sentidos opostos) caem na mesma chave.
 */
function lineKeyOf(e: ExtraTrack): string | null {
  if (e.axis === 'h') return `h|${Math.round(e.a.y * 1e6)}`;
  if (e.axis === 'v') return `v|${Math.round(e.a.x * 1e6)}`;
  const dx = e.b.x - e.a.x;
  const dy = e.b.y - e.a.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-12)) return null;
  let ux = dx / len;
  let uy = dy / len;
  // Sentido canônico: o oposto da mesma reta não pode gerar outra chave.
  if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uy < 0)) {
    ux = -ux;
    uy = -uy;
  }
  const c = -uy * e.a.x + ux * e.a.y;
  return `d|${Math.round(ux * 1e6)}|${Math.round(uy * 1e6)}|${Math.round(c * 1e6)}`;
}

/**
 * A trilha passa a até `reach` do cursor? Em h/v a reta é infinita na direção do eixo (é justamente a extensão que o
 * rastreamento oferece), então só a distância perpendicular importa; nas inclinadas vale a distância à reta suporte,
 * também para o cursor além das pontas. Trilhas sem eixo (faces da planta) mantêm o filtro antigo por segmento.
 */
function trackNear(e: ExtraTrack, cursor: Vec2, reach: number): boolean {
  if (e.axis === 'h') return Math.abs(cursor.y - e.a.y) <= reach;
  if (e.axis === 'v') return Math.abs(cursor.x - e.a.x) <= reach;
  if (e.axis === 'd') {
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const dd = dx * dx + dy * dy;
    if (dd < 1e-18) return false;
    const t = ((cursor.x - e.a.x) * dx + (cursor.y - e.a.y) * dy) / dd;
    const px = e.a.x + dx * t;
    const py = e.a.y + dy * t;
    return dist2(cursor, { x: px, y: py }) <= reach * reach;
  }
  return boxNear(e.a, e.b, cursor, reach) && dist2(cursor, closestOnSegment(cursor, e.a, e.b)) <= reach * reach;
}
