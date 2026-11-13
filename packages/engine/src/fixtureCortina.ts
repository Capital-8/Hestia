/** Projeto mínimo com uma parede cortina (decisão 0056, fase 1): usado pelos testes do engine, do render e do wasm. */
import { ProjectStore, createEmptyProject, makeWall, type CurtainSpec, type Project, type WallType } from '@hestia/model';

export const especCortinaTeste = (over: Partial<CurtainSpec> = {}): CurtainSpec => ({
  depth: 0.1,
  u: { mode: 'fixedNumber', count: 4 },
  v: { mode: 'fixedNumber', count: 2 },
  mullions: {
    interiorVertical: 'mul_ret_50x100',
    interiorHorizontal: 'mul_ret_50x100',
    borderStart: 'mul_ret_50x100',
    borderEnd: 'mul_ret_50x100',
    borderBottom: 'mul_ret_50x100',
    borderTop: 'mul_ret_50x100',
    corner: null,
    joinPriority: 'vertical',
  },
  defaultPanelTypeId: 'pnl_vidro_10',
  ...over,
});

export const tipoCortinaTeste = (curtain: CurtainSpec = especCortinaTeste(), id = 'wt_ct'): WallType => ({
  ...createEmptyProject().wallTypes.wt_alv14!,
  id,
  name: 'Cortina teste',
  family: 'curtain',
  curtain,
  layers: [],
  strips: [],
  wrapInserts: 'none',
  wrapEnds: 'none',
});

/** Cortina `ct1` de 6 m x 3 m (4 x 2 células) e uma parede comum `w1`, no nível `lv_0`. */
export function projetoComCortina(curtain: CurtainSpec = especCortinaTeste()): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertWallType', wallType: tipoCortinaTeste(curtain) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'ct1', typeId: 'wt_ct', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 5 }, b: { x: 6, y: 5 }, height: 3 }) });
  return s.project;
}
