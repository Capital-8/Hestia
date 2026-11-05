import type { ReactElement } from 'react';
import { DEFAULT_ROOM_CATEGORIES, newId, type Project, type RoomCategory } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from './Dialog.tsx';
import { useT } from '../../editor/i18n.ts';

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
const HATCHES: Array<NonNullable<RoomCategory['hatch']>> = ['diagonal', 'cross', 'dots', 'solid', 'none'];

/** Categorias de ambiente: nome, código, cor e hachura. As cores alimentam o esquema "Por categoria". */
export function RoomCategoriesDialog(): ReactElement {
  const { t } = useT();
  const p: Project = useProject();
  const cats = p.roomCategories ?? DEFAULT_ROOM_CATEGORIES;
  const hatchLabel = (h: NonNullable<RoomCategory['hatch']>): string => {
    if (h === 'none') return t('dlt_hatch_none');
    if (h === 'diagonal') return t('dlt_hatch_diagonal');
    if (h === 'cross') return t('dlt_hatch_cross');
    if (h === 'dots') return t('dlt_hatch_dotted');
    return t('dlt_hatch_filled');
  };
  const update = (c: RoomCategory, patch: Partial<RoomCategory>): void => {
    editor.store.exec({ type: 'upsertRoomCategory', category: { ...c, ...patch } }, 'undo_edit_room_category');
  };
  const add = (): void => {
    editor.store.exec({ type: 'upsertRoomCategory', category: { id: newId('rc'), name: t('dlt_rc_new'), code: '', color: '#dbe7f3', hatch: 'diagonal' } }, 'undo_create_room_category');
  };
  const remove = (c: RoomCategory): void => {
    try {
      editor.store.exec({ type: 'removeRoomCategory', id: c.id }, 'undo_delete_room_category');
    } catch (e) {
      useUi.setState({ status: e instanceof Error ? e.message : { key: 'dlt_rc_err_delete' } });
    }
  };
  return (
    <Dialog
      title={t('dlt_rc_title')}
      sub={t('dlt_rc_sub')}
      size="mid"
      onClose={close}
      footer={<><button className="btn small" onClick={add}>{t('dlt_rc_new')}</button><span style={{ flex: 1 }} /><button className="btn primary" onClick={close}>{t('stt_close')}</button></>}
    >
      <table className="tbl">
        <thead>
          <tr><th>{t('dlt_col_color')}</th><th>{t('dlt_fld_name')}</th><th>{t('dlt_col_code')}</th><th>{t('dlt_col_hatch')}</th><th /></tr>
        </thead>
        <tbody>
          {cats.map((c) => (
            <tr key={c.id}>
              <td><input type="color" aria-label={t('dlt_a11y_color_of', { name: c.name })} value={c.color} onChange={(e) => update(c, { color: e.target.value })} /></td>
              <td><input className="input" aria-label={t('dlt_a11y_name_of', { name: c.name })} value={c.name} onChange={(e) => update(c, { name: e.target.value })} /></td>
              <td><input className="input" aria-label={t('dlt_a11y_code_of', { name: c.name })} value={c.code ?? ''} onChange={(e) => update(c, { code: e.target.value })} style={{ width: 70 }} /></td>
              <td>
                <select className="select" aria-label={t('dlt_a11y_hatch_of', { name: c.name })} value={c.hatch ?? 'none'} onChange={(e) => update(c, { hatch: e.target.value as RoomCategory['hatch'] })}>
                  {HATCHES.map((h) => <option key={h} value={h}>{hatchLabel(h)}</option>)}
                </select>
              </td>
              <td><button className="btn small" onClick={() => remove(c)} title={t('dlt_delete_category_tip')}>{t('stt_delete')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint">{t('dlt_rc_help')}</div>
    </Dialog>
  );
}
