import { useState, type ReactElement } from 'react';
import { SHEET_ORIENTATIONS, SHEET_SIZES, sheetOf, type Sheet, type SheetRevision, type TitleBlock } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { nextRevisionTag } from '../../editor/sheetNumbering.ts';
import { changeSheetAction } from '../../editor/sheetActions.ts';
import { useUi } from '../../editor/state.ts';
import { fmtDate, t as translate, useT, type Dict, type Lang } from '../../editor/i18n.ts';
import { Group, NumField, Row, TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';

const ORIENTATION_LABEL_KEYS: Record<string, keyof Dict> = { landscape: 'dlc_orient_landscape', portrait: 'dlc_orient_portrait' };
const orientationLabel = (k: string, lang: Lang): string => {
  const key = ORIENTATION_LABEL_KEYS[k];
  return key ? translate(lang, key) : k;
};

/**
 * Propriedades da prancha (decisões 0022 e 0039): número, nome, disciplina, folha, margem, carimbo e revisões. Cada
 * campo grava ao sair; trocar o tamanho/orientação/margem reencaixa as vistas na nova área de desenho.
 */
export function SheetDialog({ sheetId }: { sheetId: string }): ReactElement | null {
  const { t, lang } = useT();
  const p = useProject();
  const s = sheetOf(p, sheetId);
  const [err, setErr] = useState('');
  if (!s) return null;
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const patch = (pt: Partial<Omit<Sheet, 'id' | 'viewports'>>): void => {
    const sheetPt = pt as Partial<Pick<Sheet, 'size' | 'orientation' | 'margin'>>;
    const folha = sheetPt.size !== undefined || sheetPt.orientation !== undefined || sheetPt.margin !== undefined;
    try {
      if (folha) {
        const err2 = changeSheetAction(editor.store, s.id, sheetPt);
        if (err2) throw new Error(err2);
      } else editor.store.exec({ type: 'updateSheet', id: s.id, patch: pt }, t('dlc_undo_edit_sheet'));
      setErr('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('dlc_err_change_refused'));
    }
  };
  const tb = (pt: Partial<TitleBlock>): void => patch({ titleBlock: { ...s.titleBlock, ...pt } });
  const revs = s.revisions ?? [];
  const setRevs = (revisions: SheetRevision[]): void => patch({ revisions });
  const editRev = (i: number, pt: Partial<SheetRevision>): void => setRevs(revs.map((r, k) => (k === i ? { ...r, ...pt } : r)));
  const removeRev = (i: number): void => setRevs(revs.filter((_, k) => k !== i));
  const addRev = (): void => setRevs([...revs, { tag: nextRevisionTag(revs), date: fmtDate(lang), description: '' }]);
  return (
    <Dialog title={t('dlc_sheet_props')} sub={`${s.number} · ${s.name}`} onClose={close} size="mid" footer={<button className="btn primary" onClick={close}>{t('dlc_btn_close')}</button>}>
      <Group title={t('dlc_sheet_group')}>
        <Row label={t('col_number')} htmlFor="sh-number">
          <TextField id="sh-number" value={s.number} onCommit={(v) => patch({ number: v || s.number })} />
        </Row>
        <Row label={t('col_name')} htmlFor="sh-name">
          <TextField id="sh-name" value={s.name} onCommit={(v) => patch({ name: v || s.name })} />
        </Row>
        <Row label={t('dlc_discipline')} htmlFor="sh-disc">
          <TextField id="sh-disc" value={s.discipline ?? ''} placeholder={t('dlc_ph_discipline')} onCommit={(v) => patch({ discipline: v || undefined })} />
        </Row>
        <Row label={t('dlc_sheet_size')} htmlFor="sh-size">
          <select id="sh-size" value={s.size} onChange={(e) => patch({ size: e.target.value as Sheet['size'] })}>
            {SHEET_SIZES.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </Row>
        <Row label={t('dlc_orientation')} htmlFor="sh-orient">
          <select id="sh-orient" value={s.orientation} onChange={(e) => patch({ orientation: e.target.value as Sheet['orientation'] })}>
            {SHEET_ORIENTATIONS.map((k) => (
              <option key={k} value={k}>{orientationLabel(k, lang)}</option>
            ))}
          </select>
        </Row>
        <Row label={t('dlc_margin')} htmlFor="sh-margin">
          <NumField id="sh-margin" value={s.margin / 1000} quantity="length" min={0} onCommit={(v) => patch({ margin: v * 1000 })} />
        </Row>
      </Group>
      <Group title={t('dlc_title_block')}>
        <Row label={t('dlc_project')} htmlFor="tb-project">
          <TextField id="tb-project" value={s.titleBlock.project} onCommit={(v) => tb({ project: v })} />
        </Row>
        <Row label={t('dlc_client')} htmlFor="tb-client">
          <TextField id="tb-client" value={s.titleBlock.client} onCommit={(v) => tb({ client: v })} />
        </Row>
        <Row label={t('dlc_author')} htmlFor="tb-author">
          <TextField id="tb-author" value={s.titleBlock.author} onCommit={(v) => tb({ author: v })} />
        </Row>
        <Row label={t('dlc_date')} htmlFor="tb-date">
          <TextField id="tb-date" value={s.titleBlock.date} onCommit={(v) => tb({ date: v })} />
        </Row>
        <Row label={t('dlc_revision')} htmlFor="tb-rev">
          <TextField id="tb-rev" value={s.titleBlock.revision} onCommit={(v) => tb({ revision: v })} />
        </Row>
        <Row label={t('dlc_scale_text')} htmlFor="tb-scale">
          <TextField id="tb-scale" value={s.titleBlock.scaleNote ?? ''} placeholder={t('dlc_ph_scale_note')} onCommit={(v) => tb({ scaleNote: v || undefined })} />
        </Row>
      </Group>
      <Group title={t('dlc_revisions')}>
        {revs.length ? (
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('dlc_col_tag')}</th>
                <th>{t('dlc_date')}</th>
                <th>{t('dlc_col_description')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {revs.map((r, i) => (
                <tr key={i}>
                  <td><TextField id={`rev-tag-${i}`} value={r.tag} onCommit={(v) => editRev(i, { tag: v || r.tag })} /></td>
                  <td><TextField id={`rev-date-${i}`} value={r.date} onCommit={(v) => editRev(i, { date: v })} /></td>
                  <td><TextField id={`rev-desc-${i}`} value={r.description} onCommit={(v) => editRev(i, { description: v })} /></td>
                  <td><button className="btn small" onClick={() => removeRev(i)} title={t('dlc_tip_revision_remove', { tag: r.tag })}>{t('dlc_btn_remove')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">{t('dlc_no_revisions')}</p>
        )}
        <div className="hint">
          <button className="btn small" onClick={addRev}>{t('dlc_add_revision')}</button>
        </div>
      </Group>
      {err ? <p className="error" role="alert">{err}</p> : null}
    </Dialog>
  );
}
