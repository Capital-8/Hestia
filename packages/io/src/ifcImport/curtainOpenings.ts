import type { CellOverrideEntry, GridAxisSpec, Id, Wall } from '@hestia/model';
import { openingType, operationOf } from './elementTypes.ts';
import { bodyFor } from './genericImport.ts';
import type { Ctx } from './mapping.ts';
import type { StepEntity } from './step.ts';
import { t } from '../i18n.ts';

/**
 * Portas e janelas agregadas a uma `IFCCURTAINWALL` (o Revit exporta a porta de vidro da fachada como filha da cortina,
 * sem `IfcRelVoidsElement`/`IfcRelFillsElement`). No Hestia a esquadria de cortina é uma sobrescrita de célula
 * (`curtain.cells`, override `opening`): a caixa da peça precisa coincidir com UMA célula da grade deduzida. Quando não
 * coincide (a porta fugiria da grade), a peça segue para o fallback genérico, com aviso, em vez de uma esquadria errada.
 */

/** Folga entre a caixa da esquadria e as bordas da célula (m). */
const FIT = 0.12;

/** Bordas de um eixo da grade deduzida: [0, linhas..., total]. Só os modos que a importação gera. */
function edges(axis: GridAxisSpec, total: number): number[] {
  if (axis.mode === 'fixedNumber') return Array.from({ length: (axis.count ?? 1) + 1 }, (_, k) => (total * k) / (axis.count ?? 1));
  if (axis.mode === 'manual') return [0, ...[...(axis.positions ?? [])].sort((a, b) => a - b), total];
  return [];
}

/** Índice da célula cujas bordas coincidem com [lo, hi] (dentro de `FIT`), ou -1. */
function cellOf(bordas: number[], lo: number, hi: number): number {
  for (let k = 0; k + 1 < bordas.length; k++) if (Math.abs(bordas[k]! - lo) <= FIT && Math.abs(bordas[k + 1]! - hi) <= FIT) return k;
  return -1;
}

export interface CurtainFrame {
  wallId: Id;
  /** Origem e direção da linha de base (u) e cota de base (z). */
  a: { x: number; y: number };
  dx: number;
  dy: number;
  length: number;
  height: number;
  zMin: number;
  u: GridAxisSpec;
  v: GridAxisSpec;
}

/** Converte as portas/janelas filhas da cortina em esquadrias de célula; devolve os ids IFC convertidos. */
export function attachCurtainOpenings(ctx: Ctx, wall: Wall, children: StepEntity[], fr: CurtainFrame): number[] {
  const bu = edges(fr.u, fr.length);
  const bv = edges(fr.v, fr.height);
  const done: number[] = [];
  const cells: CellOverrideEntry[] = [];
  const used = new Set<string>();
  for (const e of children) {
    if (e.type !== 'IFCDOOR' && e.type !== 'IFCWINDOW') continue;
    const body = bodyFor(ctx, e);
    const v = body.tris;
    if (v.length < 9) continue;
    let u0 = Infinity;
    let u1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i + 2 < v.length; i += 3) {
      const u = (v[i]! - fr.a.x) * fr.dx + (v[i + 1]! - fr.a.y) * fr.dy;
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      z0 = Math.min(z0, v[i + 2]! - fr.zMin);
      z1 = Math.max(z1, v[i + 2]! - fr.zMin);
    }
    const i = cellOf(bu, u0, u1);
    const j = cellOf(bv, z0, z1);
    const key = `${i}|${j}`;
    if (i < 0 || j < 0 || used.has(key)) {
      ctx.warn(t(ctx.lang, 'io_ifc_warn_curtain_opening_fallback', { name: ctx.f.text(e, 2).trim() || e.type }));
      continue;
    }
    used.add(key);
    const kind = e.type === 'IFCDOOR' ? 'door' : 'window';
    const w = bu[i + 1]! - bu[i]!;
    const h = bv[j + 1]! - bv[j]!;
    const typeId = openingType(ctx, e, kind, w, h, bv[j]!);
    cells.push({
      key: { i, j, s: (bu[i]! + bu[i + 1]!) / 2 / fr.length, z: (bv[j]! + bv[j + 1]!) / 2 / fr.height, nu: bu.length - 1, nv: bv.length - 1 },
      override: {
        kind: 'opening',
        openingTypeId: typeId,
        flipHand: /RIGHT/.test(operationOf(ctx.typeOf.get(e.id))),
        flipFacing: false,
        fit: 'cell',
        sillOverride: null,
        mark: ctx.f.text(e, 7),
      },
    });
    done.push(e.id);
    ctx.count(kind === 'door' ? 'portas' : 'janelas');
  }
  if (cells.length) wall.curtain = { ...(wall.curtain ?? {}), cells: [...(wall.curtain?.cells ?? []), ...cells] };
  return done;
}
