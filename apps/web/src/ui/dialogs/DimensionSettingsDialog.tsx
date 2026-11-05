import { useState, type KeyboardEvent, type ReactElement } from 'react';
import type { DimensionStyle, OpeningDimRef, WallDimRef } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';
import { applyDraft, defaultDraft, draftFromProject, openingOptions, wallOptions, type DimensionDraft } from './dimensionSettingsModel.ts';
import {
  DIM_TICK_OPTIONS,
  PRECISION_OPTIONS,
  READ_CONVENTION_OPTIONS,
  TEXT_FIT_OPTIONS,
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
import { useT, type Dict } from '../../editor/i18n.ts';

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
  const { t, lang } = useT();
  const [tab, setTab] = useState<Tab>('refs');
  const [draft, setDraft] = useState<DimensionDraft>(() => draftFromProject(editor.project));
  const [current] = useState<StyleDraft>(() => styleDraftFromProject(editor.project));
  const [style, setStyle] = useState<StyleDraft>(() => styleDraftFromProject(editor.project));
  /** Texto digitado nos campos numéricos (vírgula ou ponto), para não reformatar enquanto o usuário digita. */
  const [texts, setTexts] = useState<Partial<Record<StyleNumKey, string>>>({});
  const styleErrors = validateStyleDraft(style, lang);

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
          value={texts[key] ?? formatDecimal(style[key], lang)}
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
    options: ReadonlyArray<{ value: DimensionStyle[K]; label: keyof Dict }>,
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
          {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{t(o.label)}</option>)}
        </select>
      </div>
    </div>
  );

  const fontRow = (): ReactElement => (
    <div className="prow" key="font-select">
      <label htmlFor="dst-font-select">{t('dlt_fld_font')}</label>
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
      title={t('dlt_dim_settings_title')}
      sub={tab === 'refs'
        ? t('dlt_dim_settings_sub_refs')
        : t('dlt_dim_settings_sub_style')}
      size={tab === 'style' ? 'wide' : 'mid'}
      onClose={close}
      onSubmit={confirmar}
      footer={
        <>
          {tab === 'refs'
            ? <button className="btn" onClick={() => setDraft(defaultDraft())}>{t('dlt_restore_defaults')}</button>
            : <button className="btn" onClick={restaurarEstilo}>{t('dlt_restore_default')}</button>}
          {tab === 'style' ? <button className="btn" title={t('dlt_tt_dim_families')} onClick={() => useUi.setState({ dialog: 'dimensionFamilies' })}>{t('dlt_dim_families_button')}</button> : null}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={close}>{t('stt_cancel')}</button>
          <button className="btn primary" onClick={confirmar}>{t('stt_ok')}</button>
        </>
      }
    >
      <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {tabBtn('refs', t('dlt_tab_refs'))}
        {tabBtn('style', t('dlt_tab_style'))}
      </div>
      <div onKeyDown={enterAplica}>
        {tab === 'refs' ? (
          <>
            <div className="prow">
              <label htmlFor="dim-wall">{t('dlt_fld_wall_ref')}</label>
              <div>
                <select id="dim-wall" className="select" autoFocus value={draft.wallRef} onChange={(e) => setDraft({ ...draft, wallRef: e.target.value as WallDimRef })}>
                  {wallOptions(lang).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="prow">
              <label htmlFor="dim-opening">{t('dlt_fld_opening_ref')}</label>
              <div>
                <select id="dim-opening" className="select" value={draft.openingRef} onChange={(e) => setDraft({ ...draft, openingRef: e.target.value as OpeningDimRef })}>
                  {openingOptions(lang).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="prow">
              <label htmlFor="dim-place">{t('dlt_fld_show_placement')}</label>
              <input id="dim-place" type="checkbox" checked={draft.showOnPlacement} onChange={(e) => setDraft({ ...draft, showOnPlacement: e.target.checked })} />
            </div>
            <div className="prow">
              <label htmlFor="dim-select">{t('dlt_fld_show_selection')}</label>
              <input id="dim-select" type="checkbox" checked={draft.showOnSelection} onChange={(e) => setDraft({ ...draft, showOnSelection: e.target.checked })} />
            </div>
          </>
        ) : (
          <>
            <DimensionStylePreview style={style} />
            <div style={{ height: 10 }} />
            {selectRow('tick', t('dlt_fld_tick_mark'), DIM_TICK_OPTIONS)}
            {numRow('tickSize', t('dlt_fld_tick_size_mm'))}
            {numRow('textHeight', t('dlt_fld_text_height_mm'))}
            {fontRow()}
            {numRow('extensionGap', t('dlt_fld_ext_gap_mm'))}
            {numRow('extensionOvershoot', t('dlt_fld_ext_overshoot_mm'))}
            {numRow('textGap', t('dlt_fld_text_gap_mm'))}
            {selectRow('textPlacement', t('dlt_fld_text_position'), TEXT_PLACEMENT_OPTIONS)}
            {selectRow('readConvention', t('dlt_fld_read_convention'), READ_CONVENTION_OPTIONS)}
            {selectRow('textFit', t('dlt_fld_text_fit'), TEXT_FIT_OPTIONS)}
            <div className="prow">
              <label htmlFor="dst-leaderWhenNoFit">{t('dlt_fld_leader_no_fit')}</label>
              <input
                id="dst-leaderWhenNoFit"
                type="checkbox"
                checked={style.leaderWhenNoFit}
                onChange={(e) => setStyle({ ...style, leaderWhenNoFit: e.target.checked })}
              />
            </div>
            {numRow('stackSpacing', t('dlt_fld_stack_spacing_mm'))}
            {selectRow('unit', t('dlt_fld_unit_measure'), UNIT_OPTIONS)}
            {selectRow('precision', t('dlt_fld_precision'), PRECISION_OPTIONS)}
            {textRow('prefix', t('dlt_fld_prefix'))}
            {textRow('suffix', t('dlt_fld_suffix'))}
          </>
        )}
      </div>
    </Dialog>
  );
}
