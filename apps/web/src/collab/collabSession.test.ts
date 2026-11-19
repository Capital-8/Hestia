import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import {
  buildEmailShareUrl,
  buildIpInviteCode,
  buildShareUrl,
  buildWhatsAppShareUrl,
  createShareToken,
  extractHostPort,
  parseCollabUrlParams,
  parseInviteInput,
  parseShareTokenRole,
  verifyShareToken,
} from './tokens.ts';
import { isDesktopRuntime, startDesktopCollabServer, stopDesktopCollabServer } from './desktopServer.ts';
import { createRoomTransport, InMemoryTransport, WebSocketTransport } from './transport.ts';
import { CollabManager } from './session.ts';

function wallCmd(id: string, x1 = 0, y1 = 0, x2 = 4, y2 = 0) {
  return {
    type: 'addWall' as const,
    wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: x1, y: y1 }, b: { x: x2, y: y2 } }),
  };
}

describe('Collaboration tokens and URL parsing', () => {
  it('creates, verifies, builds share URLs, and parses invite inputs', () => {
    const tokenRw = createShareToken('room_42', 'editor', 'secret_xyz');
    const tokenRo = createShareToken('room_42', 'viewer', 'secret_xyz');

    expect(tokenRw.startsWith('hc1_rw_room_42_')).toBe(true);
    expect(tokenRo.startsWith('hc1_ro_room_42_')).toBe(true);
    expect(parseShareTokenRole(tokenRw)).toBe('editor');
    expect(parseShareTokenRole(tokenRo)).toBe('viewer');
    expect(verifyShareToken(tokenRw, 'room_42', 'secret_xyz')).toEqual({ valid: true, role: 'editor' });
    expect(verifyShareToken(tokenRo, 'room_42', 'secret_xyz')).toEqual({ valid: true, role: 'viewer' });
    expect(verifyShareToken(tokenRw, 'room_42', 'wrong_secret')).toEqual({ valid: false });
    expect(verifyShareToken(tokenRw, 'other_room', 'secret_xyz')).toEqual({ valid: false });

    const shareUrl = buildShareUrl('https://hestia.bim/app', {
      roomId: 'room_42',
      token: tokenRw,
      wsUrl: 'wss://relay.hestia.bim/ws',
    });
    expect(parseCollabUrlParams(new URL(shareUrl).search)).toEqual({
      roomId: 'room_42',
      token: tokenRw,
      wsUrl: 'wss://relay.hestia.bim/ws',
    });
    expect(parseInviteInput(shareUrl)).toEqual({
      roomId: 'room_42',
      token: tokenRw,
      wsUrl: 'wss://relay.hestia.bim/ws',
    });
    expect(parseInviteInput(`room_42:${tokenRo}`)).toEqual({ roomId: 'room_42', token: tokenRo });
    expect(parseInviteInput(tokenRw)).toEqual({ roomId: 'room_42', token: tokenRw });

    const waUrl = buildWhatsAppShareUrl(shareUrl, 'Casa Modelo', 'editor');
    expect(waUrl.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(waUrl)).toContain('Casa Modelo');
    expect(decodeURIComponent(waUrl)).toContain(shareUrl);

    const mailUrl = buildEmailShareUrl(shareUrl, 'Casa Modelo', 'viewer');
    expect(mailUrl.startsWith('mailto:?subject=')).toBe(true);
    expect(decodeURIComponent(mailUrl)).toContain('Casa Modelo');
    expect(decodeURIComponent(mailUrl)).toContain(shareUrl);
  });

  it('builds and parses direct IP:port invite codes without any website', () => {
    const tokenRw = createShareToken('room_ip_1', 'editor', 'sec_ip');
    const tokenRo = createShareToken('room_ip_1', 'viewer', 'sec_ip');

    expect(extractHostPort('ws://192.168.1.15:41730')).toEqual({ host: '192.168.1.15', port: 41730 });
    expect(extractHostPort('wss://relay.hestia.bim/ws')).toEqual({ host: 'relay.hestia.bim' });

    const code = buildIpInviteCode({ host: '192.168.1.15', port: 41730, roomId: 'room_ip_1', token: tokenRw });
    expect(code).toBe(`192.168.1.15:41730:room_ip_1:${tokenRw}`);
    expect(buildIpInviteCode({ wsUrl: 'ws://192.168.1.15:41730', roomId: 'room_ip_1', token: tokenRw })).toBe(code);

    expect(parseInviteInput(code)).toEqual({
      roomId: 'room_ip_1',
      token: tokenRw,
      wsUrl: 'ws://192.168.1.15:41730',
    });
    expect(parseInviteInput(`hestia-ip://192.168.1.15:41730/room_ip_1/${tokenRo}`)).toEqual({
      roomId: 'room_ip_1',
      token: tokenRo,
      wsUrl: 'ws://192.168.1.15:41730',
    });
    expect(parseInviteInput(`ws://192.168.1.15:41730?collab=room_ip_1&token=${tokenRw}`)).toEqual({
      roomId: 'room_ip_1',
      token: tokenRw,
      wsUrl: 'ws://192.168.1.15:41730',
    });
    expect(parseInviteInput(`wss://relay.hestia.bim:8443?collab=room_ip_1&token=${tokenRo}`)).toEqual({
      roomId: 'room_ip_1',
      token: tokenRo,
      wsUrl: 'wss://relay.hestia.bim:8443',
    });

    const waCode = buildWhatsAppShareUrl(code, 'Obra LAN', 'editor');
    expect(decodeURIComponent(waCode)).toContain(code);
    const mailCode = buildEmailShareUrl(code, 'Obra LAN', 'viewer');
    expect(decodeURIComponent(mailCode)).toContain(code);
  });
});

describe('Collaboration multi-transport', () => {
  it('delivers to other room peers without echoing back to sender', () => {
    const tA = new InMemoryTransport('rm_t1');
    const tB = new InMemoryTransport('rm_t1');
    const tOther = new InMemoryTransport('rm_t2');
    const gotA: string[] = [];
    const gotB: string[] = [];
    const gotOther: string[] = [];

    tA.onMessage((m) => gotA.push(m.op));
    tB.onMessage((m) => gotB.push(m.op));
    tOther.onMessage((m) => gotOther.push(m.op));

    tA.send({ op: 'resync', peerId: 'p1' });
    expect(gotA).toEqual([]);
    expect(gotB).toEqual(['resync']);
    expect(gotOther).toEqual([]);

    tA.close();
    tB.close();
    tOther.close();
  });

  it('queues outgoing WebSocket messages while CONNECTING and flushes on open', () => {
    const sent: string[] = [];
    const origWs = globalThis.WebSocket;
    const sockets: MockWebSocket[] = [];
    class MockWebSocket {
      readyState = 0;
      onopen: (() => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor(public url: string) {
        sockets.push(this);
      }
      send(raw: string) { sent.push(raw); }
      close() { this.readyState = 3; }
    }
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    try {
      const statuses: string[] = [];
      const ws = new WebSocketTransport('rm_ws', 'wss://example.com/collab', {
        onStatus: (s) => statuses.push(s.state),
      });
      ws.send({ op: 'resync', peerId: 'p_ws' });
      expect(sent).toHaveLength(0);

      sockets[0]!.readyState = 1;
      sockets[0]!.onopen?.();
      expect(statuses).toEqual(['connecting', 'open']);
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0]!)).toEqual({ op: 'resync', peerId: 'p_ws' });
      ws.close();
    } finally {
      globalThis.WebSocket = origWs;
    }
  });
});

describe('CollabManager multi-peer session', () => {
  const managers: CollabManager[] = [];

  afterEach(() => {
    while (managers.length > 0) managers.pop()!.stopSession();
  });

  async function joinAndApprove(
    hostMgr: CollabManager,
    guestMgr: CollabManager,
    opts: { roomId: string; token: string; name: string },
    roleOverride?: 'viewer' | 'editor',
  ): Promise<boolean> {
    const pending = guestMgr.joinSession(opts);
    hostMgr.approveJoin(guestMgr.store.getState().myPeerId, roleOverride);
    return pending;
  }

  async function setupThreePeers() {
    const hostMgr = new CollabManager();
    const editorMgr = new CollabManager();
    const viewerMgr = new CollabManager();
    managers.push(hostMgr, editorMgr, viewerMgr);

    const hostStore = new ProjectStore(createEmptyProject('Projeto Collab'));
    const editorStore = new ProjectStore(createEmptyProject('Vazio'));
    const viewerStore = new ProjectStore(createEmptyProject('Vazio'));

    const hostStatuses: string[] = [];
    const editorStatuses: string[] = [];
    const viewerStatuses: string[] = [];

    hostMgr.attachStore(hostStore, { onStatus: (m) => hostStatuses.push(m) });
    editorMgr.attachStore(editorStore, { onStatus: (m) => editorStatuses.push(m) });
    viewerMgr.attachStore(viewerStore, { onStatus: (m) => viewerStatuses.push(m) });

    hostStore.exec(wallCmd('w_init', 0, 0, 5, 0), 'Parede inicial');
    hostMgr.startHosting({ hostName: 'Ana (Host)', roomId: 'rm_collab_1' });

    const { links, roomId } = hostMgr.store.getState();
    const viewerLink = links.find((l) => l.role === 'viewer')!;
    const editorLink = links.find((l) => l.role === 'editor')!;
    expect(viewerLink).toBeDefined();
    expect(editorLink).toBeDefined();

    const okEditor = await joinAndApprove(hostMgr, editorMgr, {
      roomId: roomId!, token: editorLink.token, name: 'Beto (Editor)',
    });
    const okViewer = await joinAndApprove(hostMgr, viewerMgr, {
      roomId: roomId!, token: viewerLink.token, name: 'Carla (Leitura)',
    });
    expect(okEditor).toBe(true);
    expect(okViewer).toBe(true);

    return {
      hostMgr, editorMgr, viewerMgr,
      hostStore, editorStore, viewerStore,
      viewerLink, editorLink,
      hostStatuses, editorStatuses, viewerStatuses,
    };
  }

  it('holds guest in waiting room until host approves, denies, or overrides role', async () => {
    const hostMgr = new CollabManager();
    const guestMgr = new CollabManager();
    const guest2Mgr = new CollabManager();
    managers.push(hostMgr, guestMgr, guest2Mgr);

    const hostStore = new ProjectStore(createEmptyProject('Projeto Sala Espera'));
    const guestStore = new ProjectStore(createEmptyProject('Vazio'));
    const guest2Store = new ProjectStore(createEmptyProject('Vazio'));
    hostMgr.attachStore(hostStore);
    guestMgr.attachStore(guestStore);
    guest2Mgr.attachStore(guest2Store);

    hostStore.exec(wallCmd('w_host_init', 0, 0, 5, 0), 'Parede inicial');
    hostMgr.startHosting({ hostName: 'Ana (Host)', roomId: 'rm_wait_1' });
    const { links, roomId } = hostMgr.store.getState();
    const editorLink = links.find((l) => l.role === 'editor')!;

    const joinPromise = guestMgr.joinSession({
      roomId: roomId!, token: editorLink.token, name: 'Davi (Aguardando)',
    });
    const guestPeerId = guestMgr.store.getState().myPeerId;
    expect(guestMgr.store.getState().approvalStatus).toBe('waiting');
    expect(hostMgr.store.getState().pendingRequests).toHaveLength(1);
    expect(hostMgr.store.getState().pendingRequests[0]?.peerId).toBe(guestPeerId);
    expect(guestStore.project.elements['w_host_init']).toBeUndefined();

    // While waiting, both exec and transaction are blocked locally and on host
    guestStore.exec(wallCmd('w_wait_exec', 0, 2, 4, 2), 'Bloqueada');
    guestStore.transaction('Criar parede', () => guestStore.exec(wallCmd('w_wait_tx', 0, 3, 4, 3)), {});
    expect(guestStore.project.elements['w_wait_exec']).toBeUndefined();
    expect(guestStore.project.elements['w_wait_tx']).toBeUndefined();
    expect(hostStore.project.elements['w_wait_exec']).toBeUndefined();
    expect(hostStore.project.elements['w_wait_tx']).toBeUndefined();

    // Host denies -> join resolves false, status becomes denied, still no project data
    hostMgr.denyJoin(guestPeerId);
    expect(await joinPromise).toBe(false);
    expect(guestMgr.store.getState().approvalStatus).toBe('denied');
    expect(hostMgr.store.getState().pendingRequests).toHaveLength(0);
    expect(guestStore.project.elements['w_host_init']).toBeUndefined();

    // Host can override an editor link to approve the guest as viewer
    const okOverride = await joinAndApprove(
      hostMgr,
      guest2Mgr,
      { roomId: roomId!, token: editorLink.token, name: 'Eva (Rebaixada)' },
      'viewer',
    );
    expect(okOverride).toBe(true);
    expect(guest2Mgr.store.getState().approvalStatus).toBe('approved');
    expect(guest2Mgr.store.getState().myRole).toBe('viewer');
    expect(guest2Store.project.elements['w_host_init']).toBeDefined();
    guest2Store.exec(wallCmd('w_override_blocked', 0, 4, 4, 4), 'Bloqueada');
    expect(hostStore.project.elements['w_override_blocked']).toBeUndefined();
    expect(guest2Mgr.store.getState().lastError).toBe('read_only');
  });

  it('enforces read-only viewer mode for live host walls, exec, and transaction', async () => {
    const {
      viewerMgr, hostStore, viewerStore,
    } = await setupThreePeers();

    expect(viewerStore.project.elements['w_init']).toBeDefined();
    hostStore.exec(wallCmd('w_host_live', 0, 2, 6, 2), 'Parede ao vivo');
    expect(viewerStore.project.elements['w_host_live']).toBeDefined();

    viewerStore.exec(wallCmd('w_viewer_exec', 0, 3, 4, 3), 'Bloqueada exec');
    viewerStore.transaction('Criar parede', () => viewerStore.exec(wallCmd('w_viewer_tx', 0, 4, 4, 4)), {});
    expect(viewerStore.project.elements['w_viewer_exec']).toBeUndefined();
    expect(viewerStore.project.elements['w_viewer_tx']).toBeUndefined();
    expect(hostStore.project.elements['w_viewer_exec']).toBeUndefined();
    expect(hostStore.project.elements['w_viewer_tx']).toBeUndefined();
    expect(viewerMgr.store.getState().lastError).toBe('read_only');
  });

  it('syncs editor WallTool transaction across all 3 stores and preserves it on requestSync', async () => {
    const {
      editorMgr, hostStore, editorStore, viewerStore,
    } = await setupThreePeers();

    const wall = makeWall({ id: 'w_walltool', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 5 }, b: { x: 6, y: 5 } });
    editorStore.transaction('Criar parede', () => {
      editorStore.exec({ type: 'addWall', wall });
    }, {});

    expect(hostStore.project.elements['w_walltool']).toBeDefined();
    expect(editorStore.project.elements['w_walltool']).toBeDefined();
    expect(viewerStore.project.elements['w_walltool']).toBeDefined();

    editorMgr.requestSync();

    expect(hostStore.project.elements['w_walltool']).toBeDefined();
    expect(editorStore.project.elements['w_walltool']).toBeDefined();
    expect(viewerStore.project.elements['w_walltool']).toBeDefined();
  });

  it('syncs initial snapshot, enforces viewer read-only, and propagates editor deltas', async () => {
    const {
      hostMgr, editorMgr, viewerMgr,
      hostStore, editorStore, viewerStore,
    } = await setupThreePeers();

    expect(Object.keys(editorStore.project.elements)).toEqual(['w_init']);
    expect(Object.keys(viewerStore.project.elements)).toEqual(['w_init']);
    expect(hostMgr.store.getState().peers).toHaveLength(3);

    // Viewer exec is blocked by collabInterceptor
    viewerStore.exec(wallCmd('w_viewer_blocked', 0, 2, 4, 2), 'Parede leitura');
    expect(viewerStore.project.elements['w_viewer_blocked']).toBeUndefined();
    expect(hostStore.project.elements['w_viewer_blocked']).toBeUndefined();
    expect(viewerMgr.store.getState().lastError).toBe('read_only');

    // Even a malicious exec packet from viewer over transport is rejected by Host
    const rogueTransport = createRoomTransport('rm_collab_1');
    const rejections: string[] = [];
    rogueTransport.onMessage((m) => {
      if (m.op === 'rejected' && m.targetPeerId === viewerMgr.store.getState().myPeerId) {
        rejections.push(m.reason);
      }
    });
    rogueTransport.send({
      op: 'exec',
      reqId: 'req_malicious',
      peerId: viewerMgr.store.getState().myPeerId,
      label: 'Malicious',
      commands: [wallCmd('w_malicious', 1, 1, 3, 1)],
    });
    rogueTransport.close();
    expect(rejections).toContain('read_only');
    expect(hostStore.project.elements['w_malicious']).toBeUndefined();

    // Editor exec propagates through Host to all 3 stores
    editorStore.exec(wallCmd('w_editor_1', 0, 4, 6, 4), 'Parede Editor');
    expect(hostStore.project.elements['w_editor_1']).toBeDefined();
    expect(editorStore.project.elements['w_editor_1']).toBeDefined();
    expect(viewerStore.project.elements['w_editor_1']).toBeDefined();
    expect(editorMgr.store.getState().activity.at(-1)?.authorName).toBe('Beto (Editor)');
  });

  it('updates editor role live to viewer via link update and blocks further edits', async () => {
    const { hostMgr, editorMgr, editorStore, hostStore, editorLink } = await setupThreePeers();

    hostMgr.updateLinkRole(editorLink.id, 'viewer');
    expect(editorMgr.store.getState().myRole).toBe('viewer');

    editorStore.exec(wallCmd('w_after_demote', 0, 6, 4, 6), 'Parede bloqueada');
    expect(editorStore.project.elements['w_after_demote']).toBeUndefined();
    expect(hostStore.project.elements['w_after_demote']).toBeUndefined();
  });

  it('enforces soft-lock when host selects an element', async () => {
    const { hostMgr, editorMgr, editorStore, hostStore, editorStatuses } = await setupThreePeers();

    hostMgr.publishPresence({ view: 'plan', levelId: 'lv_0', selection: ['w_init'] });
    expect(editorMgr.isElementLockedByOther('w_init')?.id).toBe(hostMgr.store.getState().myPeerId);

    editorStore.exec({ type: 'updateElements', ids: ['w_init'], patch: { height: 3.5 } }, 'Alterar altura');
    expect(hostStore.project.elements['w_init']?.kind === 'wall' && hostStore.project.elements['w_init'].height).toBe(2.8);
    expect(editorMgr.store.getState().lastError).toBe('locked_element');
    expect(editorStatuses.some((s) => s.includes('Ana (Host)'))).toBe(true);
  });

  it('supports author-isolated undo and detects conflict when another author modifies same element', async () => {
    const {
      editorMgr,
      hostStore, editorStore, viewerStore,
    } = await setupThreePeers();

    hostStore.exec(wallCmd('w_host_a', 0, 1, 3, 1), 'Parede Host');
    editorStore.exec(wallCmd('w_editor_a', 0, 3, 3, 3), 'Parede Editor');

    expect(hostStore.project.elements['w_host_a']).toBeDefined();
    expect(hostStore.project.elements['w_editor_a']).toBeDefined();

    // Editor undoes only Editor's wall; Host's wall remains across all 3 stores
    editorMgr.undo();
    expect(hostStore.project.elements['w_editor_a']).toBeUndefined();
    expect(editorStore.project.elements['w_editor_a']).toBeUndefined();
    expect(viewerStore.project.elements['w_editor_a']).toBeUndefined();
    expect(hostStore.project.elements['w_host_a']).toBeDefined();
    expect(editorStore.project.elements['w_host_a']).toBeDefined();

    // Editor creates another wall, then Host edits that same wall -> Editor undo fails with conflict naming Host
    editorStore.exec(wallCmd('w_shared', 1, 0, 1, 4), 'Parede Compartilhada');
    expect(hostStore.project.elements['w_shared']).toBeDefined();

    hostStore.exec({ type: 'updateElements', ids: ['w_shared'], patch: { height: 4.0 } }, 'Altura Host');
    editorMgr.undo();

    expect(hostStore.project.elements['w_shared']).toBeDefined();
    expect(editorMgr.store.getState().lastConflict?.author).toBe('Ana (Host)');
  });

  it('returns direct IP invite code from getShareUrl when wsEndpoint is set and boots Tauri desktop server', async () => {
    const hostMgr = new CollabManager();
    managers.push(hostMgr);
    const hostStore = new ProjectStore(createEmptyProject('Projeto IP Direto'));
    hostMgr.attachStore(hostStore);

    hostMgr.startHosting({ hostName: 'Ana (LAN)', roomId: 'rm_lan_1', wsEndpoint: 'ws://192.168.1.15:41730' });
    const link = hostMgr.store.getState().links.find((l) => l.role === 'editor')!;
    const shareCode = hostMgr.getShareUrl(link);
    expect(shareCode).toBe(`192.168.1.15:41730:rm_lan_1:${link.token}`);
    expect(parseInviteInput(shareCode)).toEqual({
      roomId: 'rm_lan_1',
      token: link.token,
      wsUrl: 'ws://192.168.1.15:41730',
    });
    hostMgr.stopSession();

    const g = globalThis as { __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<unknown> } } };
    const origTauri = g.__TAURI__;
    const origWs = globalThis.WebSocket;
    const invoked: string[] = [];
    const openedUrls: string[] = [];

    class MockWs {
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((ev: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      constructor(url: string) { openedUrls.push(url); }
      send() { /* noop */ }
      close() { this.readyState = 3; }
    }

    expect(isDesktopRuntime()).toBe(false);
    expect(await startDesktopCollabServer()).toBeNull();
    await stopDesktopCollabServer();

    g.__TAURI__ = {
      core: {
        invoke: async (cmd: string) => {
          invoked.push(cmd);
          if (cmd === 'collab_iniciar_servidor') {
            return {
              port: 41730,
              lanIp: '192.168.1.15',
              wsUrl: 'ws://192.168.1.15:41730',
              localWsUrl: 'ws://127.0.0.1:41730',
            };
          }
          return null;
        },
      },
    };
    globalThis.WebSocket = MockWs as unknown as typeof WebSocket;

    try {
      expect(isDesktopRuntime()).toBe(true);
      const desktopHost = new CollabManager();
      managers.push(desktopHost);
      desktopHost.attachStore(hostStore);
      desktopHost.startHosting({ hostName: 'Desktop Host', roomId: 'rm_tauri_1' });

      await Promise.resolve();
      await Promise.resolve();

      expect(invoked).toContain('collab_iniciar_servidor');
      expect(desktopHost.store.getState().wsEndpoint).toBe('ws://192.168.1.15:41730');
      expect(openedUrls.some((u) => u.startsWith('ws://127.0.0.1:41730') && u.includes('room=rm_tauri_1'))).toBe(true);

      const desktopLink = desktopHost.store.getState().links.find((l) => l.role === 'viewer')!;
      const desktopCode = desktopHost.getShareUrl(desktopLink);
      expect(desktopCode).toBe(`192.168.1.15:41730:rm_tauri_1:${desktopLink.token}`);
      expect(desktopCode).not.toContain('tauri://');

      desktopHost.stopSession();
      await Promise.resolve();
      expect(invoked).toContain('collab_parar_servidor');
    } finally {
      g.__TAURI__ = origTauri;
      globalThis.WebSocket = origWs;
    }
  });
});
