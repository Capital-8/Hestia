import { floorViewId, roofViewId, type Id } from '@hestia/model';

/**
 * Leitura da sessão da aba gravada por versões antigas (`sessionStorage`). Antes da identificação única por `viewId`, a
 * planta era guardada como `levelId` + `planKind` + `areaPlanId`; aqui essa forma vira o `viewId` (piso `pv_<nível>`,
 * cobertura `pvr_<nível>` ou o id da planta de área). Só este arquivo conhece a forma antiga: o resto do editor usa
 * `viewId`. A sessão antiga continua abrindo as mesmas abas.
 */

/**
 * Id da vista de planta na forma antiga (`levelId` + `planKind` + `areaPlanId`); `null` na planta de área sem
 * `areaPlanId` (estado que já não abria nada).
 */
export function planViewIdDaAba(v: { levelId: Id; planKind?: string; areaPlanId?: Id | null }): Id | null {
  if (v.planKind === 'area') return v.areaPlanId ?? null;
  return v.planKind === 'roof' ? roofViewId(v.levelId) : floorViewId(v.levelId);
}

/** Aba de planta bruta (JSON) na forma antiga, convertida para `viewId`; `null` se não tem nível ou não abria nada. */
export function viewIdDaAbaAntiga(o: Record<string, unknown>): Id | null {
  if (typeof o.levelId !== 'string') return null;
  return planViewIdDaAba({
    levelId: o.levelId,
    ...(typeof o.planKind === 'string' ? { planKind: o.planKind } : {}),
    ...(typeof o.areaPlanId === 'string' ? { areaPlanId: o.areaPlanId } : {}),
  });
}

/**
 * Planta de fundo de uma sessão BRUTA sem `planViewId` (formato antigo): sai de `levelId`/`planKind`/`areaPlanId`. Sem
 * `planKind` não é sessão deste app (`null`). Planta de área sem id cai na planta de piso do nível.
 */
export function planViewIdDaSessaoAntiga(o: Record<string, unknown>): Id | null {
  if (typeof o.levelId !== 'string' || typeof o.planKind !== 'string') return null;
  const area = typeof o.areaPlanId === 'string' && o.areaPlanId !== '' ? o.areaPlanId : null;
  return planViewIdDaAba({ levelId: o.levelId, planKind: o.planKind, areaPlanId: area }) ?? floorViewId(o.levelId);
}
