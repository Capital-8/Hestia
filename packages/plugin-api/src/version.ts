/**
 * Versões da API pública de plugins do Hestia (docs/plugins/01-api.md).
 *
 * Duas versões independentes, ambas semânticas (`major.minor`):
 *  - API: o contrato TypeScript e os campos de cena/manifesto. `major` quebra compatibilidade; `minor` só acrescenta.
 *  - Protocolo: o formato dos quadros no fio. O mesmo critério.
 */
export const API_VERSION = { major: 1, minor: 0 } as const;
/** 1.2 acrescenta o snapshot em partes (`scene.snapshot.begin`, `.part`, `.end`). */
/** 1.1 acrescenta o pareamento autenticado (`auth`, `auth.ok`); o 1.0 continua negociável quando o host não exige token. */
export const PROTOCOL_VERSION = { major: 1, minor: 2 } as const;

export interface Version {
  major: number;
  minor: number;
}

/** "1.0" → {1,0}; devolve null para qualquer outra forma. */
export function parseVersion(s: unknown): Version | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{1,4})\.(\d{1,4})$/.exec(s);
  return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
}

export const formatVersion = (v: Version): string => `${v.major}.${v.minor}`;

export const compareVersions = (a: Version, b: Version): number => a.major - b.major || a.minor - b.minor;

/** Um plugin escrito para a API `want` roda neste host? Mesmo major, e o host não pode ser mais antigo que o pedido. */
export const apiSupports = (want: Version, host: Version = API_VERSION): boolean => want.major === host.major && want.minor <= host.minor;

export type Negotiation =
  | { ok: true; version: Version }
  | { ok: false; reason: 'no_common_version'; host: Version; plugin: { min: Version; max: Version } };

/**
 * Negociação do protocolo: o plugin informa a faixa `[min, max]` que fala; o host escolhe a maior versão da faixa que
 * ele próprio suporta (mesmo major, minor limitado ao do host). Sem interseção → incompatível.
 */
export function negotiateProtocol(range: { min: Version; max: Version }, host: Version = PROTOCOL_VERSION): Negotiation {
  const alvo: Version = compareVersions(range.max, host) < 0 ? { ...range.max } : { ...host };
  const dentro = alvo.major === host.major && compareVersions(alvo, range.min) >= 0 && compareVersions(alvo, range.max) <= 0;
  return dentro ? { ok: true, version: alvo } : { ok: false, reason: 'no_common_version', host, plugin: range };
}
