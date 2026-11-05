import { useState, type ReactElement } from 'react';
import {
  defaultUnits,
  quantityUnits,
  type QuantityUnit,
} from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { useT } from '../../editor/i18n.ts';
import { useUnits } from '../useUnits.ts';
import { Dialog } from './Dialog.tsx';
import {
  QUANTITY_KEYS,
  applyDraft,
  draftFrom,
  exampleLines,
  quantityLabels,
  unitLabels,
  validateDraft,
  type QuantityKey,
  type UnitsDraft,
} from './unitsDialogModel.ts';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
const FRACOES = [2, 4, 8, 16, 32, 64] as const;

function rotuloFracao(d: number): string {
  return `1/${d}"`;
}

export function UnitsDialog(): ReactElement {
  const { t, lang } = useT();
  const units = useUnits();
  const labels = quantityLabels(lang);
  const unidades = unitLabels(lang);
  const [draft, setDraft] = useState<UnitsDraft>(() => draftFrom(units));
  const [erro, setErro] = useState('');
  const mudar = (q: QuantityKey, patch: Record<string, unknown>): void =>
    setDraft((d) => ({ ...d, [q]: { ...d[q], ...patch } }) as unknown as UnitsDraft);
  const restaurar = (): void => {
    setDraft(draftFrom(defaultUnits()));
    setErro('');
  };
  const confirmar = (): void => {
    const problema = validateDraft(draft, lang);
    if (problema) {
      setErro(problema);
      return;
    }
    editor.store.exec({ type: 'setSettings', patch: { units: applyDraft(draft) } });
    close();
  };
  return (
    <Dialog
      title={t('dlc_units_title')}
      sub={t('dlc_units_sub')}
      size="mid"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={restaurar}>{t('dlc_units_restore')}</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('dlc_btn_cancel')}</button>
          <button className="btn primary" onClick={confirmar}>OK</button>
        </>
      }
    >
      <table className="layers units">
        <thead>
          <tr>
            <th>{t('dlc_units_quantity')}</th>
            <th>{t('dlc_unit')}</th>
            <th>{t('dlc_units_decimals')}</th>
            <th>{t('dlc_units_suppress_zeros')}</th>
          </tr>
        </thead>
        <tbody>
          {QUANTITY_KEYS.map((q) => {
            const f = draft[q];
            const opcoes = quantityUnits(q) as readonly QuantityUnit[];
            return (
              <tr key={q}>
                <td>{labels[q]}</td>
                <td>
                  <select
                    id={`un-${q}`}
                    className="select"
                    aria-label={t('dlc_aria_units_unit', { label: labels[q] })}
                    autoFocus={q === 'length'}
                    value={f.unit}
                    onChange={(e) => mudar(q, { unit: e.target.value })}
                  >
                    {opcoes.map((u) => (
                      <option key={u} value={u}>{unidades[u]}</option>
                    ))}
                  </select>
                </td>
                <td>
                  {f.unit === 'ft-in' ? (
                    <select
                      className="select"
                      aria-label={t('dlc_aria_units_fraction', { label: labels[q] })}
                      value={f.denominator}
                      onChange={(e) => mudar(q, { denominator: Number(e.target.value) })}
                    >
                      {FRACOES.map((d) => <option key={d} value={d}>{rotuloFracao(d)}</option>)}
                    </select>
                  ) : (
                    <select
                      className="select"
                      aria-label={t('dlc_aria_units_decimals', { label: labels[q] })}
                      value={f.decimals}
                      onChange={(e) => mudar(q, { decimals: Number(e.target.value) })}
                    >
                      {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                </td>
                <td>
                  <input
                    type="checkbox"
                    aria-label={t('dlc_aria_units_suppress', { label: labels[q] })}
                    checked={f.suppressZeros}
                    onChange={(e) => mudar(q, { suppressZeros: e.target.checked })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="prow">
        <label htmlFor="un-decimal">{t('dlc_units_decimal_symbol')}</label>
        <div>
          <select
            id="un-decimal"
            className="select"
            aria-label={t('dlc_units_decimal_symbol')}
            value={draft.decimalSymbol}
            onChange={(e) => setDraft((d) => ({ ...d, decimalSymbol: e.target.value === '.' ? '.' : ',' }))}
          >
            <option value=",">{t('dlc_units_comma')}</option>
            <option value=".">{t('dlc_units_period')}</option>
          </select>
        </div>
      </div>
      <div className="prow">
        <label htmlFor="un-currency">{t('dlc_units_currency')}</label>
        <div>
          <input
            id="un-currency"
            className="input"
            aria-label={t('dlc_units_currency')}
            maxLength={4}
            value={draft.currency}
            onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
          />
        </div>
      </div>
      <div className="hint" aria-live="polite">
        <strong>{t('dlc_units_live')}</strong>
        <ul>
          {exampleLines(draft, lang).map((l) => (
            <li key={l.q}><span>{l.label}:</span> {l.text}</li>
          ))}
        </ul>
      </div>
      {erro ? <p className="error" role="alert">{erro}</p> : null}
    </Dialog>
  );
}
