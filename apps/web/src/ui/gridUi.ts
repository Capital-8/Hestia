import { DEFAULT_GRID_TYPE_ID, gridOf, newId, projectGridTypes, type Grid, type GridCenterSegment, type GridLinePattern, type GridType, type Id, type Project } from '@hestia/model';
import type { GridMode, GridToolOptions, ToolOptions } from '@hestia/tools';
import type { Dict } from '../editor/i18n.ts';

/** Lógica pura da interface de grades (sem o editor): opções da ferramenta, campos visíveis e cópia de tipo. */

export const GRID_MODES: Array<{ mode: GridMode; label: string }> = [
  { mode: 'line', label: 'Linha' },
  { mode: 'arc', label: 'Arco' },
  { mode: 'pick', label: 'Escolher linhas' },
  { mode: 'multi', label: 'Multissegmento' },
];

export const SEGMENT_LABEL: Record<GridCenterSegment, keyof Dict> = {
  continuous: 'dlt_grid_segment_continuous',
  none: 'dlt_grid_segment_none',
  custom: 'dlt_grid_segment_custom',
};

export const PATTERN_LABEL: Record<GridLinePattern, keyof Dict> = {
  solid: 'dlt_grid_pattern_solid',
  dash: 'dlt_grid_pattern_dash',
  dashdot: 'dlt_grid_pattern_dashdot',
};

/** Opções da grade com padrão: linha e o tipo padrão quando a ferramenta ainda não tem opção, ou o tipo guardado sumiu. */
export function gridToolOf(o: Pick<ToolOptions, 'grid'>, p: Pick<Project, 'gridTypes'>): GridToolOptions {
  const types = projectGridTypes(p);
  const salvo = o.grid?.typeId;
  const typeId = salvo && types.some((t) => t.id === salvo) ? salvo : DEFAULT_GRID_TYPE_ID;
  return { mode: o.grid?.mode ?? 'line', typeId };
}

/**
 * Quais campos do tipo valem com o segmento central escolhido: as pontas só não valem com 'continuous' (ali a linha é
 * uma coisa só), e o centro próprio só existe com 'custom'.
 */
export function camposDoSegmento(seg: GridCenterSegment): { pontas: boolean; centro: boolean } {
  return { pontas: seg !== 'continuous', centro: seg === 'custom' };
}

/** Cópia de um tipo de grade com outro id e o sufixo de cópia no nome. */
export function copiaDoTipo(t: GridType, suffix = '(cópia)'): GridType {
  return { ...structuredClone(t), id: newId('gt'), name: `${t.name} ${suffix}` };
}

/** Grade selecionada (uma só, e que existe no projeto); ausente em qualquer outro caso. */
export function gradeDaSelecao(p: Pick<Project, 'grids'>, sel: readonly Id[]): Grid | undefined {
  return sel.length === 1 ? gridOf(p, sel[0]!) : undefined;
}

