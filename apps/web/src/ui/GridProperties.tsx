import type { ReactElement } from 'react';
import { formatQuantity, projectGridTypes, type Grid } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Check, Group, Row, TextField } from './fields.tsx';
import { useUnits } from './useUnits.ts';

/**
 * Propriedades de uma grade selecionada: nome, tipo e bolhas nas pontas. Cada alteração é um comando do modelo
 * (`updateGrid`); recusa do modelo (nome repetido, por exemplo) aparece na barra de status, como nas outras ações.
 */
export function GridProperties({ grid }: { grid: Grid }): ReactElement {
  const { t } = useT();
  const p = useProject();
  const units = useUnits();
  const types = projectGridTypes(p);
  const type = types.find((t) => t.id === grid.typeId);
  const change = (patch: Partial<Omit<Grid, 'id' | 'order'>>, label: string): void => {
    try {
      editor.store.exec({ type: 'updateGrid', id: grid.id, patch }, label);
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : t('prd_msg_operation_refused') });
    }
  };
  return (
    <>
      <Group title={t('tool_grid')}>
        <Row label={t('prd_fld_name')} htmlFor="g-name">
          <TextField id="g-name" value={grid.name} onCommit={(v) => change({ name: v.trim() }, t('prd_undo_rename_grid'))} />
        </Row>
        <Row label={t('prd_fld_type')} htmlFor="g-type">
          <select id="g-type" className="select" value={grid.typeId} onChange={(e) => change({ typeId: e.target.value }, t('prd_undo_change_grid_type'))}>
            {types.map((gt) => <option key={gt.id} value={gt.id}>{gt.name}</option>)}
          </select>
        </Row>
        <Row label={t('prd_fld_bubble_start')}><Check id="g-bubble-start" checked={grid.bubbleStart} onChange={(v) => change({ bubbleStart: v }, t('prd_undo_bubble_start'))} /></Row>
        <Row label={t('prd_fld_bubble_end')}><Check id="g-bubble-end" checked={grid.bubbleEnd} onChange={(v) => change({ bubbleEnd: v }, t('prd_undo_bubble_end'))} /></Row>
        <div className="prow"><span /><button id="g-type-edit" className="chiplink" onClick={() => useUi.setState({ dialog: 'gridType', dialogArg: grid.typeId })}>{t('prd_btn_edit_type')}</button></div>
      </Group>
      <Group title={t('prd_pgrp_geometry')} open={false}>
        <Row label={t('prd_fld_points')} readOnly><span className="val">{grid.points.length}</span></Row>
        {grid.sag !== 0 ? <Row label={t('prd_fld_arc_sag')} readOnly><span className="val">{formatQuantity(units, 'smallLength', grid.sag)}</span></Row> : null}
        {type ? <Row label={t('prd_fld_center_segment')} readOnly fromType><span className="val">{type.centerSegment === 'continuous' ? t('prd_opt_continuous') : type.centerSegment === 'none' ? t('prd_opt_ends_only') : t('prd_opt_custom')}</span></Row> : null}
      </Group>
    </>
  );
}
