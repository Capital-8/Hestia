import { useId, useState, type ReactElement } from 'react';
import { useT, type Dict } from '../../editor/i18n.ts';
import type { SupplementRow, SupplementRuntime } from '../../plugins/supRuntime.ts';
import { SupplementData } from './SupplementData.tsx';
import { SupplementGrants } from './SupplementGrants.tsx';
import { SupplementLog } from './SupplementLog.tsx';

export const STATE_COLOR: Record<string, string> = { active: '#2e7d32', failed: '#c62828', 'needs-grant': '#b26a00', installed: '#b26a00', disabled: '#757575' };

type Panel = 'perms' | 'log' | 'data' | null;

interface Props {
  r: SupplementRow;
  rt: SupplementRuntime;
  onReview: () => void;
  onContent: () => void;
  onUpdate: () => void;
}

/**
 * Cartão de um suplemento de pacote no gerenciador: estado, versão, runtime, autor, aviso de pacote sem assinatura,
 * motivo da falha com Reativar, e painéis de permissões, log e dados. Tudo alcançável pelo teclado (botões com
 * `aria-expanded`/`aria-controls`).
 */
export function SupplementCard({ r, rt, onReview, onContent, onUpdate }: Props): ReactElement {
  const { t } = useT();
  const uid = useId();
  const [panel, setPanel] = useState<Panel>(null);
  const [confirmar, setConfirmar] = useState(false);
  const toggle = (p: Exclude<Panel, null>): void => setPanel((cur) => (cur === p ? null : p));
  const tab = (p: Exclude<Panel, null>, label: keyof Dict): ReactElement => (
    <button className="btn" aria-expanded={panel === p} aria-controls={`${uid}-${p}`} onClick={() => toggle(p)}>{t(label)}</button>
  );
  const hasContent = r.state === 'active' && r.grants.some((g) => g === 'content.families' || g === 'content.materials');
  return (
    <section className="prow-card" aria-label={r.name} style={{ border: '1px solid var(--line, #ccc)', borderRadius: 6, padding: 12, margin: '8px 0' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <strong>{r.name}</strong>
        <span className="hint">{r.version} · {t(`sup_runtime_${r.runtime}` as keyof Dict)}{r.author ? ` · ${t('supj_by', { author: r.author })}` : ''}</span>
        <span role="status" data-state={r.state} style={{ marginLeft: 'auto', color: STATE_COLOR[r.state], fontWeight: 600 }}>● {t(`sup_state_${r.state}` as keyof Dict)}</span>
      </div>
      <div className="hint">{r.id}</div>
      {r.description ? <div>{r.description}</div> : null}
      <p role="note" className="hint" style={{ color: '#b26a00', margin: '4px 0' }}>{t(r.source === 'folder' ? 'supj_badge_folder' : 'supj_badge_unsigned')}</p>
      {r.state === 'failed' ? (
        <div role="alert" style={{ color: '#c62828', margin: '4px 0' }}>
          {t('supj_fail_reason', { detail: r.detail ?? '?' })}
          <div className="hint">{t('supj_fail_hint')}</div>
        </div>
      ) : null}
      {r.state === 'needs-grant' ? <div className="hint" style={{ color: '#b26a00' }}>{t('supj_needs_grant_hint')}</div> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {r.state === 'failed' ? <button className="btn primary" onClick={() => void rt.setEnabled(r.id, true)}>{t('supj_btn_reactivate')}</button> : null}
        {r.state === 'needs-grant' || r.state === 'installed' ? <button className="btn" onClick={onReview}>{t('sup_btn_review')}</button> : null}
        {r.enabled && r.state !== 'disabled' && r.state !== 'failed'
          ? <button className="btn" onClick={() => void rt.setEnabled(r.id, false)}>{t('sup_btn_disable')}</button>
          : r.state !== 'failed' ? <button className="btn" onClick={() => void rt.setEnabled(r.id, true)}>{t('sup_btn_enable')}</button> : null}
        {tab('perms', 'supj_btn_perms')}
        {tab('log', 'sup_btn_log')}
        {tab('data', 'supj_data_btn')}
        <button className="btn" onClick={onUpdate}>{t('supj_btn_update')}</button>
        {hasContent ? <button className="btn" onClick={onContent}>{t('sup_content_btn')}</button> : null}
        <button className="btn" aria-expanded={confirmar} onClick={() => setConfirmar((c) => !c)}>{t('sup_btn_uninstall')}</button>
      </div>
      {confirmar ? (
        <div role="group" aria-label={t('supj_uninstall_title', { name: r.name })} style={{ border: '1px solid #c62828', borderRadius: 6, padding: 8, marginTop: 8 }}>
          <strong>{t('supj_uninstall_title', { name: r.name })}</strong>
          <p>{t('supj_uninstall_explain')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => void rt.uninstall(r.id)}>{t('sup_btn_confirm_uninstall')}</button>
            <button className="btn primary" onClick={() => setConfirmar(false)}>{t('supj_btn_cancel')}</button>
          </div>
        </div>
      ) : null}
      <div id={`${uid}-perms`} hidden={panel !== 'perms'}>
        {panel === 'perms' ? <SupplementGrants requested={r.requested} granted={r.grants} onApply={async (g) => {
          const res = await rt.setGrants(r.id, g);
          return res.ok ? null : t('sup_err_activate', { detail: res.detail ?? res.code });
        }} /> : null}
      </div>
      <div id={`${uid}-log`} hidden={panel !== 'log'}>{panel === 'log' ? <SupplementLog log={rt.log} pluginId={r.id} /> : null}</div>
      <div id={`${uid}-data`} hidden={panel !== 'data'}>{panel === 'data' ? <SupplementData read={() => rt.dataSpace(r.id)} schema={r.dataSchema} /> : null}</div>
    </section>
  );
}
