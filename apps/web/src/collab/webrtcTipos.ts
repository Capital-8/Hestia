import type { CollabTransport } from './transport';

export type RtcFactory = () => RTCPeerConnection;

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export interface RtcHost extends CollabTransport {
  createInvite(meta: { roomId: string; token: string; hostName?: string }): Promise<{ inviteId: string; code: string }>;
  acceptAnswer(inviteId: string, answerCode: string): Promise<void>;
  guestCount(): number;
}

export interface RtcGuest extends CollabTransport {
  acceptInvite(offerCode: string): Promise<{ answerCode: string; roomId: string; token: string; hostName?: string }>;
  onOpen(cb: () => void): () => void;
  onClose(cb: (reason: string) => void): () => void;
}

export const CHANNEL_LABEL = 'hestia-collab';
export const ICE_GATHER_TIMEOUT_MS = 4000;
export const DISCONNECT_GRACE_MS = 10_000;

export async function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = ICE_GATHER_TIMEOUT_MS): Promise<void> {
  if (pc.iceGatheringState === 'complete') return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const prevState = pc.onicegatheringstatechange;
    const prevCand = pc.onicecandidate;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pc.onicegatheringstatechange === onState) pc.onicegatheringstatechange = prevState;
      if (pc.onicecandidate === onCand) pc.onicecandidate = prevCand;
      resolve();
    };

    const onState = function (this: RTCPeerConnection, ev: Event) {
      prevState?.call(this, ev);
      if (pc.iceGatheringState === 'complete') finish();
    };

    const onCand = function (this: RTCPeerConnection, ev: RTCPeerConnectionIceEvent) {
      prevCand?.call(this, ev);
      if (!ev.candidate || pc.iceGatheringState === 'complete') finish();
    };

    const timer = setTimeout(finish, timeoutMs);
    pc.onicegatheringstatechange = onState;
    pc.onicecandidate = onCand;
  });
}

export function resolveFactory(opts?: { iceServers?: RTCIceServer[]; factory?: RtcFactory }): RtcFactory {
  if (opts?.factory) return opts.factory;
  const iceServers = opts?.iceServers ?? DEFAULT_ICE_SERVERS;
  return () => {
    if (typeof globalThis.RTCPeerConnection !== 'function') {
      throw new Error('WebRTC RTCPeerConnection is unavailable in this environment');
    }
    return new globalThis.RTCPeerConnection({ iceServers });
  };
}
