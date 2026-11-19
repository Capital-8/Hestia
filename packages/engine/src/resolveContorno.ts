import { openingType, openingsOfWall, wallsOnLevel, openingShapeOf, outline, type Id, type Opening, type Project } from '@hestia/model';
import { arcSample, intersection, multiArea, type MultiPolygon } from '@hestia/geom';
import type { WallFrame } from './frame.ts';
import type { WallZ } from './wallZ.ts';
import { clienteFuroContorno, rotaDoVao } from './furoContornoDespacho.ts';
import { openingBandRing, openingHole } from './openingCut.ts';
import { cutHalfWidth } from './openingShapeViews.ts';
import { depthRange, insertMode, sidesOf, wrappingLayers } from './wrap.ts';
import type { FuroContornoDaParede, OpeningGeometry } from './types.ts';

/**
 * Ponte entre o despacho do furo (`furoContornoDespacho.ts`) e `resolve.ts` na troca atômica (docs/estudo-esquadrias/26):
 * quais vãos de um grupo de paredes vão por contorno, o que cada parede guarda para o 3D e o quantitativo, e o furo de planta.
 */

/** Pegada em planta de um retorno que segue o contorno (o que `clipReturn` recorta contra as paredes vizinhas). */
export interface PegadaDoRetorno {
  key: string;
  openingId: Id;
  layerIndex: number;
  y0: number;
  wallId: Id;
  /** Retângulo (x do contorno) x (faixa de s do retorno), no mundo. */
  piece: { poly: MultiPolygon };
  /** Faixa de z (relativa à base da parede) em que o contorno existe. */
  zlo: number;
  zhi: number;
}

export interface ContornoDoCluster {
  /** Ids dos vãos por contorno: deixam de cortar as faixas e de ter retorno retangular. */
  ids: ReadonlySet<Id>;
  /** Pegadas dos retornos (para recortar contra as vizinhas, docs/estudo-esquadrias/33 §2.2). */
  pegadas: readonly PegadaDoRetorno[];
  furos: ReadonlyMap<Id, FuroContornoDaParede[]>;
  /** Cota absoluta do corte da planta, por parede. */
  cutZ: (wallId: Id) => number;
}

/** Retorno do acabamento do vão com forma: camadas envolventes, com recuo e faixa de s (o cliente monta o anel que segue o contorno). */
function retornosDoContorno(p: Project, f: WallFrame, o: Opening): FuroContornoDaParede['retornos'] {
  const ot = openingType(p, o);
  const lados = sidesOf(insertMode(f.type, ot));
  const out: FuroContornoDaParede['retornos'] = [];
  for (const side of lados) {
    const [y0, y1] = depthRange(f, side, lados.length === 2);
    for (const w of wrappingLayers(f.type, side)) if (w.off + w.thickness < ot.width / 2 - 1e-3) out.push({ layerIndex: w.index, espessura: w.thickness, recuo: w.off, y0, y1 });
  }
  return out;
}

/** O contorno do grupo de paredes de um cluster, ou `undefined` quando nenhum vão vai por contorno (o caso de sempre). */
export function contornoDoGrupo(p: Project, group: readonly WallFrame[], opens: readonly OpeningGeometry[], wz: ReadonlyMap<Id, WallZ>, semRegioes: boolean, cutZ: (wallId: Id) => number): ContornoDoCluster | undefined {
  const ids = new Set<Id>();
  const furos = new Map<Id, FuroContornoDaParede[]>();
  const pegadas: PegadaDoRetorno[] = [];
  for (const g of opens) {
    const f = group.find((x) => x.wall.id === g.hostId);
    const z = wz.get(g.hostId);
    if (!f || !z || rotaDoVao(g, { tilt: f.wall.tilt, perfil: !!(z.profile || z.bottomProfile), clusterInclinado: semRegioes }).via !== 'contorno') continue;
    ids.add(g.openingId);
    const retornos = retornosDoContorno(p, f, p.elements[g.openingId] as Opening);
    furos.set(g.hostId, [...(furos.get(g.hostId) ?? []), { g, retornos }]);
    const c = outline(g.forma!);
    const xs = c.map((q) => q[0]), zs = c.map((q) => q[1]);
    const x0 = g.offset + Math.min(...xs), x1 = g.offset + Math.max(...xs);
    for (const r of retornos) {
      const pt = (x: number, y: number) => ({ x: f.a.x + f.u.x * x + f.n.x * y, y: f.a.y + f.u.y * x + f.n.y * y });
      // Parede curva: a pegada é o setor (comprimento de eixo x lateral s), com as faces em arco.
      const anel = f.arc ? [...arcSample(f.arc, x0, x1, r.y0, 0.005), ...arcSample(f.arc, x1, x0, r.y1, 0.005)] : [pt(x0, r.y0), pt(x1, r.y0), pt(x1, r.y1), pt(x0, r.y1)];
      pegadas.push({ key: `${g.openingId}|${r.layerIndex}|${r.y0}`, openingId: g.openingId, layerIndex: r.layerIndex, y0: r.y0, wallId: g.hostId, piece: { poly: [[anel]] }, zlo: g.sill + Math.min(...zs), zhi: g.sill + Math.max(...zs) });
    }
  }
  return ids.size ? { ids, pegadas, furos, cutZ } : undefined;
}

/**
 * Furo de planta de um vão na cota de corte: retângulo de sempre, ou, no vão por contorno, a largura REAL do contorno na cota
 * (`cutHalfWidth`); vazio quando o corte passa fora do vão (acima do arco ou abaixo do peitoril).
 */
export function furoDePlanta(g: OpeningGeometry, contorno: ContornoDoCluster | undefined, baseZ: number): MultiPolygon {
  if (!contorno?.ids.has(g.openingId) || !g.forma) return openingHole(g);
  const hw = cutHalfWidth(g.forma, { along: g.offset, sill: baseZ + g.sill }, contorno.cutZ(g.hostId));
  return hw > 0 ? [[openingBandRing(g, hw)]] : [];
}

/** O nível tem vão com forma e há cliente: o despacho ao kernel Rust (que fura em retângulo) fica de fora, resolve o TypeScript. */
export function nivelComContorno(p: Project, levelId: Id): boolean {
  return clienteFuroContorno() !== null && wallsOnLevel(p, levelId).some((w) => openingsOfWall(p, w.id).some((o) => openingShapeOf(openingType(p, o)) !== null));
}

/**
 * Retorno em canto (docs/estudo-esquadrias/33 §2.2): numa faixa de altura em que o vão existe (`mid`), recorta a pegada de cada
 * retorno contra o pintado das paredes vizinhas (`clipar`) e acumula por interseção entre as faixas (a vizinha mais alta vence).
 * É o mesmo recorte de `recortar_retorno` do cálculo retangular, mas guardado para o retorno 3D do cliente.
 */
export function acumularRecortes(contorno: ContornoDoCluster, acc: Map<string, MultiPolygon>, z0Da: (wallId: Id) => number, mid: number, clipar: (piece: PegadaDoRetorno['piece'], wallId: Id) => MultiPolygon): void {
  for (const pg of contorno.pegadas) {
    const z0 = z0Da(pg.wallId);
    if (!(mid > z0 + pg.zlo && mid < z0 + pg.zhi)) continue;
    const c = clipar(pg.piece, pg.wallId);
    const prev = acc.get(pg.key);
    acc.set(pg.key, prev ? intersection(prev, c) : c);
  }
}

/** Os furos da parede com o `recorte` de cada retorno que as vizinhas de fato cortam (pegada inteira = sem `recorte`, o caso de sempre). */
export function furosComRecorte(furos: readonly FuroContornoDaParede[], contorno: ContornoDoCluster, recortes: ReadonlyMap<string, MultiPolygon>): FuroContornoDaParede[] {
  const pegada = new Map(contorno.pegadas.map((pg) => [pg.key, pg] as const));
  return furos.map((f) => ({
    ...f,
    retornos: f.retornos.map((r) => {
      const key = `${f.g.openingId}|${r.layerIndex}|${r.y0}`;
      const c = recortes.get(key), pg = pegada.get(key);
      if (!c || !pg || Math.abs(multiArea(c) - multiArea(pg.piece.poly)) < 1e-9) return r;
      return { ...r, recorte: c };
    }),
  }));
}
