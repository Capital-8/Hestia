import type { ReactElement } from 'react';
import { OPENING_FRAME_DEFAULTS, type OpeningGlassKind, type OpeningType } from '@hestia/model';
import { NumField } from '../../../fields.tsx';
import { useT } from '../../../../editor/i18n.ts';
import { GLASS_KINDS, setGlassKind, setLeafMaterialId } from '../openingTypeControls.ts';
import { FIELD_HANDLE, FIELD_LEAF, MaterialSelect, Miniaturas, usePanelKit, type PanelProps } from './panelKit.tsx';
import { HingesRow, LeafHardwareRows } from './hardwareRows.tsx';
import { AngleRows, TransomRows } from './sharedRows.tsx';

/** Folha (só portas): estilo, nº de folhas, espessura, vidro, maçaneta, ângulos e bandeiras, conforme a família. */
export function LeafPanel(props: PanelProps): ReactElement {
  const { d, onChange, support, leaves, materials } = props;
  const { t } = useT();
  const k = usePanelKit(d, onChange);
  return (
    <>
      {support.leafStyle ? (
        <>
          <div className="field-row">
            <label htmlFor="op-leaf">{t('dlo_f_leaf_style')}</label>
            <select id="op-leaf" className="select" value={k.leafStyle} onChange={(e) => k.setField('leafStyle', e.target.value, k.leafFallback)}>
              {FIELD_LEAF.map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
            </select>
          </div>
          <Miniaturas value={k.leafStyle} options={FIELD_LEAF} onPick={(v) => k.setField('leafStyle', v, k.leafFallback)} preview={(v) => ({ ...k.thumbnailType, leafStyle: v })} />
        </>
      ) : null}
      {leaves.length > 1 ? (
        <div className="field-row">
          <label htmlFor="op-leaves">{t('dlo_f_leaves')}</label>
          <select id="op-leaves" className="select" value={d.leaves} onChange={(e) => k.set({ leaves: Number(e.target.value) as OpeningType['leaves'] })}>
            {leaves.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      ) : null}
      {support.leafThickness ? (
        <>
          <div className="field-row"><label htmlFor="op-lt">{t('dlo_f_leaf_thickness')}</label><NumField id="op-lt" value={d.leafThickness ?? OPENING_FRAME_DEFAULTS.doorLeaf} quantity="smallLength" min={0.01} onCommit={(v) => k.set({ leafThickness: v })} /></div>
          <MaterialSelect id="op-leaf-mat" labelKey="dlo_f_leaf_material" value={d.leafMaterialId ?? d.frameMaterialId} materials={materials} onPick={(id) => onChange(setLeafMaterialId(d, id))} />
        </>
      ) : null}
      {support.glassKind ? (
        <>
          <MaterialSelect id="op-glass" labelKey="dlo_f_glass_material" value={d.glassMaterialId} materials={materials} onPick={(id) => k.set({ glassMaterialId: id })} />
          <div className="field-row">
            <label htmlFor="op-glass-kind">{t('dlo_f_glass_kind')}</label>
            <select id="op-glass-kind" className="select" value={d.glassKind ?? 'clear'} onChange={(e) => onChange(setGlassKind(d, e.target.value as OpeningGlassKind))}>
              {GLASS_KINDS.map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
            </select>
          </div>
          <div className="field-row"><label htmlFor="op-gt">{t('dlo_f_glass_thickness')}</label><NumField id="op-gt" value={d.glassThickness ?? OPENING_FRAME_DEFAULTS.glass} quantity="smallLength" min={0.001} onCommit={(v) => k.set({ glassThickness: v })} /></div>
        </>
      ) : null}
      {support.handle ? (
        <>
          <div className="field-row">
            <label htmlFor="op-handle">{t('dlo_f_handle')}</label>
            <select id="op-handle" className="select" value={k.handle} onChange={(e) => k.setField('handle', e.target.value, k.handleFallback)}>
              {FIELD_HANDLE.map(([v, labelKey]) => <option key={v} value={v}>{t(labelKey)}</option>)}
            </select>
          </div>
          <Miniaturas value={k.handle} options={FIELD_HANDLE} onPick={(v) => k.setField('handle', v, k.handleFallback)} preview={(v) => ({ ...k.thumbnailType, handle: v })} />
        </>
      ) : null}
      <LeafHardwareRows {...props} />
      <HingesRow {...props} />
      <AngleRows {...props} />
      <TransomRows {...props} />
    </>
  );
}
