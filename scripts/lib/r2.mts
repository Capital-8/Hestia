/**
 * Cliente mínimo do R2 (API S3) com assinatura AWS SigV4 feita com node:crypto, sem dependências.
 * Só lista objetos (ListObjectsV2). As partes puras (assinatura e parse do XML) são testadas em tests/r2Sigv4.test.ts.
 */
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

const hmac = (chave: Buffer | string, dado: string): Buffer => createHmac('sha256', chave).update(dado, 'utf8').digest();
export const sha256Hex = (dado: string | Buffer): string => createHash('sha256').update(dado).digest('hex');

/** Codificação de URI da AWS: tudo exceto A-Z a-z 0-9 - _ . ~ (e `/` quando `manterBarra`). */
export function uriEncode(s: string, manterBarra = false): string {
  let r = '';
  for (const b of Buffer.from(s, 'utf8')) {
    const c = String.fromCharCode(b);
    if (/[A-Za-z0-9\-_.~]/.test(c) || (manterBarra && c === '/')) r += c;
    else r += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return r;
}

/** Chave de assinatura derivada: HMAC encadeado de data, região, serviço e "aws4_request". */
export function chaveAssinatura(secret: string, data: string, regiao: string, servico: string): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, data), regiao), servico), 'aws4_request');
}

/** Assinatura final (hex) de uma "string to sign". */
export function assinar(secret: string, data: string, regiao: string, servico: string, stringToSign: string): string {
  return createHmac('sha256', chaveAssinatura(secret, data, regiao, servico)).update(stringToSign, 'utf8').digest('hex');
}

/** Query canônica: pares codificados e ordenados pelo nome. */
export function queryCanonica(params: Readonly<Record<string, string>>): string {
  return Object.entries(params)
    .map(([k, v]) => [uriEncode(k), uriEncode(v)] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
}

export interface PedidoAssinavel {
  metodo: string;
  host: string;
  /** Caminho no formato final da URL (ex.: `/bucket`). */
  caminho: string;
  query: Readonly<Record<string, string>>;
  regiao: string;
  servico: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Instante no formato `YYYYMMDDTHHMMSSZ`. */
  amzDate: string;
  /** Corpo (vazio por padrão). */
  corpo?: string;
}

/** Cabeçalhos assinados (host, x-amz-content-sha256, x-amz-date, Authorization) para o pedido. */
export function assinarPedido(p: PedidoAssinavel): Record<string, string> {
  const dia = p.amzDate.slice(0, 8);
  const hashCorpo = sha256Hex(p.corpo ?? '');
  const cabecalhos: Record<string, string> = { host: p.host, 'x-amz-content-sha256': hashCorpo, 'x-amz-date': p.amzDate };
  const nomes = Object.keys(cabecalhos).sort();
  const canonico = [
    p.metodo,
    uriEncode(p.caminho, true),
    queryCanonica(p.query),
    ...nomes.map((n) => `${n}:${cabecalhos[n]!.trim()}`),
    '',
    nomes.join(';'),
    hashCorpo,
  ].join('\n');
  const escopo = `${dia}/${p.regiao}/${p.servico}/aws4_request`;
  const aAssinar = ['AWS4-HMAC-SHA256', p.amzDate, escopo, sha256Hex(canonico)].join('\n');
  const assinatura = assinar(p.secretAccessKey, dia, p.regiao, p.servico, aAssinar);
  return { ...cabecalhos, Authorization: `AWS4-HMAC-SHA256 Credential=${p.accessKeyId}/${escopo}, SignedHeaders=${nomes.join(';')}, Signature=${assinatura}` };
}

export const formatarAmzDate = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

const decodificarXml = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const campo = (bloco: string, nome: string): string | undefined => {
  const m = new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`).exec(bloco);
  return m ? decodificarXml(m[1]!) : undefined;
};

export interface PaginaListagem {
  objetos: Array<{ key: string; size: number }>;
  truncada: boolean;
  proximoToken?: string;
}

/** Lê a resposta de ListObjectsV2 por blocos `<Contents>`, sem depender da ordem dos campos. */
export function parseListagem(xml: string): PaginaListagem {
  const objetos: PaginaListagem['objetos'] = [];
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = campo(m[1]!, 'Key');
    const size = Number(campo(m[1]!, 'Size') ?? 0);
    if (key !== undefined) objetos.push({ key, size: Number.isFinite(size) ? size : 0 });
  }
  // O token e o truncamento ficam fora dos blocos <Contents>.
  const fora = xml.replace(/<Contents>[\s\S]*?<\/Contents>/g, '');
  const proximoToken = campo(fora, 'NextContinuationToken');
  return { objetos, truncada: campo(fora, 'IsTruncated') === 'true', ...(proximoToken ? { proximoToken } : {}) };
}

/** `R2_BUCKET` pode vir como URL completa: o nome é o último segmento do caminho. */
export function nomeDoBucket(valor: string): string {
  const v = valor.trim();
  if (!/^https?:\/\//i.test(v)) return v.replace(/^\/+|\/+$/g, '');
  const partes = new URL(v).pathname.split('/').filter(Boolean);
  return partes[partes.length - 1] ?? '';
}

/** Lê a configuração de process.env e, para o que faltar, de um arquivo `CHAVE=valor`. Nunca imprime os valores. */
export function lerConfigR2(arquivo: string): R2Config {
  const vals: Record<string, string> = {};
  if (fs.existsSync(arquivo)) {
    for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha);
      if (m) vals[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, '$2');
    }
  }
  const pega = (k: string): string => (process.env[k] || vals[k] || '').trim();
  const faltam = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'].filter((k) => !pega(k));
  if (faltam.length) throw new Error(`Variáveis do R2 ausentes: ${faltam.join(', ')}`);
  return { accountId: pega('R2_ACCOUNT_ID'), accessKeyId: pega('R2_ACCESS_KEY_ID'), secretAccessKey: pega('R2_SECRET_ACCESS_KEY'), bucket: nomeDoBucket(pega('R2_BUCKET')), publicUrl: pega('R2_PUBLIC_URL') };
}

/** Lista todos os objetos com o prefixo (ListObjectsV2, com paginação). */
export async function listarObjetos(cfg: R2Config, prefixo: string, progresso?: (total: number) => void): Promise<Array<{ key: string; size: number }>> {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const caminho = `/${cfg.bucket}`;
  const todos: Array<{ key: string; size: number }> = [];
  let token: string | undefined;
  do {
    const query: Record<string, string> = { 'list-type': '2', prefix: prefixo, 'max-keys': '1000' };
    if (token) query['continuation-token'] = token;
    const cab = assinarPedido({ metodo: 'GET', host, caminho, query, regiao: 'auto', servico: 's3', accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, amzDate: formatarAmzDate(new Date()) });
    const { host: _host, ...enviar } = cab;
    const resp = await fetch(`https://${host}${uriEncode(caminho, true)}?${queryCanonica(query)}`, { headers: enviar });
    const texto = await resp.text();
    if (!resp.ok) throw new Error(`ListObjectsV2 falhou (HTTP ${resp.status}): ${texto.slice(0, 200)}`);
    const pagina = parseListagem(texto);
    todos.push(...pagina.objetos);
    progresso?.(todos.length);
    token = pagina.truncada ? pagina.proximoToken : undefined;
  } while (token);
  return todos;
}
