import { Fragment, useState, type ReactElement } from 'react';
import { coreRange, type FloorType, floorTypeThickness, formatQuantity, functionLabels, FUNCTION_LABEL, type Layer, type LayerFunction, layerPriority, temPrioridadeEmpatada } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { duplicateFloorType, floorTypeDeleteBlock, floorTypeError, floorTypeUsage, tryDeleteFloorType } from '../../editor/typeActions.ts';
import { NumField, TextField } from '../fields.tsx';
import { Icon } from '../Icon.tsx';
import { coreHint } from './coreHint.ts';
import { FamilyRow, FamilyTypeDialog } from './familia/index.ts';
import { FAMILY } from '../typeFamilies.ts';
import { FloorSectionPreview } from './FloorSectionPreview.tsx';
import { LayerAdvanced } from './LayerAdvanced.tsx';
import { aplicarPredefinicao } from './terminoForm.ts';
import { MaterialsDialog } from './MaterialsDialog.tsx';
import { useUnits } from '../useUnits.ts';
import { useT } from '../../editor/i18n.ts';

const FUNCTIONS = Object.keys(FUNCTION_LABEL) as LayerFunction[];
/** Editor de tipo de piso: camadas do topo para baixo (reusa o editor de camadas do tipo de parede). */
export function FloorTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const units = useUnits();
  const { t, lang } = useT();
  const fnLabels = functionLabels(lang);
  const p = useProject();
  const src = p.floorTypes[typeId];
  const [draft, setDraft] = useState<FloorType | null>(src ? structuredClone(src) : null);
  const [current, setCurrent] = useState(typeId);
  const [pick, setPick] = useState<number | null>(null);
  const [adv, setAdv] = useState<number | null>(null);
  if (current !== typeId) {
    setCurrent(typeId);
    setAdv(null);
    setPick(null);
    setDraft(p.floorTypes[typeId] ? structuredClone(p.floorTypes[typeId]!) : null);
  }
  if (!draft) return null;
  const usage = floorTypeUsage(p, draft.id);
  const error = floorTypeError(draft);
  const core = coreRange(draft);
  const nucleo = coreHint(draft, units);
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
    editor.store.exec({ type: 'upsertFloorType', floorType: draft }, 'undo_edit_floor_type');
  };
  const ok = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertFloorType', floorType: draft }, 'undo_edit_floor_type');
    close();
  };
  const duplicate = (): void => {
    const id = duplicateFloorType(editor.store, draft.id);
    if (id) useUi.setState({ dialogArg: id });
  };
  const del = (): void => {
    const r = tryDeleteFloorType(editor.store, draft.id);
    if (!r.ok) {
      useUi.setState({ status: { key: 'dlt_err_delete_with_reason', args: { error: r.error } } });
      return;
    }
    const ui = useUi.getState();
    if (ui.options.floorTypeId === draft.id) useUi.setState({ options: { ...ui.options, floorTypeId: Object.keys(editor.project.floorTypes)[0] ?? ui.options.floorTypeId } });
    close();
  };
  const blocked = floorTypeDeleteBlock(p, draft.id);
  const picked = pick !== null ? draft.layers[pick] : undefined;
  return (
    <>
      <FamilyTypeDialog
        title={t('dlt_floor_title')}
        sub={t(usage === 1 ? 'dlt_floor_sub_one' : 'dlt_floor_sub_many', { n: usage })}
        onClose={close}
        size="mid"
        family={FAMILY.floor}
        types={Object.values(p.floorTypes)}
        currentId={draft.id}
        onDuplicate={duplicate}
        name={{ id: 'ft-name', value: draft.name, onCommit: (v) => setDraft({ ...draft, name: v }) }}
        footer={{ onDelete: del, deleteDisabled: blocked !== null, deleteTitle: blocked ?? t('dlt_tt_delete_type'), onApply: apply, onOk: ok, saveDisabled: error !== null, saveTitle: error ?? undefined }}
      >
        <div className="split">
          <div style={{ minWidth: 0 }}>
            <table className="layers layers-cards cols-5">
              <thead>
                <tr><th>#</th><th>{t('dlt_col_function')}</th><th>{t('dlt_col_material')}</th><th>{t('dlt_col_thickness_cm')}</th><th /></tr>
              </thead>
              <tbody>
                <tr><td colSpan={5} style={{ color: 'var(--fg-faint)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('dlt_floor_top')}</td></tr>
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
                        <td><NumField value={l.thickness} quantity="smallLength" min={l.function === 'membrane' ? 0 : 0.001} onCommit={(v) => setLayer(i, { thickness: v })} /></td>
                        <td>
                          <span className="iconrow">
                            <button id={`ft-layer-${i}-more`} className={`ibtn more${adv === i ? ' open' : ''}${l.priority !== undefined || l.termino !== undefined ? ' changed' : ''}`} aria-expanded={adv === i} aria-controls={adv === i ? `ft-layer-${i}-adv` : undefined} aria-label={t('dlt_a11y_layer_options', { n: i + 1 })} title={t('dlt_btn_more')} onClick={() => setAdv(adv === i ? null : i)}><Icon name="chevron" size={14} /></button>
                            <button className="ibtn" onClick={() => move(i, -1)} aria-label={t('dlt_a11y_move_up')} disabled={i === 0}><Icon name="up" size={14} /></button>
                            <button className="ibtn" onClick={() => move(i, 1)} aria-label={t('dlt_a11y_move_down')} disabled={i === draft.layers.length - 1}><Icon name="down" size={14} /></button>
                            <button className="ibtn" onClick={() => remove(i)} aria-label={t('dlt_a11y_remove_layer')} disabled={draft.layers.length <= 1}><Icon name="close" size={14} /></button>
                          </span>
                        </td>
                      </tr>
                      {adv === i && (
                        <tr id={`ft-layer-${i}-adv`} className="adv">
                          <td colSpan={5}>
                            <LayerAdvanced id={`ft-layer-${i}`} layer={l} onChange={(next) => replaceLayer(i, next)} termino onPreset={(pid) => setDraft({ ...draft, layers: aplicarPredefinicao(pid, draft.layers) })} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr><td colSpan={5} style={{ color: 'var(--fg-faint)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('dlt_col_face')}</td></tr>
              </tbody>
            </table>
            <div className="total"><span>{t('dlt_total_thickness')}</span><strong>{formatQuantity(units, 'smallLength', floorTypeThickness(draft))}</strong></div>
            <p className="hint">{nucleo.text}</p>
            {temPrioridadeEmpatada(draft.layers) && <p className="hint">{t('dlt_layers_tied_priority')}</p>}
            <button className="btn small" onClick={insert}>{t('dlt_add_layer')}</button>
            {error && <p className="hint" role="alert" style={{ color: 'var(--danger, #b42318)', marginTop: 8 }}>{error}</p>}
          </div>
          <div>
            <FloorSectionPreview type={draft} materials={p.materials} />
            <p className="hint" style={{ padding: '8px 2px' }}>{t('dlt_floor_help')}</p>
          </div>
        </div>
        <FamilyRow label={t('dlt_col_code')} htmlFor="ft-code"><TextField id="ft-code" value={draft.code} onCommit={(v) => setDraft({ ...draft, code: v })} /></FamilyRow>
        <FamilyRow label={t('stt_f_description')} htmlFor="ft-desc"><TextField id="ft-desc" value={draft.description} onCommit={(v) => setDraft({ ...draft, description: v })} /></FamilyRow>
        <FamilyRow label={t('dlt_cost_per_area')} htmlFor="ft-cost" title={t('dlt_tt_cost_per_area')}><NumField id="ft-cost" value={draft.cost} quantity="currency" min={0} onCommit={(v) => setDraft({ ...draft, cost: v })} /></FamilyRow>
      </FamilyTypeDialog>
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
