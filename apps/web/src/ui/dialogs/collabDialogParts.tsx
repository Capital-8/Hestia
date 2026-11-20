import type { CSSProperties, ReactElement } from 'react';
import type { CollabLinkRole, CollabRole, ShareLinkConfig } from '@hestia/model';
import { collabManager } from '../../collab/session.ts';
import { buildEmailShareUrl, buildWhatsAppShareUrl } from '../../collab/tokens.ts';
import type { useT } from '../../editor/i18n.ts';
import { CollabQrCode } from '../collab/CollabQrCode.tsx';

export type TFunc = ReturnType<typeof useT>['t'];

export const CARD: CSSProperties = { border: '1px solid var(--line)', borderRadius: 3, padding: 8, background: 'var(--sheet)' };
export const ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
export const COL: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
export const FIELD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
export const LBL: CSSProperties = { fontSize: 11.5, color: 'var(--fg-soft)' };
export const ALERT: CSSProperties = { color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 3, padding: '6px 10px', fontSize: 12 };
export const HIGHLIGHT: CSSProperties = { ...CARD, borderColor: 'var(--accent)', background: 'var(--accent-soft)' };

export const roleLabel = (role: CollabRole, t: TFunc): string =>
  role === 'host' ? t('collab_role_host') : role === 'editor' ? t('collab_role_editor') : t('collab_role_viewer');

export function PendingRequestsCard({ requests, t }: {
  requests: ReadonlyArray<{ peerId: string; name: string; requestedRole: CollabLinkRole }>;
  t: TFunc;
}): ReactElement {
  return (
    <div style={{ ...HIGHLIGHT, ...COL, gap: 6 }}>
      <strong style={{ fontSize: 12, color: 'var(--accent)' }}>{t('collab_pending_title', { n: requests.length })}</strong>
      {requests.map((req) => (
        <div key={req.peerId} style={{ ...CARD, ...ROW, gap: 6 }}>
          <strong style={{ fontSize: 12 }}>{req.name}</strong>
          <span className="hint" style={{ padding: 0, fontSize: 11.5 }}>
            {t('collab_pending_asked', { role: roleLabel(req.requestedRole, t) })}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn small" onClick={() => collabManager.approveJoin(req.peerId, 'viewer')}>
            {t('collab_accept_viewer')}
          </button>
          <button type="button" className="btn small primary" onClick={() => collabManager.approveJoin(req.peerId, 'editor')}>
            {t('collab_accept_editor')}
          </button>
          <button type="button" className="btn small danger" onClick={() => collabManager.denyJoin(req.peerId)}>
            {t('collab_deny')}
          </button>
        </div>
      ))}
    </div>
  );
}

export function ShareLinkCard({ link, projectName, copiedId, qrLinkId, onCopy, onToggleQr, t }: {
  link: ShareLinkConfig;
  projectName: string;
  copiedId: string | null;
  qrLinkId: string | null;
  onCopy: (id: string, url: string) => void;
  onToggleQr: (id: string) => void;
  t: TFunc;
}): ReactElement {
  const url = collabManager.getShareUrl(link);
  const qrOpen = qrLinkId === link.id;
  return (
    <div style={{ ...CARD, opacity: link.revoked ? 0.65 : 1 }}>
      <div style={{ ...ROW, marginBottom: link.revoked ? 0 : 6 }}>
        <strong style={{ fontSize: 12 }}>{link.label || roleLabel(link.role, t)}</strong>
        <select
          className="select"
          disabled={link.revoked}
          aria-label={roleLabel(link.role, t)}
          value={link.role}
          onChange={(e) => collabManager.updateLinkRole(link.id, e.target.value as CollabLinkRole)}
        >
          <option value="viewer">{t('collab_role_viewer')}</option>
          <option value="editor">{t('collab_role_editor')}</option>
        </select>
        {link.revoked ? <span className="badge" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>{t('collab_revoked_badge')}</span> : null}
        <span style={{ flex: 1 }} />
        {!link.revoked ? (
          <button type="button" className="btn small danger" onClick={() => collabManager.revokeLink(link.id)}>
            {t('collab_revoke')}
          </button>
        ) : null}
      </div>
      {!link.revoked ? (
        <>
          <div style={{ ...ROW, gap: 6 }}>
            <input
              className="input"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: '1 1 220px', fontFamily: 'var(--font-mono)', fontSize: 11 }}
            />
            <button type="button" className="btn small" onClick={() => onCopy(link.id, url)}>
              {copiedId === link.id ? t('collab_copied') : t('collab_copy_link')}
            </button>
            <a className="btn small" href={buildWhatsAppShareUrl(url, projectName, link.role)} target="_blank" rel="noreferrer">{t('collab_whatsapp')}</a>
            <a className="btn small" href={buildEmailShareUrl(url, projectName, link.role)}>{t('collab_email')}</a>
            <button type="button" className={`btn small${qrOpen ? ' primary' : ''}`} onClick={() => onToggleQr(link.id)}>{t('collab_qr_toggle')}</button>
          </div>
          {qrOpen ? <div style={{ marginTop: 8 }}><CollabQrCode value={url} /></div> : null}
        </>
      ) : null}
    </div>
  );
}
