import { useState, type ReactElement } from 'react';
import { projectSheets } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { formatSheetNumber, numberPrefix, numberSequence, renumberCommand } from '../../editor/sheetNumbering.ts';
import { useUi } from '../../editor/state.ts';
import { useT } from '../../editor/i18n.ts';
import { NumField, Row, TextField } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';

/**
 * Numeração em lote das pranchas (Revit: *Sheet Issues/Revisions*): prefixo, início, passo e casas. A prévia mostra o
 * primeiro e o último número antes de gravar; as pranchas entram na ordem do navegador.
 */
export function RenumberSheetsDialog(): ReactElement {
  const { t } = useT();
  const p = useProject();
  const sheets = projectSheets(p);
  const first = sheets[0];
  const [prefix, setPrefix] = useState(first ? numberPrefix(first.number) : 'A');
  const [start, setStart] = useState((first && numberSequence(first.number)) ?? 101);
  const [step, setStep] = useState(1);
  const [padding, setPadding] = useState(3);
  const [err, setErr] = useState('');
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const ids = sheets.map((s) => s.id);
  const preview = (i: number): string => formatSheetNumber(prefix.trim(), start + i * step, padding);
  const ultimo = sheets.length - 1;
  const apply = (): void => {
    const cmd = renumberCommand(p, ids, { prefix: prefix.trim(), start, step, padding });
    if (!cmd) return setErr(t('dlc_err_no_sheets'));
    try {
      editor.store.exec(cmd, t('dlc_undo_renumber'));
      useUi.setState({
        status: {
          key: sheets.length === 1 ? 'dlc_status_sheets_renumbered_one' : 'dlc_status_sheets_renumbered_many',
          args: { n: sheets.length, a: preview(0), b: preview(ultimo) },
        },
      });
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('dlc_err_numbering_refused'));
    }
  };
  return (
    <Dialog
      title={t('dlc_renumber_sheets')}
      sub={t('dlc_renumber_sub')}
      onClose={close}
      size="narrow"
      footer={
        <>
          <button className="btn" onClick={close}>{t('dlc_btn_cancel')}</button>
          <button className="btn primary" onClick={apply} disabled={sheets.length === 0}>{t('dlc_btn_renumber')}</button>
        </>
      }
    >
      <Row label={t('dlc_prefix')} htmlFor="rn-prefix">
        <TextField id="rn-prefix" value={prefix} placeholder="A" onCommit={setPrefix} />
      </Row>
      <Row label={t('dlc_start')} htmlFor="rn-start">
        <NumField id="rn-start" value={start} decimals={0} min={0} onCommit={setStart} />
      </Row>
      <Row label={t('dlc_step')} htmlFor="rn-step">
        <NumField id="rn-step" value={step} decimals={0} min={1} onCommit={setStep} />
      </Row>
      <Row label={t('dlc_padding')} htmlFor="rn-padding">
        <NumField id="rn-padding" value={padding} decimals={0} min={0} max={10} onCommit={setPadding} />
      </Row>
      <Row label={t('dlc_preview')} readOnly>
        <span className="val" id="rn-preview">
          {sheets.length === 0 ? t('dlc_no_sheets') : `${preview(0)} … ${preview(ultimo)}`}
        </span>
      </Row>
      <p className="hint">{t('dlc_renumber_hint')}</p>
      {err ? <p className="error" role="alert">{err}</p> : null}
    </Dialog>
  );
}
