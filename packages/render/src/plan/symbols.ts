import { openingPlanWorldPaths as openingPlanWorldPathsEngine, type OpeningGeometry, type OpeningModel, type OpeningPlanOptions, type OpeningPlanRole } from '@hestia/engine';
import type { Vec2 } from '@hestia/geom';
import { espessuraVezes } from './espessura.ts';
import type { Espessura, PlanTheme, StrokeOp } from './types.ts';

/** Nível de detalhe da planta, incluindo o desligado (spec E §4.1). */
export type OpeningSymbolDetail = 'low' | 'mid' | 'high' | 'off';

/** Opções do símbolo de planta: o modelo único, o detalhe e a convenção de abertura. */
export interface OpeningSymbolOptions extends Omit<OpeningPlanOptions, 'detail'> {
  detail: OpeningSymbolDetail;
}

/** Traço do símbolo já em coordenadas do mundo (a mesma geometria que o DXF recebe). */
export interface OpeningPlanWorldPath {
  pts: Vec2[];
  closed: boolean;
  weight: number;
  tone: 'cut' | 'ink' | 'soft';
  dash?: [number, number];
  role: OpeningPlanRole;
}

/** Limiares de zoom em que o detalhe da esquadria muda (px/m): 20 px/m (≈ 1:300) e 100 px/m (≈ 1:60). */
export const OPENING_DETAIL_ZOOMS = [20 * (1 + 1e-9), 100 * (1 + 1e-9)] as const;

/**
 * Nível efetivo pelo zoom da vista (px/m): baixo até 20 px/m; médio até 100 px/m; alto acima disso.
 * Com o registro de limiares da geometria, anota os dois limiares consultados (ver `limiares.ts`).
 */
export function openingDetailByZoom(zoom: number, limiares?: { registrar(z: number): void }): 'low' | 'mid' | 'high' {
  limiares?.registrar(OPENING_DETAIL_ZOOMS[0]);
  limiares?.registrar(OPENING_DETAIL_ZOOMS[1]);
  if (!Number.isFinite(zoom) || zoom <= 0) return 'low';
  if (zoom <= OPENING_DETAIL_ZOOMS[0]) return 'low';
  if (zoom <= OPENING_DETAIL_ZOOMS[1]) return 'mid';
  return 'high';
}

/** Detalhe efetivo do tipo: `'scale'` escolhe pelo zoom; `'off'` continua desligado. */
export function openingPlanDetail(detail: 'scale' | OpeningSymbolDetail, zoom: number, limiares?: { registrar(z: number): void }): OpeningSymbolDetail {
  return detail === 'scale' ? openingDetailByZoom(zoom, limiares) : detail;
}

export function openingPlanWorldPaths(g: OpeningGeometry, model: OpeningModel, opts: OpeningSymbolOptions): OpeningPlanWorldPath[] {
  if (opts.detail === 'off') return [];
  return openingPlanWorldPathsEngine(g, model, opts);
}

/**
 * Pesos de traço em 3 classes (fino, normal, forte): cada peso distinto vira uma malha na GPU, e o orçamento de draw
 * calls da planta (gpuPlan.test.ts) não comporta um peso por traço.
 */
export const pesoEmClasse = (w: number): number => (w <= 0.85 ? 0.7 : w < 1.2 ? 1 : 1.4);

/**
 * Símbolo de planta da abertura, a partir do modelo único (spec E §4.1). `cut` vai na tinta com a espessura de corte;
 * `ink` e `soft` seguem o desenho de antes (tinta e tinta leve, com o fator de peso do traço).
 */
export function openingSymbol(g: OpeningGeometry, model: OpeningModel, theme: PlanTheme, largura: number | Espessura, opts: OpeningSymbolOptions): StrokeOp[] {
  const base: Espessura = typeof largura === 'number' ? { widthPx: largura } : largura;
  return openingPlanWorldPaths(g, model, opts).map((s) => ({
    pts: s.pts,
    closed: s.closed,
    ...espessuraVezes(base, pesoEmClasse(s.weight)),
    color: s.tone === 'soft' ? theme.inkSoft : theme.ink,
    alpha: 1,
    ...(s.dash ? { dash: s.dash } : {}),
    role: s.role,
  }));
}
