import { multiArea, type Polygon, type Vec2 } from '@hestia/geom';
import { t, type Lang } from './i18n.ts';
import { isFloor, type Floor, type FloorType, type Id, type Layer, type Project } from './types.ts';

type FloorInput = { id: Id; typeId: Id; levelId: Id; boundary: Vec2[] } & Partial<Omit<Floor, 'order' | 'kind'>>;

/** Constrói um piso com os campos padrão; `order` é atribuído pelo comando addFloor. */
export function makeFloor(f: FloorInput): Omit<Floor, 'order'> {
  return { kind: 'floor', holes: [], heightOffset: 0, mark: '', comments: '', ...f };
}

export const floorsOnLevel = (p: Project, levelId: Id): Floor[] =>
  Object.values(p.elements)
    .filter(isFloor)
    .filter((f) => f.levelId === levelId)
    .sort((a, b) => a.order - b.order);

export const floorTypeThickness = (t: FloorType): number => t.layers.reduce((s, l) => s + l.thickness, 0);

/** Polígono do piso (contorno + furos) para as operações de geometria. */
export const floorPolygon = (f: Floor): Polygon => [f.boundary, ...f.holes];

/** Área líquida em planta (contorno menos furos), metros quadrados. */
export function floorArea(f: Floor): number {
  return multiArea([floorPolygon(f)]);
}

const L = (fn: Layer['function'], materialId: string, thickness: number): Layer => ({ function: fn, materialId, thickness, wraps: false });

/** Camada com término explícito nas paredes (decisão 0025): o padrão do piso único. */
const LT = (fn: Layer['function'], materialId: string, thickness: number, termino: Layer['termino']): Layer => ({ ...L(fn, materialId, thickness), termino });

const ft = (id: string, name: string, code: string, description: string, layers: Layer[], cost = 0): FloorType => ({ id, name, code, description, layers, cost });

/** Tipos de piso iniciais (camadas do topo para baixo), no idioma pedido. */
export function floorTypes(lang: Lang = 'pt'): FloorType[] {
  return [
    ft('ft_ceram', t(lang, 'md_floor_ceram'), 'PS-01', t(lang, 'md_floor_ceram_desc'), [
      L('finish1', 'mat_ceramica', 0.01),
      L('substrate', 'mat_argamassa', 0.02),
      L('substrate', 'mat_argamassa', 0.04),
      L('structure', 'mat_concreto', 0.12),
    ], 160),
    ft('ft_acab', t(lang, 'md_floor_acab'), 'PS-04', t(lang, 'md_floor_acab_desc'), [
      L('finish1', 'mat_ceramica', 0.01),
      L('substrate', 'mat_argamassa', 0.01),
      L('substrate', 'mat_argamassa', 0.02),
    ], 90),
    ft('ft_laje12', t(lang, 'md_floor_laje12'), 'PS-02', t(lang, 'md_floor_laje12_desc'), [
      L('substrate', 'mat_argamassa', 0.03),
      L('structure', 'mat_concreto', 0.12),
    ], 120),
    ft('ft_madeira', t(lang, 'md_floor_madeira'), 'PS-03', t(lang, 'md_floor_madeira_desc'), [
      L('finish1', 'mat_madeira', 0.02),
      L('substrate', 'mat_argamassa', 0.04),
      L('structure', 'mat_concreto', 0.12),
    ], 260),
    ft('ft_unico', t(lang, 'md_floor_unico'), 'PS-05', t(lang, 'md_floor_unico_desc'), [
      LT('finish1', 'mat_ceramica', 0.01, 'face'),
      LT('substrate', 'mat_argamassa', 0.02, 'face'),
      LT('substrate', 'mat_argamassa', 0.04, 'face'),
      LT('structure', 'mat_concreto', 0.12, 'passa'),
    ], 250),
  ];
}

/** Tipos de piso em PT (compatibilidade); use `floorTypes(lang)` para o idioma ativo. */
export const DEFAULT_FLOOR_TYPES: FloorType[] = floorTypes('pt');
