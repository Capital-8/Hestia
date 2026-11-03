import type { ReactElement, ReactNode } from 'react';
import { DEFAULT_RAMP_OPTIONS, type RampToolOptions } from '@hestia/tools';
import { formatRampRatio, type RampInputMode, type RampShape } from '@hestia/model';
import { useProject } from '../editor/controller.ts';
import { fmtNum, type Dict, useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { NumField } from './fields.tsx';
import { RampLevelsFields, rampLevelsValue, rampRiseFromLevels, rampRiseText } from './RampLevelsFields.tsx';

/** Rótulo traduzido de cada forma da rampa (a livre reusa `ramp_shape_free`). */
const SHAPE_KEY: Record<RampShape, keyof Dict> = {
  straight: 'pro_shape_line',
  lshape: 'pro_shape_l',
  ushape: 'pro_shape_u',
  free: 'ramp_shape_free',
};

/** Campo da barra: o rótulo envolve o controle, como os demais campos desta barra. */
function BarField({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }): ReactElement {
  return <label htmlFor={htmlFor}>{label}{children}</label>;
}

/**
 * Barra da ferramenta Rampa: forma (reta, L, U), largura, giro e profundidade do patamar (L/U), modo de entrada e, no
 * modo inclinação, o valor em % com a razão `1:X` ao lado. Campos vazios usam o padrão do tipo. Depois do tipo, os níveis
 * (base, topo e deslocamentos; altura sem nível acima) e o desnível calculado por eles.
 */
export function RampOptionsBar(): ReactElement {
  const p = useProject();
  const levelId = useUi((s) => s.levelId);
  const { t, lang } = useT();
  const options = useUi((s) => s.options);
  const o: RampToolOptions = options.ramp ?? DEFAULT_RAMP_OPTIONS;
  const set = (patch: Partial<RampToolOptions>): void => {
    const cur = useUi.getState().options;
    useUi.setState({ options: { ...cur, ramp: { ...(cur.ramp ?? DEFAULT_RAMP_OPTIONS), ...patch } } });
  };
  const typeId = o.typeId && p.rampTypes[o.typeId] ? o.typeId : (Object.keys(p.rampTypes)[0] ?? '');
  const type = p.rampTypes[typeId];
  const turnable = o.shape === 'lshape' || o.shape === 'ushape';
  const hasLanding = turnable || o.shape === 'free';
  const slope = o.slope ?? type?.defaultSlope ?? 0;
  const levels = rampLevelsValue(o);
  return (
    <>
      <label>
        {t('pro_shape')}
        <select id="opt-rampshape" className="select" value={o.shape} onChange={(e) => set({ shape: e.target.value as RampShape })}>
          {(Object.keys(SHAPE_KEY) as RampShape[]).map((s) => <option key={s} value={s}>{t(SHAPE_KEY[s])}</option>)}
        </select>
      </label>
      <label>
        {t('pro_width')}
        <NumField
          id="opt-rampwidth"
          value={o.width ?? null}
          placeholder={type ? fmtNum(type.defaultWidth, 2, lang) : undefined}
          unit="m"
          min={0.1}
          onCommit={(v) => set({ width: v })}
          onClear={() => set({ width: undefined })}
        />
      </label>
      {turnable && (
        <label>
          {t('pro_turn')}
          <select id="opt-rampturn" className="select" value={o.turn} onChange={(e) => set({ turn: e.target.value as 'left' | 'right' })}>
            <option value="left">{t('pro_turn_left')}</option>
            <option value="right">{t('pro_turn_right')}</option>
          </select>
        </label>
      )}
      {hasLanding && (
        <label>
          {t('pro_landing_depth')}
          <NumField
            id="opt-ramplanding"
            value={o.landingDepth ?? null}
            placeholder={type ? fmtNum(Math.max(o.width ?? type.defaultWidth, type.landingMinLength), 2, lang) : undefined}
            unit="m"
            min={0.1}
            onCommit={(v) => set({ landingDepth: v })}
            onClear={() => set({ landingDepth: undefined })}
          />
        </label>
      )}
      <label>
        {t('pro_input_mode')}
        <select id="opt-rampmode" className="select" value={o.mode} onChange={(e) => set({ mode: e.target.value as RampInputMode })}>
          <option value="length">{t('ramp_mode_length')}</option>
          <option value="slope">{t('ramp_mode_slope')}</option>
        </select>
      </label>
      {o.mode === 'slope' && (
        <label>
          {t('ramp_prop_slope_target')}
          <NumField id="opt-rampslope" value={slope} scale={100} unit="%" decimals={2} min={0.1} onCommit={(v) => set({ slope: v })} />
          <span className="hint" style={{ marginLeft: 6 }}>{formatRampRatio(slope)}</span>
        </label>
      )}
      <label>
        {t('pro_type')}
        <select id="opt-ramptype" className="select" value={typeId} onChange={(e) => set({ typeId: e.target.value })}>
          {Object.values(p.rampTypes).map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
        </select>
      </label>
      <RampLevelsFields project={p} levelId={levelId} idPrefix="opt-ramp" value={levels} onChange={set} Field={BarField} />
      <span className="hint" id="opt-ramprise">{rampRiseText(rampRiseFromLevels(p, levelId, levels), lang)}</span>
    </>
  );
}
