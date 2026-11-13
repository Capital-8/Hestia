import type { ReactElement } from 'react';
import type { StairType } from '@hestia/model';
import { dictOf, fmtNum, useI18n } from '../../editor/i18n.ts';
import { blondelLive, formulaText } from './stairBlondel.ts';
import { FamilyHint, FamilySection } from './familia/index.ts';

const fill = (s: string, params: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');

/**
 * Cartão "Fórmula de Blondel": explica a regra do passo humano e faz a conta ao vivo com a altura da calculadora. Os
 * números do passo a passo usam o espelho arredondado a 0,1 cm; o estado (✓/!/✕) vem do cálculo exato do motor.
 */
export function StairBlondelCard({ type, heightCm }: { type: StairType; heightCm: number }): ReactElement {
  const lang = useI18n((s) => s.lang);
  const t = dictOf(lang);
  const live = blondelLive(type, heightCm / 100);
  const a = type.calcRiserFactor;
  const b = type.calcTreadFactor;
  const cm = (m: number, dec = 1): string => fmtNum(m * 100, dec, lang);
  const factor = (v: number): string => fmtNum(v, Number.isInteger(v) ? 0 : 2, lang);
  const range = { min: cm(type.calcMin), max: cm(type.calcMax) };
  const term = (f: number, value: string): string => (f === 1 ? value : `${factor(f)} × ${value}`);

  return (
    <FamilySection id="stt-bl" title={t.stt_bl_title} defaultOpen={false}>
      <FamilyHint>{t.stt_bl_intro}</FamilyHint>
      <p className="fam-formula">
        {formulaText(a, b, lang)} = {cm(type.calcTarget)} cm
      </p>
      <FamilyHint tone="faint">{fill(t.stt_bl_range, range)}</FamilyHint>
      <FamilyHint tone="faint">{t.stt_bl_legend}</FamilyHint>
      {!live.valid ? (
        <FamilyHint tone="faint">{t.stt_bl_invalid}</FamilyHint>
      ) : (
        <>
          <FamilyHint tone="strong">{fill(t.stt_bl_live_title, { h: fmtNum(heightCm, 0, lang) })}</FamilyHint>
          <ol>
            <li>
              {fill(t.stt_bl_step_n, {
                h: fmtNum(heightCm, 0, lang),
                maxRiser: cm(type.maxRiser),
                q: fmtNum(live.quotient, 1, lang),
                N: String(live.risers),
              })}
            </li>
            <li>
              {fill(t.stt_bl_step_r, {
                h: fmtNum(heightCm, 0, lang),
                N: String(live.risers),
                R: cm(live.riserShown),
              })}
            </li>
            <li>
              {fill(t.stt_bl_step_t, {
                target: cm(type.calcTarget),
                a: factor(a),
                R: cm(live.riserShown),
                b: factor(b),
                raw: cm(live.treadRaw),
              })}
              {live.clamp === 'min'
                ? fill(t.stt_bl_step_t_min, { min: cm(type.minTread), T: cm(live.tread) })
                : live.clamp === 'max'
                  ? fill(t.stt_bl_step_t_max, { max: cm(type.maxTread), T: cm(live.tread) })
                  : null}
            </li>
            <li className="fam-mono" role="status" aria-live="polite">
              <div>{`${term(a, cm(live.riserShown))} + ${term(b, cm(live.tread))} = ${cm(live.sum)} cm`}</div>
              {live.status === 'ok' ? (
                <div className="fam-tone ok">{`✓ ${fill(t.stt_bl_ok, range)}`}</div>
              ) : live.status === 'warn' ? (
                <div className="fam-tone warn">
                  {`! ${fill(live.side === 'below' ? t.stt_bl_warn_below : t.stt_bl_warn_above, { d: cm(live.delta), ...range })}`}
                </div>
              ) : (
                <div className="fam-tone bad">
                  {`✕ ${fill(t.stt_bl_bad, { d: cm(live.delta), ...range })}`}
                </div>
              )}
            </li>
          </ol>
        </>
      )}
      <FamilySection title={t.stt_bl_words_title}>
        <FamilyHint>{t.stt_bl_words}</FamilyHint>
      </FamilySection>
      <FamilyHint tone="faint">{t.stt_bl_note_straight}</FamilyHint>
      {type.runStyle === 'post' ? (
        <FamilyHint warn>{t.stt_bl_note_curved}</FamilyHint>
      ) : (
        <FamilyHint>{t.stt_bl_note_curved_short}</FamilyHint>
      )}
      <FamilySection title={t.stt_bl_presets_title} defaultOpen={false}>
        <ul>
          <li>{t.stt_bl_p_hestia}</li>
          <li>{t.stt_bl_p_nbr9050}</li>
          <li>{t.stt_bl_p_nbr9077}</li>
          <li>{t.stt_bl_p_ibc}</li>
        </ul>
        <FamilyHint tone="faint">{t.stt_bl_p_foot}</FamilyHint>
      </FamilySection>
    </FamilySection>
  );
}
