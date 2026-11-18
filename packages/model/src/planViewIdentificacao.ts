import type { SheetViewSource } from './sheet.ts';
import type { Id, Project, ViewHiddenTarget } from './types.ts';
import { floorViewId, roofViewId } from './planViewIds.ts';
import { planViewOf, type PlanView } from './planView.ts';

/**
 * Forma única de identificar uma vista de planta (docs/vistas/PLANO-MESTRE.md §4.4): o id da `PlanView`. Aqui ficam
 * as conversões das formas antigas (`levelId` + tipo, `planId`), aceitas na entrada de comando e de arquivo.
 */

/** Alvo de ocultação já na forma única: planta por `viewId`, corte ou 3D. */
export type ViewHiddenTargetNormal = Extract<ViewHiddenTarget, { kind: 'plan'; viewId: Id } | { kind: 'section' } | { kind: '3d' }>;

/** Fonte de viewport já na forma única: planta por `viewId`, quadro de áreas, corte ou 3D. */
export type SheetViewSourceNormal = Exclude<SheetViewSource, { kind: 'areaPlan' } | { kind: 'plan'; levelId: Id }>;

/** Alvo de ocultação na forma única; aceita a antiga (`{plan|roof, levelId}`, `{area, planId}`). Não valida existência. */
export function normalizeViewHiddenTarget(t: ViewHiddenTarget): ViewHiddenTargetNormal {
  if (t.kind === 'plan') return 'viewId' in t ? t : { kind: 'plan', viewId: floorViewId(t.levelId) };
  if (t.kind === 'roof') return { kind: 'plan', viewId: roofViewId(t.levelId) };
  if (t.kind === 'area') return { kind: 'plan', viewId: t.planId };
  return t;
}

/** Fonte de viewport na forma única; aceita a antiga (`{plan, levelId}`, `{areaPlan, planId}`). Não valida existência. */
export function normalizeSheetViewSource(v: SheetViewSource): SheetViewSourceNormal {
  if (v.kind === 'plan') return 'viewId' in v ? v : { kind: 'plan', viewId: floorViewId(v.levelId) };
  if (v.kind === 'areaPlan') return { kind: 'plan', viewId: v.planId };
  return v;
}

/** Id da vista de planta de uma fonte de viewport (forma nova ou antiga); `null` para quadro de áreas, corte e 3D. */
export function sheetPlanViewId(v: SheetViewSource): Id | null {
  const n = normalizeSheetViewSource(v);
  return n.kind === 'plan' ? n.viewId : null;
}

/** Vista de planta (`PlanView`) de uma fonte de viewport (forma nova ou antiga); `undefined` se não é planta ou não existe. */
export function sheetPlanViewOf(p: Pick<Project, 'planViews'>, v: SheetViewSource): PlanView | undefined {
  const id = sheetPlanViewId(v);
  return id === null ? undefined : planViewOf(p, id);
}

type Raw = Record<string, unknown>;

/**
 * Normaliza, num projeto BRUTO (JSON ainda não tipado), as fontes das viewports de prancha para a forma única.
 * Idempotente; não toca em nada além de `sheets[].viewports[].view`.
 */
export function normalizeSheetSourcesRaw(raw: Raw): Raw {
  if (!Array.isArray(raw.sheets)) return raw;
  let mudou = false;
  const sheets = (raw.sheets as Raw[]).map((s) => {
    if (!s || !Array.isArray(s.viewports)) return s;
    const viewports = (s.viewports as Raw[]).map((vp) => {
      const view = vp?.view as SheetViewSource | undefined;
      if (!view || typeof view !== 'object') return vp;
      const next = normalizeSheetViewSource(view);
      if (next === view) return vp;
      mudou = true;
      return { ...vp, view: next };
    });
    return { ...s, viewports };
  });
  return mudou ? { ...raw, sheets } : raw;
}
