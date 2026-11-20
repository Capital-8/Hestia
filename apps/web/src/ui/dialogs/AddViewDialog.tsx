import { useMemo, useState, type ReactElement } from 'react';
import { sheetOf, type SheetViewSource } from '@hestia/model';
import { editor, useProject } from '../../editor/controller.ts';
import { decodeInsertArg } from '../../editor/sheetInsertArg.ts';
import { INSERT_SCALES, insertViewsWithMode, parseCustomScale, type ScaleMode } from '../../editor/sheetInsertPreview.ts';
import { gruposDeVistas, linhasDeVistas } from '../../editor/sheetInsertSources.ts';
import { useUi } from '../../editor/state.ts';
import { useT } from '../../editor/i18n.ts';
import { Row } from '../fields.tsx';
import { Dialog } from './Dialog.tsx';
import { InsertViewsList } from './InsertViewsList.tsx';
import { planKey, viewKey } from '../../editor/viewIdentity.ts';

const CUSTOM = 'custom';

/** Chave da fonte que corresponde a uma vista (para marcar o que veio do arraste ou do botão de uma vista). */
const keyOfView = (v: SheetViewSource): string | null => {
  if (v.kind === 'plan') return planKey(v.levelId);
  if (v.kind === 'section') return viewKey({ kind: 'section', viewId: v.sectionId });
  if (v.kind === '3d') return v.pointId ? `3d:${v.pointId}` : '3d';
  return null;
};

/**
 * "Inserir vistas na prancha": marca uma ou várias vistas do projeto (plantas, cortes, elevações e 3D), escolhe a
 * escala inicial (a da vista, a maior que cabe, 1:20…1:500 ou personalizada) e insere. As vistas entram na primeira
 * posição livre da folha, sem sobrepor. Se alguma não couber ou não houver espaço, o aviso aparece depois de Inserir e a
 * janela continua aberta. Aberta pelo botão/menu "Adicionar vista" ou pelo arraste do Navegador com Shift (entra
 * centrada onde foi solta). Um passo de desfazer.
 */
export function AddViewDialog({ sheetId: argRaw }: { sheetId: string }): ReactElement | null {
  const arg = useMemo(() => decodeInsertArg(argRaw), [argRaw]);
  const { t, lang } = useT();
  const p = useProject();
  const sheet = sheetOf(p, arg.sheetId);
  const grupos = useMemo(() => gruposDeVistas(p, lang), [p, lang]);
  const linhas = useMemo(() => linhasDeVistas(grupos), [grupos]);
  const fontes = useMemo(() => grupos.flatMap((g) => g.fontes), [grupos]);
  const chaveInicial = arg.view ? keyOfView(arg.view) : null;
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set(chaveInicial ? [chaveInicial] : []));
  const [mode, setMode] = useState<ScaleMode>('natural');
  const [custom, setCustom] = useState('');
  const [customOn, setCustomOn] = useState(false);
  const [err, setErr] = useState('');
  if (!sheet) return null;
  const selected = fontes.filter((s) => keys.has(s.key));
  const customScale = customOn ? parseCustomScale(custom) : null;
  const effectiveMode: ScaleMode = customOn ? (customScale ?? 'natural') : mode;
  const customInvalid = customOn && customScale === null;
  const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
  const toggle = (key: string, on: boolean): void => {
    setErr('');
    setKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  const add = (): void => {
    if (selected.length === 0) return setErr(t('cvs_ins_none'));
    if (customInvalid) return setErr(t('cvs_ins_custom_invalid'));
    try {
      const ids = insertViewsWithMode(editor.store, arg.sheetId, selected.map((s) => s.view), effectiveMode, selected.length === 1 ? arg.centre : undefined);
      useUi.setState({ status: { key: ids.length === 1 ? 'dlc_status_views_added_one' : 'dlc_status_views_added_many', args: { n: ids.length } } });
      close();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('cvs_ins_dialog_error'));
    }
  };
  const selectValue = customOn ? CUSTOM : String(mode);
  const onSelect = (v: string): void => {
    setErr('');
    if (v === CUSTOM) {
      setCustomOn(true);
      return;
    }
    setCustomOn(false);
    setMode(v === 'natural' || v === 'auto' ? v : Number(v));
  };
  return (
    <Dialog
      title={t('cvs_ins_title')}
      sub={`${sheet.number} · ${sheet.name}`}
      onClose={close}
      size="ins"
      trapFocus
      footer={
        <>
          <button className="btn" onClick={close}>{t('dlc_btn_cancel')}</button>
          <button className="btn primary" onClick={add} disabled={selected.length === 0 || customInvalid}>{t('cvs_ins_insert')}</button>
        </>
      }
    >
      <Row label={t('cvs_ins_scale')} htmlFor="av-scale">
        <select id="av-scale" value={selectValue} onChange={(e) => onSelect(e.target.value)}>
          <option value="natural">{t('cvs_ins_scale_natural')}</option>
          <option value="auto">{t('cvs_ins_scale_auto')}</option>
          {INSERT_SCALES.map((k) => (
            <option key={k} value={k}>1:{k}</option>
          ))}
          <option value={CUSTOM}>{t('cvs_ins_scale_custom')}</option>
        </select>
      </Row>
      {customOn ? (
        <input
          id="av-scale-custom"
          aria-label={t('cvs_ins_scale_custom')}
          aria-invalid={customInvalid}
          value={custom}
          placeholder={t('cvs_ins_custom_ph')}
          onChange={(e) => { setCustom(e.target.value); setErr(''); }}
          className="ins-custom"
          autoFocus
        />
      ) : null}
      {customInvalid ? <p className="error" role="alert">{t('cvs_ins_custom_invalid')}</p> : null}
      <p className="hint">{arg.centre ? t('cvs_ins_at_drop') : t('cvs_ins_tip_shift')}</p>
      <div className="ins-head">
        <span className="ins-title">{t('cvs_ins_views')}</span>
        <button className="btn small" onClick={() => { setErr(''); setKeys(new Set(fontes.map((s) => s.key))); }}>{t('dlc_btn_check_all')}</button>
        <button className="btn small" onClick={() => { setErr(''); setKeys(new Set()); }}>{t('dlc_btn_clear')}</button>
      </div>
      <InsertViewsList linhas={linhas} marcadas={keys} onToggle={toggle} label={t('cvs_ins_views')} />
      {err ? <p className="error" role="alert">{err}</p> : null}
    </Dialog>
  );
}
