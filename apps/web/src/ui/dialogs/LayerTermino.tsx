import { useState, type ReactElement } from 'react';
import { terminoOf, type Layer } from '@hestia/model';
import { useT } from '../../editor/i18n.ts';
import {
  formDoLimiteExterno,
  formDoTermino,
  limiteExternoAjuda,
  limiteExternoDoForm,
  limiteExternoOpcoes,
  terminoAjuda,
  terminoDoForm,
  terminoOpcoes,
  type LimiteExternoKind,
  type TerminoKind,
} from './terminoForm.ts';

interface LayerTerminoProps {
  /** Prefixo de id estável da linha, ex.: `ft-layer-0`. */
  id: string;
  layer: Layer;
  onChange: (next: Layer) => void;
}

/** Linha "Término nas paredes" da seção avançada da camada de piso ou de laje (decisão 0023 §2, P8; decisão 0025). */
export function LayerTermino({ id, layer, onChange }: LayerTerminoProps): ReactElement {
  const { t, lang } = useT();
  const opcoes = terminoOpcoes(lang);
  const ajudas = terminoAjuda(lang);
  const limiteOpcoes = limiteExternoOpcoes(lang);
  const limiteAjudas = limiteExternoAjuda(lang);
  const shown = formDoTermino(terminoOf(layer));
  const shownLimite = formDoLimiteExterno(layer.limiteExterno);
  const [kind, setKind] = useState<TerminoKind>(shown.kind);
  const [cmText, setCmText] = useState(shown.cmText);
  const [limite, setLimite] = useState<LimiteExternoKind>(shownLimite);
  const [erro, setErro] = useState<string | null>(null);
  const [seen, setSeen] = useState(JSON.stringify({ shown, shownLimite }));
  // Sincroniza quando a camada muda por fora (desfazer, troca de tipo).
  if (seen !== JSON.stringify({ shown, shownLimite })) {
    setSeen(JSON.stringify({ shown, shownLimite }));
    setKind(shown.kind);
    setCmText(shown.cmText);
    setLimite(shownLimite);
    setErro(null);
  }

  const applyLimite = (k: LimiteExternoKind): void => {
    setLimite(k);
    const next: Layer = { ...layer };
    const v = limiteExternoDoForm(k);
    if (v === undefined) delete next.limiteExterno;
    else next.limiteExterno = v;
    if (JSON.stringify(next.limiteExterno) === JSON.stringify(layer.limiteExterno)) return;
    onChange(next);
  };

  const apply = (k: TerminoKind, text: string): void => {
    const r = terminoDoForm(k, text, lang);
    if ('erro' in r) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    const next: Layer = { ...layer };
    if (r.termino === undefined) delete next.termino;
    else next.termino = r.termino;
    if (JSON.stringify(next.termino) === JSON.stringify(layer.termino)) return;
    onChange(next);
  };

  return (
    <div className="adv-panel">
      <div className="adv-row">
        <label htmlFor={`${id}-termino`}>{t('dlc_layer_wall_termination')}</label>
        <span className="adv-ctl">
          <select
            id={`${id}-termino`}
            className="input"
            value={kind}
            onChange={(e) => {
              const k = e.target.value as TerminoKind;
              // Ao escolher prioridade, o campo começa em 3 (ou mantém um número de 1 a 9 já digitado).
              const text = k === 'ate' && !/^[1-9]$/.test(cmText.trim()) ? '3' : cmText;
              setKind(k);
              setCmText(text);
              apply(k, text);
            }}
          >
            {opcoes.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {(kind === 'cm' || kind === 'ate') && (
            <input
              id={`${id}-termino-cm`}
              className="input num"
              inputMode={kind === 'cm' ? 'decimal' : 'numeric'}
              aria-label={kind === 'cm' ? t('dlc_aria_layer_term_offset') : t('dlc_aria_layer_term_priority')}
              aria-invalid={erro !== null}
              aria-describedby={`${id}-termino-help`}
              value={cmText}
              onChange={(e) => setCmText(e.target.value)}
              onBlur={() => apply(kind, cmText)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                e.stopPropagation();
              }}
            />
          )}
        </span>
      </div>
      <p id={`${id}-termino-help`} className="adv-help">{erro ?? ajudas[kind]}</p>
      <div className="adv-row">
        <label htmlFor={`${id}-limite`}>{t('dlc_layer_perimeter_limit')}</label>
        <span className="adv-ctl">
          <select
            id={`${id}-limite`}
            className="input"
            value={limite}
            onChange={(e) => applyLimite(e.target.value as LimiteExternoKind)}
          >
            {limiteOpcoes.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </span>
      </div>
      <p id={`${id}-limite-help`} className="adv-help">{limiteAjudas[limite]}</p>
    </div>
  );
}
