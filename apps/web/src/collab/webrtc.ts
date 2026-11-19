import type { CollabWireMessage } from '@hestia/model';
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

const OFFER_PREFIX = 'hestia-p2p-offer:';
const ANSWER_PREFIX = 'hestia-p2p-answer:';
const CHANNEL_LABEL = 'hestia-collab';
const ICE_GATHER_TIMEOUT_MS = 4000;
const DISCONNECT_GRACE_MS = 10_000;
const MAX_FRAME_CHARS = 16_000;
const CHUNK_PAYLOAD_LIMIT = 15_800;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const BUFFERED_LOW_THRESHOLD = 256 * 1024;

interface RtcSignalPayload {
  v: 1;
  type: RTCSdpType;
  sdp: string;
  inviteId?: string;
  roomId?: string;
  token?: string;
  hostName?: string;
}

interface ChunkFrame {
  c: string;
  i: number;
  n: number;
  d: string;
}

interface ReassemblyBuffer {
  total: number;
  chunks: (string | undefined)[];
  received: number;
}

interface ChannelPeer {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  closed: boolean;
  open: boolean;
  pendingFrames: string[];
  draining: boolean;
  reassembly: Map<string, ReassemblyBuffer>;
}

let seqCounter = 0;
function nextId(prefix: string): string {
  seqCounter += 1;
  return `${prefix}_${seqCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCode(input: string): string {
  return input.replace(/\s+/g, '');
}

/** Returns true when `input` looks like a Hestia WebRTC P2P offer code. */
export function isRtcOfferCode(input: string): boolean {
  return typeof input === 'string' && normalizeCode(input).startsWith(OFFER_PREFIX);
}

/** Returns true when `input` looks like a Hestia WebRTC P2P answer code. */
export function isRtcAnswerCode(input: string): boolean {
  return typeof input === 'string' && normalizeCode(input).startsWith(ANSWER_PREFIX);
}

function isWireMessage(value: unknown): value is CollabWireMessage {
  return typeof value === 'object' && value !== null && typeof (value as { op?: unknown }).op === 'string';
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]!);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  if (!/^[A-Za-z0-9\-_]+$/.test(b64url)) {
    throw new Error('Invalid base64url payload');
  }
  const padLen = (4 - (b64url.length % 4)) % 4;
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

async function transformBytes(stream: CompressionStream | DecompressionStream, input: Uint8Array): Promise<Uint8Array> {
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  const readAll = (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  })();

  await writer.write(input as unknown as BufferSource);
  await writer.close();
  await readAll;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function encodeSignalCode(prefix: string, payload: RtcSignalPayload): Promise<string> {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof globalThis.CompressionStream === 'function') {
    try {
      const compressed = await transformBytes(new globalThis.CompressionStream('deflate-raw'), jsonBytes);
      return `${prefix}z.${bytesToBase64Url(compressed)}`;
    } catch {
      // Fall back to plain JSON encoding when deflate-raw is unsupported.
    }
  }
  return `${prefix}j.${bytesToBase64Url(jsonBytes)}`;
}

async function decodeSignalCode(
  input: string,
  expectedPrefix: string,
  expectedType: 'offer' | 'answer',
): Promise<RtcSignalPayload> {
  if (typeof input !== 'string') {
    throw new Error(`Invalid ${expectedType} code: expected a string`);
  }
  const cleaned = normalizeCode(input);
  if (!cleaned.startsWith(expectedPrefix)) {
    throw new Error(`Invalid ${expectedType} code: must start with "${expectedPrefix}"`);
  }
  const rest = cleaned.slice(expectedPrefix.length);
  if (rest.length < 3 || rest[1] !== '.') {
    throw new Error(`Invalid ${expectedType} code: missing format flag`);
  }
  const flag = rest[0];
  const encoded = rest.slice(2);

  let rawBytes: Uint8Array;
  try {
    rawBytes = base64UrlToBytes(encoded);
  } catch {
    throw new Error(`Invalid ${expectedType} code: malformed base64url payload`);
  }

  let jsonBytes: Uint8Array;
  if (flag === 'z') {
    if (typeof globalThis.DecompressionStream !== 'function') {
      throw new Error(`Cannot decode compressed ${expectedType} code: DecompressionStream unavailable`);
    }
    try {
      jsonBytes = await transformBytes(new globalThis.DecompressionStream('deflate-raw'), rawBytes);
    } catch {
      throw new Error(`Invalid ${expectedType} code: corrupted compressed data`);
    }
  } else if (flag === 'j') {
    jsonBytes = rawBytes;
  } else {
    throw new Error(`Invalid ${expectedType} code: unsupported format flag "${flag}"`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(jsonBytes));
  } catch {
    throw new Error(`Invalid ${expectedType} code: malformed JSON`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`Invalid ${expectedType} code: payload is not an object`);
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.v !== 1) {
    throw new Error(`Unsupported ${expectedType} code version`);
  }
  if (obj.type !== expectedType || typeof obj.sdp !== 'string' || obj.sdp.length === 0) {
    throw new Error(`Invalid ${expectedType} code: missing SDP ${expectedType}`);
  }
  return obj as unknown as RtcSignalPayload;
}

async function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = ICE_GATHER_TIMEOUT_MS): Promise<void> {
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

function splitChunkSlices(raw: string): string[] {
  if (JSON.stringify(raw).length <= CHUNK_PAYLOAD_LIMIT) return [raw];
  const slices: string[] = [];
  let pos = 0;
  while (pos < raw.length) {
    let end = Math.min(raw.length, pos + CHUNK_PAYLOAD_LIMIT - 2);
    if (end < raw.length) {
      const lastCode = raw.charCodeAt(end - 1);
      if (lastCode >= 0xd800 && lastCode <= 0xdbff) end -= 1;
    }
    let slice = raw.slice(pos, end);
    const encodedLen = JSON.stringify(slice).length;
    if (encodedLen > CHUNK_PAYLOAD_LIMIT) {
      let lo = pos + 1;
      let hi = end;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const testLen = JSON.stringify(raw.slice(pos, mid)).length;
        if (testLen <= CHUNK_PAYLOAD_LIMIT) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      end = lo;
      if (end < raw.length && raw.charCodeAt(end - 1) >= 0xd800 && raw.charCodeAt(end - 1) <= 0xdbff && end > pos + 1) {
        end -= 1;
      }
      slice = raw.slice(pos, end);
    }
    slices.push(slice);
    pos = end;
  }
  return slices;
}

function encodeWireMessageFrames(msg: CollabWireMessage): string[] {
  const raw = JSON.stringify(msg);
  const id = (++seqCounter).toString(36);
  const slices = splitChunkSlices(raw);
  const n = slices.length;
  const frames: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const frame: ChunkFrame = { c: id, i, n, d: slices[i]! };
    const serialized = JSON.stringify(frame);
    if (serialized.length > MAX_FRAME_CHARS) {
      throw new Error('Serialized chunk frame exceeded 16000 character limit');
    }
    frames.push(serialized);
  }
  return frames;
}

function isChunkFrame(value: unknown): value is ChunkFrame {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.c === 'string' &&
    v.c.length > 0 &&
    typeof v.i === 'number' &&
    Number.isInteger(v.i) &&
    v.i >= 0 &&
    typeof v.n === 'number' &&
    Number.isInteger(v.n) &&
    v.n >= 1 &&
    v.i < v.n &&
    typeof v.d === 'string'
  );
}

function handleIncomingFrame(
  raw: unknown,
  reassembly: Map<string, ReassemblyBuffer>,
  deliver: (msg: CollabWireMessage) => void,
): void {
  if (typeof raw !== 'string') return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  if (!isChunkFrame(parsed)) return;

  if (parsed.n === 1) {
    try {
      const msg: unknown = JSON.parse(parsed.d);
      if (isWireMessage(msg)) deliver(msg);
    } catch {
      // Ignore malformed message payload.
    }
    return;
  }

  let entry = reassembly.get(parsed.c);
  if (!entry) {
    entry = { total: parsed.n, chunks: new Array<string | undefined>(parsed.n), received: 0 };
    reassembly.set(parsed.c, entry);
  } else if (entry.total !== parsed.n) {
    reassembly.delete(parsed.c);
    return;
  }

  if (entry.chunks[parsed.i] === undefined) {
    entry.chunks[parsed.i] = parsed.d;
    entry.received += 1;
  }

  if (entry.received === entry.total) {
    reassembly.delete(parsed.c);
    try {
      const msg: unknown = JSON.parse(entry.chunks.join(''));
      if (isWireMessage(msg)) deliver(msg);
    } catch {
      // Ignore malformed reassembled message.
    }
  }
}

async function waitForBufferLow(peer: ChannelPeer): Promise<void> {
  const dc = peer.dc;
  if (peer.closed || dc.readyState !== 'open' || (dc.bufferedAmount ?? 0) <= MAX_BUFFERED_BYTES) return;
  try {
    dc.bufferedAmountLowThreshold = BUFFERED_LOW_THRESHOLD;
  } catch {
    // Ignore unsupported bufferedAmountLowThreshold implementations.
  }

  await new Promise<void>((resolve) => {
    let done = false;
    const prevLow = dc.onbufferedamountlow;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(poll);
      if (dc.onbufferedamountlow === onLow) dc.onbufferedamountlow = prevLow;
      resolve();
    };
    const onLow = function (this: RTCDataChannel, ev: Event) {
      prevLow?.call(this, ev);
      if ((dc.bufferedAmount ?? 0) <= MAX_BUFFERED_BYTES || peer.closed || dc.readyState !== 'open') finish();
    };
    dc.onbufferedamountlow = onLow;
    const poll = setInterval(() => {
      if (peer.closed || dc.readyState !== 'open' || (dc.bufferedAmount ?? 0) <= MAX_BUFFERED_BYTES) {
        finish();
      }
    }, 20);
  });
}

async function drainPeerFrames(peer: ChannelPeer): Promise<void> {
  if (peer.draining) return;
  peer.draining = true;
  try {
    while (!peer.closed && peer.dc.readyState === 'open' && peer.pendingFrames.length > 0) {
      if ((peer.dc.bufferedAmount ?? 0) > MAX_BUFFERED_BYTES) {
        await waitForBufferLow(peer);
        if (peer.closed || peer.dc.readyState !== 'open') break;
      }
      const frame = peer.pendingFrames.shift()!;
      try {
        peer.dc.send(frame);
      } catch {
        break;
      }
    }
  } finally {
    peer.draining = false;
  }
}

function sendFramesToPeer(peer: ChannelPeer, frames: string[]): void {
  if (peer.closed || !peer.open || peer.dc.readyState !== 'open') return;
  if (peer.draining || peer.pendingFrames.length > 0) {
    peer.pendingFrames.push(...frames);
    void drainPeerFrames(peer);
    return;
  }
  for (let i = 0; i < frames.length; i += 1) {
    if (peer.closed || peer.dc.readyState !== 'open') return;
    if ((peer.dc.bufferedAmount ?? 0) > MAX_BUFFERED_BYTES) {
      peer.pendingFrames.push(...frames.slice(i));
      void drainPeerFrames(peer);
      return;
    }
    try {
      peer.dc.send(frames[i]!);
    } catch {
      return;
    }
  }
}

function closePeer(peer: ChannelPeer): void {
  if (peer.closed) return;
  peer.closed = true;
  peer.open = false;
  peer.pendingFrames = [];
  peer.reassembly.clear();
  try {
    peer.dc.close();
  } catch {
    // Ignore close errors.
  }
  try {
    peer.pc.close();
  } catch {
    // Ignore close errors.
  }
}

function resolveFactory(opts?: { iceServers?: RTCIceServer[]; factory?: RtcFactory }): RtcFactory {
  if (opts?.factory) return opts.factory;
  const iceServers = opts?.iceServers ?? DEFAULT_ICE_SERVERS;
  return () => {
    if (typeof globalThis.RTCPeerConnection !== 'function') {
      throw new Error('WebRTC RTCPeerConnection is unavailable in this environment');
    }
    return new globalThis.RTCPeerConnection({ iceServers });
  };
}

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
