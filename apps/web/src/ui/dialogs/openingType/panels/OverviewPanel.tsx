import type { ReactElement } from 'react';
import { OPENING_SPAN_GAP_MAX, leafSizeOf, openingSpanGap, openingSpanOf } from '@hestia/model';
import { NumField, TextField } from '../../../fields.tsx';
import { useT } from '../../../../editor/i18n.ts';
import { cmTexto, setSpanGap } from '../openingTypeControls.ts';
import { useUnits } from '../../../useUnits.ts';
import { usePanelKit, type PanelProps } from './panelKit.tsx';

/** Visão geral: nome e dimensões do tipo. A prévia (planta, elevação, corte, 3D) fica sempre visível à direita. */
export function OverviewPanel({ d, onChange, support }: PanelProps): ReactElement {
  const units = useUnits();
  const { t } = useT();
  const { set, setField } = usePanelKit(d, onChange);
  const gap = openingSpanGap(d);
  const vao = openingSpanOf(d);
  const folha = leafSizeOf(d);
  return (
    <>
      <div className="field-row"><label htmlFor="ot-name">{t('col_name')}</label><TextField id="ot-name" value={d.name} onCommit={(v) => set({ name: v })} /></div>
      <div className="field-row"><label htmlFor="op-w">{t('col_width')}</label><NumField id="op-w" value={d.width} quantity="smallLength" min={0.2} onCommit={(v) => set({ width: v })} /></div>
      <div className="field-row"><label htmlFor="op-h">{t('col_height')}</label><NumField id="op-h" value={d.height} quantity="smallLength" min={0.2} onCommit={(v) => set({ height: v })} /></div>
      <div className="field-row"><label htmlFor="op-s">{t('dlo_f_sill')}</label><NumField id="op-s" value={d.sill} quantity="smallLength" min={0} onCommit={(v) => set({ sill: v })} /></div>
      {support.nominalRef ? (
        <>
          <div className="field-row">
            <label htmlFor="op-nominal" title={t('dlo_f_nominal_ref_tip')}>{t('dlo_f_nominal_ref')}</label>
            <select id="op-nominal" className="select" value={d.nominalRef ?? 'opening'} onChange={(e) => setField('nominalRef', e.target.value, 'opening')}>
              <option value="opening">{t('dlo_o_nominal_opening')}</option>
              <option value="leaf">{t('dlo_o_nominal_leaf')}</option>
            </select>
          </div>
          <p className="hint" style={{ padding: '0 0 8px' }}>{t('dlo_h_nominal_br')}</p>
        </>
      ) : null}
      {support.nominalRef && d.nominalRef === 'leaf' ? (
        <>
          <div className="field-row"><label htmlFor="op-gap-w" title={t('dlo_f_gap_width_tip')}>{t('dlo_f_gap_width')}</label><NumField id="op-gap-w" value={gap.w} quantity="smallLength" min={0} max={OPENING_SPAN_GAP_MAX} onCommit={(v) => onChange(setSpanGap(d, 'w', v))} /></div>
          <div className="field-row"><label htmlFor="op-gap-h" title={t('dlo_f_gap_height_tip')}>{t('dlo_f_gap_height')}</label><NumField id="op-gap-h" value={gap.h} quantity="smallLength" min={0} max={OPENING_SPAN_GAP_MAX} onCommit={(v) => onChange(setSpanGap(d, 'h', v))} /></div>
          <div className="field-row"><label htmlFor="op-span-derived" title={t('dlo_f_span_derived_tip')}>{t('dlo_f_span_derived')}</label><span id="op-span-derived">{cmTexto(units, vao.width)} × {cmTexto(units, vao.height)}</span></div>
          <div className="field-row"><label htmlFor="op-leaf-size" title={t('dlo_f_leaf_size_tip')}>{t('dlo_f_leaf_size')}</label><span id="op-leaf-size">{cmTexto(units, folha.width)} × {cmTexto(units, folha.height)}</span></div>
        </>
      ) : null}
    </>
  );
}
