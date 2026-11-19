import { useState, type ReactElement } from 'react';
import type { CollabLinkRole } from '@hestia/model';
import { collabManager, useCollab } from '../../collab/session.ts';
import { ALERT, COL, CARD, FIELD, HIGHLIGHT, LBL, ROW, type TFunc } from './collabDialogParts.tsx';

export type P2pHostMode = 'lan' | 'p2p';

/** Copia texto para a área de transferência (sem falhar quando a API não existe). */
function copyText(text: string): void { void navigator.clipboard?.writeText(text); }

/** Botão "Copiar" com confirmação temporária. */
function CopyButton({ text, t }: { text: string; t: TFunc }): ReactElement {
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className="btn small" onClick={() => { copyText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }}>
      {copied ? t('collab_p2p_copied') : t('collab_p2p_copy')}
    </button>
  );
}

/** Seletor "Rede local / IP" x "P2P". */
export function P2pModeSelect({ value, disabled, onChange, t }: { value: P2pHostMode; disabled: boolean; onChange: (m: P2pHostMode) => void; t: TFunc }): ReactElement {
  return (
    <div className="dtabs" role="radiogroup" style={{ marginBottom: 0 }}>
      {(['lan', 'p2p'] as const).map((m) => (
        <button key={m} type="button" role="radio" aria-checked={value === m} disabled={disabled} className={`dtab${value === m ? ' on' : ''}`} onClick={() => onChange(m)}>
          {t(m === 'lan' ? 'collab_mode_lan' : 'collab_mode_p2p')}
        </button>
      ))}
    </div>
  );
}

/** Mensagem de erro P2P (código inválido ou falha de conexão). */
export function P2pErrorText({ t }: { t: TFunc }): ReactElement | null {
  const err = useCollab((s) => s.p2pError);
  return err ? <div role="alert" style={ALERT}>{t(err)}</div> : null;
}

/** Aviso permanente sobre redes restritas (CGNAT / firewall). */
export function P2pRestrictedWarning({ t }: { t: TFunc }): ReactElement {
  return <p className="hint" role="note" style={{ margin: 0 }}>{t('collab_p2p_restricted_warning')}</p>;
}

function InviteCard({ inviteId, code, label, status, t }: { inviteId: string; code: string; label: string; status: 'waiting' | 'connected'; t: TFunc }): ReactElement {
  const [answer, setAnswer] = useState('');
  return (
    <div style={{ ...CARD, ...COL, gap: 6 }}>
      <div style={ROW}>
        <strong style={{ fontSize: 12 }}>{label}</strong>
        <span className="badge">{status === 'connected' ? t('collab_p2p_connected') : t('collab_p2p_waiting_answer')}</span>
      </div>
      <label style={FIELD}>
        <span style={LBL}>{t('collab_p2p_offer_label')}</span>
        <div style={{ ...ROW, gap: 6 }}>
          <textarea className="input wide" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} style={{ flex: '1 1 260px', fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          <CopyButton text={code} t={t} />
        </div>
      </label>
      {status === 'waiting' ? (
        <label style={FIELD}>
          <span style={LBL}>{t('collab_p2p_answer_label')}</span>
          <div style={{ ...ROW, gap: 6 }}>
            <input className="input wide" value={answer} onChange={(e) => setAnswer(e.target.value)} style={{ flex: '1 1 260px' }} />
            <button type="button" className="btn small primary" disabled={!answer.trim()} onClick={() => void collabManager.acceptP2pAnswer(inviteId, answer.trim())}>{t('collab_p2p_connect')}</button>
          </div>
        </label>
      ) : null}
    </div>
  );
}

/** Painel do anfitrião P2P: escolher papel, gerar convite, copiar o código e colar a resposta do convidado. */
export function P2pHostPanel({ t }: { t: TFunc }): ReactElement {
  const invites = useCollab((s) => s.p2pInvites);
  const [role, setRole] = useState<CollabLinkRole>('editor');
  return (
    <fieldset className="dsec">
      <legend>{t('collab_p2p_title')}</legend>
      <div style={COL}>
        <p className="hint" style={{ margin: 0 }}>{t('collab_p2p_intro')}</p>
        <div style={ROW}>
          <select className="select" aria-label={t('collab_role_editor')} value={role} onChange={(e) => setRole(e.target.value as CollabLinkRole)}>
            <option value="viewer">{t('collab_role_viewer')}</option>
            <option value="editor">{t('collab_role_editor')}</option>
          </select>
          <button type="button" className="btn primary" onClick={() => void collabManager.createP2pInvite(role)}>{t('collab_p2p_generate')}</button>
        </div>
        <P2pErrorText t={t} />
        {invites.map((inv) => <InviteCard key={inv.inviteId} inviteId={inv.inviteId} code={inv.code} label={inv.label} status={inv.status} t={t} />)}
      </div>
    </fieldset>
  );
}

/** Código de resposta do convidado P2P, com botão Copiar e mensagem de espera. */
export function P2pGuestAnswer({ t }: { t: TFunc }): ReactElement | null {
  const code = useCollab((s) => s.p2pAnswerCode);
  const approval = useCollab((s) => s.approvalStatus);
  if (!code || approval === 'approved') return null;
  return (
    <div style={{ ...HIGHLIGHT, ...COL, gap: 6 }}>
      <label style={FIELD}>
        <span style={LBL}>{t('collab_p2p_guest_answer_label')}</span>
        <div style={{ ...ROW, gap: 6 }}>
          <textarea className="input wide" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} style={{ flex: '1 1 260px', fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          <CopyButton text={code} t={t} />
        </div>
      </label>
      <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{t('collab_p2p_guest_waiting')}</span>
    </div>
  );
}
