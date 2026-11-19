/** Fixtures de referência do lote (PLANO A.10): L1, L2 e I1. Usadas pelos testes do lote e das fases seguintes. */
import type { Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeLevel, makeLot, makeSlab, makeTerrain, makeTerrainRegion, type Lot, type LadoLote, type Project } from '@hestia/model';

const v = (x: number, y: number): Vec2 => ({ x, y });
const retangulo = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)];

/** L1: retângulo (0,0)–(12,30); o lado y = 0 é a frente (recuo 5), as laterais têm 1,5 e o fundo 3. Área 360, perímetro 84, edificável 198. */
export function loteL1(): Omit<Lot, 'order'> {
  const lados: LadoLote[] = [
    { papel: 'frente', recuo: 5 },
    { papel: 'lateral', recuo: 1.5 },
    { papel: 'fundo', recuo: 3 },
    { papel: 'lateral', recuo: 1.5 },
  ];
  return makeLot({ id: 'lote_l1', levelId: 'lv_0', name: 'L1', contorno: retangulo(0, 0, 12, 30), lados });
}

/** L2: lote em L (0,0), (20,0), (20,10), (10,10), (10,20), (0,20), recuo 2 em todos os lados. Área 300, edificável 156,86 ± 0,05. */
export function loteL2(): Omit<Lot, 'order'> {
  const contorno = [v(0, 0), v(20, 0), v(20, 10), v(10, 10), v(10, 20), v(0, 20)];
  return makeLot({ id: 'lote_l2', levelId: 'lv_0', name: 'L2', contorno, lados: contorno.map(() => ({ papel: 'lateral' as const, recuo: 2 })) });
}

/** Projeto com um lote (L1 ou L2) e nada mais. */
export function projetoLote(lote: Omit<Lot, 'order'> = loteL1()): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addLot', lot: lote });
  return s.project;
}

/**
 * I1: L1 mais uma laje 9 × 10 dentro do lote em dois níveis (lv_0 e lv_1) e uma subdivisão impermeável de 30 metros quadrados fora das lajes. Taxa de
 * ocupação 0,25; coeficiente 0,5; permeabilidade (360 − 90 − 30) / 360 = 0,6667.
 */
export function projetoI1(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 1', elevation: 3 }) });
  s.exec({ type: 'addLot', lot: loteL1() });
  for (const [id, levelId] of [['sl_0', 'lv_0'], ['sl_1', 'lv_1']] as const) {
    s.exec({ type: 'addSlab', slab: makeSlab({ id, typeId: 'ls_mac12', levelId, boundary: retangulo(1.5, 5, 10.5, 15) }) });
  }
  s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn_1', levelId: 'lv_0' }) });
  s.exec({ type: 'addTerrainRegion', regiao: makeTerrainRegion({ id: 'rg_1', levelId: 'lv_0', terrenoId: 'tn_1', contorno: retangulo(1.5, 20, 7.5, 25), papel: 'subdivisao', permeavel: false }) });
  return s.project;
}
