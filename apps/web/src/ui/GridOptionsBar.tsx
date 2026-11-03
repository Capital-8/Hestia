import type { ReactElement } from 'react';
import { projectGridTypes } from '@hestia/model';
import type { GridMode, GridToolOptions } from '@hestia/tools';
import { editor, useProject } from '../editor/controller.ts';
import { useUi } from '../editor/state.ts';
import { type Dict, useT } from '../editor/i18n.ts';
import { GRID_MODES, gridToolOf } from './gridUi.ts';

/** Rótulo traduzido de cada modo da grade (o catálogo de `gridUi.ts` guarda só os textos pt de fallback). */
const GRID_MODE_KEY: Record<GridMode, keyof Dict> = {
  line: 'pro_grid_line',
  arc: 'pro_grid_arc',
  pick: 'pro_grid_pick',
  multi: 'pro_grid_multi',
};

/** Barra da ferramenta Grade: modo de desenho e tipo. Trocar o modo recomeça o desenho em andamento (como o Piso). */
export function GridOptionsBar(): ReactElement {
  const p = useProject();
  const o = useUi((s) => s.options);
  const { t } = useT();
  const g = gridToolOf(o, p);
  const types = projectGridTypes(p);
  const setGrid = (patch: Partial<GridToolOptions>): void => {
    useUi.setState({ options: { ...useUi.getState().options, grid: { ...g, ...patch } } });
  };
  const trocaModo = (mode: GridMode): void => {
    setGrid({ mode });
    editor.setTool('grid');
  };
  return (
    <>
      <label>
        {t('pro_mode')}
        <select id="opt-gridmode" className="select" value={g.mode} onChange={(e) => trocaModo(e.target.value as GridMode)}>
          {GRID_MODES.map((m) => <option key={m.mode} value={m.mode}>{t(GRID_MODE_KEY[m.mode])}</option>)}
        </select>
      </label>
      <label>
        {t('pro_type')}
        <select id="opt-gridtype" className="select" value={g.typeId} onChange={(e) => setGrid({ typeId: e.target.value })}>
          {types.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
        </select>
      </label>
      <button id="opt-gridtype-edit" className="btn small" onClick={() => useUi.setState({ dialog: 'gridType', dialogArg: g.typeId })}>
        {t('pro_edit_type')}
      </button>
    </>
  );
}
