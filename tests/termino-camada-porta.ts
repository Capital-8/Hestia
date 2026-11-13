/**
 * Porta + laje com término por camada (decisão 0054 sobre a 0025). A porta de 2,10 m não chega à camada de estrutura da laje do pavimento de cima
 * (2,88 a 3,00 m): acima do vão a parede é contínua, e a laje a recorta como no trecho cheio. Compartilhado pelo teste do motor e pelo teste wasm.
 */
import { intersection, type MultiPolygon } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeLevel, makeSlab, makeWall, type Layer, type Project } from '@hestia/model';
import { resolveSlabs } from '../packages/engine/src/slabs.ts';

const estrutura = (): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: 0.12, wraps: false, termino: { camada: { funcao: 'structure', lado: 'proximo', face: 'proxima', cm: 0 } } });

/** Quatro paredes de 0 a 6 por 0 a 4 (nível 0, topo no nível 1), uma porta de 0,80 x 2,10 m em w0 (y = 0) na posição x = 3, e a laje estática que cobre o interior. */
export function projetoPortaSobLaje(): Project {
  const base = createEmptyProject();
  base.slabTypes.ls_porta = { ...base.slabTypes.ls_mac12!, id: 'ls_porta', name: 'porta', code: 'porta', layers: [estrutura()] };
  const s = new ProjectStore(base);
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'P2', elevation: 3 }) });
  const R = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
  R.forEach((a, i) => s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b: R[(i + 1) % 4]!, topLevelId: 'lv_1' }) }));
  s.exec({ type: 'addOpening', opening: { id: 'd0', kind: 'door', typeId: 'ot_p80', hostId: 'w0', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  s.exec({ type: 'addSlab', slab: makeSlab({ id: 'laje', typeId: 'ls_porta', levelId: 'lv_1', boundary: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }] }) });
  return s.project;
}

/** Menor y do contorno da camada da laje numa coluna fina em torno de `x`. */
export function bordaDaLajeEm(p: Project, x: number): number {
  const poligono = resolveSlabs(p, 'lv_1')[0]!.layers[0]!.polygon as unknown as MultiPolygon;
  const coluna: MultiPolygon = [[[{ x: x - 0.005, y: -1 }, { x: x + 0.005, y: -1 }, { x: x + 0.005, y: 1 }, { x: x - 0.005, y: 1 }]]];
  const ys = intersection(poligono, coluna).flatMap((poly) => poly.flatMap((r) => r.map((q) => q.y)));
  return Math.min(...ys);
}
