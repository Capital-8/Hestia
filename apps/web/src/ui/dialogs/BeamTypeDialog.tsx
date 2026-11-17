import { useState, type ReactElement } from 'react';
import { beamTypeMap, type BeamShape, type BeamType } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import {
  beamTypeDeleteBlock,
  beamTypeError,
  beamTypeUsage,
  deleteBeamType,
  duplicateBeamType,
} from '../../editor/structuralTypeActions.ts';
import { NumField, TextField } from '../fields.tsx';
import { TypePreview } from '../TypePreview.tsx';
import { FAMILY } from '../typeFamilies.ts';
import { FamilyRow, FamilyTypeDialog } from './familia/index.ts';

export function BeamTypeDialog({ typeId: propTypeId }: { typeId?: string } = {}): ReactElement | null {
  const p = useProject();
  const { t } = useT();
  const arg = useUi((s) => s.dialogArg);
  const typesMap = beamTypeMap(p);
  const typeId = propTypeId ?? arg ?? Object.keys(typesMap)[0] ?? '';
  const src = typesMap[typeId];

  const [draft, setDraft] = useState<BeamType | null>(src ? structuredClone(src) : null);
  const [current, setCurrent] = useState(typeId);

  if (current !== typeId) {
    setCurrent(typeId);
    setDraft(typesMap[typeId] ? structuredClone(typesMap[typeId]!) : null);
  }

  if (!draft) return null;

  const usage = beamTypeUsage(p, draft.id);
  const error = beamTypeError(draft);
  const blocked = beamTypeDeleteBlock(p, draft.id);

  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const set = (patch: Partial<BeamType>): void => setDraft({ ...draft, ...patch });

  const apply = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertBeamType', beamType: draft });
  };

  const ok = (): void => {
    if (error) return;
    editor.store.exec({ type: 'upsertBeamType', beamType: draft });
    close();
  };

  const duplicate = (): void => {
    const id = duplicateBeamType(editor.store, draft.id);
    if (id) useUi.setState({ dialogArg: id });
  };

  const del = (): void => {
    const r = deleteBeamType(editor.store, draft.id);
    if (!r.ok) {
      useUi.setState({ status: { key: 'dlt_err_delete_with_reason', args: { error: r.error } } });
      return;
    }
    const ui = useUi.getState();
    if (ui.options.beamTypeId === draft.id) {
      const remaining = Object.keys(beamTypeMap(editor.project))[0];
      useUi.setState({ options: { ...ui.options, beamTypeId: remaining } });
    }
    close();
  };

  return (
    <FamilyTypeDialog
      title={t('str_dlg_beam_type')}
      sub={t(usage === 1 ? 'scx_sub_beam_one' : 'scx_sub_beam_many', { n: usage, shown: usage, total: usage })}
      onClose={close}
      size="wide"
      family={FAMILY.beam}
      types={Object.values(typesMap)}
      currentId={draft.id}
      onDuplicate={duplicate}
      name={{ id: 'bt-name', value: draft.name, onCommit: (v) => set({ name: v }) }}
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
          <FamilyRow label={t('dlt_col_code')} htmlFor="bt-code">
            <TextField id="bt-code" value={draft.code} onCommit={(v) => set({ code: v })} />
          </FamilyRow>
          <FamilyRow label={t('stt_f_description')} htmlFor="bt-desc">
            <TextField id="bt-desc" value={draft.description} onCommit={(v) => set({ description: v })} />
          </FamilyRow>
          <FamilyRow label={t('str_fld_section_shape')} htmlFor="bt-shape">
            <select
              id="bt-shape"
              className="select"
              value={draft.shape}
              onChange={(e) => set({ shape: e.target.value as BeamShape })}
            >
              <option value="rect">{t('str_shape_rect')}</option>
              <option value="t-section">{t('str_shape_tsection')}</option>
              <option value="i-section">{t('str_shape_isection')}</option>
            </select>
          </FamilyRow>

          <FamilyRow label={t('str_fld_section_width')} htmlFor="bt-w">
            <NumField id="bt-w" value={draft.width} quantity="smallLength" min={0.01} onCommit={(v) => set({ width: v })} />
          </FamilyRow>
          <FamilyRow label={t('str_fld_section_depth')} htmlFor="bt-d">
            <NumField id="bt-d" value={draft.depth} quantity="smallLength" min={0.01} onCommit={(v) => set({ depth: v })} />
          </FamilyRow>

          {draft.shape !== 'rect' && (
            <>
              <FamilyRow label={t('str_fld_flange_width')} htmlFor="bt-fw">
                <NumField
                  id="bt-fw"
                  value={draft.flangeWidth ?? draft.width}
                  quantity="smallLength"
                  min={0.01}
                  onCommit={(v) => set({ flangeWidth: v })}
                />
              </FamilyRow>
              <FamilyRow label={t('str_fld_flange_thick')} htmlFor="bt-tf">
                <NumField
                  id="bt-tf"
                  value={draft.flangeThickness ?? 0.01}
                  quantity="smallLength"
                  min={0.001}
                  onCommit={(v) => set({ flangeThickness: v })}
                />
              </FamilyRow>
              <FamilyRow label={t('str_fld_web_thick')} htmlFor="bt-tw">
                <NumField
                  id="bt-tw"
                  value={draft.webThickness ?? 0.006}
                  quantity="smallLength"
                  min={0.001}
                  onCommit={(v) => set({ webThickness: v })}
                />
              </FamilyRow>
            </>
          )}

          <FamilyRow label={t('stt_f_materialId')} htmlFor="bt-mat">
            <select
              id="bt-mat"
              className="select"
              value={draft.materialId}
              onChange={(e) => set({ materialId: e.target.value })}
            >
              {Object.values(p.materials).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </FamilyRow>
          <FamilyRow label={t('str_fld_cost_m3')} htmlFor="bt-cost">
            <NumField id="bt-cost" value={draft.cost} quantity="currency" min={0} onCommit={(v) => set({ cost: v })} />
          </FamilyRow>
          {error && <p className="hint" role="alert" style={{ color: 'var(--danger, #b42318)', marginTop: 8 }}>{error}</p>}
        </div>

        <div>
          <TypePreview subject={{ kind: 'beam', type: draft }} />
        </div>
      </div>
    </FamilyTypeDialog>
  );
}
