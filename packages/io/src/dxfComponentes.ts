import { isComponent, type Component, type Id, type Project } from '@hestia/model';
import { pegadaDoComponente } from '@hestia/engine';
import type { DxfPoint } from './dxf.ts';
import type { DxfPolylineEntity } from './dxfDoc.ts';

/**
 * Camada dos componentes colocados no projeto (`Component`, móveis e equipamentos): o contorno em planta de cada peça
 * não vazia, unido pela pegada do componente. A malha em si não entra no DXF da planta.
 */
export const DXF_LAYER_COMPONENTE = 'COMPONENTES';

/** Cor ACI da camada dos componentes: 3, o verde. */
const COMPONENT_COLOR = 3;

/** Ponto da pegada (Vec2 do geom) no formato do DXF em planta. */
const pointOf = (q: { x: number; y: number }): DxfPoint => ({ x: q.x, y: q.y });

/**
 * Entidades R2000 dos componentes do nível: uma polilinha fechada por anel da pegada (contorno e furos), na camada
 * `COMPONENTES` (`layer`), em ordem determinística de `id`. A cor vai na própria entidade (código 62), verde. Componente
 * sem pegada não desenha nada. Sem componentes: lista vazia.
 */
export function dxfComponentEntities(p: Project, levelId: Id, layer = DXF_LAYER_COMPONENTE): DxfPolylineEntity[] {
  const components = Object.values(p.elements)
    .filter((e): e is Component => isComponent(e) && e.levelId === levelId)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const out: DxfPolylineEntity[] = [];
  for (const comp of components) {
    for (const poly of pegadaDoComponente(p, comp)) {
      for (const ring of poly) {
        if (ring.length < 3) continue;
        out.push({ kind: 'polyline', layer, points: ring.map(pointOf), closed: true, color: COMPONENT_COLOR });
      }
    }
  }
  return out;
}
