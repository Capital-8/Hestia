import type { StoreApi, UseBoundStore } from 'zustand';
import type { CollabLinkRole, ShareLinkConfig } from '@hestia/model';
import type { CollabTransport } from './transport.ts';
import { createRtcGuest, createRtcHost, isRtcAnswerCode, isRtcOfferCode, type RtcGuest, type RtcHost } from './webrtc.ts';
import { defaultLabel, type CollabP2pInvite, type CollabState } from './sessionHelpers.ts';

/** Fábrica dos transportes P2P (padrão: WebRTC real; testes injetam pares em memória). */
export interface P2pFactory {
  host: () => RtcHost;
  guest: () => RtcGuest;
}

const defaultFactory: P2pFactory = { host: () => createRtcHost(), guest: () => createRtcGuest() };

/** Operações da CollabManager de que o P2P precisa (evita acoplar p2p.ts aos membros privados). */
export interface P2pDeps {
  startHosting: (o: { hostName?: string; wsEndpoint?: string; transport?: CollabTransport }) => void;
  createLink: (role: CollabLinkRole, label?: string) => ShareLinkConfig | null;
  joinSession: (o: { roomId: string; token: string; name?: string; wsEndpoint?: string; transport?: CollabTransport; waitFor?: (go: () => void) => void }) => Promise<boolean>;
  stopSession: (preserveError?: boolean) => void;
}

export interface P2pController {
  startHosting(hostName?: string): void;
  createInvite(role: CollabLinkRole, label?: string): Promise<{ inviteId: string; code: string } | null>;
  acceptAnswer(inviteId: string, answerCode: string): Promise<boolean>;
  join(offerCode: string, name?: string): Promise<string | null>;
}

/** Lógica do convite por código (oferta/resposta WebRTC), sem servidor: a sessão segue pelo mesmo protocolo do WebSocket. */
export function createP2pController(
  store: UseBoundStore<StoreApi<CollabState>>,
  deps: P2pDeps,
  factory: P2pFactory = defaultFactory,
): P2pController {
  let host: RtcHost | null = null;
  const st = (): CollabState => store.getState();
  const set = (patch: Partial<CollabState>): void => store.setState(patch);
  const fail = (code: NonNullable<CollabState['p2pError']>): void => set({ p2pError: code });
  const markConnected = (token: string): void => set({ p2pInvites: st().p2pInvites.map((i): CollabP2pInvite => (i.token === token ? { ...i, status: 'connected' } : i)) });

  return {
    startHosting(hostName) {
      const rtc = factory.host();
      host = rtc;
      deps.startHosting({ hostName, wsEndpoint: st().wsEndpoint, transport: rtc });
      set({ transportKind: 'p2p', p2pError: null });
      rtc.onMessage((msg) => { if (msg.op === 'hello') markConnected(msg.token); });
    },

    async createInvite(role, label) {
      if (!host || st().mode !== 'host' || st().transportKind !== 'p2p') return null;
      const link = deps.createLink(role, label?.trim() || defaultLabel(role));
      if (!link) return null;
      try {
        const { inviteId, code } = await host.createInvite({ roomId: link.roomId, token: link.token, hostName: st().myName });
        set({ p2pError: null, p2pInvites: [...st().p2pInvites, { inviteId, code, role, label: link.label, token: link.token, status: 'waiting' }] });
        return { inviteId, code };
      } catch {
        fail('collab_p2p_failed');
        return null;
      }
    },

    async acceptAnswer(inviteId, answerCode) {
      if (!host || st().mode !== 'host' || !isRtcAnswerCode(answerCode)) { fail('collab_p2p_invalid_code'); return false; }
      try {
        await host.acceptAnswer(inviteId, answerCode.trim());
        set({ p2pError: null });
        return true;
      } catch {
        fail('collab_p2p_invalid_code');
        return false;
      }
    },

    async join(offerCode, name) {
      if (!isRtcOfferCode(offerCode)) { fail('collab_p2p_invalid_code'); return null; }
      const guest = factory.guest();
      let info: Awaited<ReturnType<RtcGuest['acceptInvite']>>;
      try {
        info = await guest.acceptInvite(offerCode.trim());
      } catch {
        guest.close();
        fail('collab_p2p_invalid_code');
        return null;
      }
      const joined = deps.joinSession({ roomId: info.roomId, token: info.token, name, transport: guest, waitFor: (go) => { guest.onOpen(go); } });
      set({ transportKind: 'p2p', p2pAnswerCode: info.answerCode, p2pError: null, hostName: info.hostName ?? '' });
      guest.onClose(() => queueMicrotask(() => {
        if (st().mode !== 'guest' || st().transportKind !== 'p2p') return;
        deps.stopSession(true);
        fail('collab_p2p_failed');
      }));
      void joined.then((ok) => { if (!ok && !st().lastError) fail('collab_p2p_failed'); });
      return info.answerCode;
    },
  };
}
