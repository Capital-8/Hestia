import type { ReactElement } from 'react';
import type { StairType } from '@hestia/model';
import { dictOf, fmtNum, useI18n } from '../../editor/i18n.ts';
import { blondelLive, formulaText } from './stairBlondel.ts';

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
    <section className="dsec" aria-labelledby="stt-bl-title" style={{ margin: 0 }}>
      <div id="stt-bl-title" className="stt-ref" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {t.stt_bl_title}
      </div>
      <p className="hint">{t.stt_bl_intro}</p>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15 }}>
        {formulaText(a, b, lang)} = {cm(type.calcTarget)} cm
      </div>
      <p className="stt-ref">{fill(t.stt_bl_range, range)}</p>
      <p className="stt-ref">{t.stt_bl_legend}</p>
      {!live.valid ? (
        <p className="stt-ref">{t.stt_bl_invalid}</p>
      ) : (
        <>
          <p className="stt-ref" style={{ fontWeight: 600 }}>
            {fill(t.stt_bl_live_title, { h: fmtNum(heightCm, 0, lang) })}
          </p>
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
            <li style={{ fontFamily: 'var(--font-mono)' }} role="status" aria-live="polite">
              <div>{`${term(a, cm(live.riserShown))} + ${term(b, cm(live.tread))} = ${cm(live.sum)} cm`}</div>
              {live.status === 'ok' ? (
                <div style={{ color: 'var(--ok)' }}>{`✓ ${fill(t.stt_bl_ok, range)}`}</div>
              ) : live.status === 'warn' ? (
                <div style={{ color: 'var(--warn)' }}>
                  {`! ${fill(live.side === 'below' ? t.stt_bl_warn_below : t.stt_bl_warn_above, { d: cm(live.delta), ...range })}`}
                </div>
              ) : (
                <div style={{ color: 'var(--danger)' }}>
                  {`✕ ${fill(t.stt_bl_bad, { d: cm(live.delta), ...range })}`}
                </div>
              )}
            </li>
          </ol>
        </>
      )}
      <details open>
        <summary>{t.stt_bl_words_title}</summary>
        <p className="hint">{t.stt_bl_words}</p>
      </details>
      <p className="stt-ref">{t.stt_bl_note_straight}</p>
      {type.runStyle === 'post' ? (
        <p className="hint" style={{ color: 'var(--warn)' }}>{t.stt_bl_note_curved}</p>
      ) : (
        <p className="hint">{t.stt_bl_note_curved_short}</p>
      )}
      <details>
        <summary>{t.stt_bl_presets_title}</summary>
        <ul>
          <li>{t.stt_bl_p_hestia}</li>
          <li>{t.stt_bl_p_nbr9050}</li>
          <li>{t.stt_bl_p_nbr9077}</li>
          <li>{t.stt_bl_p_ibc}</li>
        </ul>
        <p className="stt-ref">{t.stt_bl_p_foot}</p>
      </details>
    </section>
  );
}
