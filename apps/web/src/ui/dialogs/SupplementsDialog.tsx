import { useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useT, type Dict } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { supplementRuntime } from '../../plugins/supApp.ts';
import { pluginHost } from '../../plugins/appPorts.ts';
import { buildItems, countByState, filterItems, type ManagerState } from '../../plugins/supManage.ts';
import { SourceError, pickFolder, pickPackage } from '../../plugins/supSources.ts';
import type { InstallSource } from '../../plugins/supRuntime.ts';
import { Dialog } from './Dialog.tsx';
import { SupplementReview } from './SupplementReview.tsx';
import { SupplementContent } from './SupplementContent.tsx'; // SUPLEMENTOS: fase G
import { SupplementCard } from './SupplementCard.tsx';
import { ExternalCard } from './ExternalCard.tsx';

const fechar = (): void => useUi.setState({ dialog: null, dialogArg: null });
/** Em revisão: o suplemento, os avisos de origem e o `README.md` do pacote recém-instalado. */
interface Revisao { id: string; warnings: Array<'unsigned' | 'folder' | 'replace'>; readme?: string }

/**
 * Suplementos › Gerenciar suplementos (fase J): UMA tela com todos os suplementos, de pacote e de processo externo
 * ("Ferramentas externas"). Instala, atualiza, revisa e ajusta permissões, ativa, desativa, mostra log e dados e
 * desinstala. Instalar não executa nem concede nada (spec 08 §7.1).
 */
export function SupplementsDialog(): ReactElement {
  const { t } = useT();
  const rt = supplementRuntime();
  const rows = useSyncExternalStore(rt.subscribe, rt.snapshot);
  const host = pluginHost();
  const externals = useSyncExternalStore((cb) => host.subscribe(cb), () => host.list());
  const uid = useId();
  const [query, setQuery] = useState('');
  const [estado, setEstado] = useState<ManagerState | 'all'>('all');
  const items = useMemo(() => buildItems(rows, externals), [rows, externals]);
  const shown = useMemo(() => filterItems(items, { query, state: estado }), [items, query, estado]);
  const counts = useMemo(() => countByState(items), [items]);
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

  /** Atualizar: instala uma nova versão do MESMO suplemento, mantendo as concessões; só as permissões novas pedem decisão. */
  const atualizar = async (id: string, source: 'package' | 'folder'): Promise<void> => {
    setMsg(null);
    setErro(null);
    setBusy(true);
    try {
      const src = await (source === 'folder' ? pickFolder() : pickPackage());
      if (!src) return;
      const r = await rt.update(id, src);
      if (!r.ok) {
        setErro(r.code === 'id_mismatch' ? t('supj_err_id_mismatch', { id: r.message }) : `${t('sup_err_install')} [${r.code}] ${r.code === 'manifest_invalid' ? r.message : ''}`.trim());
        return;
      }
      const row = rt.snapshot().find((x) => x.id === id);
      setMsg(t('supj_update_ok', { name: row?.name ?? id, from: r.previousVersion ?? '?', to: row?.version ?? '?' }));
      if (r.needsGrant.length > 0) setRev({ id, warnings: ['replace'], ...(r.readme ? { readme: r.readme } : {}) });
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
      <p className="hint">{t('sup_hint')} {t('supj_shortcut')}</p>
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '8px 0' }} role="search">
        <label htmlFor={`${uid}-q`}>{t('supj_search')}</label>
        <input id={`${uid}-q`} type="search" value={query} placeholder={t('supj_search_ph')} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 220 }} />
        <label htmlFor={`${uid}-f`}>{t('supj_filter')}</label>
        <select id={`${uid}-f`} value={estado} onChange={(e) => setEstado(e.target.value as ManagerState | 'all')}>
          <option value="all">{t('supj_filter_all')} ({counts.all})</option>
          {(['active', 'disabled', 'needs-grant', 'failed'] as const).map((st) => <option key={st} value={st}>{t(`sup_state_${st}` as keyof Dict)} ({counts[st]})</option>)}
        </select>
        <button className="btn" onClick={() => useUi.setState({ dialog: 'externalTools', dialogArg: null })}>{t('supj_external_open')}</button>
      </div>
      <div className="hint" role="status" aria-live="polite">{t('supj_count', { n: shown.length, total: items.length })}</div>
      {items.length === 0 ? <p className="hint">{t('sup_none')}</p> : shown.length === 0 ? <p className="hint">{t('supj_none_match')}</p> : (
        <ul aria-label={t('sup_sub')} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {shown.map((it) => (
            <li key={it.key}>
              {it.kind === 'package'
                ? <SupplementCard r={it.row} rt={rt} onReview={() => { setErro(null); setRev({ id: it.row.id, warnings: [] }); }} onContent={() => setConteudo(it.row.id)} onUpdate={() => void atualizar(it.row.id, it.row.source)} />
                : <ExternalCard p={it.view} state={it.state} host={host} log={rt.log} />}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
