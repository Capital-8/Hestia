import type { Vec2 } from '@hestia/geom';
import type { Lang } from './i18n.ts';
import { levelElevation } from './queries.ts';
import { isColumn, type Id, type Project } from './types.ts';

export type ColumnShape = 'rect' | 'round' | 'i-section';

export interface ColumnType {
  id: Id;
  name: string;
  code: string;
  description: string;
  shape: ColumnShape;
  width: number;
  depth: number;
  flangeThickness?: number;
  webThickness?: number;
  materialId: string;
  cost: number;
}

export interface Column {
  id: Id;
  kind: 'column';
  typeId: Id;
  levelId: Id;
  baseOffset: number;
  topLevelId: Id | null;
  topOffset: number;
  height: number;
  at: Vec2;
  rotation: number;
  mark: string;
  comments: string;
  order: number;
}

export function columnTypes(lang: Lang = 'pt'): ColumnType[] {
  const pt = lang === 'pt';
  return [
    {
      id: 'ct_conc_20x40',
      name: pt ? 'Pilar Concreto 20×40 cm' : 'Concrete Column 20×40 cm',
      code: 'PL-01',
      description: pt ? 'Pilar retangular de concreto armado 20×40 cm' : 'Reinforced concrete rectangular column 20×40 cm',
      shape: 'rect',
      width: 0.2,
      depth: 0.4,
      materialId: 'mat_concreto',
      cost: 420,
    },
    {
      id: 'ct_conc_30x30',
      name: pt ? 'Pilar Concreto 30×30 cm' : 'Concrete Column 30×30 cm',
      code: 'PL-02',
      description: pt ? 'Pilar quadrado de concreto armado 30×30 cm' : 'Reinforced concrete square column 30×30 cm',
      shape: 'rect',
      width: 0.3,
      depth: 0.3,
      materialId: 'mat_concreto',
      cost: 480,
    },
    {
      id: 'ct_round_30',
      name: pt ? 'Pilar Circular Ø30 cm' : 'Round Column Ø30 cm',
      code: 'PL-03',
      description: pt ? 'Pilar circular de concreto armado Ø30 cm' : 'Reinforced concrete round column Ø30 cm',
      shape: 'round',
      width: 0.3,
      depth: 0.3,
      materialId: 'mat_concreto',
      cost: 460,
    },
    {
      id: 'ct_steel_w250',
      name: pt ? 'Pilar Metálico W250×32.7' : 'Steel Column W250×32.7',
      code: 'PM-01',
      description: pt ? 'Perfil estrutural de aço W250×32.7' : 'Structural steel column W250×32.7',
      shape: 'i-section',
      width: 0.146,
      depth: 0.258,
      flangeThickness: 0.0091,
      webThickness: 0.0061,
      materialId: 'mat_aco',
      cost: 890,
    },
  ];
}

export const DEFAULT_COLUMN_TYPES: ColumnType[] = columnTypes('pt');

export function columnTypeMap(p: Project): Record<Id, ColumnType> {
  return p.columnTypes ?? Object.fromEntries(DEFAULT_COLUMN_TYPES.map((t) => [t.id, t]));
}

export function findColumnType(p: Project, typeId: Id): ColumnType {
  const map = columnTypeMap(p);
  return map[typeId] ?? DEFAULT_COLUMN_TYPES[0]!;
}

export function columnsOnLevel(p: Project, levelId: Id): Column[] {
  return Object.values(p.elements)
    .filter(isColumn)
    .filter((c) => c.levelId === levelId)
    .sort((a, b) => a.order - b.order);
}

export function makeColumn(
  input: { id: Id; typeId: Id; levelId: Id; at: Vec2 } & Partial<Omit<Column, 'id' | 'kind' | 'order'>>,
): Omit<Column, 'order'> {
  return {
    kind: 'column',
    baseOffset: 0,
    topLevelId: null,
    topOffset: 0,
    height: 2.8,
    rotation: 0,
    mark: '',
    comments: '',
    ...input,
  };
}

export function columnPolygon(
  c: Pick<Column, 'at' | 'rotation'>,
  t?: Pick<ColumnType, 'shape' | 'width' | 'depth' | 'flangeThickness' | 'webThickness'>,
): Vec2[] {
  const shape = t?.shape ?? 'rect';
  const w = t?.width ?? 0.2;
  const d = t?.depth ?? 0.4;
  let local: Vec2[];

  if (shape === 'round') {
    const r = w / 2;
    local = Array.from({ length: 16 }, (_, i) => {
      const a = (2 * Math.PI * i) / 16;
      return { x: r * Math.cos(a), y: r * Math.sin(a) };
    });
  } else if (shape === 'i-section') {
    const tf = t?.flangeThickness ?? Math.min(w, d) * 0.1;
    const tw = t?.webThickness ?? Math.min(w, d) * 0.08;
    const hw = w / 2;
    const hd = d / 2;
    const htw = tw / 2;
    local = [
      { x: -hw, y: -hd },
      { x: hw, y: -hd },
      { x: hw, y: -hd + tf },
      { x: htw, y: -hd + tf },
      { x: htw, y: hd - tf },
      { x: hw, y: hd - tf },
      { x: hw, y: hd },
      { x: -hw, y: hd },
      { x: -hw, y: hd - tf },
      { x: -htw, y: hd - tf },
      { x: -htw, y: -hd + tf },
      { x: -hw, y: -hd + tf },
    ];
  } else {
    const hw = w / 2;
    const hd = d / 2;
    local = [
      { x: -hw, y: -hd },
      { x: hw, y: -hd },
      { x: hw, y: hd },
      { x: -hw, y: hd },
    ];
  }

  const cos = Math.cos(c.rotation);
  const sin = Math.sin(c.rotation);
  return local.map((pt) => ({
    x: c.at.x + pt.x * cos - pt.y * sin,
    y: c.at.y + pt.x * sin + pt.y * cos,
  }));
}

export function columnElevationSpan(
  p: Project,
  c: Column,
): { z0: number; z1: number; height: number } {
  const z0 = levelElevation(p, c.levelId) + c.baseOffset;
  const z1 = c.topLevelId ? levelElevation(p, c.topLevelId) + c.topOffset : z0 + c.height;
  const height = Math.max(0.05, z1 - z0);
  return { z0, z1, height };
}

export function columnSectionArea(t: ColumnType): number {
  if (t.shape === 'round') {
    const r = t.width / 2;
    return Math.PI * r * r;
  }
  if (t.shape === 'i-section') {
    const tf = t.flangeThickness ?? 0;
    const tw = t.webThickness ?? 0;
    const webH = Math.max(0, t.depth - 2 * tf);
    return 2 * (t.width * tf) + webH * tw;
  }
  return t.width * t.depth;
}

export function columnSectionPerimeter(t: ColumnType): number {
  if (t.shape === 'round') {
    return Math.PI * t.width;
  }
  if (t.shape === 'i-section') {
    const tw = t.webThickness ?? 0;
    return 4 * t.width + 2 * t.depth - 2 * tw;
  }
  return 2 * (t.width + t.depth);
}

/** Sub-polígonos em planta para pilares `i-section` (mesas e alma) usados em vistas de elevação/corte. */
export function columnProfileStrips(
  c: Pick<Column, 'at' | 'rotation'>,
  t: Pick<ColumnType, 'shape' | 'width' | 'depth' | 'flangeThickness' | 'webThickness'>,
): Vec2[][] {
  if (t.shape !== 'i-section') return [columnPolygon(c, t)];
  const w = t.width;
  const d = t.depth;
  const tf = t.flangeThickness ?? Math.min(w, d) * 0.1;
  const tw = t.webThickness ?? Math.min(w, d) * 0.08;
  const hw = w / 2;
  const hd = d / 2;
  const htw = tw / 2;
  const box = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  const cos = Math.cos(c.rotation);
  const sin = Math.sin(c.rotation);
  const rot = (pts: Vec2[]): Vec2[] => pts.map((pt) => ({ x: c.at.x + pt.x * cos - pt.y * sin, y: c.at.y + pt.x * sin + pt.y * cos }));
  return [
    rot(box(-hw, -hd, hw, -hd + tf)),
    rot(box(-htw, -hd + tf, htw, hd - tf)),
    rot(box(-hw, hd - tf, hw, hd)),
  ];
}
