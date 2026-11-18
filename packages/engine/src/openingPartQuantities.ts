import { isOpening, openingHeight, openingSill, openingType, ringPerimeter, ringSignedArea, type Id, type Opening, type OPt, type Project } from '@hestia/model';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { buildOpeningModel } from './openingModel.ts';
import type { OpeningModel, OpeningPart, PartRole } from './openingModelTypes.ts';

/*
 * Quantitativo das PEÇAS da esquadria (docs/estudo-esquadrias/28): volume, área da face e perímetro reais de cada peça do
 * modelo único, também quando ela segue o contorno do vão (prisma `tz`, `ts` ou `sz`). Antes não havia quantitativo de peças.
 *
 * - `volume`: seção x extrusão. Caixa: t x s x z. Perfil `ts`/`sz`/`tz`: área da seção x o comprimento da extrusão.
 * - `faceArea`: área da silhueta em elevação (plano t-z): caixa = t x z; `tz` = área do polígono da seção. É a área do vidro.
 * - `perimeter`: perímetro dessa silhueta (m): para `tz`, o do polígono; para caixa, 2 (t + z).
 * Peças tracejadas (cavidade de embutir, trilho projetado) e `pocket` não são sólidos e ficam de fora dos totais.
 */

export interface PartQuantity {
  id: string;
  role: PartRole;
  /** m3. */
  volume: number;
  /** m2, silhueta em elevação. */
  faceArea: number;
  /** m. */
  perimeter: number;
}

const ringArea = (pts: Array<[number, number]>): number => Math.abs(ringSignedArea(pts as OPt[]));

/** Quantidades de uma peça. */
export function partQuantity(part: OpeningPart): PartQuantity {
  const b = part.box;
  const dt = b.t1 - b.t0;
  const ds = b.s1 - b.s0;
  const dz = b.z1 - b.z0;
  const pr = part.profile;
  let volume = dt * ds * dz;
  let faceArea = dt * dz;
  let perimeter = 2 * (dt + dz);
  if (pr) {
    const a = ringArea(pr.pts);
    if (pr.plane === 'tz') {
      volume = a * ds;
      faceArea = a;
      perimeter = ringPerimeter(pr.pts as OPt[]);
    } else if (pr.plane === 'ts') volume = a * dz;
    else volume = a * dt;
  }
  return { id: part.id, role: part.role, volume, faceArea, perimeter };
}

export interface PartRoleTotals {
  count: number;
  volume: number;
  faceArea: number;
  perimeter: number;
}

export interface ModelQuantities {
  parts: PartQuantity[];
  byRole: Partial<Record<PartRole, PartRoleTotals>>;
}

/** Quantidades das peças do modelo (uma esquadria), com o total por papel (batente, alizar, vidro...). */
export function modelQuantities(m: OpeningModel): ModelQuantities {
  const parts: PartQuantity[] = [];
  const byRole: Partial<Record<PartRole, PartRoleTotals>> = {};
  for (const part of m.parts) {
    if (part.role === 'pocket' || part.dashed) continue;
    const q = partQuantity(part);
    parts.push(q);
    const t = byRole[q.role] ?? { count: 0, volume: 0, faceArea: 0, perimeter: 0 };
    t.count += 1;
    t.volume += q.volume;
    t.faceArea += q.faceArea;
    t.perimeter += q.perimeter;
    byRole[q.role] = t;
  }
  return { parts, byRole };
}

/** Linha do quadro de peças: um tipo, na medida efetiva das instâncias, com as quantidades de UMA esquadria e as do grupo. */
export interface OpeningPartsRow {
  typeId: Id;
  height: number;
  sill: number;
  count: number;
  /** Uma esquadria (m, m2, m3). */
  unit: ModelQuantities['byRole'];
  /** Volume do batente (ombreiras, travessa, peitoril do caixilho e soleira), do alizar e área do vidro, por esquadria. */
  frameVolume: number;
  casingVolume: number;
  glassArea: number;
  leafVolume: number;
  /** As mesmas, multiplicadas pela quantidade. */
  totalFrameVolume: number;
  totalCasingVolume: number;
  totalGlassArea: number;
  totalLeafVolume: number;
}

const FRAME: ReadonlySet<PartRole> = new Set<PartRole>(['jamb', 'head', 'sillFrame', 'threshold', 'stop']);
const sum = (r: ModelQuantities['byRole'], roles: ReadonlySet<PartRole> | PartRole[], k: 'volume' | 'faceArea'): number =>
  [...roles].reduce((s, role) => s + (r[role]?.[k] ?? 0), 0);

/**
 * Quadro de peças do projeto: uma linha por tipo e medida efetiva (altura, peitoril), medida na primeira instância do grupo
 * (as peças só dependem do tipo, da medida e da parede, não do ponto da parede). Linha sem parede válida é omitida.
 */
export function buildOpeningPartsSchedule(p: Project): OpeningPartsRow[] {
  const groups = new Map<string, { o: Opening; count: number }>();
  for (const e of Object.values(p.elements)) {
    if (!isOpening(e) || !p.openingTypes[e.typeId]) continue;
    const t = openingType(p, e);
    const key = `${e.typeId}|${openingHeight(t, e)}|${openingSill(t, e)}`;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { o: e, count: 1 });
  }
  const rows: OpeningPartsRow[] = [];
  for (const { o, count } of groups.values()) {
    const f = frameOfWall(p, o.hostId);
    if (!f) continue;
    const t = openingType(p, o);
    const unit = modelQuantities(buildOpeningModel(p, o, openingGeometry(p, o, f), f)).byRole;
    const frameVolume = sum(unit, FRAME, 'volume');
    const casingVolume = sum(unit, ['casing'], 'volume');
    const glassArea = sum(unit, ['glass'], 'faceArea');
    const leafVolume = sum(unit, ['leaf'], 'volume');
    rows.push({
      typeId: o.typeId,
      height: openingHeight(t, o),
      sill: openingSill(t, o),
      count,
      unit,
      frameVolume,
      casingVolume,
      glassArea,
      leafVolume,
      totalFrameVolume: frameVolume * count,
      totalCasingVolume: casingVolume * count,
      totalGlassArea: glassArea * count,
      totalLeafVolume: leafVolume * count,
    });
  }
  return rows.sort((a, b) => a.typeId.localeCompare(b.typeId) || a.height - b.height || a.sill - b.sill);
}
