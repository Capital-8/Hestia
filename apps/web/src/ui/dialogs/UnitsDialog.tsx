import { useState, type ReactElement } from 'react';
import {
  defaultUnits,
  quantityUnits,
  type QuantityUnit,
} from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { useUnits } from '../useUnits.ts';
import { Dialog } from './Dialog.tsx';
import {
  QUANTITY_KEYS,
  QUANTITY_LABELS,
  UNIT_LABELS,
  applyDraft,
  draftFrom,
  exampleLines,
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
  const units = useUnits();
  const [draft, setDraft] = useState<UnitsDraft>(() => draftFrom(units));
  const [erro, setErro] = useState('');
  const mudar = (q: QuantityKey, patch: Record<string, unknown>): void =>
    setDraft((d) => ({ ...d, [q]: { ...d[q], ...patch } }) as unknown as UnitsDraft);
  const restaurar = (): void => {
    setDraft(draftFrom(defaultUnits()));
    setErro('');
  };
  const confirmar = (): void => {
    const problema = validateDraft(draft);
    if (problema) {
      setErro(problema);
      return;
    }
    editor.store.exec({ type: 'setSettings', patch: { units: applyDraft(draft) } });
    close();
  };
  return (
    <Dialog
      title="Unidades do projeto"
      sub="Medidas do modelo continuam em metros; isto muda o que você lê e digita"
      size="mid"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={restaurar}>Restaurar padrões</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>Cancelar</button>
          <button className="btn primary" onClick={confirmar}>OK</button>
        </>
      }
    >
      <table className="layers units">
        <thead>
          <tr>
            <th>Grandeza</th>
            <th>Unidade</th>
            <th>Casas decimais</th>
            <th>Suprimir zeros</th>
          </tr>
        </thead>
        <tbody>
          {QUANTITY_KEYS.map((q) => {
            const f = draft[q];
            const opcoes = quantityUnits(q) as readonly QuantityUnit[];
            return (
              <tr key={q}>
                <td>{QUANTITY_LABELS[q]}</td>
                <td>
                  <select
                    id={`un-${q}`}
                    className="select"
                    aria-label={`${QUANTITY_LABELS[q]}: unidade`}
                    autoFocus={q === 'length'}
                    value={f.unit}
                    onChange={(e) => mudar(q, { unit: e.target.value })}
                  >
                    {opcoes.map((u) => (
                      <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                    ))}
                  </select>
                </td>
                <td>
                  {f.unit === 'ft-in' ? (
                    <select
                      className="select"
                      aria-label={`${QUANTITY_LABELS[q]}: fração`}
                      value={f.denominator}
                      onChange={(e) => mudar(q, { denominator: Number(e.target.value) })}
                    >
                      {FRACOES.map((d) => <option key={d} value={d}>{rotuloFracao(d)}</option>)}
                    </select>
                  ) : (
                    <select
                      className="select"
                      aria-label={`${QUANTITY_LABELS[q]}: casas decimais`}
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
                    aria-label={`${QUANTITY_LABELS[q]}: suprimir zeros`}
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
        <label htmlFor="un-decimal">Símbolo decimal</label>
        <div>
          <select
            id="un-decimal"
            className="select"
            aria-label="Símbolo decimal"
            value={draft.decimalSymbol}
            onChange={(e) => setDraft((d) => ({ ...d, decimalSymbol: e.target.value === '.' ? '.' : ',' }))}
          >
            <option value=",">Vírgula</option>
            <option value=".">Ponto</option>
          </select>
        </div>
      </div>
      <div className="prow">
        <label htmlFor="un-currency">Símbolo de moeda</label>
        <div>
          <input
            id="un-currency"
            className="input"
            aria-label="Símbolo de moeda"
            maxLength={4}
            value={draft.currency}
            onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
          />
        </div>
      </div>
      <div className="hint" aria-live="polite">
        <strong>Exemplo ao vivo</strong>
        <ul>
          {exampleLines(draft).map((l) => (
            <li key={l.q}><span>{l.label}:</span> {l.text}</li>
          ))}
        </ul>
      </div>
      {erro ? <p className="error" role="alert">{erro}</p> : null}
    </Dialog>
  );
}
