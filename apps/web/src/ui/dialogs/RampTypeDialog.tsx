import { useState, type ReactElement } from 'react';
import {
  DEFAULT_RAMP_NORM_ADA,
  DEFAULT_RAMP_NORM_NBR9050,
  rampTypeUsage,
  type RampNormProfile,
  type RampNormRow,
  type RampType,
} from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useI18n, dictOf } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { duplicateRampType, rampTypeDeleteBlock, rampTypeError, tryDeleteRampType } from '../../editor/rampTypeActions.ts';
import { Check, NumField, TextField } from '../fields.tsx';
import { Icon } from '../Icon.tsx';
import { FamilyRow, FamilyTypeDialog } from './familia/index.ts';
import { FAMILY } from '../typeFamilies.ts';
import { RampSectionPreview } from './RampSectionPreview.tsx';

const PROFILES: ReadonlyArray<RampNormProfile> = ['custom', 'nbr9050', 'ada'];

const fill = (s: string, params: Record<string, string>): string => s.replace(/\{(\w+)\}/g, (_, k: string) => params[k] ?? '');

/**
 * Editor de tipo de rampa: identificação, dimensões, material e a tabela de norma editável (que nasce "a conferir" e
 * só perde o selo quando a caixa "Norma conferida" é marcada). A validação fica em `rampTypeError`/`rampTypeIssue`.
 *
 * O modal usa a janela inteira como o do tipo de escada (`size="wide"`: `.rtt-grid` em duas colunas e a tabela de norma
 * abaixo, com a prévia fixa no topo da coluna direita; em tela estreita vira uma coluna). Antes era uma coluna só e o
 * final ("Norma") ficava cortado.
 */
export function RampTypeDialog({ typeId }: { typeId: string }): ReactElement | null {
  const p = useProject();
  const t = dictOf(useI18n((s) => s.lang));
  const profileLabel = (k: RampNormProfile): string => (k === 'custom' ? t.dlt_ramp_profile_custom : k === 'ada' ? 'ADA' : 'NBR 9050');
  const src = p.rampTypes[typeId];
  const [draft, setDraft] = useState<RampType | null>(src ? structuredClone(src) : null);
  const [current, setCurrent] = useState(typeId);
  if (current !== typeId) {
    setCurrent(typeId);
    setDraft(p.rampTypes[typeId] ? structuredClone(p.rampTypes[typeId]!) : null);
  }
  if (!draft) return null;
  const usage = rampTypeUsage(p, draft.id);
  const error = rampTypeError(draft);
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const set = (patch: Partial<RampType>): void => setDraft({ ...draft, ...patch });
  /** Grava como o OK, mas o diálogo segue aberto com o rascunho. */
  const apply = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertRampType', rampType: draft }, 'undo_edit_ramp_type');
  };
  const ok = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertRampType', rampType: draft }, 'undo_edit_ramp_type');
    close();
  };
  const duplicate = (): void => {
    const id = duplicateRampType(editor.store, draft.id);
    if (id) useUi.setState({ dialogArg: id });
  };
  const del = (): void => {
    const r = tryDeleteRampType(editor.store, draft.id);
    if (!r.ok) {
      useUi.setState({ status: { key: 'dlt_err_delete_with_reason', args: { error: r.error } } });
      return;
    }
    const ui = useUi.getState();
    if (ui.options.ramp?.typeId === draft.id) {
      useUi.setState({ options: { ...ui.options, ramp: { ...ui.options.ramp, typeId: Object.keys(editor.project.rampTypes)[0] } } });
    }
    close();
  };
  const blocked = rampTypeDeleteBlock(p, draft.id);
  const setRow = (i: number, patch: Partial<RampNormRow>): void =>
    set({ normProfile: 'custom', normTable: draft.normTable.map((row, k) => (k === i ? { ...row, ...patch } : row)) });
  const addRow = (): void => {
    const last = draft.normTable[draft.normTable.length - 1];
    const row: RampNormRow = last
      ? { maxSlope: last.maxSlope + 0.01, maxRise: last.maxRise, maxFlights: null }
      : { maxSlope: 0.05, maxRise: 1.5, maxFlights: null };
    set({ normProfile: 'custom', normTable: [...draft.normTable, row] });
  };
  const removeRow = (i: number): void => set({ normProfile: 'custom', normTable: draft.normTable.filter((_, k) => k !== i) });
  const setProfile = (profile: RampNormProfile): void => {
    if (profile === 'ada') set({ normProfile: profile, normTable: DEFAULT_RAMP_NORM_ADA.map((row) => ({ ...row })), normChecked: true });
    else if (profile === 'nbr9050') set({ normProfile: profile, normTable: DEFAULT_RAMP_NORM_NBR9050.map((row) => ({ ...row })), normChecked: false });
    else set({ normProfile: profile });
  };
  return (
    <FamilyTypeDialog
      title={t.dlt_ramp_title}
      sub={fill(t[usage === 1 ? 'dlt_ramp_sub_one' : 'dlt_ramp_sub_many'], { n: String(usage) })}
      onClose={close}
      size="wide"
      family={FAMILY.stair}
      types={Object.values(p.rampTypes)}
      currentId={draft.id}
      onDuplicate={duplicate}
      name={{ id: 'rt-name', value: draft.name, onCommit: (v) => set({ name: v }) }}
      footer={{ onDelete: del, deleteDisabled: blocked !== null, deleteTitle: blocked ?? t.stt_delete_type_tip, onApply: apply, onOk: ok, saveDisabled: error !== null, saveTitle: error ?? undefined }}
    >
      <div className="rtt-grid">
        <div className="rtt-main">
          <FamilyRow label={t.dlt_col_code} htmlFor="rt-code"><TextField id="rt-code" value={draft.code} onCommit={(v) => set({ code: v })} /></FamilyRow>
          <FamilyRow label={t.stt_f_description} htmlFor="rt-desc"><TextField id="rt-desc" value={draft.description} onCommit={(v) => set({ description: v })} /></FamilyRow>
          <FamilyRow label={t.dlt_ramp_cost} htmlFor="rt-cost" title={t.dlt_ramp_tt_cost}><NumField id="rt-cost" value={draft.cost} decimals={2} min={0} onCommit={(v) => set({ cost: v })} /></FamilyRow>
          <FamilyRow label={t.dlt_ramp_structural_depth} htmlFor="rt-depth"><NumField id="rt-depth" value={draft.structuralDepth} scale={100} unit="cm" decimals={1} min={0.01} onCommit={(v) => set({ structuralDepth: v })} /></FamilyRow>
          <FamilyRow label={t.stt_f_landingThickness} htmlFor="rt-landth"><NumField id="rt-landth" value={draft.landingThickness} scale={100} unit="cm" decimals={1} min={0.01} onCommit={(v) => set({ landingThickness: v })} /></FamilyRow>
          <FamilyRow label={t.dlt_ramp_default_width} htmlFor="rt-width"><NumField id="rt-width" value={draft.defaultWidth} unit="m" decimals={2} min={0.01} onCommit={(v) => set({ defaultWidth: v })} /></FamilyRow>
          <FamilyRow label={t.dlt_ramp_min_width} htmlFor="rt-minwidth"><NumField id="rt-minwidth" value={draft.minWidth} unit="m" decimals={2} min={0.01} onCommit={(v) => set({ minWidth: v })} /></FamilyRow>
          <FamilyRow label={t.dlt_ramp_landing_min} htmlFor="rt-landsize"><NumField id="rt-landsize" value={draft.landingMinLength} unit="m" decimals={2} min={0.01} onCommit={(v) => set({ landingMinLength: v })} /></FamilyRow>
          <FamilyRow label={t.stt_f_minHeadroom} htmlFor="rt-head"><NumField id="rt-head" value={draft.minHeadroom} unit="m" decimals={2} min={0.01} onCommit={(v) => set({ minHeadroom: v })} /></FamilyRow>
          <FamilyRow label={t.dlt_ramp_default_slope} htmlFor="rt-slope"><NumField id="rt-slope" value={draft.defaultSlope} scale={100} unit="%" decimals={2} min={0.1} onCommit={(v) => set({ defaultSlope: v })} /></FamilyRow>
          <FamilyRow label={t.stt_f_materialId} htmlFor="rt-mat">
            <select id="rt-mat" className="select" value={draft.materialId} onChange={(e) => set({ materialId: e.target.value })}>
              {Object.values(p.materials).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </FamilyRow>
          {error && <p className="hint" role="alert" style={{ color: 'var(--danger, #b42318)', marginTop: 8 }}>{error}</p>}
        </div>
        <div className="rtt-side">
          <RampSectionPreview type={draft} />
          <p className="hint" style={{ padding: '0 2px' }}>
            {t.dlt_ramp_help}
          </p>
        </div>
      </div>
      <div className="rtt-norm">
        <FamilyRow label={t.dlt_ramp_norm_profile} htmlFor="rt-profile">
          <select id="rt-profile" className="select" value={draft.normProfile} onChange={(e) => setProfile(e.target.value as RampNormProfile)}>
            {PROFILES.map((k) => <option key={k} value={k}>{profileLabel(k)}</option>)}
          </select>
          <Check id="rt-normchecked" checked={draft.normChecked} onChange={(v) => set({ normChecked: v })}>{t.ramp_norm_verified}</Check>
          {!draft.normChecked && (
            <span
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--warn)', color: 'var(--panel)', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}
              role="status"
            >
              <Icon name="soon" size={12} />
              {t.ramp_norm_unverified}
            </span>
          )}
        </FamilyRow>
        <table className="layers">
          <thead>
            <tr>
              <th>{t.dlt_ramp_norm_slope}</th>
              <th>{t.dlt_ramp_norm_rise}</th>
              <th>{t.dlt_ramp_norm_flights}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {draft.normTable.map((row, i) => (
              <tr key={i}>
                <td><NumField value={row.maxSlope} scale={100} unit="%" decimals={2} min={0.01} onCommit={(v) => setRow(i, { maxSlope: v })} /></td>
                <td><NumField value={row.maxRise} unit="m" decimals={2} min={0.01} onCommit={(v) => setRow(i, { maxRise: v })} /></td>
                <td>
                  <NumField
                    value={row.maxFlights}
                    decimals={0}
                    min={1}
                    placeholder={t.dlt_ramp_no_limit}
                    onCommit={(v) => setRow(i, { maxFlights: Math.round(v) })}
                    onClear={() => setRow(i, { maxFlights: null })}
                  />
                </td>
                <td><button type="button" className="ibtn" aria-label={fill(t.dlt_a11y_remove_row, { n: String(i + 1) })} onClick={() => removeRow(i)}><Icon name="close" size={14} /></button></td>
              </tr>
            ))}
          </tbody>
          </table>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn small" onClick={addRow}>{t.dlt_ramp_add_row}</button>
          <button type="button" className="btn small" onClick={() => removeRow(draft.normTable.length - 1)} disabled={draft.normTable.length === 0}>{t.dlt_ramp_remove_row}</button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>{t.dlt_ramp_norm_footnote}</p>
      </div>
    </FamilyTypeDialog>
  );
}
