import type { ReactElement, ReactNode } from 'react';
import type { StairType } from '@hestia/model';
import { dictOf, fmtNum, useI18n } from '../../editor/i18n.ts';
import { NumField } from '../fields.tsx';
import { computeStairCalc } from './stairTypeCalc.ts';
import { FamilyRow, FamilySection } from './familia/index.ts';

const fill = (s: string, params: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');

/** Calculadora ao vivo do tipo de escada: altura simulada (não gravada), resultados e indicador com ícone e texto. */
export function StairCalculatorPanel({ type, heightCm, onHeight }: { type: StairType; heightCm: number; onHeight: (v: number) => void }): ReactElement {
  const lang = useI18n((s) => s.lang);
  const t = dictOf(lang);
  const calc = computeStairCalc(type, heightCm / 100);
  const post = type.runStyle === 'post';
  const cm = (v: number, dec = 1): string => `${fmtNum(v * 100, dec, lang)} cm`;
  const factor = (v: number): string => fmtNum(v, Number.isInteger(v) ? 0 : 2, lang);
  const row = (label: string, value: ReactNode): ReactElement => (
    <div className="prow ro">
      <span className="lbl">{label}</span>
      <span className="val">{value}</span>
    </div>
  );
  const status = calc.status;
  const statusText = status === 'ok'
    ? t.stt_calc_ok
    : status === 'warn'
      ? fill(t.stt_calc_warn, { d: fmtNum(calc.delta * 100, 1, lang) })
      : t.stt_calc_bad;
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '!' : '✕';
  return (
    <FamilySection title={t.stt_calc_title}>
      <FamilyRow label={t.stt_calc_height} htmlFor="stt-calc-h">
        <NumField id="stt-calc-h" value={heightCm / 100} scale={100} decimals={0} unit="cm" min={0.01} strictRange onCommit={(v) => onHeight(v * 100)} />
      </FamilyRow>
      {post ? (
        <>
          {calc.valid ? (
            <>
              {row(t.stt_calc_risers, calc.risers)}
              {row(t.stt_calc_riser, cm(calc.riser))}
            </>
          ) : (
            <>
              {row(t.stt_calc_risers, '—')}
              {row(t.stt_calc_riser, '—')}
            </>
          )}
          <p className="hint">{t.stt_calc_post_note}</p>
        </>
      ) : !calc.valid ? (
        <>
          {row(t.stt_calc_risers, '—')}
          {row(t.stt_calc_riser, '—')}
          {row(t.stt_calc_tread, '—')}
          {row(fill(t.stt_calc_sum, { a: factor(type.calcRiserFactor), b: factor(type.calcTreadFactor) }), '—')}
          <div className="calc-badge bad" role="status" aria-live="polite"><span aria-hidden="true">{icon}</span>{statusText}</div>
          <p className="stt-ref">{t.stt_calc_invalid}</p>
        </>
      ) : (
        <>
          {row(t.stt_calc_risers, calc.risers)}
          {row(t.stt_calc_riser, cm(calc.riser))}
          {row(t.stt_calc_tread, cm(calc.tread))}
          {row(fill(t.stt_calc_sum, { a: factor(type.calcRiserFactor), b: factor(type.calcTreadFactor) }), cm(calc.sum))}
          <p className="stt-ref" style={{ margin: '4px 0' }}>{fill(t.stt_calc_range, { min: fmtNum(type.calcMin * 100, 1, lang), max: fmtNum(type.calcMax * 100, 1, lang) })}</p>
          <div className={`calc-badge ${status}`} role="status" aria-live="polite"><span aria-hidden="true">{icon}</span>{statusText}</div>
          <div style={{ marginTop: 6 }}>
            {row(t.stt_calc_run, cm(calc.run))}
            {row(t.stt_calc_angle, `${fmtNum(calc.angleDeg, 1, lang)}°`)}
          </div>
        </>
      )}
      <p className="stt-ref" style={{ marginBottom: 0 }}>{t.stt_calc_hint}</p>
    </FamilySection>
  );
}
