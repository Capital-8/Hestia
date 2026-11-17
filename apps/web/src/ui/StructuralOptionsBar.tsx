import type { ReactElement } from 'react';
import type { ToolId, ToolEnv } from '@hestia/tools';
import { placeFootingsAtColumns } from '@hestia/tools';
import type { Id } from '@hestia/model';
import { editor, useProject } from '../editor/controller.ts';
import { useT } from '../editor/i18n.ts';
import { useUi } from '../editor/state.ts';
import { Check, NumField } from './fields.tsx';

export function StructuralOptionsBar({ tool }: { tool: ToolId }): ReactElement | null {
  const p = useProject();
  const { t } = useT();
  const levelId = useUi((s) => s.levelId);
  const o = useUi((s) => s.options);
  const set = (patch: Partial<typeof o>): void => useUi.setState((s) => ({ options: { ...s.options, ...patch } }));

  if (tool === 'column') {
    return (
      <>
        <label>
          {t('str_opt_col_mode')}
          <select
            id="opt-col-mode"
            className="select"
            value={o.columnMode ?? 'vertical'}
            onChange={(e) => { set({ columnMode: e.target.value as 'vertical' | 'slanted' }); e.currentTarget.blur(); }}
          >
            <option value="vertical">{t('str_opt_col_vertical')}</option>
            <option value="slanted">{t('str_opt_col_slanted')}</option>
          </select>
        </label>
        <label>
          {t('str_opt_col_height')}
          <select
            id="opt-col-depth-mode"
            className="select"
            value={o.columnDepthMode ?? 'height'}
            onChange={(e) => { set({ columnDepthMode: e.target.value as 'depth' | 'height' }); e.currentTarget.blur(); }}
          >
            <option value="height">{t('str_opt_col_height')}</option>
            <option value="depth">{t('str_opt_col_depth')}</option>
          </select>
        </label>
        <label>
          {t('pra_fld_top_level')}
          <select
            id="opt-col-top"
            className="select"
            value={o.columnTopLevelId ?? ''}
            onChange={(e) => { set({ columnTopLevelId: e.target.value || null }); e.currentTarget.blur(); }}
          >
            <option value="">{t('pra_opt_by_height')}</option>
            {p.levels.filter((l) => l.id !== levelId).map((l) => (
              <option key={l.id} value={l.id}>{t('pra_opt_up_to', { name: l.name })}</option>
            ))}
          </select>
        </label>
        {!o.columnTopLevelId && (
          <label>
            {t('pra_fld_height')}
            <NumField
              id="opt-col-height"
              value={o.columnHeight ?? 2.8}
              quantity="length"
              min={0.1}
              onCommit={(v) => set({ columnHeight: v })}
            />
          </label>
        )}
        <button
          type="button"
          className="btn small"
          onClick={(e) => {
            const cur = o.columnRotation ?? 0;
            set({ columnRotation: (cur + Math.PI / 2) % (2 * Math.PI) });
            e.currentTarget.blur();
          }}
        >
          {t('str_btn_rotate_90')}
        </button>
      </>
    );
  }

  if (tool === 'beam') {
    return (
      <>
        <label>
          {t('str_fld_justify')}
          <select
            id="opt-beam-just"
            className="select"
            title={t('str_hint_beam_space')}
            value={o.beamJustify ?? 'center'}
            onChange={(e) => { set({ beamJustify: e.target.value as typeof o.beamJustify }); e.currentTarget.blur(); }}
          >
            <option value="center">{t('str_just_center')}</option>
            <option value="left">{t('str_just_left')}</option>
            <option value="right">{t('str_just_right')}</option>
          </select>
        </label>
        <label>
          {t('str_fld_z_offset')}
          <NumField
            id="opt-beam-zoff"
            value={o.beamZOffset ?? 0}
            quantity="length"
            onCommit={(v) => set({ beamZOffset: v })}
          />
        </label>
        <Check id="opt-beam-chain" checked={o.chain} onChange={(v) => set({ chain: v })}>
          {t('str_btn_place_chain')}
        </Check>
      </>
    );
  }

  if (tool === 'footing') {
    return (
      <>
        <label>
          {t('str_opt_foot_mode')}
          <select
            id="opt-ft-mode"
            className="select"
            value={o.footingMode ?? 'free'}
            onChange={(e) => { set({ footingMode: e.target.value as 'free' | 'atColumns' }); e.currentTarget.blur(); }}
          >
            <option value="free">{t('str_opt_foot_free')}</option>
            <option value="atColumns">{t('str_opt_foot_at_cols')}</option>
          </select>
        </label>
        <label>
          {t('str_fld_height_offset')}
          <NumField
            id="opt-ft-offset"
            value={o.footingHeightOffset ?? 0}
            quantity="length"
            onCommit={(v) => set({ footingHeightOffset: v })}
          />
        </label>
        <label>
          {t('str_fld_foot_pos_mode')}
          <select
            id="opt-ft-ecc-mode"
            className="select"
            value={o.footingEccentric ? 'eccentric' : 'centered'}
            onChange={(e) => {
              const ecc = e.target.value === 'eccentric';
              set(ecc ? { footingEccentric: true } : { footingEccentric: false, footingEccentricityX: 0, footingEccentricityY: 0 });
              e.currentTarget.blur();
            }}
          >
            <option value="centered">{t('str_opt_foot_centered')}</option>
            <option value="eccentric">{t('str_opt_foot_eccentric')}</option>
          </select>
        </label>
        {o.footingEccentric && (
          <>
            <label>
              {t('str_fld_eccentricity_x')}
              <NumField
                id="opt-ft-ex"
                value={o.footingEccentricityX ?? 0}
                quantity="length"
                onCommit={(v) => set({ footingEccentricityX: v })}
              />
            </label>
            <label>
              {t('str_fld_eccentricity_y')}
              <NumField
                id="opt-ft-ey"
                value={o.footingEccentricityY ?? 0}
                quantity="length"
                onCommit={(v) => set({ footingEccentricityY: v })}
              />
            </label>
          </>
        )}
        {o.footingMode === 'atColumns' && (
          <button
            type="button"
            className="btn small"
            onClick={(e) => {
              const env = {
                project: () => editor.project,
                levelId: () => useUi.getState().levelId,
                options: () => useUi.getState().options,
                transaction: (label: string, fn: () => void) => editor.store.transaction(label, fn),
                exec: (cmd: Parameters<typeof editor.store.exec>[0]) => editor.store.exec(cmd),
                setSelection: (ids: Id[]) => useUi.setState({ selection: ids }),
                say: (msg: string) => useUi.setState({ status: msg }),
              } as unknown as ToolEnv;
              placeFootingsAtColumns(env);
              e.currentTarget.blur();
            }}
          >
            {t('str_btn_apply_at_cols')}
          </button>
        )}
        <button
          type="button"
          className="btn small"
          onClick={(e) => {
            const cur = o.footingRotation ?? 0;
            set({ footingRotation: (cur + Math.PI / 2) % (2 * Math.PI) });
            e.currentTarget.blur();
          }}
        >
          {t('str_btn_rotate_90')}
        </button>
      </>
    );
  }

  return null;
}
