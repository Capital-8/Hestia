import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { ContentItem, ContentOffer } from '@hestia/model';
import { useT, type Dict } from '../../editor/i18n.ts';
import { loadContent, loadedCount, previewContent, previewRemoval, removeContent } from '../../plugins/contentBridge.ts';
import { supplementRuntime } from '../../plugins/supApp.ts';

const COR: Record<string, string> = { new: '#2e7d32', update: '#b26a00', unchanged: '#757575', invalid: '#c62828' };

/**
 * Suplementos › Carregar conteúdo: lista as famílias e os materiais que o suplemento ativo oferece, mostra a prévia (novo,
 * já carregado, atualização, recusado) e só grava quando o usuário clica em Carregar (um passo de Desfazer). Remover o
 * conteúdo é seguro: o que está em uso fica e é avisado.
 */
export function SupplementContent({ pluginId, onClose }: { pluginId: string; onClose: () => void }): ReactElement {
  const { t } = useT();
  const rt = supplementRuntime();
  const model = rt.modelPort;
  const [offer, setOffer] = useState<ContentOffer | null | undefined>(undefined);
  const [fam, setFam] = useState<Set<string>>(new Set());
  const [mat, setMat] = useState<Set<string>>(new Set());
  const [upd, setUpd] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    void rt.contentOffers().then((all) => {
      const o = all.find((x) => x.pluginId === pluginId) ?? null;
      setOffer(o);
      setFam(new Set(o?.families.map((f) => f.id) ?? []));
      setMat(new Set(o?.materials.map((m) => m.id) ?? []));
    });
  }, [rt, pluginId]);

  const opts = useMemo(() => ({ updateExisting: upd, select: { families: fam, materials: mat } }), [upd, fam, mat]);
  // `rev` força nova prévia depois de carregar ou remover (o projeto mudou).
  const plan = useMemo(() => (offer ? previewContent(model, offer, opts) : null), [offer, model, opts, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const remocao = useMemo(() => previewRemoval(model, pluginId), [model, pluginId, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void): void => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    fn(n);
  };

  if (offer === undefined) return <section className="prow-card" />;
  if (offer === null) return <section className="prow-card"><p className="hint">{t('sup_content_none')}</p><button className="btn" onClick={onClose}>{t('sup_content_close')}</button></section>;

  const carregar = (): void => {
    setMsg(null);
    setErro(null);
    const r = loadContent(model, offer, opts);
    if (r.result.ok) setMsg(r.result.applied === 0 ? t('sup_content_nothing') : t('sup_content_loaded', { n: String(r.plan.counts.applied) }));
    else setErro(t('sup_content_err', { detail: r.result.error }));
    setRev((v) => v + 1);
  };
  const remover = (): void => {
    setMsg(null);
    setErro(null);
    const r = removeContent(model, pluginId);
    if (r.result.ok) setMsg(t('sup_content_removed', { n: String(r.plan.commands.filter((c) => c.type.startsWith('delete') && c.type !== 'deletePluginData').length) }));
    else setErro(t('sup_content_err', { detail: r.result.error }));
    setRev((v) => v + 1);
  };
  const linha = (it: ContentItem): ReactElement => (
    <li key={it.id} data-status={it.status}>
      <span style={{ color: COR[it.status], fontWeight: 600 }}>{t(`sup_content_st_${it.status}` as keyof Dict)}</span>{' '}
      {t(`sup_content_kind_${it.kind}` as keyof Dict)}: {it.name} <code>{it.id}</code>
      {it.error ? <span role="alert" style={{ color: COR.invalid }}> — {it.error}</span> : null}
    </li>
  );
  const livres = remocao.items.filter((i) => i.status === 'removable').length;
  const usados = remocao.items.filter((i) => i.status === 'in-use');
  return (
    <section className="prow-card" aria-label={t('sup_content_title')} style={{ border: '1px solid var(--line, #ccc)', borderRadius: 6, padding: 12, margin: '8px 0' }}>
      <strong>{t('sup_content_title')}: {offer.pluginName}</strong>
      <p className="hint">{t('sup_content_hint')}</p>
      {offer.materials.length > 0 ? <fieldset><legend>{t('sup_content_materials')}</legend>
        {offer.materials.map((m) => <label key={m.id} style={{ marginRight: 12 }}><input type="checkbox" checked={mat.has(m.id)} onChange={() => toggle(mat, m.id, setMat)} /> {m.name}</label>)}
      </fieldset> : null}
      {offer.families.length > 0 ? <fieldset><legend>{t('sup_content_families')}</legend>
        {offer.families.map((f) => <label key={f.id} style={{ marginRight: 12 }}><input type="checkbox" checked={fam.has(f.id)} onChange={() => toggle(fam, f.id, setFam)} /> {f.id} ({t(`sup_content_kind_${f.category}` as keyof Dict)})</label>)}
      </fieldset> : null}
      <label style={{ display: 'block', margin: '6px 0' }}><input type="checkbox" checked={upd} onChange={(e) => setUpd(e.target.checked)} /> {t('sup_content_update_existing')}</label>
      <div aria-label={t('sup_content_preview')}><strong>{t('sup_content_preview')}</strong><ul>{plan?.items.map(linha)}</ul></div>
      {msg ? <div role="status">{msg}</div> : null}
      {erro ? <div role="alert" style={{ color: COR.invalid }}>{erro}</div> : null}
      {loadedCount(model, pluginId) > 0 ? <p className="hint">{t('sup_content_remove_preview', { free: String(livres), used: String(usados.length) })}{usados.length ? ` ${t('sup_content_blocked', { names: usados.map((u) => u.name).join(', ') })}` : ''}</p> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn primary" disabled={!plan || plan.counts.applied === 0} onClick={carregar}>{t('sup_content_load', { n: String(plan?.counts.applied ?? 0) })}</button>
        <button className="btn" disabled={livres === 0} onClick={remover}>{t('sup_content_remove')}</button>
        <button className="btn" onClick={onClose}>{t('sup_content_close')}</button>
      </div>
    </section>
  );
}
