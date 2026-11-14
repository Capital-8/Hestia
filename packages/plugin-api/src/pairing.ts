/**
 * Pareamento por token (protocolo 1.1; docs/plugins/07-pareamento-por-token.md). O token NUNCA trafega: cada lado prova
 * que o conhece com HMAC-SHA256 sobre os dois nonces (desafio e resposta mútuos):
 *   prova do host   = HMAC(token, "hestia-host|"   + nonceDoPlugin + "|" + nonceDoHost)
 *   prova do plugin = HMAC(token, "hestia-plugin|" + nonceDoPlugin + "|" + nonceDoHost)
 * Os nonces vão em base64 (16 bytes aleatórios) e entram no cálculo como o texto recebido. Só WebCrypto
 * (`globalThis.crypto`, presente no navegador, no Tauri e no Node 20+); nenhuma dependência.
 */

export type AuthPolicy = 'required' | 'optional';
export type AuthLabel = 'hestia-host' | 'hestia-plugin';

/** Causa mostrada ao usuário quando o pareamento falha. */
export type AuthCause = 'wrong_token' | 'no_token' | 'plugin_without_auth' | 'timeout' | 'locked' | 'no_crypto';

/** Um token de 128 bits em hexadecimal já tem 32 caracteres. */
export const TOKEN_MIN_CHARS = 32;
export const TOKEN_MAX_CHARS = 256;
/** Falhas seguidas que bloqueiam novas tentativas. */
export const AUTH_MAX_FAILURES = 3;
/** Duração do bloqueio, em milissegundos. */
export const AUTH_LOCK_MS = 10_000;

/** Token plausível (sem espaços, de 32 a 256 caracteres) ou null. */
export function normalizeToken(raw: string): string | null {
  const t = raw.trim();
  return t.length >= TOKEN_MIN_CHARS && t.length <= TOKEN_MAX_CHARS && !/\s/.test(t) ? t : null;
}

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('no_crypto');
  return s;
};

const b64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

const unb64 = (s: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch { return null; }
};

/** 16 bytes aleatórios em base64. */
export function randomNonce(): string {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) throw new Error('no_crypto');
  return b64(c.getRandomValues(new Uint8Array(16)));
}

/** Compara dois vetores em tempo constante (o tempo não depende de onde os bytes diferem). */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

async function hmac(token: string, label: AuthLabel, nonceP: string, nonceH: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await subtle().importKey('raw', enc.encode(token.trim()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', key, enc.encode(`${label}|${nonceP}|${nonceH}`)));
}

/** Prova (base64) de que quem fala conhece o token. */
export async function authProof(token: string, label: AuthLabel, nonceP: string, nonceH: string): Promise<string> {
  return b64(await hmac(token, label, nonceP, nonceH));
}

/** Confere a prova recebida em tempo constante. Base64 inválido ou prova errada → false. */
export async function verifyAuthProof(token: string, label: AuthLabel, nonceP: string, nonceH: string, proof: string): Promise<boolean> {
  const got = unb64(proof);
  if (!got) return false;
  return constantTimeEqual(await hmac(token, label, nonceP, nonceH), got);
}

/** Bloqueio por falhas seguidas: depois de `AUTH_MAX_FAILURES`, recusa novas tentativas por `AUTH_LOCK_MS`. */
export class AuthLockout {
  private failures = 0;
  private lockedUntil = 0;
  constructor(private readonly now: () => number = Date.now) {}
  /** Milissegundos que faltam para liberar (0 = liberado). */
  remainingMs(): number { return Math.max(0, this.lockedUntil - this.now()); }
  fail(): void {
    this.failures += 1;
    if (this.failures >= AUTH_MAX_FAILURES) { this.lockedUntil = this.now() + AUTH_LOCK_MS; this.failures = 0; }
  }
  succeed(): void { this.failures = 0; this.lockedUntil = 0; }
}
