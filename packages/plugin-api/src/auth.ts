/**
 * Pareamento autenticado (protocolo 1.1, docs/plugins/07-pareamento-por-token.md).
 *
 * Desafio e resposta MÚTUOS com HMAC-SHA256: o token compartilhado nunca trafega. Cada conexão usa dois nonces novos
 * (um de cada lado), e as duas provas amarram os dois, então uma prova capturada não vale em outra conexão.
 *
 *   plugin → host : hello { auth: { nonce: nP } }
 *   host → plugin : auth  { nonce: nH, proof: HMAC(token, "hestia-host|"   + nP + "|" + nH) }
 *   plugin → host : auth.ok { proof: HMAC(token, "hestia-plugin|" + nP + "|" + nH) }
 *
 * Usa WebCrypto (`crypto.subtle`), presente no navegador, no Tauri e no Node.
 */

export const AUTH_MIN_PROTOCOL_MINOR = 1;
/** Token mínimo aceito (caracteres). O renderizador gera 64 hex (256 bits). */
export const MIN_TOKEN_LENGTH = 32;
const NONCE_BYTES = 16;

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function randomNonce(): string {
  const a = new Uint8Array(NONCE_BYTES);
  globalThis.crypto.getRandomValues(a);
  return b64(a);
}

export const isNonce = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9+/]{22}==$/.test(x);

export const isValidToken = (t: unknown): t is string => typeof t === 'string' && t.length >= MIN_TOKEN_LENGTH && t.length <= 256;

export type AuthRole = 'host' | 'plugin';

/** Prova de quem fala (`role`), amarrada aos dois nonces. Devolve base64. */
export async function authProof(token: string, role: AuthRole, nonceP: string, nonceH: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(`hestia-${role}|${nonceP}|${nonceH}`));
  return b64(new Uint8Array(sig));
}

/** Comparação em tempo constante (não vaza onde as provas diferem). */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
