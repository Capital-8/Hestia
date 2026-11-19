import { useEffect, useState, type CSSProperties, type ReactElement } from 'react';
import type { CollabLinkRole, CollabPeer, CollabPresence, CollabRole, ShareLinkConfig } from '@hestia/model';
import { collabManager, useCollab } from '../../collab/session.ts';
import { buildEmailShareUrl, buildWhatsAppShareUrl, parseInviteInput } from '../../collab/tokens.ts';
import { editor } from '../../editor/controller.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { CollabQrCode } from '../collab/CollabQrCode.tsx';
import { Dialog } from './Dialog.tsx';

type CollabTab = 'session' | 'join' | 'peers' | 'activity' | 'worksets';
type TFunc = ReturnType<typeof useT>['t'];

const CARD: CSSProperties = { border: '1px solid var(--line)', borderRadius: 3, padding: 8, background: 'var(--sheet)' };
const ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const COL: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const FIELD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const LBL: CSSProperties = { fontSize: 11.5, color: 'var(--fg-soft)' };
const ALERT: CSSProperties = { color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: 3, padding: '6px 10px', fontSize: 12 };
const HIGHLIGHT: CSSProperties = { ...CARD, borderColor: 'var(--accent)', background: 'var(--accent-soft)' };

const close = (): void => useUi.setState({ dialog: null, dialogArg: null });
const resolveTab = (arg: string | null): CollabTab =>
  arg === 'join' || arg === 'peers' || arg === 'activity' || arg === 'worksets' ? arg : 'session';

const roleLabel = (role: CollabRole, t: TFunc): string =>
  role === 'host' ? t('collab_role_host') : role === 'editor' ? t('collab_role_editor') : t('collab_role_viewer');

const viewLabel = (view: CollabPresence['view'], t: TFunc): string =>
  t(view === 'plan' ? 'collab_view_plan' : view === '3d' ? 'collab_view_3d' : view === 'section' ? 'collab_view_section' : view === 'sheet' ? 'collab_view_sheet' : 'collab_view_face');

const withArg = (text: string, value: string): string => (value && !text.includes(value) ? `${text}: ${value}` : text);

function formatError(err: string | null, approvalStatus: string, t: TFunc): string | null {
  if (approvalStatus === 'denied' || err === 'denied_by_host') return t('collab_denied_msg');
  if (!err) return null;
  if (err === 'locked_element') return t('collab_locked_error', { author: '—' });
  if (err === 'read_only') return t('collab_readonly_error');
  return err;
}

function PendingRequestsCard({ requests, t }: {
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

function ShareLinkCard({ link, projectName, copiedId, qrLinkId, onCopy, onToggleQr, t }: {
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

/**
 * Diálogo de colaboração em tempo real: sessão, fila de aprovação, links, entrada, participantes, atividade e bloqueios.
 */
export function CollabDialog(): ReactElement {
  const { t } = useT();
  const dialogArg = useUi((s) => s.dialogArg);
  const [tab, setTab] = useState<CollabTab>(() => resolveTab(dialogArg));

  const {
    mode, roomId, myPeerId, myName, myRole, hostName, links, peers, pendingRequests,
    approvalStatus, activity, followingPeerId, wsEndpoint, syncStatus, lastError, lastConflict,
  } = useCollab();

  const [nameInput, setNameInput] = useState(myName);
  const [wsInput, setWsInput] = useState(wsEndpoint);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrLinkId, setQrLinkId] = useState<string | null>(null);

  useEffect(() => { if (dialogArg) setTab(resolveTab(dialogArg)); }, [dialogArg]);
  useEffect(() => { setNameInput(myName); }, [myName]);
  useEffect(() => { setWsInput(wsEndpoint); }, [wsEndpoint]);

  const projectName = editor.project.name;
  const errText = formatError(lastError, approvalStatus, t);
  const locks = collabManager.getAllLockedElements();
  const syncLabel = syncStatus === 'syncing' || syncStatus === 'reconnecting' ? t('collab_status_syncing') : syncStatus === 'error' ? t('collab_status_error') : t('collab_status_synced');
  const statusBadge = mode === 'host' ? t('collab_hosting_badge', { n: peers.length }) : myRole === 'viewer' ? t('collab_guest_viewer_badge') : t('collab_guest_editor_badge');

  const commitName = (next: string): void => { setNameInput(next); collabManager.setMyName(next); };
  const commitWs = (next: string): void => { setWsInput(next); collabManager.setWsEndpoint(next); };

  const handleCopy = (id: string, url: string): void => {
    void navigator.clipboard?.writeText(url);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
  };

  const handleJoin = async (): Promise<void> => {
    const parsed = parseInviteInput(joinInput);
    if (!parsed) { setJoinError(t('collab_join_invalid')); return; }
    setJoinError(null);
    setJoining(true);
    try {
      const ok = await collabManager.joinSession({
        roomId: parsed.roomId,
        token: parsed.token,
        name: nameInput.trim() || undefined,
        wsEndpoint: parsed.wsUrl ?? (wsInput.trim() || undefined),
      });
      if (ok) setTab('session');
    } finally {
      setJoining(false);
    }
  };

  const peersCountLabel = pendingRequests.length > 0 ? `${peers.length} + ${pendingRequests.length}` : String(peers.length);
  const tabs: Array<{ id: CollabTab; label: string }> = [
    { id: 'session', label: t('collab_tab_session') },
    { id: 'join', label: t('collab_tab_join') },
    { id: 'peers', label: mode === 'off' ? t('collab_tab_peers') : `${t('collab_tab_peers')} (${peersCountLabel})` },
    { id: 'activity', label: t('collab_tab_activity') },
    { id: 'worksets', label: t('collab_tab_worksets') },
  ];

  const showPending = mode === 'host' && pendingRequests.length > 0;

  return (
    <Dialog
      title={t('collab_title')}
      sub={t('collab_sub')}
      size="wide"
      onClose={close}
      footer={
        <>
          {mode !== 'off' ? <span className="badge">{syncLabel}</span> : null}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn primary" onClick={close}>{t('collab_close')}</button>
        </>
      }
    >
      <div style={{ ...ROW, justifyContent: 'space-between', marginBottom: 10, borderBottom: '1px solid var(--line)' }}>
        <div className="dtabs" role="tablist" style={{ flex: 1, marginBottom: 0, borderBottom: 'none' }}>
          {tabs.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`dtab${tab === item.id ? ' on' : ''}`} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <span className="badge" style={{ color: 'var(--warn)', borderColor: 'var(--warn)', fontWeight: 600, flexShrink: 0 }}>Experimental</span>
      </div>

      {errText ? <div role="alert" style={{ ...ALERT, marginBottom: 10 }}>{errText}</div> : null}

      {mode === 'guest' && approvalStatus === 'waiting' ? (
        <div role="status" style={{ ...HIGHLIGHT, ...COL, gap: 6, marginBottom: 10 }}>
          <strong style={{ fontSize: 12.5 }}>{t('collab_waiting_title')}</strong>
          <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{t('collab_waiting_desc')}</span>
          <div>
            <button type="button" className="btn small danger" onClick={() => collabManager.stopSession()}>{t('collab_waiting_cancel')}</button>
          </div>
        </div>
      ) : null}

      {tab === 'session' ? (
        <div style={COL}>
          {showPending ? <PendingRequestsCard requests={pendingRequests} t={t} /> : null}
          <fieldset className="dsec">
            <legend>{t('collab_tab_session')}</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              <label style={FIELD}>
                <span style={LBL}>{t('collab_your_name')}</span>
                <input className="input wide" value={nameInput} onChange={(e) => commitName(e.target.value)} />
              </label>
              <label style={FIELD}>
                <span style={LBL}>{t('collab_ws_url')}</span>
                <input className="input wide" placeholder={t('collab_ws_placeholder')} value={wsInput} onChange={(e) => commitWs(e.target.value)} />
              </label>
            </div>
            <div style={{ ...ROW, marginTop: 10 }}>
              {mode === 'off' ? (
                <button type="button" className="btn primary" onClick={() => collabManager.startHosting({ hostName: nameInput.trim() || undefined, wsEndpoint: wsInput.trim() || undefined })}>
                  {t('collab_start_host')}
                </button>
              ) : (
                <>
                  <span className="badge">{statusBadge}</span>
                  {roomId ? <span className="badge">{t('collab_room_id', { id: roomId })}</span> : null}
                  {hostName ? <span className="badge">{t('collab_host_label', { name: hostName })}</span> : null}
                  {myRole === 'viewer' ? <span className="badge" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>{t('collab_readonly_banner')}</span> : null}
                  <span style={{ flex: 1 }} />
                  <button type="button" className="btn" onClick={() => collabManager.requestSync()}>{t('collab_sync_now')}</button>
                  <button type="button" className="btn danger" onClick={() => collabManager.stopSession()}>
                    {mode === 'host' ? t('collab_stop_session') : t('collab_leave_session')}
                  </button>
                </>
              )}
            </div>
          </fieldset>

          {mode === 'host' || links.length > 0 ? (
            <fieldset className="dsec">
              <legend>{t('collab_links_title')}</legend>
              {mode === 'host' ? (
                <div style={{ ...ROW, marginBottom: 8 }}>
                  <button type="button" className="btn small" onClick={() => collabManager.createLink('viewer')}>{t('collab_new_link_viewer')}</button>
                  <button type="button" className="btn small primary" onClick={() => collabManager.createLink('editor')}>{t('collab_new_link_editor')}</button>
                </div>
              ) : null}
              <div style={COL}>
                {links.map((link) => (
                  <ShareLinkCard
                    key={link.id}
                    link={link}
                    projectName={projectName}
                    copiedId={copiedId}
                    qrLinkId={qrLinkId}
                    onCopy={handleCopy}
                    onToggleQr={(id) => setQrLinkId((cur) => (cur === id ? null : id))}
                    t={t}
                  />
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
      ) : null}

      {tab === 'join' ? (
        <fieldset className="dsec">
          <legend>{t('collab_join_title')}</legend>
          <div style={COL}>
            <label style={FIELD}>
              <span style={LBL}>{t('collab_your_name')}</span>
              <input className="input wide" value={nameInput} onChange={(e) => commitName(e.target.value)} />
            </label>
            <label style={FIELD}>
              <span style={LBL}>{t('collab_join_input_label')}</span>
              <input className="input wide" placeholder={t('collab_join_input_placeholder')} value={joinInput} onChange={(e) => { setJoinInput(e.target.value); setJoinError(null); }} />
            </label>
            <label style={FIELD}>
              <span style={LBL}>{t('collab_ws_url')}</span>
              <input className="input wide" placeholder={t('collab_ws_placeholder')} value={wsInput} onChange={(e) => commitWs(e.target.value)} />
            </label>
            {joinError ? <div role="alert" style={{ color: 'var(--danger)', fontSize: 12 }}>{joinError}</div> : null}
            <div>
              <button type="button" className="btn primary" disabled={joining || !joinInput.trim()} onClick={() => void handleJoin()}>{t('collab_join_btn')}</button>
            </div>
          </div>
        </fieldset>
      ) : null}

      {tab === 'peers' ? (
        <div style={COL}>
          {showPending ? <PendingRequestsCard requests={pendingRequests} t={t} /> : null}
          {peers.length === 0 ? <p className="hint">{t('collab_peers_empty')}</p> : (
            <div style={{ ...COL, gap: 6 }}>
              {peers.map((peer: CollabPeer) => {
                const isSelf = peer.id === myPeerId;
                const isFollowing = followingPeerId === peer.id;
                const selCount = peer.presence?.selection.length ?? 0;
                return (
                  <div key={peer.id} style={{ ...CARD, ...ROW }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: peer.color, flexShrink: 0 }} />
                    <strong>{peer.name}</strong>
                    {isSelf ? <span className="badge">{t('collab_you_tag')}</span> : null}
                    <span className="badge">{roleLabel(peer.role, t)}</span>
                    <span className="hint" style={{ padding: 0, fontSize: 11.5 }}>
                      {peer.presence ? `${viewLabel(peer.presence.view, t)} · ${withArg(t('collab_selected_count', { count: selCount, n: selCount }), String(selCount))}` : '—'}
                    </span>
                    <span style={{ flex: 1 }} />
                    {!isSelf ? (
                      <button type="button" className={`btn small${isFollowing ? ' primary' : ''}`} onClick={() => collabManager.followPeer(isFollowing ? null : peer.id)}>
                        {isFollowing ? t('collab_unfollow') : t('collab_follow')}
                      </button>
                    ) : null}
                    {mode === 'host' && peer.role !== 'host' ? (
                      <>
                        <select className="select" aria-label={roleLabel(peer.role, t)} value={peer.role} onChange={(e) => collabManager.setPeerRole(peer.id, e.target.value as CollabLinkRole)}>
                          <option value="viewer">{t('collab_role_viewer')}</option>
                          <option value="editor">{t('collab_role_editor')}</option>
                        </select>
                        <button type="button" className="btn small" onClick={() => collabManager.handOverHost(peer.id)}>{t('collab_make_host')}</button>
                        <button type="button" className="btn small danger" onClick={() => collabManager.kickPeer(peer.id)}>{t('collab_kick')}</button>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'activity' ? (
        <div style={COL}>
          <div style={ROW}>
            <button type="button" className="btn small" disabled={mode === 'off' || myRole === 'viewer'} onClick={() => collabManager.undo()}>
              {t('collab_undo_mine')}
            </button>
          </div>
          {lastConflict ? (
            <div role="alert" style={ALERT}>{t('collab_conflict_undo', { author: lastConflict.author || '—' })}</div>
          ) : null}
          {activity.length === 0 ? <p className="hint">{t('collab_activity_empty')}</p> : (
            <div style={{ ...COL, gap: 4 }}>
              {[...activity].reverse().map((item) => (
                <div key={item.id} style={{ ...CARD, ...ROW, padding: '6px 8px' }}>
                  <span className="badge" style={{ borderColor: item.authorColor, color: item.authorColor, fontWeight: 600 }}>{item.authorName}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-soft)' }}>{new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'worksets' ? (
        <fieldset className="dsec">
          <legend>{t('collab_locks_title')}</legend>
          {locks.length === 0 ? <p className="hint">{t('collab_locks_empty')}</p> : (
            <div style={{ ...COL, gap: 6 }}>
              {locks.map(({ elementId, peer }) => (
                <div key={elementId} style={{ ...CARD, ...ROW, padding: '6px 8px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: peer.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{elementId}</span>
                  <span style={{ flex: 1 }} />
                  <span className="hint" style={{ padding: 0, fontSize: 11.5 }}>
                    {withArg(t('collab_locked_by', { name: peer.name, author: peer.name }), peer.name)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </fieldset>
      ) : null}
    </Dialog>
  );
}
