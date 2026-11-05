import { useRef, useState, type ReactElement } from 'react';
import { FUNCTION_PRIORITY, type Layer } from '@hestia/model';
import { useT } from '../../editor/i18n.ts';
import { LayerTermino } from './LayerTermino.tsx';

interface LayerAdvancedProps {
  /** Prefixo de id estável da linha, ex.: `wt-layer-2`. */
  id: string;
  layer: Layer;
  /** Recebe a camada inteira. A chave `priority` sai do objeto quando a prioridade volta ao padrão. */
  onChange: (next: Layer) => void;
  /** Mostra também "Término na junção" (só pisos e lajes, decisão 0023 §2, P8). */
  termino?: boolean;
}

/** Conteúdo expandido ("mais") de uma linha de camada (docs/06 §5). Não guarda nada além do texto do campo. */
export function LayerAdvanced({ id, layer, onChange, termino = false }: LayerAdvancedProps): ReactElement {
  const { t } = useT();
  const padrao = FUNCTION_PRIORITY[layer.function];
  const shown = layer.priority === undefined ? '' : String(layer.priority);
  const [text, setText] = useState(shown);
  const [seen, setSeen] = useState(shown);
  const cancel = useRef(false);
  // Sincroniza o texto quando a camada muda por fora (botão "Padrão", troca de função).
  if (seen !== shown) {
    setSeen(shown);
    setText(shown);
  }

  const apply = (value: number | null): void => {
    const target = value === null || value === padrao ? undefined : value;
    setText(target === undefined ? '' : String(target));
    if (target === layer.priority) return;
    const next: Layer = { ...layer };
    if (target === undefined) delete next.priority;
    else next.priority = target;
    onChange(next);
  };

  const commit = (): void => {
    if (cancel.current) {
      cancel.current = false;
      setText(shown);
      return;
    }
    const t = text.trim();
    if (t === '') apply(null);
    else if (/^\d+$/.test(t)) apply(Math.min(9, Math.max(1, Number(t))));
    else setText(shown);
  };

  return (
    <>
      <div className="adv-panel">
        <div className="adv-row">
          <label htmlFor={`${id}-prio`}>{t('dlc_layer_join_priority')}</label>
          <span className="adv-ctl">
            <input
              id={`${id}-prio`}
              className="input num"
              inputMode="numeric"
              placeholder={String(padrao)}
              aria-describedby={`${id}-prio-help`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  cancel.current = true;
                  e.currentTarget.blur();
                }
                e.stopPropagation();
              }}
            />
            <button id={`${id}-prio-reset`} className="btn small" disabled={layer.priority === undefined} onClick={() => apply(null)}>
              {t('dlc_btn_default')}
            </button>
          </span>
        </div>
        <p id={`${id}-prio-help`} className="adv-help">{t('dlc_layer_join_priority_help')}</p>
      </div>
      {termino && <LayerTermino id={id} layer={layer} onChange={onChange} />}
    </>
  );
}
