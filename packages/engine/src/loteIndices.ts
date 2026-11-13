import { difference, intersection, multiArea, union, type MultiPolygon } from '@hestia/geom';
import { isTerrainRegion, type Id, type Lot, type Project } from '@hestia/model';
import { resolveAllFloors } from './floors.ts';
import { resolveAllSlabs } from './slabs.ts';
import { areaDoLote, areaEdificavel, loteComoMulti } from './loteGeometria.ts';

/** Resto (metros quadrados) abaixo do qual a projeção conta como dentro da área edificável. */
export const TOLERANCIA_FORA_EDIFICAVEL = 1e-4;

export interface IndicesDoLote {
  areaLote: number;
  areaEdificavel: number;
  /** Área da projeção da edificação recortada pelo lote. */
  areaProjecao: number;
  /** Soma, por nível, da área dos pisos e lajes do nível recortada pelo lote. */
  areaConstruida: number;
  /** Parte da projeção que cai fora da área edificável (metros quadrados). */
  projecaoForaDoEdificavel: number;
  taxaOcupacao: number;
  coefAproveitamento: number;
  permeabilidade: number;
}

/** Contornos resolvidos de Floor e Slab, agrupados por nível. */
function contornosPorNivel(p: Project): Map<Id, MultiPolygon[]> {
  const porNivel = new Map<Id, MultiPolygon[]>();
  const poe = (nivel: Id, m: MultiPolygon): void => {
    if (m.length === 0) return;
    const l = porNivel.get(nivel);
    if (l) l.push(m);
    else porNivel.set(nivel, [m]);
  };
  for (const f of resolveAllFloors(p)) poe(f.levelId, f.polygon);
  for (const s of resolveAllSlabs(p)) poe(s.levelId, s.polygon);
  return porNivel;
}

/** Projeção da edificação (A.4 regra 18): união de todos os pisos e lajes, de todos os níveis, sem recorte. */
export function projecaoDaEdificacao(p: Project): MultiPolygon {
  return union(...[...contornosPorNivel(p).values()].flat());
}

/** Regiões de terreno impermeáveis (`permeavel = false`), pelo contorno. */
function regioesImpermeaveis(p: Project): MultiPolygon[] {
  return Object.values(p.elements)
    .filter(isTerrainRegion)
    .filter((r) => !r.permeavel && r.contorno.length >= 3)
    .map((r): MultiPolygon => [[r.contorno]]);
}

const area = (m: MultiPolygon): number => (m.length === 0 ? 0 : multiArea(m));
const razao = (a: number, b: number): number => (b > 0 ? a / b : 0);

/**
 * Índices de um lote (A.4 regra 18). Sem edificação, taxa e coeficiente são zero. Lote de área zero: todos os índices zero (sem divisão
 * por zero).
 */
export function indicesDoLote(p: Project, lote: Lot): IndicesDoLote {
  const areaLote = areaDoLote(lote.contorno);
  const poligono = loteComoMulti(lote.contorno);
  const edificavel = areaEdificavel(lote.contorno, lote.lados);
  const porNivel = contornosPorNivel(p);
  const recortar = (m: MultiPolygon): MultiPolygon => (m.length === 0 || poligono.length === 0 ? [] : intersection(poligono, m));

  const projecao = recortar(union(...[...porNivel.values()].flat()));
  const areaProjecao = area(projecao);
  let areaConstruida = 0;
  for (const lista of porNivel.values()) areaConstruida += area(recortar(union(...lista)));

  const ocupado = recortar(union(projecao, ...regioesImpermeaveis(p)));
  const fora = projecao.length === 0 || edificavel.length === 0 ? projecao : difference(projecao, edificavel);
  return {
    areaLote,
    areaEdificavel: area(edificavel),
    areaProjecao,
    areaConstruida,
    projecaoForaDoEdificavel: area(fora),
    taxaOcupacao: razao(areaProjecao, areaLote),
    coefAproveitamento: razao(areaConstruida, areaLote),
    permeabilidade: areaLote > 0 ? (areaLote - area(ocupado)) / areaLote : 0,
  };
}
