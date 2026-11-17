import { openingType, openingsOfWall, wallsOnLevel, openingShapeOf, type Id, type Opening, type Project } from '@hestia/model';
import type { MultiPolygon } from '@hestia/geom';
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

export interface ContornoDoCluster {
  /** Ids dos vãos por contorno: deixam de cortar as faixas e de ter retorno retangular. */
  ids: ReadonlySet<Id>;
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
  for (const g of opens) {
    const f = group.find((x) => x.wall.id === g.hostId);
    const z = wz.get(g.hostId);
    if (!f || !z || rotaDoVao(g, { tilt: f.wall.tilt, perfil: !!(z.profile || z.bottomProfile), clusterInclinado: semRegioes }).via !== 'contorno') continue;
    ids.add(g.openingId);
    furos.set(g.hostId, [...(furos.get(g.hostId) ?? []), { g, retornos: retornosDoContorno(p, f, p.elements[g.openingId] as Opening) }]);
  }
  return ids.size ? { ids, furos, cutZ } : undefined;
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
