import type { DxfBatchRenderers } from './dxfBatch.types.ts';
import { areaPlanDxf } from './dxfAreaPlan.ts';
import { planDxf, sectionDxf } from './dxfExport.ts';
import { sheetDxf } from './dxfSheet.ts';

/**
 * Renderizadores reais do lote de exportação: os mesmos exportadores da vista ativa, com a unidade escolhida no diálogo
 * e (nas plantas) a projeção da cobertura. A prancha sai "como plotada", no modo do Revit.
 */
export const dxfBatchRenderers: DxfBatchRenderers = {
  plan: (p, levelId, options) => planDxf(p, levelId, options.showRoofProjection, options.units, options.lang),
  area: (p, planId, options) => areaPlanDxf(p, planId, options.units),
  section: (p, viewId, options) => sectionDxf(p, viewId, options.units, options.lang),
  sheet: (p, sheetId, options) => sheetDxf(p, sheetId, { units: options.units, ...(options.lang === undefined ? {} : { lang: options.lang }) }),
};
