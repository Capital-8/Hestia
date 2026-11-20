import type { CollabWireMessage } from '@hestia/model';

const MAX_FRAME_CHARS = 16_000;
const CHUNK_PAYLOAD_LIMIT = 15_800;
const MAX_BUFFERED_BYTES = 1024 * 1024;
const BUFFERED_LOW_THRESHOLD = 256 * 1024;

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

export interface ChannelPeer {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  closed: boolean;
  open: boolean;
  pendingFrames: string[];
  draining: boolean;
  reassembly: Map<string, ReassemblyBuffer>;
}

let seqCounter = 0;
export function nextId(prefix: string): string {
  seqCounter += 1;
  return `${prefix}_${seqCounter}_${Math.random().toString(36).slice(2, 8)}`;
}

function isWireMessage(value: unknown): value is CollabWireMessage {
  return typeof value === 'object' && value !== null && typeof (value as { op?: unknown }).op === 'string';
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

export function encodeWireMessageFrames(msg: CollabWireMessage): string[] {
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

export function handleIncomingFrame(
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

export function sendFramesToPeer(peer: ChannelPeer, frames: string[]): void {
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

export function closePeer(peer: ChannelPeer): void {
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
