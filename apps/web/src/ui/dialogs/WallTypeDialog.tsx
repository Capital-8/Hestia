import { Fragment, useMemo, useState, type ReactElement } from 'react';
import { formatQuantity, functionLabels, FUNCTION_LABEL, coreRange, layerPriority, newId, totalThickness, wallTypeUsage, type Layer, type LayerFunction, type WallType, type WrapMode } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { NumField, TextField } from '../fields.tsx';
import { Icon } from '../Icon.tsx';
import { FamilyRow, FamilyTabs, FamilyTypeDialog } from './familia/index.ts';
import { FAMILY } from '../typeFamilies.ts';
import { LayerAdvanced } from './LayerAdvanced.tsx';
import { MaterialsDialog } from './MaterialsDialog.tsx';
import { SectionPreview } from './SectionPreview.tsx';
import { StripsTab, stripError } from './StripsTab.tsx';
import { TypeParams } from './TypeParams.tsx';
import { useUnits } from '../useUnits.ts';
import { useT } from '../../editor/i18n.ts';

const FUNCTIONS = Object.keys(FUNCTION_LABEL) as LayerFunction[];
type Tab = 'estrutura' | 'faixas' | 'graficos' | 'identidade';

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
  /** Grava como o OK, mas o diálogo segue aberto com o rascunho. */
  const apply = (): void => {
    if (stripsInvalid) return;
    editor.store.exec({ type: 'upsertWallType', wallType: draft }, 'undo_edit_wall_type');
  };
  const ok = (): void => {
    if (stripsInvalid) return;
    editor.store.exec({ type: 'upsertWallType', wallType: draft }, 'undo_edit_wall_type');
    close();
  };
  const duplicate = (): void => {
    const copy = { ...draft, id: newId('wt'), name: `${draft.name} ${t('dlt_duplicate_suffix')}` };
    editor.store.exec({ type: 'upsertWallType', wallType: copy }, 'dlo_cmd_duplicate');
    useUi.setState({ dialogArg: copy.id });
  };
  const del = (): void => {
    try {
      editor.store.exec({ type: 'deleteWallType', id: draft.id });
      close();
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : { key: 'dlt_err_delete_generic' } });
    }
  };
  return (
    <>
      <FamilyTypeDialog
        title={t('dlt_wall_title')}
        sub={t(usage === 1 ? 'dlt_wall_sub_one' : 'dlt_wall_sub_many', { n: usage })}
        onClose={close}
        family={FAMILY.wall}
        types={Object.values(p.wallTypes)}
        currentId={draft.id}
        onDuplicate={duplicate}
        name={{ id: 'wt-name', value: draft.name, onCommit: (v) => setDraft({ ...draft, name: v }) }}
        footer={{
          onDelete: del,
          deleteDisabled: usage > 0 || draft.id === p.defaults.wallTypeId,
          deleteTitle: usage > 0 ? t('dlt_wall_in_use') : t('dlt_tt_delete_type'),
          onApply: apply,
          onOk: ok,
          saveDisabled: stripsInvalid,
          saveTitle: stripsInvalid ? t('dlt_wall_fix_strips') : undefined,
        }}
      >
        <FamilyTabs
          tabs={[
            { id: 'estrutura', label: t('dlt_tab_structure') },
            { id: 'faixas', label: t('dlt_tab_strips') },
            { id: 'graficos', label: t('dlt_tab_graphics') },
            { id: 'identidade', label: t('dlt_tab_identity') },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'estrutura' && (
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
              <div className="total"><span>{t('dlt_total_thickness')}</span><strong>{formatQuantity(units, 'smallLength', totalThickness(draft))}</strong></div>
              <button className="btn small" onClick={insert}>{t('dlt_add_layer')}</button>
              <div style={{ marginTop: 10 }} />
              <FamilyRow label={t('dlt_wrap_inserts')} htmlFor="wt-wrap-ins" title={t('dlt_tt_wrap_inserts')}>
                <select id="wt-wrap-ins" className="select" value={draft.wrapInserts} onChange={(e) => setDraft({ ...draft, wrapInserts: e.target.value as WrapMode })}>
                  {WRAP_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </FamilyRow>
              <FamilyRow label={t('dlt_wrap_ends')} htmlFor="wt-wrap-end" title={t('dlt_tt_wrap_ends')}>
                <select id="wt-wrap-end" className="select" value={draft.wrapEnds} onChange={(e) => setDraft({ ...draft, wrapEnds: e.target.value as WrapMode })}>
                  {WRAP_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </FamilyRow>
            </div>
            <div>
              <SectionPreview type={draft} materials={p.materials} />
              <p className="hint" style={{ padding: '8px 2px' }}>
                {t('dlt_wall_core_help')}
              </p>
            </div>
          </div>
        )}
        {tab === 'faixas' && (
          <StripsTab strips={draft.strips} materials={p.materials} onChange={(strips) => setDraft({ ...draft, strips })} onPickMaterial={setStripPick} />
        )}
        {tab === 'graficos' && (
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
        {tab === 'identidade' && (
          <>
            <FamilyRow label={t('dlt_col_code')} htmlFor="wt-code"><TextField id="wt-code" value={draft.code} onCommit={(v) => setDraft({ ...draft, code: v })} /></FamilyRow>
            <FamilyRow label={t('stt_f_description')} htmlFor="wt-desc"><TextField id="wt-desc" value={draft.description} onCommit={(v) => setDraft({ ...draft, description: v })} /></FamilyRow>
            <TypeParams type={draft} onChange={(patch) => setDraft({ ...draft, ...patch })} />
          </>
        )}
      </FamilyTypeDialog>
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
