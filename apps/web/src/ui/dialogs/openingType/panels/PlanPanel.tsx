import type { ReactElement } from 'react';
import { openingLeafPlan, openingPlanDisplay, openingSwingStyle } from '@hestia/model';
import { Check } from '../../../fields.tsx';
import { useT } from '../../../../editor/i18n.ts';
import { usePanelKit, type PanelProps } from './panelKit.tsx';

/** Planta e corte: exibição, arco (só famílias que giram) e nível de detalhe 2D/3D. */
export function PlanPanel({ d, onChange, support }: PanelProps): ReactElement {
  const { t } = useT();
  const k = usePanelKit(d, onChange);
  return (
    <>
      <div className="field-row">
        <label htmlFor="op-plan">{t('dlo_f_plan_display')}</label>
        <select id="op-plan" className="select" value={openingPlanDisplay(d)} onChange={(e) => k.setField('planDisplay', e.target.value, openingPlanDisplay({}))}>
          <option value="symbolic">{t('dlo_o_plan_symbolic')}</option>
          <option value="projected">{t('dlo_o_plan_projected')}</option>
        </select>
      </div>
      {support.angle ? (
        <>
          <div className="field-row">
            <label htmlFor="op-leaf-plan" title={t('dlo_f_leaf_plan_tip')}>{t('dlo_f_leaf_plan')}</label>
            <select id="op-leaf-plan" className="select" value={openingLeafPlan(d)} onChange={(e) => k.setField('leafPlan', e.target.value, 'open')}>
              <option value="open">{t('dlo_o_leaf_plan_open')}</option>
              <option value="closed">{t('dlo_o_leaf_plan_closed')}</option>
              <option value="both">{t('dlo_o_leaf_plan_both')}</option>
            </select>
          </div>
          <div className="field-row"><label htmlFor="op-swing" title={t('dlo_f_show_swing_tip')}>{t('dlo_f_show_swing')}</label><Check id="op-swing" checked={d.showSwing !== false} onChange={(v) => { if (v) k.limpar('showSwing'); else k.set({ showSwing: false }); }} /></div>
          <div className="field-row">
            <label htmlFor="op-swing-style">{t('dlo_f_swing_style')}</label>
            <select id="op-swing-style" className="select" value={openingSwingStyle(d)} onChange={(e) => k.setField('swingStyle', e.target.value, openingSwingStyle({}))}>
              <option value="arc">{t('dlo_o_swing_arc')}</option>
              <option value="dash">{t('dlo_o_swing_dash')}</option>
              <option value="line">{t('dlo_o_swing_line')}</option>
            </select>
          </div>
        </>
      ) : null}
      <div className="field-row">
        <label htmlFor="op-d2">{t('dlo_f_detail2d')}</label>
        <select id="op-d2" className="select" value={k.detail2d} onChange={(e) => k.setField('detail2d', e.target.value, k.detail2dFallback)}>
          <option value="scale">{t('dlo_o_detail_scale')}</option>
          <option value="low">{t('dlo_o_detail_low')}</option>
          <option value="mid">{t('dlo_o_detail_mid')}</option>
          <option value="high">{t('dlo_o_detail_high')}</option>
          <option value="off">{t('dlo_o_detail_off')}</option>
        </select>
      </div>
      <div className="field-row">
        <label htmlFor="op-d3">{t('dlo_f_detail3d')}</label>
        <select id="op-d3" className="select" value={k.detail3d} onChange={(e) => k.setField('detail3d', e.target.value, k.detail3dFallback)}>
          <option value="view">{t('dlo_o_detail3d_view')}</option>
          <option value="schematic">{t('dlo_o_detail3d_schematic')}</option>
          <option value="simple">{t('dlo_o_detail3d_simple')}</option>
          <option value="full">{t('dlo_o_detail3d_full')}</option>
          <option value="off">{t('dlo_o_detail_off')}</option>
        </select>
      </div>
    </>
  );
}
