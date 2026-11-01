import { useState, type KeyboardEvent, type ReactElement } from 'react';
import type { DimensionStyle, OpeningDimRef, WallDimRef } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';
import { OPENING_OPTIONS, WALL_OPTIONS, applyDraft, defaultDraft, draftFromProject, type DimensionDraft } from './dimensionSettingsModel.ts';
import {
  DIM_TICK_OPTIONS,
  PRECISION_OPTIONS,
  TEXT_PLACEMENT_OPTIONS,
  UNIT_OPTIONS,
  defaultStyleDraft,
  fontOptions,
  formatDecimal,
  hasStyleErrors,
  parseDecimal,
  styleDiff,
  styleDraftFromProject,
  validateStyleDraft,
  type StyleDraft,
  type StyleNumKey,
} from './dimensionStyleModel.ts';
import { DimensionStylePreview } from './dimensionStylePreview.tsx';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

type Tab = 'refs' | 'style';

export interface DimensionSettingsDialogProps {
  /** Recebe só os campos alterados do estilo global (merge em `ProjectSettings.dimensionStyle`). Não chamado se nada mudou. */
  onApplyStyle?: (patch: Partial<DimensionStyle>) => void;
}

/**
 * "Cotas…" em Padrões do projeto. Duas abas: referências das cotas dinâmicas (como antes) e o estilo global
 * das cotas (marcador, texto, linhas de extensão, formato). OK aplica as duas; Esc cancela.
 */
export function DimensionSettingsDialog({ onApplyStyle }: DimensionSettingsDialogProps = {}): ReactElement {
  const [tab, setTab] = useState<Tab>('refs');
  const [draft, setDraft] = useState<DimensionDraft>(() => draftFromProject(editor.project));
  const [current] = useState<StyleDraft>(() => styleDraftFromProject(editor.project));
  const [style, setStyle] = useState<StyleDraft>(() => styleDraftFromProject(editor.project));
  /** Texto digitado nos campos numéricos (vírgula ou ponto), para não reformatar enquanto o usuário digita. */
  const [texts, setTexts] = useState<Partial<Record<StyleNumKey, string>>>({});
  const styleErrors = validateStyleDraft(style);

  const confirmar = (): void => {
    if (hasStyleErrors(styleErrors)) {
      setTab('style');
      return;
    }
    editor.store.exec({ type: 'setSettings', patch: { dimensions: applyDraft(draft) } });
    const patch = styleDiff(style, current);
    if (Object.keys(patch).length > 0) onApplyStyle?.(patch);
    close();
  };

  /** Enter num campo de texto ou número aplica (como OK). Selects e botões mantêm o comportamento nativo. */
  const enterAplica = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
    e.preventDefault();
    confirmar();
  };

  const restaurarEstilo = (): void => {
    setStyle(defaultStyleDraft());
    setTexts({});
  };

  const setNum = (key: StyleNumKey, raw: string): void => {
    setTexts((t) => ({ ...t, [key]: raw }));
    setStyle((s) => ({ ...s, [key]: parseDecimal(raw) }));
  };

  const numRow = (key: StyleNumKey, label: string): ReactElement => (
    <div className="prow" key={key}>
      <label htmlFor={`dst-${key}`}>{label}</label>
      <div style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <input
          id={`dst-${key}`}
          className="input"
          type="text"
          inputMode="decimal"
          value={texts[key] ?? formatDecimal(style[key])}
          onChange={(e) => setNum(key, e.target.value)}
        />
        {styleErrors[key] ? <span className="error">{styleErrors[key]}</span> : null}
      </div>
    </div>
  );

  const textRow = (key: 'prefix' | 'suffix', label: string): ReactElement => (
    <div className="prow" key={key}>
      <label htmlFor={`dst-${key}`}>{label}</label>
      <div style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <input
          id={`dst-${key}`}
          className="input"
          type="text"
          value={style[key]}
          onChange={(e) => setStyle({ ...style, [key]: e.target.value })}
        />
        {styleErrors[key] ? <span className="error">{styleErrors[key]}</span> : null}
      </div>
    </div>
  );

  const selectRow = <K extends keyof DimensionStyle>(
    key: K,
    label: string,
    options: ReadonlyArray<{ value: DimensionStyle[K]; label: string }>,
  ): ReactElement => (
    <div className="prow" key={String(key)}>
      <label htmlFor={`dst-${String(key)}`}>{label}</label>
      <div>
        <select
          id={`dst-${String(key)}`}
          className="select"
          value={String(style[key])}
          onChange={(e) => {
            const picked = options.find((o) => String(o.value) === e.target.value);
            if (picked) setStyle({ ...style, [key]: picked.value });
          }}
        >
          {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );

  const fontRow = (): ReactElement => (
    <div className="prow" key="font-select">
      <label htmlFor="dst-font-select">Fonte</label>
      <div>
        <select id="dst-font-select" className="select" value={style.font} onChange={(e) => setStyle({ ...style, font: e.target.value })}>
          {fontOptions(style.font).map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
    </div>
  );

  const tabBtn = (id: Tab, label: string): ReactElement => (
    <button role="tab" aria-selected={tab === id} className={tab === id ? 'btn primary' : 'btn'} onClick={() => setTab(id)}>
      {label}
    </button>
  );

  return (
    <Dialog
      title="Cotas do projeto"
      sub={tab === 'refs'
        ? 'Referências das cotas dinâmicas que aparecem ao colocar e ao selecionar'
        : 'Estilo global das cotas: marcador, texto, linhas de extensão e formato'}
      size={tab === 'style' ? 'wide' : 'mid'}
      onClose={close}
      onSubmit={confirmar}
      footer={
        <>
          {tab === 'refs'
            ? <button className="btn" onClick={() => setDraft(defaultDraft())}>Restaurar padrões</button>
            : <button className="btn" onClick={restaurarEstilo}>Restaurar padrão</button>}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>Cancelar</button>
          <button className="btn primary" onClick={confirmar}>OK</button>
        </>
      }
    >
      <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {tabBtn('refs', 'Referências')}
        {tabBtn('style', 'Estilo das cotas')}
      </div>
      <div onKeyDown={enterAplica}>
        {tab === 'refs' ? (
          <>
            <div className="prow">
              <label htmlFor="dim-wall">Referência de paredes</label>
              <div>
                <select id="dim-wall" className="select" autoFocus value={draft.wallRef} onChange={(e) => setDraft({ ...draft, wallRef: e.target.value as WallDimRef })}>
                  {WALL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="prow">
              <label htmlFor="dim-opening">Referência de portas e janelas</label>
              <div>
                <select id="dim-opening" className="select" value={draft.openingRef} onChange={(e) => setDraft({ ...draft, openingRef: e.target.value as OpeningDimRef })}>
                  {OPENING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="prow">
              <label htmlFor="dim-place">Mostrar ao colocar</label>
              <input id="dim-place" type="checkbox" checked={draft.showOnPlacement} onChange={(e) => setDraft({ ...draft, showOnPlacement: e.target.checked })} />
            </div>
            <div className="prow">
              <label htmlFor="dim-select">Mostrar ao selecionar</label>
              <input id="dim-select" type="checkbox" checked={draft.showOnSelection} onChange={(e) => setDraft({ ...draft, showOnSelection: e.target.checked })} />
            </div>
          </>
        ) : (
          <>
            <DimensionStylePreview style={style} />
            <div style={{ height: 10 }} />
            {selectRow('tick', 'Marcador', DIM_TICK_OPTIONS)}
            {numRow('tickSize', 'Tamanho do marcador (mm)')}
            {numRow('textHeight', 'Altura do texto (mm)')}
            {fontRow()}
            {numRow('extensionGap', 'Folga da linha de extensão (mm)')}
            {numRow('extensionOvershoot', 'Ultrapassagem da linha de extensão (mm)')}
            {selectRow('textPlacement', 'Posição do texto', TEXT_PLACEMENT_OPTIONS)}
            <div className="prow">
              <label htmlFor="dst-leaderWhenNoFit">Linha de chamada quando não cabe</label>
              <input
                id="dst-leaderWhenNoFit"
                type="checkbox"
                checked={style.leaderWhenNoFit}
                onChange={(e) => setStyle({ ...style, leaderWhenNoFit: e.target.checked })}
              />
            </div>
            {numRow('stackSpacing', 'Espaçamento entre cotas empilhadas (mm)')}
            {selectRow('unit', 'Unidade', UNIT_OPTIONS)}
            {selectRow('precision', 'Precisão', PRECISION_OPTIONS)}
            {textRow('prefix', 'Prefixo')}
            {textRow('suffix', 'Sufixo')}
          </>
        )}
      </div>
    </Dialog>
  );
}
