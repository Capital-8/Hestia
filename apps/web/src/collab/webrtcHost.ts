import type { CollabWireMessage } from '@hestia/model';
import { ANSWER_PREFIX, OFFER_PREFIX, decodeSignalCode, encodeSignalCode } from './webrtcCodigos.ts';
import {
  type ChannelPeer,
  closePeer,
  encodeWireMessageFrames,
  handleIncomingFrame,
  nextId,
  sendFramesToPeer,
} from './webrtcQuadros.ts';
import {
  CHANNEL_LABEL,
  ICE_GATHER_TIMEOUT_MS,
  resolveFactory,
  waitForIceGathering,
  type RtcFactory,
  type RtcHost,
} from './webrtcTipos.ts';

/**
 * Creates a star-hub WebRTC host transport managing one RTCPeerConnection and DataChannel per guest.
 */
export function createRtcHost(opts?: { iceServers?: RTCIceServer[]; factory?: RtcFactory }): RtcHost {
  const createPc = resolveFactory(opts);
  const guests = new Map<string, ChannelPeer & { answered: boolean }>();
  const listeners = new Set<(msg: CollabWireMessage) => void>();
  let closed = false;

  const deliver = (msg: CollabWireMessage) => {
    if (closed) return;
    for (const cb of [...listeners]) cb(msg);
  };

  return {
    kind: 'webrtc',

    async createInvite(meta): Promise<{ inviteId: string; code: string }> {
      if (closed) throw new Error('Host transport is closed');
      const inviteId = nextId('inv');
      const pc = createPc();
      const dc = pc.createDataChannel(CHANNEL_LABEL, { ordered: true });
      const peer: ChannelPeer & { answered: boolean } = {
        pc,
        dc,
        closed: false,
        open: dc.readyState === 'open',
        pendingFrames: [],
        draining: false,
        reassembly: new Map(),
        answered: false,
      };
      guests.set(inviteId, peer);

      const cleanupGuest = () => {
        guests.delete(inviteId);
        closePeer(peer);
      };

      dc.onopen = () => {
        if (!closed && !peer.closed) peer.open = true;
      };
      dc.onclose = cleanupGuest;
      dc.onerror = cleanupGuest;
      dc.onmessage = (ev: MessageEvent) => {
        if (closed || peer.closed) return;
        handleIncomingFrame(ev.data, peer.reassembly, deliver);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') cleanupGuest();
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc, ICE_GATHER_TIMEOUT_MS);
        if (closed) {
          cleanupGuest();
          throw new Error('Host transport closed while creating invite');
        }
        const desc = pc.localDescription ?? offer;
        if (!desc.sdp) {
          cleanupGuest();
          throw new Error('Failed to generate local SDP offer');
        }
        const code = await encodeSignalCode(OFFER_PREFIX, {
          v: 1,
          type: desc.type ?? 'offer',
          sdp: desc.sdp,
          inviteId,
          roomId: meta.roomId,
          token: meta.token,
          ...(meta.hostName !== undefined ? { hostName: meta.hostName } : {}),
        });
        return { inviteId, code };
      } catch (err) {
        cleanupGuest();
        throw err;
      }
    },

    async acceptAnswer(inviteId: string, answerCode: string): Promise<void> {
      if (closed) throw new Error('Host transport is closed');
      const peer = guests.get(inviteId);
      if (!peer || peer.closed) {
        throw new Error(`Unknown or closed invite: ${inviteId}`);
      }
      if (peer.answered) {
        throw new Error(`Invite ${inviteId} has already accepted an answer`);
      }
      const payload = await decodeSignalCode(answerCode, ANSWER_PREFIX, 'answer');
      if (payload.inviteId !== inviteId) {
        throw new Error('Answer code does not match invite (inviteId mismatch)');
      }
      await peer.pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
      peer.answered = true;
    },

    guestCount(): number {
      if (closed) return 0;
      let count = 0;
      for (const peer of guests.values()) {
        if (!peer.closed && peer.open && peer.dc.readyState === 'open') count += 1;
      }
      return count;
    },

    send(msg: CollabWireMessage): void {
      if (closed) return;
      let frames: string[];
      try {
        frames = encodeWireMessageFrames(msg);
      } catch {
        return;
      }
      for (const peer of [...guests.values()]) {
        sendFramesToPeer(peer, frames);
      }
    },

    onMessage(cb: (msg: CollabWireMessage) => void): () => void {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    close(): void {
      if (closed) return;
      closed = true;
      listeners.clear();
      for (const peer of guests.values()) closePeer(peer);
      guests.clear();
    },
  };
}
