import type { CollabWireMessage } from '@hestia/model';
import { OFFER_PREFIX, ANSWER_PREFIX, decodeSignalCode, encodeSignalCode } from './webrtcCodigos.ts';
import { type ChannelPeer, closePeer, encodeWireMessageFrames, handleIncomingFrame, sendFramesToPeer } from './webrtcQuadros.ts';
import {
  DISCONNECT_GRACE_MS,
  ICE_GATHER_TIMEOUT_MS,
  resolveFactory,
  waitForIceGathering,
  type RtcFactory,
  type RtcGuest,
} from './webrtcTipos.ts';

/**
 * Creates a WebRTC guest transport connecting to a single host via manual offer/answer codes.
 */
export function createRtcGuest(opts?: { iceServers?: RTCIceServer[]; factory?: RtcFactory }): RtcGuest {
  const createPc = resolveFactory(opts);
  const messageListeners = new Set<(msg: CollabWireMessage) => void>();
  const openListeners = new Set<() => void>();
  const closeListeners = new Set<(reason: string) => void>();

  let peer: ChannelPeer | null = null;
  let pcOnly: RTCPeerConnection | null = null;
  let closed = false;
  let closeNotified = false;
  let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const clearDisconnectTimer = () => {
    if (disconnectTimer !== null) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
  };

  const notifyClose = (reason: string) => {
    if (closed || closeNotified) return;
    closeNotified = true;
    clearDisconnectTimer();
    if (peer) closePeer(peer);
    else {
      try {
        pcOnly?.close();
      } catch {
        // Ignore close errors.
      }
    }
    for (const cb of [...closeListeners]) cb(reason);
  };

  const deliver = (msg: CollabWireMessage) => {
    if (closed) return;
    for (const cb of [...messageListeners]) cb(msg);
  };

  const attachChannel = (pc: RTCPeerConnection, dc: RTCDataChannel) => {
    if (closed) return;
    const nextPeer: ChannelPeer = {
      pc,
      dc,
      closed: false,
      open: dc.readyState === 'open',
      pendingFrames: [],
      draining: false,
      reassembly: new Map(),
    };
    peer = nextPeer;

    const fireOpen = () => {
      if (closed || nextPeer.closed) return;
      nextPeer.open = true;
      for (const cb of [...openListeners]) cb();
    };

    dc.onopen = fireOpen;
    dc.onclose = () => notifyClose('Data channel closed');
    dc.onerror = () => notifyClose('Data channel error');
    dc.onmessage = (ev: MessageEvent) => {
      if (closed || nextPeer.closed) return;
      handleIncomingFrame(ev.data, nextPeer.reassembly, deliver);
    };

    if (nextPeer.open) fireOpen();
  };

  return {
    kind: 'webrtc',

    async acceptInvite(offerCode: string) {
      if (closed) throw new Error('Guest transport is closed');
      if (pcOnly || peer) throw new Error('Guest has already accepted an invite');

      const payload = await decodeSignalCode(offerCode, OFFER_PREFIX, 'offer');
      if (typeof payload.roomId !== 'string' || typeof payload.token !== 'string') {
        throw new Error('Invalid offer code: missing roomId or token');
      }

      const pc = createPc();
      pcOnly = pc;

      pc.ondatachannel = (ev: RTCDataChannelEvent) => {
        if (ev.channel) attachChannel(pc, ev.channel);
      };

      const checkConnState = () => {
        if (closed || closeNotified) return;
        const connState = pc.connectionState;
        const iceState = pc.iceConnectionState;
        if (connState === 'failed' || connState === 'closed' || iceState === 'failed') {
          notifyClose('Peer connection failed');
          return;
        }
        if (connState === 'disconnected' || iceState === 'disconnected') {
          if (disconnectTimer === null) {
            disconnectTimer = setTimeout(() => {
              disconnectTimer = null;
              if (!closed && !closeNotified) {
                const stillBad = pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected';
                if (stillBad) notifyClose('Peer connection disconnected');
              }
            }, DISCONNECT_GRACE_MS);
          }
          return;
        }
        if (connState === 'connected' || iceState === 'connected' || iceState === 'completed') {
          clearDisconnectTimer();
        }
      };

      pc.onconnectionstatechange = checkConnState;
      pc.oniceconnectionstatechange = checkConnState;

      try {
        await pc.setRemoteDescription({ type: payload.type, sdp: payload.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await waitForIceGathering(pc, ICE_GATHER_TIMEOUT_MS);
        if (closed) {
          throw new Error('Guest transport closed while accepting invite');
        }
        const desc = pc.localDescription ?? answer;
        if (!desc.sdp) {
          throw new Error('Failed to generate local SDP answer');
        }
        const answerCode = await encodeSignalCode(ANSWER_PREFIX, {
          v: 1,
          type: desc.type ?? 'answer',
          sdp: desc.sdp,
          ...(payload.inviteId !== undefined ? { inviteId: payload.inviteId } : {}),
        });
        return {
          answerCode,
          roomId: payload.roomId,
          token: payload.token,
          ...(payload.hostName !== undefined ? { hostName: payload.hostName } : {}),
        };
      } catch (err) {
        clearDisconnectTimer();
        try {
          pc.close();
        } catch {
          // Ignore close errors.
        }
        pcOnly = null;
        peer = null;
        throw err;
      }
    },

    send(msg: CollabWireMessage): void {
      if (closed || !peer) return;
      let frames: string[];
      try {
        frames = encodeWireMessageFrames(msg);
      } catch {
        return;
      }
      sendFramesToPeer(peer, frames);
    },

    onMessage(cb: (msg: CollabWireMessage) => void): () => void {
      messageListeners.add(cb);
      return () => {
        messageListeners.delete(cb);
      };
    },

    onOpen(cb: () => void): () => void {
      openListeners.add(cb);
      return () => {
        openListeners.delete(cb);
      };
    },

    onClose(cb: (reason: string) => void): () => void {
      closeListeners.add(cb);
      return () => {
        closeListeners.delete(cb);
      };
    },

    close(): void {
      if (closed) return;
      closed = true;
      clearDisconnectTimer();
      messageListeners.clear();
      openListeners.clear();
      closeListeners.clear();
      if (peer) closePeer(peer);
      else {
        try {
          pcOnly?.close();
        } catch {
          // Ignore close errors.
        }
      }
      peer = null;
      pcOnly = null;
    },
  };
}
