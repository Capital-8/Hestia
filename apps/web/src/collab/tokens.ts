import type { CollabLinkRole } from '@hestia/model';

const TOKEN_PREFIX = 'hc1';

/**
 * Computes a deterministic 64-bit URL-safe hex signature without Node `crypto`,
 * allowing synchronous token generation and verification in browser and Vitest.
 */
function signPayload(payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < payload.length; i += 1) {
    const c = payload.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + ((i + 1) & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
    h2 = ((h2 << 13) | (h2 >>> 19)) >>> 0;
  }
  // Final avalanche mix so single-character changes cascade across both halves.
  h1 ^= h2 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b) >>> 0;
  h2 ^= h1 >>> 13;
  h2 = Math.imul(h2, 0xc2b2ae35) >>> 0;
  h1 ^= h1 >>> 16;
  h2 ^= h2 >>> 16;
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

function parseTokenParts(token: string): { role: CollabLinkRole; roomId: string; sig: string } | null {
  const trimmed = token.trim();
  const rwPrefix = `${TOKEN_PREFIX}_rw_`;
  const roPrefix = `${TOKEN_PREFIX}_ro_`;
  let role: CollabLinkRole;
  let rest: string;
  if (trimmed.startsWith(rwPrefix)) {
    role = 'editor';
    rest = trimmed.slice(rwPrefix.length);
  } else if (trimmed.startsWith(roPrefix)) {
    role = 'viewer';
    rest = trimmed.slice(roPrefix.length);
  } else {
    return null;
  }
  const sep = rest.lastIndexOf('_');
  if (sep <= 0 || sep >= rest.length - 1) return null;
  const roomId = rest.slice(0, sep);
  const sig = rest.slice(sep + 1);
  if (!roomId || !/^[0-9a-f]{16}$/i.test(sig)) return null;
  return { role, roomId, sig };
}

/** Creates a compact URL-safe collaboration share token embedding role, roomId, and signature. */
export function createShareToken(roomId: string, role: CollabLinkRole, secret: string): string {
  const roleTag = role === 'editor' ? 'rw' : 'ro';
  const sig = signPayload(`${secret}:${roomId}:${role}`);
  return `${TOKEN_PREFIX}_${roleTag}_${roomId}_${sig}`;
}

/** Verifies a share token against an expected roomId and secret, returning its embedded role if valid. */
export function verifyShareToken(token: string, roomId: string, secret: string): { valid: boolean; role?: CollabLinkRole } {
  const parsed = parseTokenParts(token);
  if (!parsed || !roomId || parsed.roomId !== roomId) return { valid: false };
  const expected = createShareToken(roomId, parsed.role, secret);
  if (token.trim() !== expected) return { valid: false };
  return { valid: true, role: parsed.role };
}

/** Extracts the embedded permission role from a well-formed share token, or null if malformed. */
export function parseShareTokenRole(token: string): CollabLinkRole | null {
  return parseTokenParts(token)?.role ?? null;
}

/** Extrai host e porta opcional de uma URL WebSocket (`ws://...`, `wss://...`) ou `host:port`. */
export function extractHostPort(wsUrl: string): { host: string; port?: number } | null {
  const trimmed = wsUrl.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname) return null;
    if (url.port) {
      const port = Number(url.port);
      if (Number.isInteger(port) && port > 0 && port <= 65535) return { host: url.hostname, port };
    }
    return { host: url.hostname };
  } catch {
    return null;
  }
}

/**
 * Gera um código de convite direto por IP:porta (`host:port:roomId:token`),
 * autossuficiente e sem dependência de website externo.
 */
export function buildIpInviteCode(opts: {
  host?: string;
  port?: number;
  wsUrl?: string;
  roomId: string;
  token: string;
}): string {
  const rawHost = opts.wsUrl?.trim() || opts.host?.trim() || '';
  const parsed = rawHost ? extractHostPort(rawHost) : null;
  const host = parsed?.host ?? '';
  const port = opts.port !== undefined && Number.isInteger(opts.port) && opts.port > 0 ? opts.port : parsed?.port;
  const roomId = opts.roomId.trim();
  const token = opts.token.trim();
  if (!host) return `${roomId}:${token}`;
  return port ? `${host}:${port}:${roomId}:${token}` : `${host}:${roomId}:${token}`;
}

/** Builds a shareable URL containing `?collab=...&token=...` (and optional `&ws=...`). */
export function buildShareUrl(baseUrl: string, opts: { roomId: string; token: string; wsUrl?: string }): string {
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(baseUrl);
  const url = hasScheme ? new URL(baseUrl) : new URL(baseUrl || '/', 'https://hestia.local');
  url.searchParams.set('collab', opts.roomId);
  url.searchParams.set('token', opts.token);
  if (opts.wsUrl?.trim()) url.searchParams.set('ws', opts.wsUrl.trim());
  else url.searchParams.delete('ws');
  return hasScheme ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

/** Builds a `https://wa.me/?text=...` WhatsApp invite link for the given share URL or direct IP code. */
export function buildWhatsAppShareUrl(shareUrl: string, projectName: string, role: CollabLinkRole): string {
  const roleLabel = role === 'editor' ? 'Leitura e Edição' : 'Somente Leitura';
  const name = projectName.trim() || 'Projeto Hestia';
  const invite = shareUrl.trim();
  const text = `Convite para colaborar no projeto "${name}" (${roleLabel}): ${invite}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Builds a `mailto:?subject=...&body=...` email invite link for the given share URL or direct IP code. */
export function buildEmailShareUrl(shareUrl: string, projectName: string, role: CollabLinkRole): string {
  const roleLabel = role === 'editor' ? 'Leitura e Edição' : 'Somente Leitura';
  const name = projectName.trim() || 'Projeto Hestia';
  const invite = shareUrl.trim();
  const hint = /^https?:\/\//i.test(invite) ? 'Acesse pelo link:' : 'Cole este código em Colaborar ▸ Entrar na sessão:';
  const subject = `Convite de colaboração Hestia — ${name}`;
  const body = `Você foi convidado para acessar o projeto "${name}" no Hestia (${roleLabel}).\n\n${hint}\n${invite}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Parses collaboration query parameters (`?collab=...&token=...&ws=...`) from a search string or full URL. */
export function parseCollabUrlParams(search: string): { roomId: string; token: string; wsUrl?: string } | null {
  const trimmed = search.trim();
  if (!trimmed) return null;
  let query = trimmed;
  let wsFromScheme: string | undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      query = url.search;
      if (url.protocol === 'ws:' || url.protocol === 'wss:') {
        wsFromScheme = `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`;
      }
    } catch {
      return null;
    }
  } else {
    const qIdx = trimmed.indexOf('?');
    if (qIdx >= 0) query = trimmed.slice(qIdx);
  }
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const roomId = params.get('collab')?.trim() ?? '';
  const token = params.get('token')?.trim() ?? '';
  if (!roomId || !token) return null;
  const wsUrl = (params.get('ws') ?? params.get('wsUrl'))?.trim() || wsFromScheme;
  return wsUrl ? { roomId, token, wsUrl } : { roomId, token };
}

function parseHestiaIpUrl(trimmed: string): { roomId: string; token: string; wsUrl?: string } | null {
  try {
    const url = new URL(trimmed);
    if (url.search) {
      const fromQuery = parseCollabUrlParams(url.search);
      if (fromQuery) return fromQuery.wsUrl || !url.host ? fromQuery : { ...fromQuery, wsUrl: `ws://${url.host}` };
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || !url.host) return null;
    const roomId = decodeURIComponent(parts[0] ?? '').trim();
    const token = decodeURIComponent(parts[1] ?? '').trim();
    return roomId && token ? { roomId, token, wsUrl: `ws://${url.host}` } : null;
  } catch {
    return null;
  }
}

function parseDirectIpCode(trimmed: string): { roomId: string; token: string; wsUrl?: string } | null {
  const ipv6 = /^(\[[^\]]+\])(?::(\d{1,5}))?:([^:\s]+):([^:\s]+)$/.exec(trimmed);
  if (ipv6) {
    const port = ipv6[2] ? Number(ipv6[2]) : undefined;
    const wsUrl = port && port <= 65535 ? `ws://${ipv6[1]!}:${port}` : `ws://${ipv6[1]!}`;
    return { roomId: ipv6[3]!, token: ipv6[4]!, wsUrl };
  }
  const four = /^([^:\s]+):(\d{1,5}):([^:\s]+):([^:\s]+)$/.exec(trimmed);
  if (four) {
    const port = Number(four[2]);
    if (port > 0 && port <= 65535) return { roomId: four[3]!, token: four[4]!, wsUrl: `ws://${four[1]!}:${port}` };
  }
  const three = /^([^:\s]+):([^:\s]+):([^:\s]+)$/.exec(trimmed);
  if (three) return { roomId: three[2]!, token: three[3]!, wsUrl: `ws://${three[1]!}` };
  const two = /^([^:\s]+):([^:\s]+)$/.exec(trimmed);
  if (two) return { roomId: two[1]!, token: two[2]! };
  return null;
}

/**
 * Parses a pasted invite input: direct `ip:port:roomId:token`, `hestia-ip://host:port/roomId/token`,
 * `ws://`/`http://` URLs with `?collab=...&token=...`, shorthand `roomId:token`, or raw `hc1_...` tokens.
 */
export function parseInviteInput(input: string): { roomId: string; token: string; wsUrl?: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^hestia-ip:\/\//i.test(trimmed)) return parseHestiaIpUrl(trimmed);

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || trimmed.includes('collab=') || trimmed.startsWith('?')) {
    return parseCollabUrlParams(trimmed);
  }

  if (trimmed.startsWith(`${TOKEN_PREFIX}_`)) {
    const parsed = parseTokenParts(trimmed);
    return parsed ? { roomId: parsed.roomId, token: trimmed } : null;
  }

  return parseDirectIpCode(trimmed);
}
