import { useState, type ReactElement } from 'react';
import { columnTypeMap, type ColumnShape, type ColumnType } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import {
  columnTypeDeleteBlock,
  columnTypeError,
  columnTypeUsage,
  deleteColumnType,
  duplicateColumnType,
} from '../../editor/structuralTypeActions.ts';
import { NumField, TextField } from '../fields.tsx';
import { TypePreview } from '../TypePreview.tsx';
import { FAMILY } from '../typeFamilies.ts';
import { FamilyRow, FamilyTypeDialog } from './familia/index.ts';

export function ColumnTypeDialog({ typeId: propTypeId }: { typeId?: string } = {}): ReactElement | null {
  const p = useProject();
  const { t } = useT();
  const arg = useUi((s) => s.dialogArg);
  const typesMap = columnTypeMap(p);
  const typeId = propTypeId ?? arg ?? Object.keys(typesMap)[0] ?? '';
  const src = typesMap[typeId];

  const [draft, setDraft] = useState<ColumnType | null>(src ? structuredClone(src) : null);
  const [current, setCurrent] = useState(typeId);

  if (current !== typeId) {
    setCurrent(typeId);
    setDraft(typesMap[typeId] ? structuredClone(typesMap[typeId]!) : null);
  }

  if (!draft) return null;

  const usage = columnTypeUsage(p, draft.id);
  const error = columnTypeError(draft);
  const blocked = columnTypeDeleteBlock(p, draft.id);

  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const set = (patch: Partial<ColumnType>): void => setDraft({ ...draft, ...patch });

  const apply = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertColumnType', columnType: draft });
  };

  const ok = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertColumnType', columnType: draft });
    close();
  };

  const duplicate = (): void => {
    const id = duplicateColumnType(editor.store, draft.id);
    if (id) useUi.setState({ dialogArg: id });
  };

  const del = (): void => {
    const r = deleteColumnType(editor.store, draft.id);
    if (!r.ok) {
      useUi.setState({ status: { key: 'dlt_err_delete_with_reason', args: { error: r.error } } });
      return;
    }
    const ui = useUi.getState();
    if (ui.options.columnTypeId === draft.id) {
      const remaining = Object.keys(columnTypeMap(editor.project))[0];
      useUi.setState({ options: { ...ui.options, columnTypeId: remaining } });
    }
    close();
  };

  return (
    <FamilyTypeDialog
      title={t('str_dlg_column_type')}
      sub={t(usage === 1 ? 'scx_sub_column_one' : 'scx_sub_column_many', { n: usage, shown: usage, total: usage })}
      onClose={close}
      size="wide"
      family={FAMILY.column}
      types={Object.values(typesMap)}
      currentId={draft.id}
      onDuplicate={duplicate}
      name={{ id: 'ct-name', value: draft.name, onCommit: (v) => set({ name: v }) }}
      footer={{
        onDelete: del,
        deleteDisabled: blocked !== null,
        deleteTitle: blocked ?? undefined,
        onApply: apply,
        onOk: ok,
        saveDisabled: error !== null,
        saveTitle: error ?? undefined,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 20 }}>
        <div>
          <FamilyRow label={t('dlt_col_code')} htmlFor="ct-code">
            <TextField id="ct-code" value={draft.code} onCommit={(v) => set({ code: v })} />
          </FamilyRow>
          <FamilyRow label={t('stt_f_description')} htmlFor="ct-desc">
            <TextField id="ct-desc" value={draft.description} onCommit={(v) => set({ description: v })} />
          </FamilyRow>
          <FamilyRow label={t('str_fld_section_shape')} htmlFor="ct-shape">
            <select
              id="ct-shape"
              className="select"
              value={draft.shape}
              onChange={(e) => set({ shape: e.target.value as ColumnShape })}
            >
              <option value="rect">{t('str_shape_rect')}</option>
              <option value="round">{t('str_shape_round')}</option>
              <option value="i-section">{t('str_shape_isection')}</option>
            </select>
          </FamilyRow>

          {draft.shape === 'round' ? (
            <FamilyRow label={t('str_fld_diameter')} htmlFor="ct-diam">
              <NumField
                id="ct-diam"
                value={draft.width}
                quantity="smallLength"
                min={0.01}
                onCommit={(v) => set({ width: v, depth: v })}
              />
            </FamilyRow>
          ) : draft.shape === 'i-section' ? (
            <>
              <FamilyRow label={t('str_fld_flange_width')} htmlFor="ct-w">
                <NumField id="ct-w" value={draft.width} quantity="smallLength" min={0.01} onCommit={(v) => set({ width: v })} />
              </FamilyRow>
              <FamilyRow label={t('str_fld_section_depth')} htmlFor="ct-d">
                <NumField id="ct-d" value={draft.depth} quantity="smallLength" min={0.01} onCommit={(v) => set({ depth: v })} />
              </FamilyRow>
              <FamilyRow label={t('str_fld_flange_thick')} htmlFor="ct-tf">
                <NumField
                  id="ct-tf"
                  value={draft.flangeThickness ?? 0.01}
                  quantity="smallLength"
                  min={0.001}
                  onCommit={(v) => set({ flangeThickness: v })}
                />
              </FamilyRow>
              <FamilyRow label={t('str_fld_web_thick')} htmlFor="ct-tw">
                <NumField
                  id="ct-tw"
                  value={draft.webThickness ?? 0.006}
                  quantity="smallLength"
                  min={0.001}
                  onCommit={(v) => set({ webThickness: v })}
                />
              </FamilyRow>
            </>
          ) : (
            <>
              <FamilyRow label={t('str_fld_section_width')} htmlFor="ct-w">
                <NumField id="ct-w" value={draft.width} quantity="smallLength" min={0.01} onCommit={(v) => set({ width: v })} />
              </FamilyRow>
              <FamilyRow label={t('str_fld_section_depth')} htmlFor="ct-d">
                <NumField id="ct-d" value={draft.depth} quantity="smallLength" min={0.01} onCommit={(v) => set({ depth: v })} />
              </FamilyRow>
            </>
          )}

          <FamilyRow label={t('stt_f_materialId')} htmlFor="ct-mat">
            <select
              id="ct-mat"
              className="select"
              value={draft.materialId}
              onChange={(e) => set({ materialId: e.target.value })}
            >
              {Object.values(p.materials).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </FamilyRow>
          <FamilyRow label={t('str_fld_cost_m3')} htmlFor="ct-cost">
            <NumField id="ct-cost" value={draft.cost} quantity="currency" min={0} onCommit={(v) => set({ cost: v })} />
          </FamilyRow>
          {error && <p className="hint" role="alert" style={{ color: 'var(--danger, #b42318)', marginTop: 8 }}>{error}</p>}
        </div>

        <div>
          <TypePreview subject={{ kind: 'column', type: draft }} />
        </div>
      </div>
    </FamilyTypeDialog>
  );
}
