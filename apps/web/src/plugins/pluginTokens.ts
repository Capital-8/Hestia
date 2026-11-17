import { normalizeToken, type AuthCause, type AuthPolicy } from '@hestia/plugin-api';
import { safeGet, safeSet } from '../editor/storage.ts';

/**
 * Tokens de pareamento dos plugins de processo externo (protocolo 1.1, docs/plugins/07-pareamento-por-token.md).
 *
 * Onde ficam: no `localStorage` do navegador/webview, por plugin. Isso é MENOS seguro que o cofre do sistema (qualquer
 * código que rode na mesma origem lê o valor); a tela avisa. No desktop (Tauri) ainda não há comando de cofre no app:
 * quando existir, só `lerToken`/`gravarToken` precisam mudar. O token nunca é enviado pela rede nem gravado no projeto.
 */
const CHAVE = 'hestia.plugins.tokens.v1';

function ler(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(safeGet(CHAVE) ?? '{}');
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch { return {}; }
}

/** Token guardado para o plugin, ou undefined. */
export function lerToken(pluginKey: string): string | undefined {
  const t = ler()[pluginKey];
  return t && normalizeToken(t) ? t : undefined;
}

/** Guarda (ou apaga, com `null`) o token do plugin. Devolve false se o texto não parece um token (32 a 256 caracteres, sem espaços). */
export function gravarToken(pluginKey: string, token: string | null): boolean {
  const all = ler();
  if (token === null) delete all[pluginKey];
  else {
    const t = normalizeToken(token);
    if (!t) return false;
    all[pluginKey] = t;
  }
  safeSet(CHAVE, JSON.stringify(all));
  return true;
}

/** O armazenamento do token é o do navegador (menos seguro que o cofre do sistema). */
export const tokenNoCofreDoSistema = (): boolean => false;

/**
 * Política do token: obrigatório em uso real. O modo opcional existe só em desenvolvimento (build de desenvolvimento e
 * testes), com aviso na tela quando uma sessão conecta sem autenticar.
 */
export const politicaDoToken = (desenvolvimento: boolean = import.meta.env.DEV === true): AuthPolicy => (desenvolvimento ? 'optional' : 'required');

const MSG: Record<AuthCause, [string, string]> = {
  wrong_token: ['O token não confere com o do plugin. Copie de novo o token que o programa externo mostrou.', 'The token does not match the plugin\'s. Copy the token the external program showed again.'],
  no_token: ['Este plugin exige token de pareamento. Cole o token abaixo e salve.', 'This plugin requires a pairing token. Paste the token below and save it.'],
  plugin_without_auth: ['O programa externo é antigo (protocolo 1.0, sem token) e o Hestia exige pareamento. Atualize o programa.', 'The external program is old (protocol 1.0, no token) and Hestia requires pairing. Update the program.'],
  timeout: ['O programa externo não respondeu ao pareamento a tempo.', 'The external program did not answer the pairing in time.'],
  locked: ['Muitas falhas de pareamento seguidas. Aguarde alguns segundos ou salve um token novo.', 'Too many pairing failures in a row. Wait a few seconds or save a new token.'],
  no_crypto: ['Este ambiente não oferece a criptografia necessária (WebCrypto) para o pareamento.', 'This environment does not offer the cryptography (WebCrypto) required for pairing.'],
};

/** Mensagem da falha de pareamento, no idioma da interface. */
export const mensagemDeCausa = (c: AuthCause, lang: string): string => MSG[c][lang === 'pt' ? 0 : 1];
