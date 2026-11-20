import type { StoreApi, UseBoundStore } from 'zustand';
import {
  ProjectStore, newId, type CollabDeltaMeta, type CollabLinkRole, type CollabPeer,
  type CollabPresence, type CollabUndoResult, type CollabWireMessage, type Command, type Project, type ShareLinkConfig,
} from '@hestia/model';
import { isDesktopRuntime, isTauriLocation, startDesktopCollabServer, stopDesktopCollabServer } from './desktopServer.ts';
import { buildIpInviteCode, buildShareUrl, createShareToken, extractHostPort } from './tokens.ts';
import { createRoomTransport, type CollabTransport, type TransportStatus } from './transport.ts';
import { createP2pController, type P2pController, type P2pFactory } from './p2p.ts';
import {
  appendActivity, applyLinkRoleUpdate, buildLinkConfig, collectCommandTargetIds, collectLockedElements, createCollabStore,
  defaultLabel, findLockingPeer, makeActivityItem, makeDefaultLinkConfigs, makeGuestJoinState, makeHostStartState,
  makeResetState, makeSecret, pickPeerColor, removePendingRequest, toJsonSafe, upsertPendingRequest, validateHelloLink,
  type CollabCallbacks, type CollabState,
} from './sessionHelpers.ts';

export { createCollabStore, type CollabCallbacks, type CollabP2pInvite, type CollabPendingRequest, type CollabState } from './sessionHelpers.ts';

const PRESENCE_THROTTLE_MS = 66; const JOIN_TIMEOUT_MS = 5000;
/** Manages a real-time collaboration session (Host or Guest) wired to a `ProjectStore`. */
export class CollabManager {
  readonly store: UseBoundStore<StoreApi<CollabState>> = createCollabStore();
  private projectStore: ProjectStore | null = null;
  private callbacks: CollabCallbacks = {};
  private transport: CollabTransport | null = null;
  private unsubTransport: (() => void) | null = null;
  private roomSecret = '';
  private seq = 0;
  private applyingRemoteOrGuest = false;
  private desktopServerActive = false;
  private pendingJoin: { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> | null } | null = null;
  private lastPresenceSentAt = 0;
  private lastSelectionKey = '';
  private pendingPresence: CollabPresence | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly p2p: P2pController;
  constructor(p2pFactory?: P2pFactory) {
    this.p2p = createP2pController(this.store, { startHosting: (o) => this.startHosting(o), createLink: (r, l) => this.createLink(r, l), joinSession: (o) => this.joinSession(o), stopSession: (k) => this.stopSession(k) }, p2pFactory);
  }
  startHostingP2p(hostName?: string): void { this.p2p.startHosting(hostName); }
  createP2pInvite(role: CollabLinkRole, label?: string): ReturnType<P2pController['createInvite']> { return this.p2p.createInvite(role, label); }
  acceptP2pAnswer(inviteId: string, answerCode: string): Promise<boolean> { return this.p2p.acceptAnswer(inviteId, answerCode); }
  joinSessionP2p(offerCode: string, name?: string): Promise<string | null> { return this.p2p.join(offerCode, name); }
  private get s(): CollabState { return this.store.getState(); }
  private set(patch: Partial<CollabState>): void { this.store.setState(patch); }

  attachStore(store: ProjectStore, callbacks?: CollabCallbacks): () => void {
    this.projectStore = store; this.callbacks = callbacks ?? {};
    store.setAuthor(this.s.myPeerId, this.s.myName);
    if (this.s.mode !== 'off') this.installHooks(this.s.mode === 'host');
    return () => {
      if (this.projectStore !== store) return;
      store.collabInterceptor = null; store.onDelta = null; this.projectStore = null; this.callbacks = {};
    };
  }
  setMyName(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { myPeerId, mode, peers } = this.s;
    const updatedPeers = peers.map((p) => (p.id === myPeerId ? { ...p, name: trimmed } : p));
    this.set({ myName: trimmed, peers: updatedPeers, ...(mode === 'host' ? { hostName: trimmed } : {}) });
    this.projectStore?.setAuthor(myPeerId, trimmed);
    if (mode === 'host') this.transport?.send({ op: 'peers', peers: updatedPeers });
  }
  setWsEndpoint(wsEndpoint: string): void { this.set({ wsEndpoint: wsEndpoint.trim() }); }
  startHosting(options?: { hostName?: string; wsEndpoint?: string; roomId?: string; transport?: CollabTransport }): void {
    if (this.s.mode !== 'off') this.stopSession();
    const roomId = options?.roomId?.trim() || newId('room');
    const hostName = options?.hostName?.trim() || this.s.myName || 'Anfitrião';
    const explicitWs = options?.wsEndpoint?.trim();
    const wsEndpoint = explicitWs ?? this.s.wsEndpoint;
    this.roomSecret = makeSecret(); this.seq = 0;
    this.set(makeHostStartState(this.s.myPeerId, hostName, roomId, wsEndpoint, this.roomSecret, Date.now()));
    this.openTransport(roomId, wsEndpoint, (msg) => this.handleHostMessage(msg), options?.transport);
    this.installHooks(true);
    if (!explicitWs && !wsEndpoint && !options?.transport && isDesktopRuntime()) void this.bootDesktopServer(roomId);
  }
  createLink(role: CollabLinkRole, label?: string): ShareLinkConfig | null {
    if (this.s.mode !== 'host' || !this.s.roomId) return null;
    const link = buildLinkConfig(this.s.roomId, role, label?.trim() || defaultLabel(role), this.roomSecret, Date.now());
    this.set({ links: [...this.s.links, link] });
    return link;
  }
  updateLinkRole(linkId: string, role: CollabLinkRole): void {
    if (this.s.mode !== 'host' || !this.s.roomId) return;
    const res = applyLinkRoleUpdate(this.s, this.s.roomId, this.roomSecret, linkId, role);
    if (!res) return;
    this.set({ links: res.links, peers: res.peers, pendingRequests: res.pendingRequests });
    this.broadcastRoleUpdates(res.affectedIds, role, res.peers);
  }
  revokeLink(linkId: string): void {
    if (this.s.mode !== 'host') return;
    this.set({ links: this.s.links.map((lnk) => (lnk.id === linkId ? { ...lnk, revoked: true } : lnk)) });
    this.kickPeersWhere((p) => p.linkId === linkId && p.role !== 'host', 'revoked');
  }
  getShareUrl(link: ShareLinkConfig): string {
    const ws = this.s.wsEndpoint.trim();
    const inTauri = isDesktopRuntime() || isTauriLocation();
    if (ws) {
      const parsed = extractHostPort(ws);
      if (parsed) return buildIpInviteCode({ host: parsed.host, port: parsed.port, roomId: link.roomId, token: link.token });
    }
    if (inTauri) return `${link.roomId}:${link.token}`;
    const loc = globalThis.location;
    const baseUrl = loc?.origin ? `${loc.origin}${loc.pathname}` : 'https://hestia.app/';
    return buildShareUrl(baseUrl, { roomId: link.roomId, token: link.token, wsUrl: ws || undefined });
  }
  setPeerRole(peerId: string, role: CollabLinkRole): void {
    const { mode, peers, myPeerId } = this.s;
    if (mode !== 'host' || peerId === myPeerId || !peers.some((p) => p.id === peerId)) return;
    const nextPeers = peers.map((p) => (p.id === peerId ? { ...p, role } : p));
    this.set({ peers: nextPeers }); this.broadcastRoleUpdates([peerId], role, nextPeers);
  }
  kickPeer(peerId: string): void {
    if (this.s.mode === 'host' && peerId !== this.s.myPeerId) this.kickPeersWhere((p) => p.id === peerId, 'removed_by_host');
  }
  approveJoin(peerId: string, roleOverride?: CollabLinkRole): void {
    if (this.s.mode !== 'host' || !this.projectStore) return;
    const req = this.s.pendingRequests.find((r) => r.peerId === peerId);
    if (!req) return;
    const role = roleOverride ?? req.requestedRole;
    const peer: CollabPeer = { id: req.peerId, name: req.name, color: pickPeerColor(this.s.peers), role, linkId: req.linkId, joinedAt: Date.now(), presence: null };
    const nextPeers = [...this.s.peers.filter((p) => p.id !== peerId), peer];
    this.set({ pendingRequests: removePendingRequest(this.s.pendingRequests, peerId), peers: nextPeers });
    this.sendWelcome(peer, role, nextPeers);
  }
  denyJoin(peerId: string, reason = 'denied_by_host'): void {
    if (this.s.mode !== 'host') return;
    this.set({ pendingRequests: removePendingRequest(this.s.pendingRequests, peerId) });
    this.transport?.send({ op: 'join_denied', peerId, reason });
  }

  handOverHost(targetPeerId: string): void {
    const { mode, peers, myPeerId, roomId } = this.s;
    const target = peers.find((p) => p.id === targetPeerId);
    if (mode !== 'host' || !roomId || targetPeerId === myPeerId || !target) return;
    const nextPeers: CollabPeer[] = peers.map((p) => (p.id === targetPeerId ? { ...p, role: 'host' } : p.id === myPeerId ? { ...p, role: 'editor' } : p));
    this.transport?.send({ op: 'peers', peers: nextPeers });
    this.transport?.send({ op: 'handover', newHostId: target.id, newHostName: target.name, roomId, token: createShareToken(roomId, 'editor', this.roomSecret) });
    this.set({ mode: 'guest', myRole: 'editor', hostName: target.name, peers: nextPeers, links: [], pendingRequests: [], approvalStatus: 'approved' });
    this.switchTransportListener((msg) => this.handleGuestMessage(msg));
    this.installHooks(false);
  }

  joinSession(opts: { roomId: string; token: string; name?: string; wsEndpoint?: string; transport?: CollabTransport; waitFor?: (go: () => void) => void }): Promise<boolean> {
    if (this.s.mode !== 'off') this.stopSession();
    const roomId = opts.roomId.trim();
    const name = opts.name?.trim() || this.s.myName || 'Convidado';
    const wsEndpoint = opts.wsEndpoint?.trim() ?? this.s.wsEndpoint;
    this.seq = 0;
    this.set(makeGuestJoinState(roomId, name, wsEndpoint));
    this.installHooks(false);
    this.openTransport(roomId, wsEndpoint, (msg) => this.handleGuestMessage(msg), opts.transport);
    const p = new Promise<boolean>((resolve) => {
      this.pendingJoin = { resolve, timer: null };
      const go = (): void => {
        if (!this.pendingJoin || this.pendingJoin.resolve !== resolve) return;
        this.pendingJoin.timer = setTimeout(() => {
          if (!this.pendingJoin) return;
          this.pendingJoin = null; this.set({ lastError: 'timeout', syncStatus: 'error' }); this.stopSession(true); resolve(false);
        }, JOIN_TIMEOUT_MS);
        this.transport?.send({ op: 'hello', peerId: this.s.myPeerId, name, token: opts.token, roomId });
      };
      if (opts.waitFor) opts.waitFor(go); else go();
    });
    return p;
  }

  stopSession(preserveError = false): void {
    this.resolveJoin(false);
    if (this.presenceTimer) { clearTimeout(this.presenceTimer); this.presenceTimer = null; }
    this.pendingPresence = null;
    if (this.s.mode === 'host') {
      this.transport?.send({ op: 'ended', reason: 'host_closed' });
      if (isDesktopRuntime()) void stopDesktopCollabServer();
    }
    const clearDesktopWs = this.desktopServerActive;
    this.desktopServerActive = false;
    this.unsubTransport?.(); this.unsubTransport = null;
    this.transport?.close(); this.transport = null;
    if (this.projectStore) { this.projectStore.collabInterceptor = null; this.projectStore.onDelta = null; }
    this.roomSecret = ''; this.seq = 0;
    this.set({ ...makeResetState(preserveError, this.s), ...(clearDesktopWs ? { wsEndpoint: '' } : {}) });
  }

  requestSync(): void { if (this.s.mode === 'guest') this.transport?.send({ op: 'resync', peerId: this.s.myPeerId }); }
  undo(): void { this.applyAuthorHistory('undo'); }
  redo(): void { this.applyAuthorHistory('redo'); }

  publishPresence(presence: Omit<CollabPresence, 'updatedAt'>): void {
    if (this.s.mode === 'off') return;
    const stamped: CollabPresence = { ...presence, updatedAt: Date.now() };
    this.set({ peers: this.s.peers.map((p) => (p.id === this.s.myPeerId ? { ...p, presence: stamped } : p)) });
    const selKey = stamped.selection.join('|');
    const elapsed = Date.now() - this.lastPresenceSentAt;
    if (selKey !== this.lastSelectionKey || elapsed >= PRESENCE_THROTTLE_MS) return this.flushPresence(stamped, selKey);
    this.pendingPresence = stamped;
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      const next = this.pendingPresence;
      this.pendingPresence = null;
      if (next) this.flushPresence(next, next.selection.join('|'));
    }, PRESENCE_THROTTLE_MS - elapsed);
  }

  followPeer(peerId: string | null): void {
    this.set({ followingPeerId: peerId });
    const peer = peerId ? this.s.peers.find((p) => p.id === peerId) : null;
    if (peer?.presence) this.callbacks.onFollowView?.(peer.presence);
  }

  isElementLockedByOther(elementId: string): CollabPeer | null {
    return this.s.peers.find((p) => p.id !== this.s.myPeerId && p.presence?.selection.includes(elementId)) ?? null;
  }

  getAllLockedElements(): Array<{ elementId: string; peer: CollabPeer }> { return collectLockedElements(this.s.peers, this.s.myPeerId); }

  private async bootDesktopServer(roomId: string): Promise<void> {
    const info = await startDesktopCollabServer();
    if (!info) return;
    if (this.s.mode !== 'host' || this.s.roomId !== roomId) { if (this.s.mode === 'off') void stopDesktopCollabServer(); return; }
    this.desktopServerActive = true; this.set({ wsEndpoint: info.wsUrl });
    this.openTransport(roomId, info.localWsUrl, (msg) => this.handleHostMessage(msg));
  }
  private sendWelcome(peer: CollabPeer, role: CollabLinkRole, nextPeers: CollabPeer[]): void {
    if (!this.projectStore) return;
    this.transport?.send({ op: 'welcome', peerId: peer.id, role, color: peer.color, project: toJsonSafe(this.projectStore.project), seq: this.seq, peers: nextPeers, activity: this.s.activity, hostId: this.s.myPeerId, hostName: this.s.myName });
    this.transport?.send({ op: 'peers', peers: nextPeers });
  }
  private kickPeersWhere(pred: (p: CollabPeer) => boolean, reason: string): void {
    const kickedIds: string[] = [];
    const nextPeers = this.s.peers.filter((p) => (pred(p) ? (kickedIds.push(p.id), false) : true));
    if (kickedIds.length === 0) return;
    this.set({ peers: nextPeers });
    for (const peerId of kickedIds) this.transport?.send({ op: 'kicked', peerId, reason });
    this.transport?.send({ op: 'peers', peers: nextPeers });
  }
  private broadcastRoleUpdates(peerIds: string[], role: CollabLinkRole, peers: CollabPeer[]): void {
    for (const peerId of peerIds) this.transport?.send({ op: 'role_changed', peerId, role });
    if (peerIds.length > 0) this.transport?.send({ op: 'peers', peers });
  }
  private openTransport(roomId: string, wsEndpoint: string, onMsg: (msg: CollabWireMessage) => void, custom?: CollabTransport): void {
    this.unsubTransport?.(); this.transport?.close();
    this.transport = custom ?? createRoomTransport(roomId, wsEndpoint || undefined, { onStatus: (st) => this.handleTransportStatus(st) });
    this.unsubTransport = this.transport.onMessage(onMsg);
  }
  private switchTransportListener(onMsg: (msg: CollabWireMessage) => void): void {
    this.unsubTransport?.(); this.unsubTransport = this.transport ? this.transport.onMessage(onMsg) : null;
  }
  private handleTransportStatus(status: TransportStatus): void {
    if (this.s.mode === 'off') return;
    if (status.state === 'open') this.set({ syncStatus: 'synced', lastError: null });
    else if (status.state === 'connecting') this.set({ syncStatus: 'reconnecting' });
    else if (status.state === 'error') this.set({ syncStatus: 'error', lastError: status.error ?? 'transport_error' });
  }
  private installHooks(asHost: boolean): void {
    if (!this.projectStore) return;
    this.projectStore.setAuthor(this.s.myPeerId, this.s.myName);
    this.projectStore.collabInterceptor = asHost ? null : (cmds, label) => this.interceptGuestExec(cmds, label);
    this.projectStore.onDelta = asHost ? (meta) => { if (!this.applyingRemoteOrGuest && this.s.mode === 'host') this.emitDelta(this.s.myPeerId, meta.authorName || this.s.myName, this.s.myColor, meta); } : null;
  }
  private interceptGuestExec(cmds: Command[], label: string): boolean {
    if (this.s.mode !== 'guest') return false;
    if (this.s.approvalStatus !== 'approved') return true;
    if (this.s.myRole === 'viewer') { this.set({ lastError: 'read_only' }); this.callbacks.onStatus?.('Modo somente leitura: edição bloqueada.'); return true; }
    const locked = findLockingPeer(this.s.peers, this.s.myPeerId, collectCommandTargetIds(cmds));
    if (locked) {
      const message = `Elemento em edição por ${locked.peer.name}`;
      this.set({ lastError: 'locked_element', lastConflict: { author: locked.peer.name, ids: [locked.elementId], message } });
      this.callbacks.onStatus?.(message); return true;
    }
    this.transport?.send({ op: 'exec', reqId: newId('req'), peerId: this.s.myPeerId, label, commands: toJsonSafe(cmds) }); return true;
  }
  private emitDelta(authorId: string, authorName: string, authorColor: string, meta: Omit<CollabDeltaMeta, 'authorId' | 'authorName'>): void {
    const seq = (this.seq += 1); const touchedIds = [...meta.touchedIds];
    this.set({ activity: appendActivity(this.s.activity, makeActivityItem(seq, authorId, authorName, authorColor, meta.label, touchedIds)), lastConflict: null });
    this.transport?.send({ op: 'delta', seq, authorId, authorName, authorColor, label: meta.label, patches: toJsonSafe(meta.patches), inverse: toJsonSafe(meta.inverse), touchedIds });
  }
  private runAuthorHistory(kind: 'undo' | 'redo', peerId: string, name: string, color: string): CollabUndoResult | null {
    if (!this.projectStore) return null;
    this.applyingRemoteOrGuest = true;
    const res = kind === 'undo' ? this.projectStore.undoByAuthor(peerId) : this.projectStore.redoByAuthor(peerId);
    this.applyingRemoteOrGuest = false;
    if (res.ok) this.emitDelta(peerId, name, color, res);
    return res;
  }
  private applyAuthorHistory(kind: 'undo' | 'redo'): void {
    if (this.s.mode === 'off') return;
    if (this.s.mode === 'guest') {
      if (this.s.approvalStatus !== 'approved') return;
      if (this.s.myRole === 'viewer') { this.set({ lastError: 'read_only' }); this.callbacks.onStatus?.('Modo somente leitura.'); return; }
      return void this.transport?.send({ op: kind, reqId: newId('req'), peerId: this.s.myPeerId });
    }
    const res = this.runAuthorHistory(kind, this.s.myPeerId, this.s.myName, this.s.myColor);
    if (res && !res.ok && res.reason === 'conflict') {
      const author = res.conflictAuthor ?? 'outro colaborador';
      const message = `Conflito ao ${kind === 'undo' ? 'desfazer' : 'refazer'}: alterado por ${author}`;
      this.set({ lastError: 'conflict', lastConflict: { author, ids: res.conflictIds ?? [], message } }); this.callbacks.onStatus?.(message);
    }
  }
  private flushPresence(presence: CollabPresence, selectionKey: string): void {
    this.lastPresenceSentAt = Date.now(); this.lastSelectionKey = selectionKey;
    this.transport?.send({ op: 'presence', peerId: this.s.myPeerId, presence });
  }

  private handleHostMessage(msg: CollabWireMessage): void {
    if (this.s.mode !== 'host' || !this.s.roomId) return;
    if (msg.op === 'hello') return this.handleHostHello(msg);
    if (msg.op === 'exec') return this.handleHostExec(msg);
    if (msg.op === 'undo' || msg.op === 'redo') {
      const peer = this.s.peers.find((p) => p.id === msg.peerId);
      if (!peer || peer.role === 'viewer') return void this.transport?.send({ op: 'ack', reqId: msg.reqId, peerId: msg.peerId, ok: false, error: 'read_only' });
      const res = this.runAuthorHistory(msg.op, peer.id, peer.name, peer.color);
      if (res) this.transport?.send(res.ok ? { op: 'ack', reqId: msg.reqId, peerId: msg.peerId, ok: true } : { op: 'ack', reqId: msg.reqId, peerId: msg.peerId, ok: false, error: res.reason, conflictAuthor: res.conflictAuthor, conflictIds: res.conflictIds });
    } else if (msg.op === 'presence') { this.updatePeerPresence(msg.peerId, msg.presence); this.transport?.send(msg); }
    else if (msg.op === 'resync' && this.projectStore && this.s.peers.some((p) => p.id === msg.peerId)) this.transport?.send({ op: 'snapshot', seq: this.seq, project: toJsonSafe(this.projectStore.project) });
  }

  private handleHostHello(msg: Extract<CollabWireMessage, { op: 'hello' }>): void {
    if (!this.s.roomId || !this.projectStore) return;
    const check = validateHelloLink(this.s.roomId, this.roomSecret, this.s.links, msg.roomId, msg.token);
    if (!check) return;
    if (!check.ok) return void this.transport?.send({ op: 'rejected', targetPeerId: msg.peerId, reason: check.reason });
    const { link } = check; const guestName = msg.name.trim() || 'Convidado';
    const existing = this.s.peers.find((p) => p.id === msg.peerId);
    if (existing) {
      const peer: CollabPeer = { ...existing, name: guestName, role: existing.role === 'host' ? 'host' : link.role, linkId: link.id };
      const nextPeers = this.s.peers.map((p) => (p.id === msg.peerId ? peer : p));
      this.set({ peers: nextPeers }); return this.sendWelcome(peer, peer.role === 'host' ? 'editor' : peer.role, nextPeers);
    }
    this.set({ pendingRequests: upsertPendingRequest(this.s.pendingRequests, { peerId: msg.peerId, name: guestName, linkId: link.id, requestedRole: link.role, requestedAt: Date.now() }) });
    this.transport?.send({ op: 'join_pending', peerId: msg.peerId, hostName: this.s.myName, requestedRole: link.role });
    this.callbacks.onStatus?.(`${guestName} solicitando entrada na sessão.`);
  }

  private handleHostExec(msg: Extract<CollabWireMessage, { op: 'exec' }>): void {
    const peer = this.s.peers.find((p) => p.id === msg.peerId);
    if (!peer || peer.role === 'viewer') return this.denyPeerExec(msg.reqId, msg.peerId, 'read_only');
    const locked = findLockingPeer(this.s.peers, peer.id, collectCommandTargetIds(msg.commands));
    if (locked) return this.denyPeerExec(msg.reqId, msg.peerId, 'locked_element', locked.peer.name, [locked.elementId]);
    if (!this.projectStore) return;
    this.applyingRemoteOrGuest = true;
    let meta: CollabDeltaMeta | null = null;
    try { meta = this.projectStore.execAsAuthor(peer.id, peer.name, msg.commands, msg.label); } finally { this.applyingRemoteOrGuest = false; }
    if (meta) this.emitDelta(peer.id, peer.name, peer.color, meta);
    this.transport?.send({ op: 'ack', reqId: msg.reqId, peerId: msg.peerId, ok: true });
  }

  private denyPeerExec(reqId: string, peerId: string, reason: 'read_only' | 'locked_element', conflictAuthor?: string, conflictIds?: string[]): void {
    this.transport?.send({ op: 'ack', reqId, peerId, ok: false, error: reason, conflictAuthor, conflictIds });
    this.transport?.send({ op: 'rejected', targetPeerId: peerId, reason, detail: conflictAuthor });
  }

  private handleGuestMessage(msg: CollabWireMessage): void {
    if (msg.op === 'join_pending' && msg.peerId === this.s.myPeerId) {
      if (this.pendingJoin?.timer) { clearTimeout(this.pendingJoin.timer); this.pendingJoin.timer = null; }
      this.set({ hostName: msg.hostName, approvalStatus: 'waiting', syncStatus: 'syncing' });
      this.callbacks.onStatus?.(`Aguardando aprovação de ${msg.hostName}...`);
    } else if (msg.op === 'join_denied' && msg.peerId === this.s.myPeerId) {
      this.set({ approvalStatus: 'denied', lastError: msg.reason ?? 'denied_by_host', syncStatus: 'error' });
      this.callbacks.onStatus?.('Entrada recusada pelo anfitrião.'); this.resolveJoin(false); this.stopSession(true);
    } else if (msg.op === 'welcome' && msg.peerId === this.s.myPeerId) {
      this.seq = msg.seq;
      this.set({ approvalStatus: 'approved', myRole: msg.role, myColor: msg.color, hostName: msg.hostName, peers: msg.peers, activity: msg.activity, syncStatus: 'synced', lastError: null });
      this.loadProject(msg.project); this.installHooks(false); this.resolveJoin(true);
    } else if (msg.op === 'rejected' && (!msg.targetPeerId || msg.targetPeerId === this.s.myPeerId)) {
      this.set({ lastError: msg.reason, syncStatus: 'error', ...(this.pendingJoin ? { approvalStatus: 'idle' } : {}) });
      if (this.pendingJoin) { this.resolveJoin(false); this.stopSession(true); } else this.callbacks.onStatus?.(msg.detail ?? msg.reason);
    } else if (msg.op === 'delta') this.applyGuestDelta(msg);
    else if (msg.op === 'snapshot') { this.seq = msg.seq; this.loadProject(msg.project); this.set({ syncStatus: 'synced' }); }
    else if (msg.op === 'peers') this.set({ peers: msg.peers });
    else if (msg.op === 'presence') this.updatePeerPresence(msg.peerId, msg.presence);
    else if (msg.op === 'role_changed' && msg.peerId === this.s.myPeerId) {
      this.set({ myRole: msg.role, peers: this.s.peers.map((p) => (p.id === msg.peerId ? { ...p, role: msg.role } : p)) });
      this.callbacks.onStatus?.(msg.role === 'viewer' ? 'Permissão alterada para Somente Leitura.' : 'Permissão alterada para Editor.');
    } else if ((msg.op === 'kicked' && msg.peerId === this.s.myPeerId) || msg.op === 'ended') {
      this.set({ lastError: msg.reason ?? 'kicked' });
      this.callbacks.onStatus?.(msg.op === 'ended' ? 'Sessão encerrada pelo anfitrião.' : 'Você foi removido da sessão colaborativa.'); this.stopSession(true);
    } else if (msg.op === 'ack' && msg.peerId === this.s.myPeerId && !msg.ok) {
      const message = msg.conflictAuthor ? `Conflito: alterado por ${msg.conflictAuthor}` : (msg.error ?? 'error');
      this.set({ lastError: msg.error ?? 'conflict', ...(msg.conflictAuthor ? { lastConflict: { author: msg.conflictAuthor, ids: msg.conflictIds ?? [], message } } : {}) });
      this.callbacks.onStatus?.(message);
    } else if (msg.op === 'handover') {
      this.set({ hostName: msg.newHostName });
      if (msg.newHostId !== this.s.myPeerId) return;
      this.roomSecret = makeSecret();
      this.set({ mode: 'host', myRole: 'host', hostName: this.s.myName, links: makeDefaultLinkConfigs(this.s.roomId ?? msg.roomId, this.roomSecret, Date.now()), pendingRequests: [], approvalStatus: 'idle' });
      this.switchTransportListener((m) => this.handleHostMessage(m)); this.installHooks(true);
    }
  }

  private applyGuestDelta(msg: Extract<CollabWireMessage, { op: 'delta' }>): void {
    if (msg.seq <= this.seq) return;
    if (msg.seq > this.seq + 1) return this.requestSync();
    this.seq = msg.seq; this.applyingRemoteOrGuest = true;
    try { this.projectStore?.applyRemotePatches(msg.patches, msg.inverse, { label: msg.label, authorId: msg.authorId, authorName: msg.authorName, seq: msg.seq, touchedIds: msg.touchedIds }); } finally { this.applyingRemoteOrGuest = false; }
    this.set({ activity: appendActivity(this.s.activity, makeActivityItem(msg.seq, msg.authorId, msg.authorName, msg.authorColor, msg.label, msg.touchedIds)), syncStatus: 'synced' });
  }

  private resolveJoin(ok: boolean): void {
    if (!this.pendingJoin) return;
    if (this.pendingJoin.timer) clearTimeout(this.pendingJoin.timer);
    const { resolve } = this.pendingJoin; this.pendingJoin = null; resolve(ok);
  }

  private loadProject(project: Project): void { if (this.callbacks.onLoadProject) this.callbacks.onLoadProject(project); else this.projectStore?.load(project); }

  private updatePeerPresence(peerId: string, presence: CollabPresence): void {
    if (peerId === this.s.myPeerId) return;
    this.set({ peers: this.s.peers.map((p) => (p.id === peerId ? { ...p, presence } : p)) });
    if (this.s.followingPeerId === peerId) this.callbacks.onFollowView?.(presence);
  }
}

/** App-wide default collaboration session manager singleton. */
export const collabManager = new CollabManager();
/** App-wide reactive Zustand hook/store for collaboration UI state. */
export const useCollab = collabManager.store;
