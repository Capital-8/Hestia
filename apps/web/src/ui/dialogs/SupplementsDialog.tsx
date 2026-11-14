import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useT, type Dict } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { supplementRuntime } from '../../plugins/supApp.ts';
import { SourceError, pickFolder, pickPackage } from '../../plugins/supSources.ts';
import type { InstallSource, SupplementRow } from '../../plugins/supRuntime.ts';
import { Dialog } from './Dialog.tsx';
import { SupplementReview } from './SupplementReview.tsx';
import { SupplementContent } from './SupplementContent.tsx'; // SUPLEMENTOS: fase G

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });
const COR: Record<string, string> = { active: '#2e7d32', failed: '#c62828', 'needs-grant': '#b26a00', installed: '#b26a00', disabled: '#757575' };

/** Em revisão: o suplemento, os avisos de origem e o `README.md` do pacote recém-instalado. */
interface Revisao { id: string; warnings: Array<'unsigned' | 'folder' | 'replace'>; readme?: string }

function Linha({ r, onReview, onContent }: { r: SupplementRow; onReview: () => void; onContent: () => void }): ReactElement {
  const { t } = useT();
  const rt = supplementRuntime();
  const [confirmar, setConfirmar] = useState(false);
  const [verLog, setVerLog] = useState(false);
  const log = verLog ? rt.log.entries(r.id) : [];
  return (
    <section className="prow-card" aria-label={r.name} style={{ border: '1px solid var(--line, #ccc)', borderRadius: 6, padding: 12, margin: '8px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>{r.name}</strong>
        <span className="hint">{r.version} · {t(`sup_runtime_${r.runtime}` as keyof Dict)}</span>
        <span role="status" data-state={r.state} style={{ marginLeft: 'auto', color: COR[r.state], fontWeight: 600 }}>● {t(`sup_state_${r.state}` as keyof Dict)}</span>
      </div>
      {r.description ? <div className="hint">{r.description}</div> : null}
      {r.state === 'failed' && r.detail ? <div role="alert" style={{ color: '#c62828' }}>{t('sup_err_activate', { detail: r.detail })}</div> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button className="btn" onClick={onReview}>{t('sup_btn_review')}</button>
        {r.state === 'active' && r.grants.some((g) => g === 'content.families' || g === 'content.materials') ? <button className="btn" onClick={onContent}>{t('sup_content_btn')}</button> : null}
        {r.enabled && r.state !== 'disabled'
          ? <button className="btn" onClick={() => void rt.setEnabled(r.id, false)}>{t('sup_btn_disable')}</button>
          : <button className="btn" onClick={() => void rt.setEnabled(r.id, true)}>{t('sup_btn_enable')}</button>}
        <button className="btn" onClick={() => setVerLog((v) => !v)}>{t(verLog ? 'sup_btn_hide_log' : 'sup_btn_log')}</button>
        {confirmar
          ? <button className="btn" onClick={() => void rt.uninstall(r.id)}>{t('sup_btn_confirm_uninstall')}</button>
          : <button className="btn" onClick={() => setConfirmar(true)}>{t('sup_btn_uninstall')}</button>}
      </div>
      {confirmar ? <div className="hint">{t('sup_uninstall_hint')}</div> : null}
      {verLog ? (
        <div aria-label={t('sup_log_title')} style={{ fontFamily: 'monospace', fontSize: 12, maxHeight: 140, overflow: 'auto', marginTop: 8 }}>
          {log.length === 0 ? t('sup_log_empty') : log.map((e, i) => <div key={i}>{new Date(e.at).toLocaleTimeString()} [{e.level}] {e.text}</div>)}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Suplementos › Gerenciar suplementos: instala (`.hestiapkg` ou pasta), revisa permissões antes de ativar, ativa,
 * desativa e desinstala. Instalar não executa nem concede nada (spec 08 §7.1).
 */
export function SupplementsDialog(): ReactElement {
  const { t } = useT();
  const rt = supplementRuntime();
  const rows = useSyncExternalStore(rt.subscribe, rt.snapshot);
  const [rev, setRev] = useState<Revisao | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conteudo, setConteudo] = useState<string | null>(null);
  useEffect(() => { void rt.refresh(); }, [rt]);

  const instalar = async (pick: () => Promise<InstallSource | null>): Promise<void> => {
    setMsg(null);
    setErro(null);
    setBusy(true);
    try {
      const src = await pick();
      if (!src) return;
      const r = await rt.install(src);
      if (!r.ok) {
        const key = `sup_err_${r.code}` as keyof Dict;
        const txt = t(key);
        setErro(`${txt === String(key) ? t('sup_err_install') : txt} [${r.code}] ${r.code === 'manifest_invalid' ? r.message : ''}`.trim());
        return;
      }
      const row = rt.snapshot().find((x) => x.id === r.id);
      setMsg(t('sup_installed_ok', { name: row?.name ?? r.id }));
      setRev({ id: r.id, warnings: [src.kind === 'folder' ? 'folder' : 'unsigned', ...(r.replaced ? ['replace' as const] : [])], ...(r.readme ? { readme: r.readme } : {}) });
    } catch (e) {
      setErro(e instanceof SourceError && e.code === 'no_support' ? t('sup_err_no_support') : `${t('sup_err_install')} ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setBusy(false);
    }
  };

  const conceder = async (id: string, grants: string[]): Promise<void> => {
    setBusy(true);
    setErro(null);
    const r = await rt.approve(id, grants);
    setBusy(false);
    if (r.ok) setRev(null);
    else setErro(t('sup_err_activate', { detail: r.detail ?? r.code }));
  };

  const emRevisao = rev ? rows.find((r) => r.id === rev.id) : undefined;
  return (
    <Dialog title={t('sup_title')} sub={t('sup_sub')} size="wide" onClose={fechar} footer={<button className="btn primary" onClick={fechar}>{t('dlm_btn_close')}</button>}>
      <p className="hint">{t('sup_hint')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
        <button className="btn primary" disabled={busy} onClick={() => void instalar(pickPackage)}>{t('sup_install_pkg')}</button>
        <button className="btn" disabled={busy} onClick={() => void instalar(pickFolder)}>{t('sup_install_folder')}</button>
      </div>
      {msg ? <div role="status">{msg}</div> : null}
      {erro && !emRevisao ? <div role="alert" style={{ color: '#c62828', margin: '6px 0' }}>{erro}</div> : null}
      {rev && emRevisao ? (
        <SupplementReview key={emRevisao.id} row={emRevisao} warnings={rev.warnings} {...(rev.readme ? { readme: rev.readme } : {})} busy={busy} error={erro}
          onGrant={(g) => void conceder(emRevisao.id, g)} onLater={() => { setRev(null); setErro(null); }} />
      ) : null}
      {conteudo ? <SupplementContent key={conteudo} pluginId={conteudo} onClose={() => setConteudo(null)} /> : null}
      {rows.length === 0 ? <p className="hint">{t('sup_none')}</p> : rows.map((r) => <Linha key={r.id} r={r} onReview={() => { setErro(null); setRev({ id: r.id, warnings: [] }); }} onContent={() => setConteudo(r.id)} />)}
    </Dialog>
  );
}
