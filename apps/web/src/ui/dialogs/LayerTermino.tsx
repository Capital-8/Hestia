import { useState, type ReactElement } from 'react';
import { terminoOf, type Layer } from '@hestia/model';
import { useT } from '../../editor/i18n.ts';
import {
  CAMADA_FORM_PADRAO,
  camadaOpcoes,
  formDoLimiteExterno,
  formDoTermino,
  limiteExternoAjuda,
  limiteExternoDoForm,
  limiteExternoOpcoes,
  predefinicoes,
  terminoAjuda,
  terminoDoForm,
  terminoOpcoes,
  type CamadaForm,
  type LimiteExternoKind,
  type PredefinicaoId,
  type TerminoKind,
} from './terminoForm.ts';

interface LayerTerminoProps {
  /** Prefixo de id estável da linha, ex.: `ft-layer-0`. */
  id: string;
  layer: Layer;
  onChange: (next: Layer) => void;
  /** Aplica uma predefinição a todas as camadas do tipo (o diálogo do tipo tem a lista inteira). */
  onPreset?: (id: PredefinicaoId) => void;
}

/** Linha "Término nas paredes" da seção avançada da camada de piso ou de laje (decisão 0023 §2, P8; decisão 0025). */
export function LayerTermino({ id, layer, onChange, onPreset }: LayerTerminoProps): ReactElement {
  const { t, lang } = useT();
  const opcoes = terminoOpcoes(lang);
  const ajudas = terminoAjuda(lang);
  const limiteOpcoes = limiteExternoOpcoes(lang);
  const limiteAjudas = limiteExternoAjuda(lang);
  const cam = camadaOpcoes(lang);
  const presets = predefinicoes(lang);
  const shown = formDoTermino(terminoOf(layer));
  const shownLimite = formDoLimiteExterno(layer.limiteExterno);
  const [kind, setKind] = useState<TerminoKind>(shown.kind);
  const [cmText, setCmText] = useState(shown.cmText);
  const [camada, setCamada] = useState<CamadaForm>(shown.camada ?? CAMADA_FORM_PADRAO);
  const [limite, setLimite] = useState<LimiteExternoKind>(shownLimite);
  const [erro, setErro] = useState<string | null>(null);
  const [seen, setSeen] = useState(JSON.stringify({ shown, shownLimite }));
  // Sincroniza quando a camada muda por fora (desfazer, troca de tipo).
  if (seen !== JSON.stringify({ shown, shownLimite })) {
    setSeen(JSON.stringify({ shown, shownLimite }));
    setKind(shown.kind);
    setCmText(shown.cmText);
    setCamada(shown.camada ?? CAMADA_FORM_PADRAO);
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

  const apply = (k: TerminoKind, text: string, c: CamadaForm = camada): void => {
    const r = terminoDoForm(k, text, lang, c);
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

  const editCamada = (patch: Partial<CamadaForm>): void => {
    const c = { ...camada, ...patch };
    setCamada(c);
    apply('camada', cmText, c);
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
              if (k === 'camada') {
                setKind(k);
                apply(k, cmText, camada);
                return;
              }
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
      {kind === 'camada' && (
        <>
          <div className="adv-row">
            <label htmlFor={`${id}-cam-funcao`}>{t('dlc_term_cam_which')}</label>
            <span className="adv-ctl">
              <select id={`${id}-cam-funcao`} className="input" aria-label={t('dlc_term_cam_aria')} value={camada.funcao} onChange={(e) => editCamada({ funcao: e.target.value as CamadaForm['funcao'] })}>
                {cam.funcoes.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </span>
          </div>
          <div className="adv-row">
            <label htmlFor={`${id}-cam-lado`}>{t('dlc_term_cam_side')}</label>
            <span className="adv-ctl">
              <select id={`${id}-cam-lado`} className="input" value={camada.lado} onChange={(e) => editCamada({ lado: e.target.value as CamadaForm['lado'] })}>
                {cam.lados.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </span>
          </div>
          <div className="adv-row">
            <label htmlFor={`${id}-cam-face`}>{t('dlc_term_cam_face')}</label>
            <span className="adv-ctl">
              <select id={`${id}-cam-face`} className="input" value={camada.face} onChange={(e) => editCamada({ face: e.target.value as CamadaForm['face'] })}>
                {cam.faces.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </span>
          </div>
          <div className="adv-row">
            <label htmlFor={`${id}-cam-cm`}>{t('dlc_term_cam_offset')}</label>
            <span className="adv-ctl">
              <input
                id={`${id}-cam-cm`}
                className="input num"
                inputMode="decimal"
                aria-invalid={erro !== null}
                aria-describedby={`${id}-termino-help`}
                value={camada.cmText}
                onChange={(e) => setCamada({ ...camada, cmText: e.target.value })}
                onBlur={() => apply('camada', cmText, camada)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  e.stopPropagation();
                }}
              />
            </span>
          </div>
          <p className="adv-help">{t('dlc_term_cam_example')}</p>
        </>
      )}
      <p id={`${id}-termino-help`} className="adv-help">{erro ?? ajudas[kind]}</p>
      {onPreset && (
        <div className="adv-row">
          <span>{t('dlc_term_cam_presets')}</span>
          <span className="adv-ctl" style={{ flexWrap: 'wrap' }}>
            {presets.map((p) => (
              <button key={p.id} id={`${id}-preset-${p.id}`} className="btn small" title={p.ajuda} aria-describedby={`${id}-preset-${p.id}-help`} onClick={() => onPreset(p.id)}>{p.label}</button>
            ))}
          </span>
        </div>
      )}
      {onPreset && presets.map((p) => <p key={p.id} id={`${id}-preset-${p.id}-help`} className="adv-help">{p.label}: {p.ajuda}</p>)}
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
