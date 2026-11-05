import { Fragment, useState, type ReactElement } from 'react';
import { formatQuantity, functionLabels, FUNCTION_LABEL, roofTypeThickness, type Layer, type LayerFunction, type RoofType } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { duplicateRoofType, roofTypeDeleteBlock, roofTypeError, roofTypeUsage, tryDeleteRoofType } from '../../editor/roofTypeActions.ts';
import { NumField, TextField } from '../fields.tsx';
import { Icon } from '../Icon.tsx';
import { Dialog } from './Dialog.tsx';
import { TypeDialogHeader } from './TypeDialogHeader.tsx';
import { FAMILY } from '../typeFamilies.ts';
import { RoofSectionPreview } from './RoofSectionPreview.tsx';
import { LayerAdvanced } from './LayerAdvanced.tsx';
import { MaterialsDialog } from './MaterialsDialog.tsx';
import { useUnits } from '../useUnits.ts';
import { useT } from '../../editor/i18n.ts';

const FUNCTIONS = Object.keys(FUNCTION_LABEL) as LayerFunction[];
/** Editor de tipo de telhado: camadas do topo para baixo (mesmo editor de camadas da laje; espessura vertical). */
export function RoofTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const units = useUnits();
  const { t, lang } = useT();
  const fnLabels = functionLabels(lang);
  const p = useProject();
  const src = p.roofTypes[typeId];
  const [draft, setDraft] = useState<RoofType | null>(src ? structuredClone(src) : null);
  const [current, setCurrent] = useState(typeId);
  const [pick, setPick] = useState<number | null>(null);
  const [adv, setAdv] = useState<number | null>(null);
  if (current !== typeId) {
    setCurrent(typeId);
    setAdv(null);
    setPick(null);
    setDraft(p.roofTypes[typeId] ? structuredClone(p.roofTypes[typeId]!) : null);
  }
  if (!draft) return null;
  const usage = roofTypeUsage(p, draft.id);
  const error = roofTypeError(draft);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
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
    const material = Object.keys(p.materials)[0] ?? 'mat_argamassa';
    setDraft({ ...draft, layers: [...draft.layers, { function: 'substrate', materialId: material, thickness: 0.02, wraps: false }] });
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
    if (error) return;
    editor.store.exec({ type: 'upsertRoofType', roofType: draft }, 'undo_edit_roof_type');
  };
  const ok = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertRoofType', roofType: draft }, 'undo_edit_roof_type');
    close();
  };
  const duplicate = (): void => {
    const id = duplicateRoofType(editor.store, draft.id);
    if (id) useUi.setState({ dialogArg: id });
  };
  const del = (): void => {
    const r = tryDeleteRoofType(editor.store, draft.id);
    if (!r.ok) {
      useUi.setState({ status: { key: 'dlt_err_delete_with_reason', args: { error: r.error } } });
      return;
    }
    const ui = useUi.getState();
    if (ui.options.roofTypeId === draft.id) useUi.setState({ options: { ...ui.options, roofTypeId: Object.keys(editor.project.roofTypes)[0] ?? ui.options.roofTypeId } });
    close();
  };
  const blocked = roofTypeDeleteBlock(p, draft.id);
  const picked = pick !== null ? draft.layers[pick] : undefined;
  return (
    <>
      <Dialog
        title={t('dlt_roof_title')}
        sub={t(usage === 1 ? 'dlt_roof_sub_one' : 'dlt_roof_sub_many', { n: usage })}
        onClose={close}
        size="mid"
        footer={
          <>
            <button className="btn danger" disabled={blocked !== null} title={blocked ?? t('dlt_tt_delete_type')} onClick={del}>{t('stt_delete')}</button>
            <span style={{ flex: 1 }} />
            <button className="btn" onClick={close}>{t('stt_cancel')}</button>
            <button className="btn" onClick={apply} disabled={error !== null}>{t('stt_apply')}</button>
            <button className="btn primary" onClick={ok} disabled={error !== null} title={error ?? undefined}>{t('stt_ok')}</button>
          </>
        }
      >
        <TypeDialogHeader family={FAMILY.roof} types={Object.values(p.roofTypes)} currentId={draft.id} nameFieldId="rt-name" onDuplicate={duplicate} />
        <div className="field-row">
          <label htmlFor="rt-name">{t('stt_f_name')}</label>
          <TextField id="rt-name" value={draft.name} onCommit={(v) => setDraft({ ...draft, name: v })} />
        </div>
        <div className="split">
          <div style={{ minWidth: 0 }}>
            <table className="layers layers-cards cols-5">
              <thead>
                <tr><th>#</th><th>{t('dlt_col_function')}</th><th>{t('dlt_col_material')}</th><th>{t('dlt_col_thickness_cm')}</th><th /></tr>
              </thead>
              <tbody>
                <tr><td colSpan={5} style={{ color: 'var(--fg-faint)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('dlt_roof_top')}</td></tr>
                {draft.layers.map((l, i) => {
                  const m = p.materials[l.materialId];
                  return (
                    <Fragment key={i}>
                      <tr>
                        <td className="mono">{i + 1}</td>
                        <td>
                          <select className="select" aria-label={t('dlt_a11y_layer_function', { n: i + 1 })} value={l.function} onChange={(e) => setLayer(i, { function: e.target.value as LayerFunction })}>
                            {FUNCTIONS.map((f) => <option key={f} value={f}>{fnLabels[f]}</option>)}
                          </select>
                        </td>
                        <td>
                          <button className="btn small" style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setPick(i)} title={t('dlt_tt_pick_material')}>
                            <span className="swatch" style={{ background: m?.color }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m?.name ?? '—'}</span>
                          </button>
                        </td>
                        <td><NumField value={l.thickness} quantity="smallLength" min={l.function === 'membrane' ? 0 : 0.001} onCommit={(v) => setLayer(i, { thickness: v })} /></td>
                        <td>
                          <span className="iconrow">
                            <button id={`rt-layer-${i}-more`} className={`ibtn more${adv === i ? ' open' : ''}${l.priority !== undefined ? ' changed' : ''}`} aria-expanded={adv === i} aria-controls={adv === i ? `rt-layer-${i}-adv` : undefined} aria-label={t('dlt_a11y_layer_options', { n: i + 1 })} title={t('dlt_btn_more')} onClick={() => setAdv(adv === i ? null : i)}><Icon name="chevron" size={14} /></button>
                            <button className="ibtn" onClick={() => move(i, -1)} aria-label={t('dlt_a11y_move_up')} disabled={i === 0}><Icon name="up" size={14} /></button>
                            <button className="ibtn" onClick={() => move(i, 1)} aria-label={t('dlt_a11y_move_down')} disabled={i === draft.layers.length - 1}><Icon name="down" size={14} /></button>
                            <button className="ibtn" onClick={() => remove(i)} aria-label={t('dlt_a11y_remove_layer')} disabled={draft.layers.length <= 1}><Icon name="close" size={14} /></button>
                          </span>
                        </td>
                      </tr>
                      {adv === i && (
                        <tr id={`rt-layer-${i}-adv`} className="adv">
                          <td colSpan={5}>
                            <LayerAdvanced id={`rt-layer-${i}`} layer={l} onChange={(next) => replaceLayer(i, next)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr><td colSpan={5} style={{ color: 'var(--fg-faint)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('dlt_col_face')}</td></tr>
              </tbody>
            </table>
            <div className="total"><span>{t('dlt_total_thickness')}</span><strong>{formatQuantity(units, 'smallLength', roofTypeThickness(draft))}</strong></div>
            <button className="btn small" onClick={insert}>{t('dlt_add_layer')}</button>
            {error && <p className="hint" role="alert" style={{ color: 'var(--danger, #b42318)', marginTop: 8 }}>{error}</p>}
          </div>
          <div>
            <RoofSectionPreview type={draft} materials={p.materials} />
            <p className="hint" style={{ padding: '8px 2px' }}>{t('dlt_roof_help')}</p>
          </div>
        </div>
        <div className="field-row"><label htmlFor="rt-code">{t('dlt_col_code')}</label><TextField id="rt-code" value={draft.code} onCommit={(v) => setDraft({ ...draft, code: v })} /></div>
        <div className="field-row"><label htmlFor="rt-desc">{t('stt_f_description')}</label><TextField id="rt-desc" value={draft.description} onCommit={(v) => setDraft({ ...draft, description: v })} /></div>
        <div className="field-row"><label htmlFor="rt-cost" title={t('dlt_tt_cost_per_area')}>{t('dlt_cost_per_area')}</label><NumField id="rt-cost" value={draft.cost} quantity="currency" min={0} onCommit={(v) => setDraft({ ...draft, cost: v })} /></div>
      </Dialog>
      {pick !== null && picked && (
        <MaterialsDialog
          pickFor={picked.materialId}
          onPick={(id) => {
            setLayer(pick, { materialId: id });
            setPick(null);
          }}
          onClose={() => setPick(null)}
        />
      )}
    </>
  );
}
