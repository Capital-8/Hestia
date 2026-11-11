import { Fragment, useMemo, useState, type ReactElement } from 'react';
import { CURTAIN_PRESET_ID, curtainPresetType, formatQuantity, functionLabels, FUNCTION_LABEL, coreRange, isCurtainType, layerPriority, newId, wallThicknessOf, wallTypeUsage, type Layer, type LayerFunction, type WallType, type WrapMode } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { NumField, TextField } from '../fields.tsx';
import { Icon } from '../Icon.tsx';
import { Dialog } from './Dialog.tsx';
import { TypeDialogHeader } from './TypeDialogHeader.tsx';
import { FAMILY } from '../typeFamilies.ts';
import { LayerAdvanced } from './LayerAdvanced.tsx';
import { MaterialsDialog } from './MaterialsDialog.tsx';
import { SectionPreview } from './SectionPreview.tsx';
import { StripsTab, stripError } from './StripsTab.tsx';
import { TypeParams } from './TypeParams.tsx';
import { useUnits } from '../useUnits.ts';
import { useT } from '../../editor/i18n.ts';
import { AbaCortina } from './CurtainTab.tsx';

const FUNCTIONS = Object.keys(FUNCTION_LABEL) as LayerFunction[];
type Tab = 'estrutura' | 'faixas' | 'graficos' | 'identidade' | 'cortina';

export function WallTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const units = useUnits();
  const { t, lang } = useT();
  const fnLabels = functionLabels(lang);
  const WRAP_OPTIONS: Array<[WrapMode, string]> = [
    ['none', t('dlt_wrap_none')],
    ['both', t('dlt_wrap_both')],
    ['exterior', t('dlt_wrap_exterior')],
    ['interior', t('dlt_wrap_interior')],
  ];
  const p = useProject();
  const src = p.wallTypes[typeId];
  const [draft, setDraft] = useState<WallType | null>(src ? structuredClone(src) : null);
  const [tab, setTab] = useState<Tab>('estrutura');
  const [pick, setPick] = useState<number | null>(null);
  const [stripPick, setStripPick] = useState<number | null>(null);
  const [adv, setAdv] = useState<number | null>(null);
  const [current, setCurrent] = useState(typeId);
  if (current !== typeId) {
    setCurrent(typeId);
    setAdv(null);
    setDraft(p.wallTypes[typeId] ? structuredClone(p.wallTypes[typeId]!) : null);
  }
  const usage = useMemo(() => (draft ? wallTypeUsage(p, draft.id) : 0), [p, draft]);
  if (!draft) return null;
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const core = coreRange(draft);
  const stripsInvalid = draft.strips.some((s) => stripError(s, lang) !== null);
  // Tipo cortina (decisão 0056): tem aba própria e não tem camadas, faixas nem gráficos de camada.
  const curtainDraft = isCurtainType(draft) ? draft : null;
  const aba: Tab = curtainDraft && (tab === 'estrutura' || tab === 'faixas' || tab === 'graficos') ? 'cortina' : tab;
  const setLayer = (i: number, patch: Partial<Layer>): void => setDraft({ ...draft, layers: draft.layers.map((l, k) => (k === i ? { ...l, ...patch } : l)) });
  const replaceLayer = (i: number, next: Layer): void => setDraft({ ...draft, layers: draft.layers.map((l, k) => (k === i ? next : l)) });
  const move = (i: number, d: -1 | 1): void => {
    const j = i + d;
    if (j < 0 || j >= draft.layers.length) return;
    const ls = [...draft.layers];
    [ls[i], ls[j]] = [ls[j]!, ls[i]!];
    setDraft({ ...draft, layers: ls });
    setAdv(null);
  };
  const insert = (): void => {
    const at = Math.max(0, Math.min(draft.layers.length, core.first + 1));
    const ls = [...draft.layers];
    ls.splice(at, 0, { function: 'substrate', materialId: 'mat_reboco', thickness: 0.01, wraps: true });
    setDraft({ ...draft, layers: ls });
    setAdv(null);
  };
  const remove = (i: number): void => {
    if (draft.layers.length > 1) {
      setDraft({ ...draft, layers: draft.layers.filter((_, k) => k !== i) });
      setAdv(null);
    }
  };
  /** Grava como o OK, mas o diálogo segue aberto com o rascunho. Erro de validação (cortina inválida) vai para a barra de status. */
  const gravar = (fechar: boolean): void => {
    if (stripsInvalid) return;
    try {
      editor.store.exec({ type: 'upsertWallType', wallType: draft }, 'undo_edit_wall_type');
      if (fechar) close();
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : { key: 'dlt_err_delete_generic' } });
    }
  };
  const apply = (): void => gravar(false);
  const ok = (): void => gravar(true);
  const duplicate = (): void => {
    const copy = { ...draft, id: newId('wt'), name: `${draft.name} ${t('dlt_duplicate_suffix')}` };
    editor.store.exec({ type: 'upsertWallType', wallType: copy }, 'dlo_cmd_duplicate');
    useUi.setState({ dialogArg: copy.id });
  };
  /** Cria um tipo cortina a partir da predefinição "vidraça de fachada" (decisão 0056, §4.5). */
  const duplicateAsCurtain = (): void => {
    const base = curtainPresetType(CURTAIN_PRESET_ID.vitrine, lang);
    if (!base) return;
    const novo: WallType = { ...base, id: newId('wt') };
    try {
      editor.store.exec({ type: 'upsertWallType', wallType: novo }, 'dlo_cmd_duplicate');
      useUi.setState({ dialogArg: novo.id });
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : { key: 'dlt_err_delete_generic' } });
    }
  };
  const del = (): void => {
    try {
      editor.store.exec({ type: 'deleteWallType', id: draft.id });
      close();
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : { key: 'dlt_err_delete_generic' } });
    }
  };
  const tabBtn = (t: Tab, label: string): ReactElement => (
    <button className={`dtab${aba === t ? ' on' : ''}`} onClick={() => setTab(t)}>{label}</button>
  );
  return (
    <>
      <Dialog
        title={t('dlt_wall_title')}
        sub={t(usage === 1 ? 'dlt_wall_sub_one' : 'dlt_wall_sub_many', { n: usage })}
        onClose={close}
        footer={
          <>
            <button className="btn danger" disabled={usage > 0 || draft.id === p.defaults.wallTypeId} title={usage > 0 ? t('dlt_wall_in_use') : t('dlt_tt_delete_type')} onClick={del}>{t('stt_delete')}</button>
            {!curtainDraft && <button className="btn" onClick={duplicateAsCurtain}>{t('pct_dup_curtain')}</button>}
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={close}>{t('stt_cancel')}</button>
            <button className="btn" onClick={apply} disabled={stripsInvalid}>{t('stt_apply')}</button>
            <button className="btn primary" onClick={ok} disabled={stripsInvalid} title={stripsInvalid ? t('dlt_wall_fix_strips') : undefined}>{t('stt_ok')}</button>
          </>
        }
      >
        <TypeDialogHeader family={curtainDraft ? t('pct_fam_curtain') : FAMILY.wall} types={Object.values(p.wallTypes)} currentId={draft.id} nameFieldId="wt-name" onDuplicate={duplicate} />
        <div className="field-row">
          <label htmlFor="wt-name">{t('stt_f_name')}</label>
          <TextField id="wt-name" value={draft.name} onCommit={(v) => setDraft({ ...draft, name: v })} />
        </div>
        <div className="dtabs">
          {curtainDraft ? tabBtn('cortina', t('pct_tab_curtain')) : (
            <>
              {tabBtn('estrutura', t('dlt_tab_structure'))}
              {tabBtn('faixas', t('dlt_tab_strips'))}
              {tabBtn('graficos', t('dlt_tab_graphics'))}
            </>
          )}
          {tabBtn('identidade', t('dlt_tab_identity'))}
        </div>
        {aba === 'cortina' && curtainDraft?.curtain && (
          <AbaCortina curtain={curtainDraft.curtain} project={p} onChange={(curtain) => setDraft({ ...draft, curtain })} />
        )}
        {aba === 'estrutura' && (
          <div className="split">
            <div style={{ minWidth: 0 }}>
              <div className="table-scroll">
              <table className="layers layers-cards cols-6">
                <thead>
                  <tr><th>#</th><th>{t('dlt_col_function')}</th><th>{t('dlt_col_material')}</th><th>{t('dlt_col_thickness_cm')}</th><th title={t('dlt_tt_wraps')}>{t('dlt_col_wraps')}</th><th /></tr>
                </thead>
                <tbody>
                  <tr><td colSpan={6} style={{ color: 'var(--fg-faint)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('dlt_face_exterior')}</td></tr>
                  {draft.layers.map((l, i) => {
                    const m = p.materials[l.materialId];
                    const inCore = i >= core.first && i <= core.last;
                    return (
                      <Fragment key={i}>
                      <tr className={inCore ? 'core' : ''}>
                        <td className="mono">{i + 1}</td>
                        <td>
                          <span className="fn-cell">
                            <select className="select" aria-label={t('dlt_a11y_layer_function', { n: i + 1 })} value={l.function} onChange={(e) => setLayer(i, { function: e.target.value as LayerFunction })}>
                            {FUNCTIONS.map((f) => <option key={f} value={f}>{fnLabels[f]}</option>)}
                          </select>
                            <span className="pbadge" title={t('dlt_tt_join_priority')}>P{layerPriority(l)}</span>
                          </span>
                        </td>
                        <td>
                          <button className="btn small" style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setPick(i)} title={t('dlt_tt_pick_material')}>
                            <span className="swatch" style={{ background: m?.color }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m?.name ?? '—'}</span>
                          </button>
                        </td>
                        <td><NumField value={l.thickness} quantity="smallLength" min={0} onCommit={(v) => setLayer(i, { thickness: v })} /></td>
                        <td><input type="checkbox" aria-label={t('dlt_a11y_layer_wraps', { n: i + 1 })} checked={l.wraps} onChange={(e) => setLayer(i, { wraps: e.target.checked })} /></td>
                        <td>
                          <span className="iconrow">
                            <button id={`wt-layer-${i}-more`} className={`ibtn more${adv === i ? ' open' : ''}${l.priority !== undefined ? ' changed' : ''}`} aria-expanded={adv === i} aria-controls={adv === i ? `wt-layer-${i}-adv` : undefined} aria-label={t('dlt_a11y_layer_options', { n: i + 1 })} title={l.priority !== undefined ? t('dlt_btn_more_changed') : t('dlt_btn_more')} onClick={() => setAdv(adv === i ? null : i)}><Icon name="chevron" size={14} /></button>
                            <button className="ibtn" onClick={() => move(i, -1)} aria-label={t('dlt_a11y_move_up')} disabled={i === 0}><Icon name="up" size={14} /></button>
                            <button className="ibtn" onClick={() => move(i, 1)} aria-label={t('dlt_a11y_move_down')} disabled={i === draft.layers.length - 1}><Icon name="down" size={14} /></button>
                            <button className="ibtn" onClick={() => remove(i)} aria-label={t('dlt_a11y_remove_layer')} disabled={draft.layers.length <= 1}><Icon name="close" size={14} /></button>
                          </span>
                        </td>
                      </tr>
                      {adv === i && (
                        <tr id={`wt-layer-${i}-adv`} className="adv">
                          <td colSpan={6}>
                            <LayerAdvanced id={`wt-layer-${i}`} layer={l} onChange={(next) => replaceLayer(i, next)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                    );
                  })}
                  <tr><td colSpan={6} style={{ color: 'var(--fg-faint)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('dlt_face_interior')}</td></tr>
                </tbody>
              </table>
              </div>
              <div className="total"><span>{t('dlt_total_thickness')}</span><strong>{formatQuantity(units, 'smallLength', wallThicknessOf(draft))}</strong></div>
              <button className="btn small" onClick={insert}>{t('dlt_add_layer')}</button>
              <div className="field-row" style={{ marginTop: 10 }}>
                <label htmlFor="wt-wrap-ins" title={t('dlt_tt_wrap_inserts')}>{t('dlt_wrap_inserts')}</label>
                <select id="wt-wrap-ins" className="select" value={draft.wrapInserts} onChange={(e) => setDraft({ ...draft, wrapInserts: e.target.value as WrapMode })}>
                  {WRAP_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              <div className="field-row">
                <label htmlFor="wt-wrap-end" title={t('dlt_tt_wrap_ends')}>{t('dlt_wrap_ends')}</label>
                <select id="wt-wrap-end" className="select" value={draft.wrapEnds} onChange={(e) => setDraft({ ...draft, wrapEnds: e.target.value as WrapMode })}>
                  {WRAP_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            </div>
            <div>
              <SectionPreview type={draft} materials={p.materials} />
              <p className="hint" style={{ padding: '8px 2px' }}>
                {t('dlt_wall_core_help')}
              </p>
            </div>
          </div>
        )}
        {aba === 'faixas' && (
          <StripsTab strips={draft.strips} materials={p.materials} onChange={(strips) => setDraft({ ...draft, strips })} onPickMaterial={setStripPick} />
        )}
        {aba === 'graficos' && (
          <div>
            <p className="hint" style={{ padding: '0 0 8px' }}>{t('dlt_wall_graphics_help')}</p>
            <table className="layers">
              <thead><tr><th>{t('dlt_col_layer')}</th><th>{t('dlt_col_material')}</th><th>{t('dlt_col_hatch')}</th></tr></thead>
              <tbody>
                {draft.layers.map((l, i) => {
                  const m = p.materials[l.materialId];
                  return (
                    <tr key={i}>
                      <td>{fnLabels[l.function]}</td>
                      <td><span className="swatch" style={{ background: m?.color }} /> {m?.name}</td>
                      <td>{m?.hatch}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p><button className="chiplink" onClick={() => setPick(0)}>{t('dlt_open_material_browser')}</button></p>
          </div>
        )}
        {aba === 'identidade' && (
          <>
            <div className="field-row"><label htmlFor="wt-code">{t('dlt_col_code')}</label><TextField id="wt-code" value={draft.code} onCommit={(v) => setDraft({ ...draft, code: v })} /></div>
            <div className="field-row"><label htmlFor="wt-desc">{t('stt_f_description')}</label><TextField id="wt-desc" value={draft.description} onCommit={(v) => setDraft({ ...draft, description: v })} /></div>
            <TypeParams type={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          </>
        )}
      </Dialog>
      {pick !== null && (
        <MaterialsDialog
          pickFor={draft.layers[pick]?.materialId ?? null}
          onPick={(id) => {
            if (tab === 'estrutura') setLayer(pick, { materialId: id });
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      )}
      {stripPick !== null && (
        <MaterialsDialog
          pickFor={draft.strips[stripPick]?.materialId ?? null}
          onPick={(id) => {
            setDraft({ ...draft, strips: draft.strips.map((s, k) => (k === stripPick ? { ...s, materialId: id } : s)) });
            setStripPick(null);
          }}
          onClose={() => setStripPick(null)}
        />
      )}
    </>
  );
}
