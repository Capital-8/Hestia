import { arcFromSagitta, arcPointAt, arcSample, dist, type Arc, type Vec2 } from '@hestia/geom';
import type { Lang } from './i18n.ts';
import { levelElevation } from './queries.ts';
import { isBeam, type Id, type Project } from './types.ts';

export type BeamShape = 'rect' | 't-section' | 'i-section';
export type BeamJustify = 'center' | 'left' | 'right';

export interface BeamType {
  id: Id;
  name: string;
  code: string;
  description: string;
  shape: BeamShape;
  width: number;
  depth: number;
  flangeWidth?: number;
  flangeThickness?: number;
  webThickness?: number;
  materialId: string;
  cost: number;
}

export interface Beam {
  id: Id;
  kind: 'beam';
  typeId: Id;
  levelId: Id;
  a: Vec2;
  b: Vec2;
  /** Flecha do arco (positiva à esquerda de a→b); 0 ou ausente = viga reta. */
  sag?: number;
  zOffset: number;
  justify: BeamJustify;
  mark: string;
  comments: string;
  order: number;
}

export function beamTypes(lang: Lang = 'pt'): BeamType[] {
  const pt = lang === 'pt';
  return [
    {
      id: 'bt_conc_15x40',
      name: pt ? 'Viga Concreto 15×40 cm' : 'Concrete Beam 15×40 cm',
      code: 'VG-01',
      description: pt ? 'Viga retangular de concreto armado 15×40 cm' : 'Reinforced concrete rectangular beam 15×40 cm',
      shape: 'rect',
      width: 0.15,
      depth: 0.4,
      materialId: 'mat_concreto',
      cost: 340,
    },
    {
      id: 'bt_conc_20x50',
      name: pt ? 'Viga Concreto 20×50 cm' : 'Concrete Beam 20×50 cm',
      code: 'VG-02',
      description: pt ? 'Viga retangular de concreto armado 20×50 cm' : 'Reinforced concrete rectangular beam 20×50 cm',
      shape: 'rect',
      width: 0.2,
      depth: 0.5,
      materialId: 'mat_concreto',
      cost: 460,
    },
    {
      id: 'bt_steel_w310',
      name: pt ? 'Viga Metálica W310×38.7' : 'Steel Beam W310×38.7',
      code: 'VM-01',
      description: pt ? 'Perfil estrutural de aço W310×38.7' : 'Structural steel beam W310×38.7',
      shape: 'i-section',
      width: 0.165,
      depth: 0.31,
      flangeThickness: 0.0097,
      webThickness: 0.0058,
      materialId: 'mat_aco',
      cost: 780,
    },
  ];
}

export const DEFAULT_BEAM_TYPES: BeamType[] = beamTypes('pt');

export function beamTypeMap(p: Project): Record<Id, BeamType> {
  return p.beamTypes ?? Object.fromEntries(DEFAULT_BEAM_TYPES.map((t) => [t.id, t]));
}

export function findBeamType(p: Project, typeId: Id): BeamType {
  const map = beamTypeMap(p);
  return map[typeId] ?? DEFAULT_BEAM_TYPES[0]!;
}

export function beamsOnLevel(p: Project, levelId: Id): Beam[] {
  return Object.values(p.elements)
    .filter(isBeam)
    .filter((b) => b.levelId === levelId)
    .sort((a, b) => a.order - b.order);
}

export function makeBeam(
  input: { id: Id; typeId: Id; levelId: Id; a: Vec2; b: Vec2 } & Partial<Omit<Beam, 'id' | 'kind' | 'order'>>,
): Omit<Beam, 'order'> {
  return {
    kind: 'beam',
    sag: 0,
    zOffset: 0,
    justify: 'center',
    mark: '',
    comments: '',
    ...input,
  };
}

/** Arco geométrico da viga quando há flecha não nula; `null` para vigas retas. */
export function beamArc(b: Pick<Beam, 'a' | 'b' | 'sag'>): Arc | null {
  return b.sag ? arcFromSagitta(b.a, b.b, b.sag) : null;
}

/** Ponto médio real ao longo do eixo da viga (ápice do arco se curva, meio da corda se reta). */
export function beamMidPoint(b: Pick<Beam, 'a' | 'b' | 'sag'>): Vec2 {
  const arc = beamArc(b);
  return arc ? arcPointAt(arc, arc.length / 2, 0) : { x: (b.a.x + b.b.x) / 2, y: (b.a.y + b.b.y) / 2 };
}

/** Polilinha amostrada do eixo da viga (ou linha paralela deslocada `s` à esquerda). */
export function beamAxisPolyline(b: Pick<Beam, 'a' | 'b' | 'sag'>, s = 0, tol = 0.005): Vec2[] {
  const arc = beamArc(b);
  if (arc) return arcSample(arc, 0, arc.length, s, tol);
  const dx = b.b.x - b.a.x;
  const dy = b.b.y - b.a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [b.a, b.b];
  const nx = -dy / len;
  const ny = dx / len;
  return [
    { x: b.a.x + s * nx, y: b.a.y + s * ny },
    { x: b.b.x + s * nx, y: b.b.y + s * ny },
  ];
}

export function beamLength(b: Pick<Beam, 'a' | 'b' | 'sag'>): number {
  const arc = beamArc(b);
  return arc ? arc.length : dist(b.a, b.b);
}

/** Offsets transversais [o1, o2] e linha média `sMid` à esquerda de `a→b`, conforme `justify`. */
export function beamJustifyOffsets(
  b: Pick<Beam, 'justify'>,
  t?: Pick<BeamType, 'width'>,
): { o1: number; o2: number; sMid: number; width: number } {
  const width = t?.width ?? 0.2;
  let o1: number;
  let o2: number;
  if (b.justify === 'left') {
    o1 = 0;
    o2 = width;
  } else if (b.justify === 'right') {
    o1 = -width;
    o2 = 0;
  } else {
    o1 = -width / 2;
    o2 = width / 2;
  }
  return { o1, o2, sMid: (o1 + o2) / 2, width };
}

export interface BeamSectionBox {
  s0: number;
  s1: number;
  z0: number;
  z1: number;
}

/** Dimensões efetivas de mesa (`fw`, `tf`) e alma (`tw`) da seção transversal da viga. */
export function beamProfileDims(
  t?: Pick<BeamType, 'shape' | 'width' | 'depth' | 'flangeWidth' | 'flangeThickness' | 'webThickness'>,
  height?: number,
): { fw: number; tf: number; tw: number } {
  const depth = Math.max(0.02, height ?? t?.depth ?? 0.4);
  const fw = Math.max(0.02, t?.flangeWidth ?? t?.width ?? 0.2);
  const tf =
    t?.shape === 't-section'
      ? Math.min(t?.flangeThickness ?? 0.08, depth * 0.45)
      : Math.min(t?.flangeThickness ?? 0.015, depth * 0.4);
  const tw = Math.min(t?.webThickness ?? (t?.shape === 't-section' ? 0.12 : 0.01), fw * 0.9);
  return { fw, tf, tw };
}

/** Sub-retângulos (s0..s1 × z0..z1) que compõem a seção da viga (`rect`, `t-section` ou `i-section`). */
export function beamProfileParts(
  b: Pick<Beam, 'justify'>,
  t: Pick<BeamType, 'shape' | 'width' | 'depth' | 'flangeWidth' | 'flangeThickness' | 'webThickness'>,
  z0: number,
  z1: number,
): BeamSectionBox[] {
  const { o1, o2, sMid } = beamJustifyOffsets(b, t);
  if (t.shape === 'rect') return [{ s0: o1, s1: o2, z0, z1 }];
  const { fw, tf, tw } = beamProfileDims(t, z1 - z0);
  const s0 = sMid - fw / 2;
  const s1 = sMid + fw / 2;
  const w0 = sMid - tw / 2;
  const w1 = sMid + tw / 2;
  if (t.shape === 't-section') {
    return [
      { s0: w0, s1: w1, z0, z1: z1 - tf },
      { s0, s1, z0: z1 - tf, z1 },
    ];
  }
  return [
    { s0, s1, z0, z1: z0 + tf },
    { s0: w0, s1: w1, z0: z0 + tf, z1: z1 - tf },
    { s0, s1, z0: z1 - tf, z1 },
  ];
}

/** Contorno contínuo anti-horário da seção transversal em coordenadas `(s, z)` no plano perpendicular ao eixo. */
export function beamProfileRingSZ(
  b: Pick<Beam, 'justify'>,
  t: Pick<BeamType, 'shape' | 'width' | 'depth' | 'flangeWidth' | 'flangeThickness' | 'webThickness'>,
  z0: number,
  z1: number,
): Vec2[] {
  const { o1, o2, sMid } = beamJustifyOffsets(b, t);
  if (t.shape !== 'i-section' && t.shape !== 't-section') {
    return [
      { x: o1, y: z0 },
      { x: o2, y: z0 },
      { x: o2, y: z1 },
      { x: o1, y: z1 },
    ];
  }
  const { fw, tf, tw } = beamProfileDims(t, z1 - z0);
  const s0 = sMid - fw / 2;
  const s1 = sMid + fw / 2;
  const w0 = sMid - tw / 2;
  const w1 = sMid + tw / 2;
  if (t.shape === 't-section') {
    return [
      { x: w0, y: z0 },
      { x: w1, y: z0 },
      { x: w1, y: z1 - tf },
      { x: s1, y: z1 - tf },
      { x: s1, y: z1 },
      { x: s0, y: z1 },
      { x: s0, y: z1 - tf },
      { x: w0, y: z1 - tf },
    ];
  }
  return [
    { x: s0, y: z0 },
    { x: s1, y: z0 },
    { x: s1, y: z0 + tf },
    { x: w1, y: z0 + tf },
    { x: w1, y: z1 - tf },
    { x: s1, y: z1 - tf },
    { x: s1, y: z1 },
    { x: s0, y: z1 },
    { x: s0, y: z1 - tf },
    { x: w0, y: z1 - tf },
    { x: w0, y: z0 + tf },
    { x: s0, y: z0 + tf },
  ];
}

/** Faixa em planta da viga entre offsets transversais `s0` e `s1` (reta ou curva). */
export function beamStripPolygon(b: Pick<Beam, 'a' | 'b' | 'sag'>, s0: number, s1: number): Vec2[] {
  const arc = beamArc(b);
  if (arc) {
    const side0 = arcSample(arc, 0, arc.length, s0, 0.005);
    const side1 = arcSample(arc, 0, arc.length, s1, 0.005).reverse();
    return [...side0, ...side1];
  }
  const dx = b.b.x - b.a.x;
  const dy = b.b.y - b.a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [b.a, b.a, b.a, b.a];
  const nx = -dy / len;
  const ny = dx / len;
  return [
    { x: b.a.x + s0 * nx, y: b.a.y + s0 * ny },
    { x: b.b.x + s0 * nx, y: b.b.y + s0 * ny },
    { x: b.b.x + s1 * nx, y: b.b.y + s1 * ny },
    { x: b.a.x + s1 * nx, y: b.a.y + s1 * ny },
  ];
}

export function beamPolygon(b: Pick<Beam, 'a' | 'b' | 'justify' | 'sag'>, t?: Pick<BeamType, 'width'>): Vec2[] {
  const { o1, o2 } = beamJustifyOffsets(b, t);
  return beamStripPolygon(b, o1, o2);
}

export function beamSectionArea(t: Pick<BeamType, 'shape' | 'width' | 'depth' | 'flangeWidth' | 'flangeThickness' | 'webThickness'>): number {
  if (t.shape === 'rect') return t.width * t.depth;
  const { fw, tf, tw } = beamProfileDims(t, t.depth);
  if (t.shape === 't-section') return fw * tf + Math.max(0, t.depth - tf) * tw;
  return 2 * fw * tf + Math.max(0, t.depth - 2 * tf) * tw;
}

export function beamElevationSpan(
  p: Project,
  b: Beam,
  t?: Pick<BeamType, 'depth'>,
): { z0: number; z1: number; depth: number } {
  const depth = t?.depth ?? 0.4;
  const z1 = levelElevation(p, b.levelId) + b.zOffset;
  const z0 = z1 - depth;
  return { z0, z1, depth };
}
