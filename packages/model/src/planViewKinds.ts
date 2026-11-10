import { DEFAULT_AREA_GRAPHICS } from './areaPlan.ts';
import type { PlanViewKind } from './planView.ts';
import { areaLayersOf, FLOOR_PROFILE_LAYERS, type ProfileLayers } from './viewProfile.ts';
import { DEFAULT_VIEW_RANGE, type ViewRange } from './viewRange.ts';

/**
 * Tabela única por tipo de vista de planta (docs/vistas/PLANO-MESTRE.md §4.6): direção, intervalo padrão, camadas
 * padrão e ferramentas permitidas. O id de ferramenta é `string` aqui: o tipo `ToolId` vive em `packages/tools`, que
 * `model` não pode importar (scripts/check-boundaries.mjs).
 */
export type ToolRule =
  | { mode: 'all' }
  | { mode: 'only'; ids: readonly string[] }
  | { mode: 'except'; ids: readonly string[] };

export interface PlanViewKindInfo {
  direction: 'down' | 'up';
  defaultRange: ViewRange;
  defaultLayers: ProfileLayers;
  tools: ToolRule;
}

/**
 * Ferramentas da planta de área HOJE: cópia de `AREA_PLAN_TOOLS` (apps/web/src/editor/controller.ts:65). Anotação e
 * ferramentas de ambiente; o resto (modelo) fica bloqueado. Na Fase 3 a planta de área passa a aceitar TODAS
 * (`{ mode: 'all' }`) e esta lista some junto com `AREA_PLAN_TOOLS`.
 */
export const AREA_VIEW_TOOLS: readonly string[] = ['select', 'measure', 'dimension', 'text', 'tag', 'detailLine', 'filledRegion', 'room', 'roomsep'];

/**
 * Cobertura HOJE: nenhuma restrição de ferramenta (nenhum `planKind === 'roof'` em controller.ts, nem em
 * ui/ribbon/parts.tsx; só `'area'` bloqueia). O PLANO §4.6 pede sem ambiente/separação na cobertura; fica para a
 * fase que mudar o comportamento.
 *
 * Intervalo e camadas da cobertura: o render não usa intervalo de vista (planContext.ts: `rp` => `view = null`) e
 * parte de `FLOOR_PLAN_PROFILE`; por isso o padrão é o de piso (lacuna relatada em `viewProfileOf`).
 */
const FLOOR_LIKE = { direction: 'down', defaultRange: DEFAULT_VIEW_RANGE, defaultLayers: FLOOR_PROFILE_LAYERS } as const;

export const PLAN_VIEW_KINDS: Record<PlanViewKind, PlanViewKindInfo> = {
  floor: { ...FLOOR_LIKE, tools: { mode: 'all' } },
  roof: { ...FLOOR_LIKE, tools: { mode: 'all' } },
  area: { direction: 'down', defaultRange: DEFAULT_VIEW_RANGE, defaultLayers: areaLayersOf(DEFAULT_AREA_GRAPHICS), tools: { mode: 'only', ids: AREA_VIEW_TOOLS } },
  // Forro: rascunho da Fase 4 (corte 2,30 m, para cima; sem portas, pisos e mobiliário). Sem comportamento ainda.
  ceiling: {
    direction: 'up',
    defaultRange: { top: 2.3, cut: 2.3, bottom: 0, depth: 0, direction: 'up' },
    defaultLayers: { ...FLOOR_PROFILE_LAYERS, openings: false, floors: false, rooms: false, underlay: false },
    // `tag` é compartilhado com etiqueta de elemento; não existe id próprio da etiqueta de ambiente em packages/tools.
    tools: { mode: 'except', ids: ['room', 'roomsep'] },
  },
};

/** A ferramenta pode ser usada nesta vista? Única consulta de permissão depois da Fase 3. */
export function toolAllowedInView(kind: PlanViewKind, toolId: string): boolean {
  const rule = PLAN_VIEW_KINDS[kind].tools;
  if (rule.mode === 'all') return true;
  return rule.mode === 'only' ? rule.ids.includes(toolId) : !rule.ids.includes(toolId);
}
