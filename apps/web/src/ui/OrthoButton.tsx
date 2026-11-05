import { useState, type ReactElement } from 'react';
import { fmtNum, useT } from '../editor/i18n.ts';
import { setPolarIncrement, toggleOrtho, togglePolar, useUi } from '../editor/state.ts';

const PRESETS = [10, 15, 20, 22.5, 30, 40, 45, 50, 60, 70, 80, 90];

/** Grupo Orto/Polar da barra de status: F8 trava em 0°/90°; F10 trava nos múltiplos do incremento (15° por padrão). */
export function OrthoButton(): ReactElement {
  const { t, lang } = useT();
  const am = useUi((s) => s.options.angleMode);
  const ortho = am?.ortho ?? useUi.getState().options.orthoLock;
  const polar = am?.polar ?? false;
  const inc = am?.polarIncrementDeg ?? 15;
  const [custom, setCustom] = useState(String(inc));
  const apply = (): void => {
    const v = Number(custom.replace(',', '.'));
    setPolarIncrement(v);
  };
  return (
    <span className="angle-group" role="group" aria-label={t('shc_ortho_polar')}>
      <span className="angle-group-title">{t('shc_ortho_polar')}</span>
      <button
        type="button"
        className={`snap-btn${ortho ? '' : ' snap-btn--disabled'}`}
        aria-pressed={ortho}
        onClick={() => toggleOrtho()}
        title={t(ortho ? 'shc_ortho_on' : 'shc_ortho_off')}
      >
        <span>{t('shc_ortho')}</span>
        {ortho ? <span className="snap-count">F8</span> : <span className="snap-status-tag off">OFF</span>}
      </button>
      <button
        type="button"
        className={`snap-btn${polar ? '' : ' snap-btn--disabled'}`}
        aria-pressed={polar}
        onClick={() => togglePolar()}
        title={t(polar ? 'shc_polar_on' : 'shc_polar_off', { inc: fmtNum(inc, Number.isInteger(inc) ? 0 : 1, lang) })}
      >
        <span>{t('shc_polar')}</span>
        {polar ? <span className="snap-count">F10</span> : <span className="snap-status-tag off">OFF</span>}
      </button>
      <select
        className="select angle-preset"
        value={PRESETS.includes(inc) ? String(inc) : 'custom'}
        title={t('shc_polar_inc')}
        onChange={(e) => {
          if (e.target.value === 'custom') return;
          const v = Number(e.target.value);
          setCustom(String(v));
          setPolarIncrement(v);
        }}
      >
        {PRESETS.map((v) => <option key={v} value={v}>{v}°</option>)}
        <option value="custom">{t('shc_custom')}</option>
      </select>
      <input
        className="input angle-custom"
        type="number"
        min={0.1}
        max={180}
        step={0.1}
        value={custom}
        aria-label={t('shc_polar_custom_aria')}
        onChange={(e) => setCustom(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
          e.stopPropagation();
        }}
      />
    </span>
  );
}
