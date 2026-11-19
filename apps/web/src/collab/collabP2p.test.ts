import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore, type CollabWireMessage } from '@hestia/model';
import { CollabManager } from './session.ts';
import type { P2pFactory } from './p2p.ts';
import type { RtcGuest, RtcHost } from './webrtc.ts';

type Listener = (msg: CollabWireMessage) => void;
interface Invite { roomId: string; token: string; hostName?: string; guest: FakeGuest | null }

/** Rede falsa em memória: pareia anfitrião e convidados sem WebRTC real. */
class FakeNet {
  invites = new Map<string, Invite>();
  hosts: FakeHost[] = [];
  guests: FakeGuest[] = [];
  seq = 0;
  factory(): P2pFactory {
    return {
      host: () => { const h = new FakeHost(this); this.hosts.push(h); return h; },
      guest: () => { const g = new FakeGuest(this); this.guests.push(g); return g; },
    };
  }
}

class FakeHost implements RtcHost {
  kind = 'fake-rtc';
  closed = false;
  private listeners = new Set<Listener>();
  constructor(private net: FakeNet) {}
  async createInvite(meta: { roomId: string; token: string; hostName?: string }) {
    this.net.seq += 1;
    const inviteId = `inv_${this.net.seq}`;
    this.net.invites.set(inviteId, { ...meta, guest: null });
    return { inviteId, code: `hestia-p2p-offer:${inviteId}` };
  }
  async acceptAnswer(inviteId: string, answerCode: string) {
    const inv = this.net.invites.get(inviteId);
    if (!inv?.guest || answerCode !== `hestia-p2p-answer:${inviteId}`) throw new Error('bad answer');
    inv.guest.open();
  }
  guestCount() { return this.net.guests.filter((g) => g.opened && !g.closed).length; }
  send(msg: CollabWireMessage) { if (!this.closed) for (const g of this.net.guests) if (g.opened && !g.closed) g.deliver(msg); }
  onMessage(cb: Listener) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  deliver(msg: CollabWireMessage) { for (const cb of [...this.listeners]) cb(msg); }
  close() { this.closed = true; this.listeners.clear(); }
}

class FakeGuest implements RtcGuest {
  kind = 'fake-rtc';
  opened = false;
  closed = false;
  private listeners = new Set<Listener>();
  private openCbs = new Set<() => void>();
  private closeCbs = new Set<(r: string) => void>();
  constructor(private net: FakeNet) {}
  async acceptInvite(offerCode: string) {
    const inviteId = offerCode.replace('hestia-p2p-offer:', '');
    const inv = this.net.invites.get(inviteId);
    if (!inv) throw new Error('unknown offer');
    inv.guest = this;
    return { answerCode: `hestia-p2p-answer:${inviteId}`, roomId: inv.roomId, token: inv.token, hostName: inv.hostName };
  }
  open() { this.opened = true; for (const cb of [...this.openCbs]) cb(); }
  onOpen(cb: () => void) { this.openCbs.add(cb); return () => { this.openCbs.delete(cb); }; }
  onClose(cb: (r: string) => void) { this.closeCbs.add(cb); return () => { this.closeCbs.delete(cb); }; }
  send(msg: CollabWireMessage) {
    if (this.closed) return;
    for (const h of this.net.hosts) h.deliver(msg);
  }
  onMessage(cb: Listener) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  deliver(msg: CollabWireMessage) { for (const cb of [...this.listeners]) cb(msg); }
  close() { this.closed = true; this.listeners.clear(); for (const cb of this.closeCbs) cb('closed'); }
}

const wall = (id: string) => ({
  type: 'addWall' as const,
  wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }),
});

describe('Colaboração P2P (transportes falsos pareados)', () => {
  const managers: CollabManager[] = [];
  afterEach(() => { while (managers.length > 0) managers.pop()!.stopSession(); });

  function setup() {
    const net = new FakeNet();
    const hostMgr = new CollabManager(net.factory());
    const guestMgr = new CollabManager(net.factory());
    managers.push(hostMgr, guestMgr);
    const hostStore = new ProjectStore(createEmptyProject('Projeto P2P'));
    const guestStore = new ProjectStore(createEmptyProject('Vazio'));
    hostMgr.attachStore(hostStore);
    guestMgr.attachStore(guestStore);
    hostStore.exec(wall('w_p2p_init'), 'Parede inicial');
    hostMgr.startHostingP2p('Ana (P2P)');
    return { net, hostMgr, guestMgr, hostStore, guestStore };
  }

  it('gera convite com prefixo de oferta e resposta com prefixo de resposta', async () => {
    const { hostMgr, guestMgr } = setup();
    const invite = await hostMgr.createP2pInvite('editor', 'Beto');
    expect(invite?.code.startsWith('hestia-p2p-offer:')).toBe(true);
    expect(hostMgr.store.getState().transportKind).toBe('p2p');
    expect(hostMgr.store.getState().p2pInvites).toHaveLength(1);
    expect(hostMgr.store.getState().p2pInvites[0]?.status).toBe('waiting');
    const answer = await guestMgr.joinSessionP2p(invite!.code, 'Beto');
    expect(answer?.startsWith('hestia-p2p-answer:')).toBe(true);
    expect(guestMgr.store.getState().p2pAnswerCode).toBe(answer);
  });

  it('mantém o convidado na sala de espera até a aprovação e então entrega o snapshot', async () => {
    const { hostMgr, guestMgr, guestStore } = setup();
    const invite = await hostMgr.createP2pInvite('editor');
    const answer = await guestMgr.joinSessionP2p(invite!.code, 'Beto');
    expect(guestMgr.store.getState().approvalStatus).toBe('waiting');
    expect(hostMgr.store.getState().pendingRequests).toHaveLength(0);

    expect(await hostMgr.acceptP2pAnswer(invite!.inviteId, answer!)).toBe(true);
    expect(hostMgr.store.getState().pendingRequests).toHaveLength(1);
    expect(hostMgr.store.getState().p2pInvites[0]?.status).toBe('connected');
    expect(guestMgr.store.getState().approvalStatus).toBe('waiting');
    expect(guestStore.project.elements['w_p2p_init']).toBeUndefined();

    hostMgr.approveJoin(guestMgr.store.getState().myPeerId);
    expect(guestMgr.store.getState().approvalStatus).toBe('approved');
    expect(guestMgr.store.getState().myRole).toBe('editor');
    expect(guestStore.project.elements['w_p2p_init']).toBeDefined();
  });

  it('visualizador não edita pelo canal P2P e editor propaga ao anfitrião', async () => {
    const { hostMgr, guestMgr, hostStore, guestStore } = setup();
    const invite = await hostMgr.createP2pInvite('viewer');
    const answer = await guestMgr.joinSessionP2p(invite!.code, 'Carla');
    await hostMgr.acceptP2pAnswer(invite!.inviteId, answer!);
    hostMgr.approveJoin(guestMgr.store.getState().myPeerId);
    expect(guestMgr.store.getState().myRole).toBe('viewer');

    guestStore.exec(wall('w_viewer_p2p'), 'Parede leitura');
    expect(guestStore.project.elements['w_viewer_p2p']).toBeUndefined();
    expect(hostStore.project.elements['w_viewer_p2p']).toBeUndefined();
    expect(guestMgr.store.getState().lastError).toBe('read_only');

    hostMgr.setPeerRole(guestMgr.store.getState().myPeerId, 'editor');
    guestStore.exec(wall('w_editor_p2p'), 'Parede editor');
    expect(hostStore.project.elements['w_editor_p2p']).toBeDefined();
  });

  it('código inválido gera erro sem derrubar a sessão', async () => {
    const { hostMgr, guestMgr } = setup();
    expect(await guestMgr.joinSessionP2p('qualquer coisa', 'X')).toBeNull();
    expect(guestMgr.store.getState().p2pError).toBe('collab_p2p_invalid_code');
    expect(await guestMgr.joinSessionP2p('hestia-p2p-offer:inexistente', 'X')).toBeNull();
    expect(guestMgr.store.getState().p2pError).toBe('collab_p2p_invalid_code');

    expect(await hostMgr.acceptP2pAnswer('inv_x', 'lixo')).toBe(false);
    expect(hostMgr.store.getState().p2pError).toBe('collab_p2p_invalid_code');
    expect(hostMgr.store.getState().mode).toBe('host');
    expect(guestMgr.store.getState().mode).toBe('off');
  });

  it('stopSession fecha o transporte P2P do anfitrião e do convidado', async () => {
    const { net, hostMgr, guestMgr } = setup();
    const invite = await hostMgr.createP2pInvite('editor');
    const answer = await guestMgr.joinSessionP2p(invite!.code, 'Beto');
    await hostMgr.acceptP2pAnswer(invite!.inviteId, answer!);
    guestMgr.stopSession();
    expect(net.guests[0]?.closed).toBe(true);
    expect(guestMgr.store.getState().mode).toBe('off');
    hostMgr.stopSession();
    expect(net.hosts[0]?.closed).toBe(true);
    expect(hostMgr.store.getState().p2pInvites).toEqual([]);
    expect(hostMgr.store.getState().transportKind).toBe('ws');
  });
});
