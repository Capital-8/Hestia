import type { Vec2 } from '@hestia/geom';
import type { Lang } from './i18n.ts';
import { levelElevation } from './queries.ts';
import { isFooting, type Id, type Project } from './types.ts';

export interface FootingType {
  id: Id;
  name: string;
  code: string;
  description: string;
  width: number;
  length: number;
  thickness: number;
  materialId: string;
  cost: number;
}

export interface Footing {
  id: Id;
  kind: 'footing';
  typeId: Id;
  levelId: Id;
  at: Vec2;
  rotation: number;
  heightOffset: number;
  eccentricityX?: number;
  eccentricityY?: number;
  columnId?: Id | null;
  mark: string;
  comments: string;
  order: number;
}

export function footingTypes(lang: Lang = 'pt'): FootingType[] {
  const pt = lang === 'pt';
  return [
    {
      id: 'ft_iso_100x100',
      name: pt ? 'Sapata Isolada 100×100×40 cm' : 'Isolated Footing 100×100×40 cm',
      code: 'SP-01',
      description: pt ? 'Sapata isolada de concreto armado 100×100×40 cm' : 'Reinforced concrete isolated footing 100×100×40 cm',
      width: 1.0,
      length: 1.0,
      thickness: 0.4,
      materialId: 'mat_concreto',
      cost: 650,
    },
    {
      id: 'ft_iso_150x150',
      name: pt ? 'Sapata Isolada 150×150×50 cm' : 'Isolated Footing 150×150×50 cm',
      code: 'SP-02',
      description: pt ? 'Sapata isolada de concreto armado 150×150×50 cm' : 'Reinforced concrete isolated footing 150×150×50 cm',
      width: 1.5,
      length: 1.5,
      thickness: 0.5,
      materialId: 'mat_concreto',
      cost: 1150,
    },
    {
      id: 'ft_bloco_80x80',
      name: pt ? 'Bloco de Coroamento 80×80×60 cm' : 'Pile Cap 80×80×60 cm',
      code: 'BL-01',
      description: pt ? 'Bloco de coroamento para estacas 80×80×60 cm' : 'Pile cap 80×80×60 cm',
      width: 0.8,
      length: 0.8,
      thickness: 0.6,
      materialId: 'mat_concreto',
      cost: 590,
    },
  ];
}

export const DEFAULT_FOOTING_TYPES: FootingType[] = footingTypes('pt');

export function footingTypeMap(p: Project): Record<Id, FootingType> {
  return p.footingTypes ?? Object.fromEntries(DEFAULT_FOOTING_TYPES.map((t) => [t.id, t]));
}

export function findFootingType(p: Project, typeId: Id): FootingType {
  const map = footingTypeMap(p);
  return map[typeId] ?? DEFAULT_FOOTING_TYPES[0]!;
}

export function footingsOnLevel(p: Project, levelId: Id): Footing[] {
  return Object.values(p.elements)
    .filter(isFooting)
    .filter((f) => f.levelId === levelId)
    .sort((a, b) => a.order - b.order);
}

export function makeFooting(
  input: { id: Id; typeId: Id; levelId: Id; at: Vec2 } & Partial<Omit<Footing, 'id' | 'kind' | 'order'>>,
): Omit<Footing, 'order'> {
  return {
    kind: 'footing',
    rotation: 0,
    heightOffset: 0,
    eccentricityX: 0,
    eccentricityY: 0,
    columnId: null,
    mark: '',
    comments: '',
    ...input,
  };
}

export function footingPolygon(
  f: Pick<Footing, 'at' | 'rotation' | 'eccentricityX' | 'eccentricityY'>,
  t?: Pick<FootingType, 'width' | 'length'>,
): [Vec2, Vec2, Vec2, Vec2] {
  const hw = (t?.width ?? 1.0) / 2;
  const hl = (t?.length ?? 1.0) / 2;
  const ex = f.eccentricityX ?? 0;
  const ey = f.eccentricityY ?? 0;
  const cos = Math.cos(f.rotation);
  const sin = Math.sin(f.rotation);
  const local = [
    { x: ex - hw, y: ey - hl },
    { x: ex + hw, y: ey - hl },
    { x: ex + hw, y: ey + hl },
    { x: ex - hw, y: ey + hl },
  ];
  return local.map((pt) => ({
    x: f.at.x + pt.x * cos - pt.y * sin,
    y: f.at.y + pt.x * sin + pt.y * cos,
  })) as [Vec2, Vec2, Vec2, Vec2];
}

export function footingElevationSpan(
  p: Project,
  f: Footing,
  t?: Pick<FootingType, 'thickness'>,
): { z0: number; z1: number; thickness: number } {
  const thickness = t?.thickness ?? 0.4;
  const z1 = levelElevation(p, f.levelId) + f.heightOffset;
  const z0 = z1 - thickness;
  return { z0, z1, thickness };
}
