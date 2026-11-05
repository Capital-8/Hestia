import { useMemo, useState, type ReactElement } from 'react';
import { projectSheets, sheetDimsMm, sheetOf, type Id } from '@hestia/model';
import { buildSheetDrawList } from '@hestia/render';
import { exportSheetsPdf } from '@hestia/io';
import { editor, useProject } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { fmtNum, useT } from '../../editor/i18n.ts';
import { savePdf } from '../../editor/savePdf.ts';
import { Dialog } from './Dialog.tsx';
import { TextField } from '../fields.tsx';

/**
 * Publicação das pranchas (Revit: *Print/Export PDF* em lote; ArchiCAD: *Publisher*): escolhe as pranchas, a ordem, se
 * sai um arquivo só ou um por prancha e o nome base. O PDF é o mesmo `exportSheetsPdf` da exportação rápida.
 */
export function PublishDialog(): ReactElement {
  const { t, lang } = useT();
  const p = useProject();
  const sheets = useMemo(() => projectSheets(p), [p]);
  const [order, setOrder] = useState<Id[]>(() => sheets.map((s) => s.id));
  const [picked, setPicked] = useState<Set<Id>>(() => new Set(sheets.map((s) => s.id)));
  const [oneFile, setOneFile] = useState(true);
  const [base, setBase] = useState(p.name || t('dlc_fallback_project_name'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });

  // Mantém a ordem com as pranchas atuais (o diálogo pode abrir com a lista já preenchida).
  const ordered = useMemo(() => {
    const known = new Set(sheets.map((s) => s.id));
    const kept = order.filter((id) => known.has(id));
    return [...kept, ...sheets.map((s) => s.id).filter((id) => !kept.includes(id))];
  }, [order, sheets]);

  const move = (id: Id, delta: -1 | 1): void => {
    const i = ordered.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };
  const toggle = (id: Id): void =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selected = ordered.filter((id) => picked.has(id));
  const publish = async (): Promise<void> => {
    if (selected.length === 0) {
      setErr(t('dlc_err_select_sheet_publish'));
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const lists = selected.map((id) => buildSheetDrawList(p, id, lang)).filter((l): l is NonNullable<typeof l> => l !== null);
      if (lists.length === 0) throw new Error(t('dlc_err_no_valid_sheet'));
      const safe = (base.trim() || t('dlc_fallback_project_name')).replace(/[\\/:*?"<>|]+/g, '-');
      if (oneFile) {
        const msg = await savePdf(`${safe}-pranchas.pdf`, exportSheetsPdf(lists, p.name));
        useUi.setState({ status: msg });
      } else {
        for (let i = 0; i < lists.length; i++) {
          const sheet = sheetOf(p, selected[i]!);
          const name = `${safe}-${sheet ? `${sheet.number}-${sheet.name}` : String(i + 1)}`.replace(/[\\/:*?"<>|]+/g, '-');
          await savePdf(`${name}.pdf`, exportSheetsPdf([lists[i]!], p.name));
        }
        useUi.setState({
          status: {
            key: lists.length === 1 ? 'dlc_status_published_one' : 'dlc_status_published_many',
            args: { n: lists.length },
          },
        });
      }
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('dlc_err_publish'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('dlc_publish_sheets')}
      sub={t('dlc_publish_sub')}
      onClose={close}
      size="mid"
      footer={
        <>
          <button className="btn" onClick={close}>{t('dlc_btn_cancel')}</button>
          <button className="btn primary" disabled={busy || selected.length === 0} onClick={() => void publish()}>
            {busy ? t('dlc_publishing') : oneFile ? t('dlc_btn_publish_pdf') : t('dlc_btn_publish_n_pdf', { n: selected.length })}
          </button>
        </>
      }
    >
      <label className="pub-row">
        <span>{t('dlc_base_name')}</span>
        <TextField id="pub-base" value={base} onCommit={setBase} />
      </label>
      <label className="pub-row">
        <input type="checkbox" checked={oneFile} onChange={(e) => setOneFile(e.target.checked)} />
        <span>{t('dlc_one_file')}</span>
      </label>
      <div className="pub-list" role="list">
        {ordered.map((id, i) => {
          const s = sheetOf(p, id);
          if (!s) return null;
          const d = sheetDimsMm(s);
          return (
            <div className="pub-item" role="listitem" key={id}>
              <input type="checkbox" checked={picked.has(id)} aria-label={t('dlc_aria_include_sheet', { number: s.number })} onChange={() => toggle(id)} />
              <span className="pub-ord">{i + 1}</span>
              <span className="pub-name">
                <b>{s.number}</b> {s.name}
                <span className="val soft"> · {s.size} {fmtNum(d.w, 0, lang)}×{fmtNum(d.h, 0, lang)} mm · {s.viewports.length} {t(s.viewports.length === 1 ? 'dlc_count_view_one' : 'dlc_count_view_many')}{s.revisions?.length ? ` · ${t('dlc_rev_short', { tag: s.titleBlock.revision || s.revisions[s.revisions.length - 1]!.tag })}` : ''}</span>
              </span>
              <button className="btn small" title={t('dlc_move_up')} disabled={i === 0} onClick={() => move(id, -1)}>↑</button>
              <button className="btn small" title={t('dlc_move_down')} disabled={i === ordered.length - 1} onClick={() => move(id, 1)}>↓</button>
            </div>
          );
        })}
        {sheets.length === 0 ? <p className="val soft">{t('dlc_no_sheets_project')}</p> : null}
      </div>
      {err ? <p className="error" role="alert">{err}</p> : null}
      <p className="val soft">{t('dlc_publish_tip')}</p>
    </Dialog>
  );
}

/** Abre a publicação cuidando de prancha inexistente (o diálogo só aparece com o projeto atual). */
export function openPublish(): void {
  if (!editor.project) return;
  useUi.setState({ dialog: 'publish', dialogArg: null });
}
