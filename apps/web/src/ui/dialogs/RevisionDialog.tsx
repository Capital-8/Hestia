import { useState, type ReactElement } from 'react';
import { sheetOf } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { emitRevisionCommand, nextRevisionTag } from '../../editor/sheetNumbering.ts';
import { useUi } from '../../editor/state.ts';
import { fmtDate, useT } from '../../editor/i18n.ts';
import { Row, TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';

/**
 * Emite revisão numa prancha (Revit: *Sheet Issues/Revisions*, ArchiCAD: *Revision History*): a tag é a próxima da
 * prancha, a data já vem de hoje e a revisão entra no histórico e no carimbo num único passo de desfazer.
 */
export function RevisionDialog({ sheetId }: { sheetId: string }): ReactElement | null {
  const { t, lang } = useT();
  const p = useProject();
  const s = sheetOf(p, sheetId);
  const [date, setDate] = useState(() => fmtDate(lang));
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState(s?.titleBlock.author ?? '');
  const [err, setErr] = useState('');
  if (!s) return null;
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const tag = nextRevisionTag(s.revisions);
  const emit = (): void => {
    const descricao = description.trim();
    if (!descricao) return setErr(t('dlc_err_describe_revision'));
    const cmd = emitRevisionCommand(p, [s.id], {
      date: date.trim(),
      description: descricao,
      ...(author.trim() ? { by: author.trim() } : {}),
      tag,
    });
    if (!cmd) return setErr(t('dlc_err_sheet_missing'));
    try {
      editor.store.exec(cmd, t('dlc_undo_issue_revision'));
      useUi.setState({ status: { key: 'dlc_status_revision_issued', args: { tag, number: s.number } } });
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('dlc_err_revision_refused'));
    }
  };
  return (
    <Dialog
      title={t('dlc_issue_revision')}
      sub={`${s.number} · ${s.name}`}
      onClose={close}
      size="narrow"
      footer={
        <>
          <button className="btn" onClick={close}>{t('dlc_btn_cancel')}</button>
          <button className="btn primary" onClick={emit}>{t('dlc_btn_issue_revision')}</button>
        </>
      }
    >
      <Row label={t('dlc_col_tag')} readOnly>
        <span className="val">{tag}</span>
      </Row>
      <Row label={t('dlc_date')} htmlFor="rev-date">
        <TextField id="rev-date" value={date} onCommit={setDate} />
      </Row>
      <Row label={t('dlc_col_description')} htmlFor="rev-desc">
        <TextField id="rev-desc" value={description} placeholder={t('dlc_ph_revision_desc')} onCommit={setDescription} />
      </Row>
      <Row label={t('dlc_author')} htmlFor="rev-by">
        <TextField id="rev-by" value={author} placeholder={t('dlc_ph_revision_author')} onCommit={setAuthor} />
      </Row>
      <p className="hint">{t('dlc_revision_hint')}</p>
      {err ? <p className="error" role="alert">{err}</p> : null}
    </Dialog>
  );
}
