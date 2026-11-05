import type { ReactElement } from 'react';
import { openingLintel, openingSillBeam, type OpeningType } from '@hestia/model';
import { Check, NumField } from '../../../fields.tsx';
import { useT } from '../../../../editor/i18n.ts';
import { alternarAcabamento } from '../../openingTypeForm.ts';
import { usePanelKit, type PanelProps } from './panelKit.tsx';

/** Parede e vão: fechamento, vão bruto (folga) e verga/contraverga. */
export function WallPanel({ d, onChange, support }: PanelProps): ReactElement {
  const { t } = useT();
  const { set } = usePanelKit(d, onChange);
  const lin = openingLintel(d);
  const beam = openingSillBeam(d);
  return (
    <>
      <div className="field-row">
        <label htmlFor="op-clos" title={t('dlo_f_opening_closure_tip')}>{t('dlo_f_opening_closure')}</label>
        <select id="op-clos" className="select" value={d.closure} onChange={(e) => set({ closure: e.target.value as OpeningType['closure'] })}>
          <option value="inherit">{t('dlo_o_closure_follow')}</option>
          <option value="none">{t('dlo_o_closure_none')}</option>
          <option value="both">{t('dlo_o_closure_both')}</option>
          <option value="exterior">{t('dlo_o_closure_exterior')}</option>
          <option value="interior">{t('dlo_o_closure_interior')}</option>
        </select>
      </div>
      <div className="field-row"><label htmlFor="ot-ac-fw" title={t('dlo_f_rough_width_tip')}>{t('dlo_f_rough_width')}</label><NumField id="ot-ac-fw" value={d.roughOversize?.w ?? 0} quantity="smallLength" onCommit={(v) => set({ roughOversize: { w: v, h: d.roughOversize?.h ?? 0 } })} /></div>
      <div className="field-row"><label htmlFor="ot-ac-fh" title={t('dlo_f_rough_height_tip')}>{t('dlo_f_rough_height')}</label><NumField id="ot-ac-fh" value={d.roughOversize?.h ?? 0} quantity="smallLength" onCommit={(v) => set({ roughOversize: { w: d.roughOversize?.w ?? 0, h: v } })} /></div>
      {support.lintel ? (
        <>
          <div className="field-row"><label htmlFor="ot-ac-vg" title={t('dlo_f_lintel_tip')}>{t('dlo_f_lintel')}</label><Check id="ot-ac-vg" checked={lin !== null} onChange={(v) => onChange(alternarAcabamento(d, 'lintel', v))} /></div>
          {lin ? (
            <>
              <div className="field-row"><label htmlFor="ot-ac-vgo">{t('dlo_f_lintel_over')}</label><NumField id="ot-ac-vgo" value={lin.over} quantity="smallLength" onCommit={(v) => set({ lintel: { ...lin, over: v } })} /></div>
              <div className="field-row"><label htmlFor="ot-ac-vgh">{t('dlo_f_lintel_height')}</label><NumField id="ot-ac-vgh" value={lin.height} quantity="smallLength" onCommit={(v) => set({ lintel: { ...lin, height: v } })} /></div>
            </>
          ) : null}
        </>
      ) : null}
      {support.sillBeam ? (
        <>
          <div className="field-row"><label htmlFor="ot-ac-cv" title={t('dlo_f_sill_beam_tip')}>{t('dlo_f_sill_beam')}</label><Check id="ot-ac-cv" checked={beam !== null} onChange={(v) => onChange(alternarAcabamento(d, 'sillBeam', v))} /></div>
          {beam ? (
            <>
              <div className="field-row"><label htmlFor="ot-ac-cvo">{t('dlo_f_sill_beam_over')}</label><NumField id="ot-ac-cvo" value={beam.over} quantity="smallLength" onCommit={(v) => set({ sillBeam: { ...beam, over: v } })} /></div>
              <div className="field-row"><label htmlFor="ot-ac-cvh">{t('dlo_f_sill_beam_height')}</label><NumField id="ot-ac-cvh" value={beam.height} quantity="smallLength" onCommit={(v) => set({ sillBeam: { ...beam, height: v } })} /></div>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
