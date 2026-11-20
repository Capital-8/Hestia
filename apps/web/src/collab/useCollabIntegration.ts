import { useEffect, useRef } from 'react';
import type { Id } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { useUi, type ViewKind } from '../editor/state.ts';
import { activateView } from '../editor/viewTabActions.ts';
import { collabManager, useCollab } from './session.ts';
import { parseCollabUrlParams } from './tokens.ts';

/**
 * Conecta o `collabManager` ao `editor.store`, processa convite na URL (`?collab=...&token=...`)
 * e publica mudanças de vista/seleção aos demais colaboradores.
 */
export function useCollabIntegration(view: ViewKind, levelId: Id, sectionId: Id | null): void {
  const collabMode = useCollab((s) => s.mode);
  const pendingCount = useCollab((s) => s.pendingRequests.length);
  const pendingFirstName = useCollab((s) => s.pendingRequests[0]?.name ?? '');
  const prevPendingRef = useRef(0);
  const sheetId = useUi((s) => s.sheetId);
  const selection = useUi((s) => s.selection);

  useEffect(() => {
    const detach = collabManager.attachStore(editor.store, {
      getProjectName: () => editor.project.name || editor.fileName,
      onLoadProject: (p) => {
        editor.load(p, `${p.name || 'colaborativo'}.hestia.json`);
        useUi.setState({ tela: 'editor' });
      },
      onStatus: (msg) => useUi.setState({ status: msg }),
      onFollowView: (p) => {
        if (p.view === 'plan') activateView({ kind: 'plan', levelId: p.levelId, planKind: 'floor' });
        else if (p.view === '3d') activateView({ kind: '3d' });
        else if (p.view === 'section' && p.sectionId) activateView({ kind: 'section', viewId: p.sectionId });
        else if (p.view === 'sheet' && p.sheetId) activateView({ kind: 'sheet', sheetId: p.sheetId });
      },
    });
    const invite = typeof window !== 'undefined' ? parseCollabUrlParams(window.location.search) : null;
    if (invite) {
      useUi.setState({ tela: 'editor' });
      void collabManager.joinSession({ roomId: invite.roomId, token: invite.token, wsEndpoint: invite.wsUrl }).then((ok) => {
        if (!ok) useUi.setState({ dialog: 'collab', dialogArg: 'join' });
      });
    }
    return detach;
  }, []);

  useEffect(() => {
    const prev = prevPendingRef.current;
    prevPendingRef.current = pendingCount;
    if (collabMode !== 'host') return;
    if (prev === 0 && pendingCount > 0) {
      const msg = pendingFirstName
        ? `${pendingFirstName} solicitando entrada (${pendingCount})`
        : `${pendingCount} solicitação(ões) de entrada pendente(s)`;
      useUi.setState((s) => ({
        status: msg,
        ...(s.dialog === null || s.dialog === 'collab' ? { dialog: 'collab', dialogArg: 'peers' } : {}),
      }));
    }
  }, [collabMode, pendingCount, pendingFirstName]);

  useEffect(() => {
    if (collabMode === 'off') return;
    collabManager.publishPresence({ view, levelId, sectionId, sheetId, selection });
  }, [collabMode, view, levelId, sectionId, sheetId, selection]);
}
