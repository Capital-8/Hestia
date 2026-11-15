import type { Vec2 } from '@hestia/geom';
import { findColumnType, findFootingType, isColumn, type ColumnType, type Id, type Project } from '@hestia/model';

export type StructuralAnchorPreset = 'tl' | 'top' | 'tr' | 'left' | 'center' | 'right' | 'bl' | 'bottom' | 'br';
export type AnchorNumKey = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export interface StructuralPresetDef {
  readonly id: StructuralAnchorPreset;
  readonly glyph: string;
  readonly numKey: AnchorNumKey;
  readonly gridCol: 0 | 1 | 2;
  readonly gridRow: 0 | 1 | 2;
}

/** Grade 3x3 em ordem de leitura (linha superior 7-8-9, centro 4-5-6, inferior 1-2-3 como no teclado numérico). */
export const STRUCTURAL_PRESETS: readonly StructuralPresetDef[] = [
  { id: 'tl', glyph: '↖', numKey: '7', gridCol: 0, gridRow: 0 },
  { id: 'top', glyph: '↑', numKey: '8', gridCol: 1, gridRow: 0 },
  { id: 'tr', glyph: '↗', numKey: '9', gridCol: 2, gridRow: 0 },
  { id: 'left', glyph: '←', numKey: '4', gridCol: 0, gridRow: 1 },
  { id: 'center', glyph: '●', numKey: '5', gridCol: 1, gridRow: 1 },
  { id: 'right', glyph: '→', numKey: '6', gridCol: 2, gridRow: 1 },
  { id: 'bl', glyph: '↙', numKey: '1', gridCol: 0, gridRow: 2 },
  { id: 'bottom', glyph: '↓', numKey: '2', gridCol: 1, gridRow: 2 },
  { id: 'br', glyph: '↘', numKey: '3', gridCol: 2, gridRow: 2 },
];

export const PRESET_BY_NUMKEY: Readonly<Record<AnchorNumKey, StructuralAnchorPreset>> = {
  '7': 'tl',
  '8': 'top',
  '9': 'tr',
  '4': 'left',
  '5': 'center',
  '6': 'right',
  '1': 'bl',
  '2': 'bottom',
  '3': 'br',
};

export const NUMKEY_BY_PRESET: Readonly<Record<StructuralAnchorPreset, AnchorNumKey>> = {
  tl: '7',
  top: '8',
  tr: '9',
  left: '4',
  center: '5',
  right: '6',
  bl: '1',
  bottom: '2',
  br: '3',
};

/** Ordem horária das 8 bordas/cantos usada ao tabular com Espaço. */
export const STRUCTURAL_BOUNDARY_CYCLE: readonly StructuralAnchorPreset[] = [
  'tl',
  'top',
  'tr',
  'right',
  'br',
  'bottom',
  'bl',
  'left',
];

/**
 * Sinal no referencial local (em que +Y fica no topo e -Y na base em planta) para deslocar o
 * centro do elemento quando a face/canto indicado encosta no ponto de lançamento ou divisa.
 */
export const STRUCTURAL_ANCHOR_SIGN: Readonly<Record<StructuralAnchorPreset, readonly [number, number]>> = {
  center: [0, 0],
  left: [1, 0],
  right: [-1, 0],
  bottom: [0, 1],
  top: [0, -1],
  bl: [1, 1],
  br: [-1, 1],
  tl: [1, -1],
  tr: [-1, -1],
};

const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;

export function isAnchorNumKey(key: string): key is AnchorNumKey {
  return key in PRESET_BY_NUMKEY;
}

/**
 * Calcula `(eccentricityX, eccentricityY)` no referencial local da sapata para alinhar sua borda
 * ou canto com o ponto de carga (`colW = colD = 0`) ou face externa do pilar vinculado.
 */
export function footingPresetOffset(
  p: Project,
  footingTypeId: Id,
  columnId: Id | null | undefined,
  footingRotation: number,
  preset: StructuralAnchorPreset,
): { eccentricityX: number; eccentricityY: number } {
  const ft = findFootingType(p, footingTypeId);
  let colW = 0;
  let colD = 0;
  const col = columnId ? p.elements[columnId] : undefined;
  if (isColumn(col)) {
    const ct = findColumnType(p, col.typeId);
    const rawW = ct.width;
    const rawD = ct.shape === 'round' ? ct.width : ct.depth;
    const dRot = col.rotation - footingRotation;
    const c = Math.abs(Math.cos(dRot));
    const s = Math.abs(Math.sin(dRot));
    colW = c * rawW + s * rawD;
    colD = s * rawW + c * rawD;
  }
  const dx = Math.max(0, (ft.width - colW) / 2);
  const dy = Math.max(0, (ft.length - colD) / 2);
  const [sx, sy] = STRUCTURAL_ANCHOR_SIGN[preset];
  return {
    eccentricityX: round4(sx * dx),
    eccentricityY: round4(sy * dy),
  };
}

/** Identifica qual preset 3x3 corresponde aos valores atuais `(ex, ey)` da sapata. */
export function matchingFootingPreset(
  p: Project,
  footingTypeId: Id,
  columnId: Id | null | undefined,
  footingRotation: number,
  ex: number,
  ey: number,
  tol = 1e-3,
): StructuralAnchorPreset | null {
  if (Math.hypot(ex, ey) <= tol) return 'center';
  for (const preset of STRUCTURAL_BOUNDARY_CYCLE) {
    const off = footingPresetOffset(p, footingTypeId, columnId, footingRotation, preset);
    if (Math.hypot(off.eccentricityX - ex, off.eccentricityY - ey) <= tol) return preset;
  }
  return null;
}

/** Próximo preset de canto/borda na ordem horária (ignora `'center'`). */
export function nextBoundaryPreset(current: StructuralAnchorPreset | null | undefined): StructuralAnchorPreset {
  if (!current || current === 'center') return STRUCTURAL_BOUNDARY_CYCLE[0]!;
  const idx = STRUCTURAL_BOUNDARY_CYCLE.indexOf(current);
  return STRUCTURAL_BOUNDARY_CYCLE[(idx + 1) % STRUCTURAL_BOUNDARY_CYCLE.length]!;
}

/**
 * Deslocamento em coordenadas de mundo para posicionar o centro do pilar quando o cursor marca
 * o vértice/face escolhido (`anchor`). Para `'center'`, retorna `{ x: 0, y: 0 }`.
 */
export function columnAnchorOffset(
  type: Pick<ColumnType, 'shape' | 'width' | 'depth'>,
  rotation: number,
  anchor: StructuralAnchorPreset = 'center',
): Vec2 {
  if (anchor === 'center') return { x: 0, y: 0 };
  const rawW = type.width;
  const rawD = type.shape === 'round' ? type.width : type.depth;
  const [sx, sy] = STRUCTURAL_ANCHOR_SIGN[anchor];
  const lx = (sx * rawW) / 2;
  const ly = (sy * rawD) / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: round4(lx * cos - ly * sin),
    y: round4(lx * sin + ly * cos),
  };
}
