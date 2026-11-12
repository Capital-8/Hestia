import { floorViewId } from './planViewIds.ts';

/**
 * Leitura de ARQUIVO antigo: as fontes das viewports de prancha na forma antiga (`{ plan, levelId }` do piso do nível e
 * `{ areaPlan, planId }` da planta de área) viram a forma única `{ plan, viewId }` (docs/vistas/PLANO-MESTRE.md §4.4).
 * Só aqui a forma antiga existe: o tipo `SheetViewSource` não a conhece mais.
 */

type Raw = Record<string, unknown>;

/** Fonte de viewport BRUTA na forma única; devolve o próprio objeto quando já está nela (ou não é planta). */
function normalizaFonteBruta(v: Raw): Raw {
  if (v.kind === 'plan' && typeof v.viewId !== 'string' && typeof v.levelId === 'string') return { kind: 'plan', viewId: floorViewId(v.levelId) };
  if (v.kind === 'areaPlan' && typeof v.planId === 'string') return { kind: 'plan', viewId: v.planId };
  return v;
}

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
      const view = vp?.view as Raw | undefined;
      if (!view || typeof view !== 'object') return vp;
      const next = normalizaFonteBruta(view);
      if (next === view) return vp;
      mudou = true;
      return { ...vp, view: next };
    });
    return { ...s, viewports };
  });
  return mudou ? { ...raw, sheets } : raw;
}
