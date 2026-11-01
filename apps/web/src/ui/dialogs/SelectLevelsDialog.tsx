import { useState, type ReactElement } from 'react';
import { formatQuantity, type Id } from '@hestia/model';
import { Check } from '../fields.tsx';
import { useUnits } from '../useUnits.ts';
import { Dialog } from './Dialog.tsx';
import {
  createPasteLevelsModel,
  deltaOf,
  groupLevels,
  search,
  selectAllAbove,
  selectAllBelow,
  selectRange,
  summary,
  toggleLevel,
  validate,
  type PasteLevelsLevel,
  type PasteLevelsModel,
} from './pasteLevelsModel.ts';

export interface SelectLevelsDialogProps {
  /** Níveis do projeto (a ordem recebida não importa: o diálogo ordena por elevação). */
  levels: readonly PasteLevelsLevel[];
  /** Níveis de onde a seleção copiada veio: a referência do Δh e nunca destino. */
  originLevelIds: readonly Id[];
  /** Elementos na área de transferência. */
  elementCount: number;
  /** Níveis marcados ao abrir. */
  initialSelected: readonly Id[];
  /** Vínculo entre as cópias ao abrir (o padrão do diálogo é desligado). */
  initialLink: boolean;
  onCancel: () => void;
  onPreview: (levelIds: Id[], link: boolean) => void;
  onPaste: (levelIds: Id[], link: boolean) => void;
}

/**
 * Diálogo "Selecionar níveis" do colar alinhado: lista os níveis em Acima / Atual / Abaixo, marca os destinos e
 * devolve a escolha por `onPaste` (um passo de desfazer) ou `onPreview` (rascunho fantasma + aba contextual).
 * Controlado por props: não conhece o controlador nem o estado da área de transferência.
 */
export function SelectLevelsDialog({
  levels,
  originLevelIds,
  elementCount,
  initialSelected,
  initialLink,
  onCancel,
  onPreview,
  onPaste,
}: SelectLevelsDialogProps): ReactElement {
  const units = useUnits();
  // O diálogo é montado do zero a cada abertura: o estado local começa dos props e evolui daí.
  const [model, setModel] = useState<PasteLevelsModel>(() =>
    createPasteLevelsModel({ levels, originLevelIds, elementCount, initialSelected, initialLink }),
  );
  const [term, setTerm] = useState('');
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(0);
  const [rangeTo, setRangeTo] = useState(() => Math.max(0, levels.length - 1));
  const [erro, setErro] = useState('');

  const change = (fn: (m: PasteLevelsModel) => PasteLevelsModel): void => {
    setModel(fn);
    setErro('');
  };
  const setLink = (link: boolean): void => change((m) => ({ ...m, link }));

  const copies = model.selected.length * model.elementCount;
  const groups = groupLevels(model);
  const above = groups.find((g) => g.key === 'above')?.levels ?? [];
  const below = groups.find((g) => g.key === 'below')?.levels ?? [];

  const levelLabel = (level: PasteLevelsLevel): string => formatQuantity(units, 'length', level.elevation);
  const deltaLabel = (id: Id): string => {
    const delta = deltaOf(model, id);
    if (delta === null) return '—';
    const text = formatQuantity(units, 'length', Math.abs(delta));
    if (Math.abs(delta) < 1e-9) return text;
    return `${delta > 0 ? '+' : '−'}${text}`;
  };

  const applyRange = (from: number, to: number): void => {
    change((m) => selectRange(m, from, to));
  };

  const confirm = (action: (levelIds: Id[], link: boolean) => void): void => {
    const problem = validate(model);
    if (problem !== null) {
      setErro(problem);
      return;
    }
    action([...model.selected], model.link);
  };

  return (
    <Dialog
      title="Selecionar níveis"
      sub="Colar alinhado"
      size="mid"
      onClose={onCancel}
      footer={
        <>
          <span aria-live="polite" style={{ color: 'var(--fg-soft)' }}>{summary(model)}</span>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onCancel}>Cancelar</button>
          <button className="btn" onClick={() => confirm(onPreview)}>Pré-visualizar</button>
          <button className="btn primary" onClick={() => confirm(onPaste)}>Colar {copies}</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: 1, minWidth: 160 }}
            type="search"
            placeholder="Buscar nível…"
            aria-label="Buscar nível"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <button className="btn small" onClick={() => change(selectAllAbove)} disabled={above.length === 0}>Todos acima</button>
          <button className="btn small" onClick={() => change(selectAllBelow)} disabled={below.length === 0}>Todos abaixo</button>
          <button className="btn small" aria-expanded={rangeOpen} onClick={() => setRangeOpen((open) => !open)}>Intervalo…</button>
        </div>

        {rangeOpen ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label htmlFor="paste-levels-from">De</label>
            <select
              id="paste-levels-from"
              className="select"
              aria-label="Primeiro nível do intervalo"
              value={rangeFrom}
              onChange={(e) => {
                const from = Number(e.target.value);
                setRangeFrom(from);
                applyRange(from, rangeTo);
              }}
            >
              {model.levels.map((level, index) => (
                <option key={level.id} value={index}>{index + 1} · {level.name}</option>
              ))}
            </select>
            <label htmlFor="paste-levels-to">Até</label>
            <select
              id="paste-levels-to"
              className="select"
              aria-label="Último nível do intervalo"
              value={rangeTo}
              onChange={(e) => {
                const to = Number(e.target.value);
                setRangeTo(to);
                applyRange(rangeFrom, to);
              }}
            >
              {model.levels.map((level, index) => (
                <option key={level.id} value={index}>{index + 1} · {level.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        {groups.length === 0 || groups.every((g) => search(g.levels, term).length === 0) ? (
          <p className="hint">Nenhum nível encontrado.</p>
        ) : (
          <table className="layers" aria-label="Níveis de destino">
            <thead>
              <tr>
                <th>Nome</th>
                <th style={{ textAlign: 'right' }}>Elevação</th>
                <th style={{ textAlign: 'right' }}>Δh</th>
              </tr>
            </thead>
            {groups.map((group) => {
              const visible = search(group.levels, term);
              if (visible.length === 0) return null;
              return (
                <tbody key={group.key}>
                  <tr>
                    <td colSpan={3} style={{ padding: '8px 4px 3px', fontWeight: 600, color: 'var(--fg-soft)' }}>
                      {group.title}
                    </td>
                  </tr>
                  {visible.map((level) => {
                    const origin = model.originLevelIds.includes(level.id);
                    return (
                      <tr key={level.id}>
                        <td>
                          <Check
                            id={`paste-level-${level.id}`}
                            checked={model.selected.includes(level.id)}
                            disabled={origin}
                            onChange={() => change((m) => toggleLevel(m, level.id))}
                          >
                            {level.name}
                          </Check>
                          {origin ? <span className="tmark">Origem</span> : null}
                        </td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{levelLabel(level)}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{deltaLabel(level.id)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })}
          </table>
        )}

        <Check id="paste-levels-link" checked={model.link} onChange={setLink}>Manter cópias vinculadas</Check>

        {erro ? <p className="error" role="alert">{erro}</p> : null}
      </div>
    </Dialog>
  );
}
