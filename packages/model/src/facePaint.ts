import type { FaceShape2D, SlatsSpec, Vec2 } from '@hestia/geom';
import type { Command } from './commands.ts';
import { isFloor, isSlab, isWall, type Element, type Floor, type Id, type Project, type Slab, type Wall } from './types.ts';

export type WallFaceSlot =
  | 'sideExt'
  | 'sideInt'
  | 'endA'
  | 'endB'
  | 'top'
  | 'bottom'
  | `opening:${string}:${'sill' | 'head' | 'jambLeft' | 'jambRight'}`;

export type PlanarFaceSlot = 'top' | 'bottom' | `edge:${number}:${number}`;

export type FaceSlot = WallFaceSlot | PlanarFaceSlot;

export type FaceLayerTarget = number | 'all';

export type FaceKey = string;

export interface FaceRegion {
  id: Id;
  name?: string;
  shape: FaceShape2D;
  materialId: Id;
  order: number;
  baseOffset?: number;
  thickness?: number;
  cutMode?: 'clipBelow' | 'overlay';
  slats?: SlatsSpec;
}

export interface FaceDxfOverlay {
  id: Id;
  name: string;
  paths: Array<{ pts: Vec2[]; closed: boolean }>;
  offset: Vec2;
  rotationDeg: number;
  scale: number;
  separatorWidth: number;
  materialId?: Id;
  baseOffset?: number;
  thickness?: number;
}

export interface FacePaintEntry {
  face: FaceSlot;
  layer: FaceLayerTarget;
  materialId?: Id;
  regions?: FaceRegion[];
  dxfOverlays?: FaceDxfOverlay[];
}

export type FacePaintCommand =
  | { type: 'setFacePaint'; elementId: Id; entry: FacePaintEntry }
  | { type: 'removeFacePaint'; elementId: Id; face: FaceSlot; layer?: FaceLayerTarget };

/** Builds a stable string key for a `(face, layer)` paint target. */
export function faceKeyOf(face: FaceSlot, layer: FaceLayerTarget): FaceKey {
  return `${face}@${layer}`;
}

/** Parses a `FaceKey` back into `{ face, layer }`. */
export function parseFaceKey(key: string): { face: FaceSlot; layer: FaceLayerTarget } {
  const idx = key.lastIndexOf('@');
  if (idx <= 0) return { face: key as FaceSlot, layer: 'all' };
  const face = key.slice(0, idx) as FaceSlot;
  const rawLayer = key.slice(idx + 1);
  if (rawLayer === 'all') return { face, layer: 'all' };
  const n = Number(rawLayer);
  if (Number.isInteger(n) && n >= 0) return { face, layer: n };
  return { face, layer: 'all' };
}

/** Finds the effective paint entry for `(face, layer)`, falling back to `layer = 'all'`. */
export function findFacePaint(
  entries: readonly FacePaintEntry[] | undefined,
  face: FaceSlot,
  layer: number,
): FacePaintEntry | undefined {
  if (!entries || entries.length === 0) return undefined;
  return entries.find((e) => e.face === face && e.layer === layer) ?? entries.find((e) => e.face === face && e.layer === 'all');
}

/** Finds an exact paint entry matching `(face, layer)` without falling back to `'all'`. */
export function findExactFacePaint(
  entries: readonly FacePaintEntry[] | undefined,
  face: FaceSlot,
  layer: FaceLayerTarget,
): FacePaintEntry | undefined {
  return entries?.find((e) => e.face === face && e.layer === layer);
}

/** Resolves the effective base material for `(face, layer)`, defaulting to `defaultMaterialId`. */
export function effectiveFaceMaterial(
  entries: readonly FacePaintEntry[] | undefined,
  face: FaceSlot,
  layer: number,
  defaultMaterialId: Id,
): Id {
  return findFacePaint(entries, face, layer)?.materialId ?? defaultMaterialId;
}

/** Lists all paintable faces available on an element. */
export function availableFacesForElement(_p: Project, el: Element): Array<{ face: FaceSlot; kind: 'wall' | 'floor' | 'slab' }> {
  if (isWall(el)) {
    const slots: WallFaceSlot[] = ['sideExt', 'sideInt', 'endA', 'endB', 'top', 'bottom'];
    return slots.map((face) => ({ face, kind: 'wall' }));
  }
  if (isFloor(el) || isSlab(el)) {
    const kind = el.kind;
    const out: Array<{ face: FaceSlot; kind: 'floor' | 'slab' }> = [
      { face: 'top', kind },
      { face: 'bottom', kind },
    ];
    for (let i = 0; i < el.boundary.length; i++) {
      out.push({ face: `edge:0:${i}`, kind });
    }
    for (let r = 0; r < el.holes.length; r++) {
      const hole = el.holes[r]!;
      for (let i = 0; i < hole.length; i++) {
        out.push({ face: `edge:${r + 1}:${i}`, kind });
      }
    }
    return out;
  }
  return [];
}

/** Type guard for elements supporting per-face painting (`Wall`, `Floor`, `Slab`). */
export function isFacePaintableElement(e: Element | undefined): e is Wall | Floor | Slab {
  return isWall(e) || isFloor(e) || isSlab(e);
}

function hasPaintContent(entry: FacePaintEntry): boolean {
  return Boolean(
    entry.materialId ||
      (entry.regions && entry.regions.length > 0) ||
      (entry.dxfOverlays && entry.dxfOverlays.length > 0),
  );
}

/** Applies face paint commands (`setFacePaint`, `removeFacePaint`). Returns true if handled. */
export function applyFacePaintCommand(p: Project, c: Command): boolean {
  switch (c.type) {
    case 'setFacePaint': {
      const el = p.elements[c.elementId];
      if (!isFacePaintableElement(el)) return true;
      const prev = el.facePaints ?? [];
      let next: FacePaintEntry[];
      if (!hasPaintContent(c.entry)) {
        next = prev.filter((e) => !(e.face === c.entry.face && e.layer === c.entry.layer));
        if (next.length === prev.length) return true;
      } else {
        const idx = prev.findIndex((e) => e.face === c.entry.face && e.layer === c.entry.layer);
        next = idx >= 0 ? prev.map((e, i) => (i === idx ? c.entry : e)) : [...prev, c.entry];
      }
      p.elements[c.elementId] = { ...el, facePaints: next.length > 0 ? next : undefined };
      return true;
    }
    case 'removeFacePaint': {
      const el = p.elements[c.elementId];
      if (!isFacePaintableElement(el)) return true;
      const prev = el.facePaints ?? [];
      if (prev.length === 0) return true;
      const next = prev.filter((e) => !(e.face === c.face && (c.layer === undefined || e.layer === c.layer)));
      if (next.length === prev.length) return true;
      p.elements[c.elementId] = { ...el, facePaints: next.length > 0 ? next : undefined };
      return true;
    }
    default:
      return false;
  }
}
