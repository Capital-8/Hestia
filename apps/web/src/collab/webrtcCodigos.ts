// Códigos de convite/resposta do P2P: prefixos, base64url, compressão e (de)codificação.

export const OFFER_PREFIX = 'hestia-p2p-offer:';
export const ANSWER_PREFIX = 'hestia-p2p-answer:';

export interface RtcSignalPayload {
  v: 1;
  type: RTCSdpType;
  sdp: string;
  inviteId?: string;
  roomId?: string;
  token?: string;
  hostName?: string;
}

export function normalizeCode(input: string): string {
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

  // Escrita e leitura são consumidas juntas por allSettled: nenhuma promessa interna
  // fica sem tratador e o erro do (de)compressor chega uma só vez ao chamador.
  const writeAll = (async () => {
    await writer.write(input as unknown as BufferSource);
    await writer.close();
  })();
  const [escrita, leitura] = await Promise.allSettled([writeAll, readAll]);
  if (leitura.status === 'rejected') throw leitura.reason;
  if (escrita.status === 'rejected') throw escrita.reason;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function encodeSignalCode(prefix: string, payload: RtcSignalPayload): Promise<string> {
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

export async function decodeSignalCode(
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
