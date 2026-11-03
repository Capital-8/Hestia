import type { ReactElement } from 'react';
import { OPENING_FRAME_DEFAULTS, type OpeningFrameDepthMode } from '@hestia/model';
import { NumField } from '../../../fields.tsx';
import { useT, type Dict } from '../../../../editor/i18n.ts';
import { setRevealDepth } from '../openingTypeControls.ts';
import { FIELD_FRAME, MaterialSelect, usePanelKit, type PanelProps } from './panelKit.tsx';

const MODOS: ReadonlyArray<readonly [OpeningFrameDepthMode, keyof Dict]> = [
  ['wall', 'dlo_o_frame_depth_wall'],
  ['core', 'dlo_o_frame_depth_core'],
  ['fixed', 'dlo_o_frame_depth_fixed'],
];

/** Batente: estilo, perfil, profundidade (e como ela se liga à parede) e material. */
export function FramePanel({ d, onChange, materials }: PanelProps): ReactElement {
  const { t } = useT();
  const k = usePanelKit(d, onChange);
  const modo = d.frameDepthMode ?? 'wall';
  return (
    <>
      <div className="field-row">
        <label htmlFor="op-frame">{t('dlo_f_frame_style')}</label>
        <select id="op-frame" className="select" value={k.frameStyle} onChange={(e) => k.setField('frameStyle', e.target.value, k.frameFallback)}>
          {FIELD_FRAME.map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
        </select>
      </div>
      <div className="field-row"><label htmlFor="op-fw" title={t('dlo_f_frame_width_tip')}>{t('dlo_f_frame_width')}</label><NumField id="op-fw" value={d.frameWidth ?? OPENING_FRAME_DEFAULTS.frameWidth} quantity="smallLength" min={0.01} onCommit={(v) => k.set({ frameWidth: v })} /></div>
      <div className="field-row">
        <label htmlFor="op-fdm" title={t('dlo_f_frame_depth_mode_tip')}>{t('dlo_f_frame_depth')}</label>
        <select
          id="op-fdm"
          className="select"
          value={modo}
          onChange={(e) => (e.target.value === 'wall' ? k.limpar('frameDepthMode') : k.set({ frameDepthMode: e.target.value as OpeningFrameDepthMode }))}
        >
          {MODOS.map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
        </select>
      </div>
      {modo === 'fixed' ? (
        <div className="field-row"><label htmlFor="op-fd" title={t('dlo_f_frame_depth_tip')}>{t('dlo_f_frame_depth')}</label><NumField id="op-fd" value={d.frameDepth ?? OPENING_FRAME_DEFAULTS.frameDepth} quantity="smallLength" min={0.01} onCommit={(v) => k.set({ frameDepth: v })} /></div>
      ) : null}
      {modo !== 'wall' ? (
        <div className="field-row"><label htmlFor="op-reveal" title={t('dlo_f_frame_reveal_tip')}>{t('dlo_f_frame_reveal')}</label><NumField id="op-reveal" value={d.reveal?.depth ?? 0} quantity="smallLength" min={0} onCommit={(v) => onChange(setRevealDepth(d, v))} /></div>
      ) : null}
      <MaterialSelect id="op-mat" labelKey="dlo_f_frame_material" value={d.frameMaterialId} materials={materials} onPick={(id) => k.set({ frameMaterialId: id })} />
    </>
  );
}
