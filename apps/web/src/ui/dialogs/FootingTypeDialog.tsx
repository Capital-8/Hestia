import { useState, type ReactElement } from 'react';
import { footingTypeMap, type FootingType } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import {
  deleteFootingType,
  duplicateFootingType,
  footingTypeDeleteBlock,
  footingTypeError,
  footingTypeUsage,
} from '../../editor/structuralTypeActions.ts';
import { NumField, TextField } from '../fields.tsx';
import { TypePreview } from '../TypePreview.tsx';
import { FAMILY } from '../typeFamilies.ts';
import { FamilyRow, FamilyTypeDialog } from './familia/index.ts';

export function FootingTypeDialog({ typeId: propTypeId }: { typeId?: string } = {}): ReactElement | null {
  const p = useProject();
  const { t } = useT();
  const arg = useUi((s) => s.dialogArg);
  const typesMap = footingTypeMap(p);
  const typeId = propTypeId ?? arg ?? Object.keys(typesMap)[0] ?? '';
  const src = typesMap[typeId];

  const [draft, setDraft] = useState<FootingType | null>(src ? structuredClone(src) : null);
  const [current, setCurrent] = useState(typeId);

  if (current !== typeId) {
    setCurrent(typeId);
    setDraft(typesMap[typeId] ? structuredClone(typesMap[typeId]!) : null);
  }

  if (!draft) return null;

  const usage = footingTypeUsage(p, draft.id);
  const error = footingTypeError(draft);
  const blocked = footingTypeDeleteBlock(p, draft.id);

  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const set = (patch: Partial<FootingType>): void => setDraft({ ...draft, ...patch });

  const apply = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertFootingType', footingType: draft });
  };

  const ok = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertFootingType', footingType: draft });
    close();
  };

  const duplicate = (): void => {
    const id = duplicateFootingType(editor.store, draft.id);
    if (id) useUi.setState({ dialogArg: id });
  };

  const del = (): void => {
    const r = deleteFootingType(editor.store, draft.id);
    if (!r.ok) {
      useUi.setState({ status: { key: 'dlt_err_delete_with_reason', args: { error: r.error } } });
      return;
    }
    const ui = useUi.getState();
    if (ui.options.footingTypeId === draft.id) {
      const remaining = Object.keys(footingTypeMap(editor.project))[0];
      useUi.setState({ options: { ...ui.options, footingTypeId: remaining } });
    }
    close();
  };

  return (
    <FamilyTypeDialog
      title={t('str_dlg_footing_type')}
      sub={t(usage === 1 ? 'scx_sub_footing_one' : 'scx_sub_footing_many', { n: usage, shown: usage, total: usage })}
      onClose={close}
      size="wide"
      family={FAMILY.footing}
      types={Object.values(typesMap)}
      currentId={draft.id}
      onDuplicate={duplicate}
      name={{ id: 'ft-name', value: draft.name, onCommit: (v) => set({ name: v }) }}
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
          <FamilyRow label={t('dlt_col_code')} htmlFor="ft-code">
            <TextField id="ft-code" value={draft.code} onCommit={(v) => set({ code: v })} />
          </FamilyRow>
          <FamilyRow label={t('stt_f_description')} htmlFor="ft-desc">
            <TextField id="ft-desc" value={draft.description} onCommit={(v) => set({ description: v })} />
          </FamilyRow>
          <FamilyRow label={t('str_fld_foot_width')} htmlFor="ft-w">
            <NumField id="ft-w" value={draft.width} quantity="length" min={0.1} onCommit={(v) => set({ width: v })} />
          </FamilyRow>
          <FamilyRow label={t('str_fld_foot_length')} htmlFor="ft-l">
            <NumField id="ft-l" value={draft.length} quantity="length" min={0.1} onCommit={(v) => set({ length: v })} />
          </FamilyRow>
          <FamilyRow label={t('str_fld_foot_thick')} htmlFor="ft-th">
            <NumField id="ft-th" value={draft.thickness} quantity="smallLength" min={0.05} onCommit={(v) => set({ thickness: v })} />
          </FamilyRow>
          <FamilyRow label={t('stt_f_materialId')} htmlFor="ft-mat">
            <select
              id="ft-mat"
              className="select"
              value={draft.materialId}
              onChange={(e) => set({ materialId: e.target.value })}
            >
              {Object.values(p.materials).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </FamilyRow>
          <FamilyRow label={t('str_fld_cost_m3')} htmlFor="ft-cost">
            <NumField id="ft-cost" value={draft.cost} quantity="currency" min={0} onCommit={(v) => set({ cost: v })} />
          </FamilyRow>
          {error && <p className="hint" role="alert" style={{ color: 'var(--danger, #b42318)', marginTop: 8 }}>{error}</p>}
        </div>

        <div>
          <TypePreview subject={{ kind: 'footing', type: draft }} />
        </div>
      </div>
    </FamilyTypeDialog>
  );
}
