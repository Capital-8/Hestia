import { isGeneric, type Generic, type Id, type Project } from '@hestia/model';
import type { DxfPoint } from './dxf.ts';
import type { DxfPolylineEntity } from './dxfDoc.ts';

/**
 * Camada dos objetos importados de outro programa e sem equivalente nativo (`Generic`, `kind: 'generic'`): vigas, pilares,
 * mobiliário, MEP... O que sai é só o contorno em planta (`outline`, o hull da malha); a malha em si não entra no DXF.
 */
export const DXF_LAYER_GENERIC = 'IMPORTADO';

/** Cor ACI da camada dos importados: 8, o cinza (mesmo tom das camadas de projeção leves). */
const GENERIC_COLOR = 8;

const EPS = 1e-9;

/** Anel sem o vértice de fechamento repetido. Com menos de 3 vértices não há área: devolve null. */
function openRing(ring: DxfPoint[]): DxfPoint[] | null {
  const first = ring[0];
  const last = ring[ring.length - 1];
  const repeated = ring.length > 1 && first !== undefined && last !== undefined && Math.abs(first.x - last.x) < EPS && Math.abs(first.y - last.y) < EPS;
  const pts = repeated ? ring.slice(0, -1) : ring;
  return pts.length >= 3 ? pts : null;
}

/**
 * Entidades R2000 de cada `Generic` do nível que tem `outline` em planta: uma polilinha fechada por objeto, na camada
 * `IMPORTADO` (`layer`), em ordem determinística de `id`. A cor vai na própria entidade (código 62), cinza; a camada entra
 * na tabela LAYER com o padrão do escritor. Outline com menos de 3 pontos não desenha nada. Sem genéricos: lista vazia.
 * `hidden` (planta de disciplina, decisão 0060 §7): os ids ocultos na vista não saem.
 */
export function dxfGenericEntities(p: Project, levelId: Id, layer = DXF_LAYER_GENERIC, hidden?: ReadonlySet<Id>): DxfPolylineEntity[] {
  const generics = Object.values(p.elements)
    .filter((e): e is Generic => isGeneric(e) && e.levelId === levelId && !hidden?.has(e.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: DxfPolylineEntity[] = [];
  for (const g of generics) {
    const points = g.outline ? openRing(g.outline) : null;
    if (points) out.push({ kind: 'polyline', layer, points, closed: true, color: GENERIC_COLOR });
  }
  return out;
}
