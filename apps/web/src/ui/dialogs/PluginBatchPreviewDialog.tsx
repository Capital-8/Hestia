import { useSyncExternalStore, type ReactElement } from 'react';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { supplementRuntime } from '../../plugins/supApp.ts';
import { Dialog } from './Dialog.tsx';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });

/**
 * Prévia confirmável de um lote proposto por um suplemento (`DialogKind` 'pluginBatchPreview'). Mostra o que o ensaio
 * contou (criados, alterados, apagados, erros) e só aplica no clique em "Aplicar"; com erros o botão fica desabilitado.
 * Depois de aplicado oferece desfazer UMA vez, enquanto a aplicação for o último passo. Os textos do suplemento são
 * dados não confiáveis: só aparecem como texto simples.
 */
export function PluginBatchPreviewDialog(): ReactElement | null {
  const { t } = useT();
  const batch = supplementRuntime().batch;
  const st = useSyncExternalStore(batch?.subscribe ?? (() => () => {}), batch?.snapshot ?? (() => null), () => null);
  if (!batch) return null;
  const p = st?.pending;
  if (!p) {
    if (!st?.applied) return null;
    const a = st.applied;
    return (
      <Dialog title={t('supbp_title')} sub={a.pluginName} size="narrow" onClose={fechar}
        footer={<>
          {batch.canUndo() ? <button className="btn" onClick={() => { batch.undo(); fechar(); }}>{t('supbp_undo')}</button> : null}
          <button className="btn primary" onClick={fechar}>OK</button>
        </>}>
        <p role="status">{t('supbp_status_applied', { name: a.pluginName })}</p>
      </Dialog>
    );
  }
  const r = p.rehearsal;
  return (
    <Dialog title={t('supbp_title')} sub={p.pluginName} size="narrow" onClose={() => { batch.cancel(); fechar(); }}
      footer={<>
        <button className="btn" onClick={() => { batch.cancel(); fechar(); }}>{t('supbp_cancel')}</button>
        <button className="btn primary" disabled={!r.ok} onClick={() => { batch.confirm(); }}>{t('supbp_apply')}</button>
      </>}>
      <p>{t('supbp_body', { name: p.pluginName, commands: r.commands })}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}><b>{p.label}</b></p>
      {p.note ? <p style={{ whiteSpace: 'pre-wrap' }}><i>{t('supbp_note')}:</i> {p.note}</p> : null}
      <ul data-testid="batch-counts">
        <li>{t('supbp_created', { n: r.created })}</li>
        <li>{t('supbp_changed', { n: r.changed })}</li>
        <li>{t('supbp_deleted', { n: r.deleted })}</li>
        <li>{t('supbp_errors', { n: r.errors.length })}</li>
      </ul>
      {r.errors.length > 0 ? <ul role="alert" style={{ color: '#c62828' }}>{r.errors.slice(0, 5).map((e, i) => <li key={i}>{e.index >= 0 ? `#${e.index + 1}: ` : ''}{e.message}</li>)}</ul> : null}
    </Dialog>
  );
}
