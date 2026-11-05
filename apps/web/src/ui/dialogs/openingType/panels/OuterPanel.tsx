import type { ReactElement } from 'react';
import { openingSillBoard } from '@hestia/model';
import { Check, NumField } from '../../../fields.tsx';
import { useT } from '../../../../editor/i18n.ts';
import { alternarAcabamento } from '../../openingTypeForm.ts';
import { THRESHOLD_KINDS, setThresholdKind, setThresholdThickness, thresholdKind, type OpeningThresholdKind } from '../openingTypeControls.ts';
import { usePanelKit, type PanelProps } from './panelKit.tsx';
import { CasingRows, ClosureSideRow } from './sharedRows.tsx';

/** Lado externo: retorno do acabamento, alizar e soleira/peitoril saliente. */
export function OuterPanel(props: PanelProps): ReactElement {
  const { d, onChange, support } = props;
  const { t } = useT();
  const { set } = usePanelKit(d, onChange);
  const sb = openingSillBoard(d);
  return (
    <>
      <ClosureSideRow d={d} onChange={onChange} lado="exterior" />
      <CasingRows {...props} />
      {support.threshold ? (
        <>
          <div className="field-row">
            <label htmlFor="op-threshold" title={t('dlo_f_threshold_tip')}>{t('dlo_f_threshold')}</label>
            <select id="op-threshold" className="select" value={thresholdKind(d)} onChange={(e) => onChange(setThresholdKind(d, e.target.value as OpeningThresholdKind))}>
              {THRESHOLD_KINDS.map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
            </select>
          </div>
          {d.threshold ? (
            <div className="field-row"><label htmlFor="op-threshold-h">{t('dlo_f_threshold_height')}</label><NumField id="op-threshold-h" value={d.threshold.thickness} quantity="smallLength" min={0.005} max={0.08} onCommit={(v) => onChange(setThresholdThickness(d, v))} /></div>
          ) : null}
        </>
      ) : null}
      {support.sillBoard ? (
        <>
          <div className="field-row"><label htmlFor="ot-ac-sb" title={t('dlo_f_sill_board_tip')}>{t('dlo_f_sill_board')}</label><Check id="ot-ac-sb" checked={sb !== null} onChange={(v) => onChange(alternarAcabamento(d, 'sillBoard', v))} /></div>
          {sb ? (
            <>
              <div className="field-row"><label htmlFor="ot-ac-sbp">{t('dlo_f_sill_projection')}</label><NumField id="ot-ac-sbp" value={sb.projection} quantity="smallLength" onCommit={(v) => set({ sillBoard: { ...sb, projection: v } })} /></div>
              <div className="field-row"><label htmlFor="ot-ac-sbe">{t('dlo_f_sill_thickness')}</label><NumField id="ot-ac-sbe" value={sb.thickness} quantity="smallLength" onCommit={(v) => set({ sillBoard: { ...sb, thickness: v } })} /></div>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
