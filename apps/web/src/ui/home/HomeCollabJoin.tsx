import { useState, type CSSProperties, type ReactElement } from 'react';
import { collabManager, useCollab } from '../../collab/session.ts';
import { parseInviteInput } from '../../collab/tokens.ts';
import { useT } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { Dialog } from '../dialogs/Dialog.tsx';

const COL: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const FIELD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };
const LBL: CSSProperties = { fontSize: 11.5, color: 'var(--fg-soft)' };
const ALERT: CSSProperties = { color: 'var(--danger)', fontSize: 12 };

interface HomeCollabJoinProps {
  onClose: () => void;
}

/**
 * Diálogo de entrada rápida em projeto colaborativo diretamente na tela inicial.
 */
export function HomeCollabJoin({ onClose }: HomeCollabJoinProps): ReactElement {
  const { t } = useT();
  const myName = useCollab((s) => s.myName);
  const [nameInput, setNameInput] = useState(myName);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const commitName = (next: string): void => {
    setNameInput(next);
    collabManager.setMyName(next);
  };

  const handleConnect = (): void => {
    const parsed = parseInviteInput(joinInput);
    if (!parsed) {
      setJoinError(t('collab_join_invalid'));
      return;
    }
    setJoinError(null);
    const name = nameInput.trim() || undefined;
    useUi.setState({ tela: 'editor' });
    void collabManager
      .joinSession({
        roomId: parsed.roomId,
        token: parsed.token,
        name,
        wsEndpoint: parsed.wsUrl,
      })
      .then((ok) => {
        if (!ok) useUi.setState({ dialog: 'collab', dialogArg: 'join' });
      });
  };

  return (
    <Dialog
      title={t('collab_join_title')}
      size="narrow"
      onClose={onClose}
      onSubmit={handleConnect}
      footer={
        <>
          <span className="badge" style={{ color: 'var(--warn)', borderColor: 'var(--warn)', fontWeight: 600, flexShrink: 0 }}>
            Experimental
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            {t('collab_close')}
          </button>
          <button type="button" className="btn primary" onClick={handleConnect}>
            {t('collab_join_btn')}
          </button>
        </>
      }
    >
      <div style={COL}>
        <label style={FIELD}>
          <span style={LBL}>{t('collab_your_name')}</span>
          <input
            className="input wide"
            value={nameInput}
            onChange={(e) => commitName(e.target.value)}
          />
        </label>
        <label style={FIELD}>
          <span style={LBL}>{t('collab_join_input_label')}</span>
          <input
            className="input wide"
            data-autofocus
            placeholder={t('collab_join_input_placeholder')}
            value={joinInput}
            onChange={(e) => {
              setJoinInput(e.target.value);
              setJoinError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleConnect();
              }
            }}
          />
        </label>
        {joinError ? (
          <div role="alert" style={ALERT}>
            {joinError}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
