/**
 * Leitor ZIP com limites, para o pacote `.hestiapkg` de suplementos (docs/plugins/08 §8).
 *
 * O arquivo é DADO NÃO CONFIÁVEL: todo limite é conferido ANTES de alocar e a descompressão (deflate bruto, via
 * `DecompressionStream`, presente no navegador, no Tauri e no Node) é cortada assim que passa do tamanho declarado, o que
 * barra zip bomb mesmo quando o cabeçalho mente. Sem ZIP64, sem criptografia, sem entrada de diretório gravável.
 * Métodos aceitos: 0 (store) e 8 (deflate). Tamanhos em bytes.
 */

/** Limites da leitura. */
export interface ZipReadLimits {
  /** Quantidade máxima de arquivos. */
  maxFiles: number;
  /** Bytes descompactados somados de todos os arquivos. */
  maxTotalBytes: number;
  /** Bytes descompactados de um arquivo. */
  maxFileBytes: number;
  /** Razão máxima descompactado:compactado (por arquivo e no total). */
  maxRatio: number;
}

/** Limites do `.hestiapkg`: 200 arquivos, 16 MiB no total, 8 MiB por arquivo, razão 100:1. */
export const PKG_ZIP_LIMITS: Readonly<ZipReadLimits> = {
  maxFiles: 200,
  maxTotalBytes: 16 * 1024 * 1024,
  maxFileBytes: 8 * 1024 * 1024,
  maxRatio: 100,
};

export type ZipReadCode =
  | 'not_zip'
  | 'zip64'
  | 'encrypted'
  | 'method'
  | 'too_many_files'
  | 'too_big_total'
  | 'too_big_file'
  | 'ratio'
  | 'bad_path'
  | 'duplicate'
  | 'corrupt'
  | 'crc';

/** Erro de leitura com código estável (a interface traduz; a mensagem é para o log do gerenciador). */
export class ZipReadError extends Error {
  readonly code: ZipReadCode;
  constructor(code: ZipReadCode, message: string) {
    super(message);
    this.name = 'ZipReadError';
    this.code = code;
  }
}

/** Arquivo lido do ZIP. */
export interface ZipEntryData {
  path: string;
  data: Uint8Array;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Nome reservado do Windows (com ou sem extensão), recusado em qualquer sistema. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * Caminho seguro de uma entrada: relativo, separador `/`, sem `..`, sem `.`, sem barra inicial, sem letra de unidade,
 * sem barra invertida, sem caractere de controle e sem nome reservado. Devolve `null` quando inseguro.
 */
export function safeEntryPath(name: string): string | null {
  if (name === '' || name.length > 240) return null;
  if (name.startsWith('/') || name.includes('\\') || /^[a-zA-Z]:/.test(name)) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return null;
  const parts = name.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i]!;
    if (p === '..' || p === '.') return null;
    if (p === '' && i !== parts.length - 1) return null; // `//` no meio
    if (p !== '' && RESERVED.test(p)) return null;
  }
  return name;
}

/** Deflate bruto → bytes, cortando em `limit` bytes (excedeu = `too_big_file`). */
async function inflateRaw(src: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([src as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new ZipReadError('too_big_file', 'descompressão passou do tamanho declarado');
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof ZipReadError) throw e;
    throw new ZipReadError('corrupt', 'dados deflate inválidos');
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

interface CentralEntry {
  path: string;
  isDir: boolean;
  method: number;
  crc: number;
  csize: number;
  usize: number;
  localAt: number;
}

/** Lê o diretório central, conferindo tudo o que dá para conferir sem descompactar. */
function readCentral(zip: Uint8Array, limits: ZipReadLimits): CentralEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  const stop = Math.max(0, zip.length - 22 - 0xffff);
  for (let i = zip.length - 22; i >= stop; i -= 1) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipReadError('not_zip', 'não é um arquivo ZIP');
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdAt = view.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdAt === 0xffffffff) throw new ZipReadError('zip64', 'ZIP64 não suportado');
  if (count > limits.maxFiles) throw new ZipReadError('too_many_files', `mais de ${limits.maxFiles} arquivos`);
  if (cdAt + cdSize > eocd) throw new ZipReadError('corrupt', 'diretório central fora do arquivo');
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const out: CentralEntry[] = [];
  const seen = new Set<string>();
  let at = cdAt;
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > zip.length || view.getUint32(at, true) !== SIG_CENTRAL) throw new ZipReadError('corrupt', 'diretório central inválido');
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const csize = view.getUint32(at + 20, true);
    const usize = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const attrs = view.getUint32(at + 38, true);
    const localAt = view.getUint32(at + 42, true);
    if (at + 46 + nameLen + extraLen + commentLen > zip.length) throw new ZipReadError('corrupt', 'entrada truncada');
    const rawName = decoder.decode(zip.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (flags & 1 || flags & 0x40) throw new ZipReadError('encrypted', `arquivo cifrado: ${rawName}`);
    if (csize === 0xffffffff || usize === 0xffffffff) throw new ZipReadError('zip64', 'ZIP64 não suportado');
    const path = safeEntryPath(rawName);
    if (path === null) throw new ZipReadError('bad_path', `caminho inválido: ${rawName.slice(0, 80)}`);
    // Link simbólico (modo Unix 0xA000 nos 16 bits altos do atributo externo) não é aceito.
    if (((attrs >>> 16) & 0xf000) === 0xa000) throw new ZipReadError('bad_path', `link não permitido: ${path}`);
    if (path.endsWith('/')) continue; // entrada de pasta: nada a extrair
    if (method !== 0 && method !== 8) throw new ZipReadError('method', `método ${method} não suportado: ${path}`);
    if (seen.has(path)) throw new ZipReadError('duplicate', `caminho repetido: ${path}`);
    seen.add(path);
    if (usize > limits.maxFileBytes) throw new ZipReadError('too_big_file', `arquivo grande demais: ${path}`);
    if (usize > 0 && usize / Math.max(csize, 1) > limits.maxRatio) throw new ZipReadError('ratio', `razão de compressão acima de ${limits.maxRatio}:1: ${path}`);
    total += usize;
    if (total > limits.maxTotalBytes) throw new ZipReadError('too_big_total', 'conteúdo descompactado grande demais');
    out.push({ path, isDir: false, method, crc, csize, usize, localAt });
  }
  return out;
}

/**
 * Lê todos os arquivos do ZIP respeitando os limites. Lança `ZipReadError` no primeiro problema; nada é devolvido pela
 * metade. Confere CRC-32 e tamanho real de cada arquivo.
 */
export async function readZip(zip: Uint8Array, limits: ZipReadLimits = PKG_ZIP_LIMITS): Promise<ZipEntryData[]> {
  const entries = readCentral(zip, limits);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const out: ZipEntryData[] = [];
  let totalCompressed = 0;
  let totalReal = 0;
  for (const e of entries) {
    if (e.localAt + 30 > zip.length || view.getUint32(e.localAt, true) !== SIG_LOCAL) throw new ZipReadError('corrupt', `cabeçalho local inválido: ${e.path}`);
    const start = e.localAt + 30 + view.getUint16(e.localAt + 26, true) + view.getUint16(e.localAt + 28, true);
    if (start + e.csize > zip.length) throw new ZipReadError('corrupt', `dados truncados: ${e.path}`);
    const raw = zip.subarray(start, start + e.csize);
    const data = e.method === 0 ? raw.slice() : await inflateRaw(raw, e.usize);
    if (data.length !== e.usize) throw new ZipReadError('corrupt', `tamanho diferente do declarado: ${e.path}`);
    if (crc32(data) !== e.crc) throw new ZipReadError('crc', `CRC inválido: ${e.path}`);
    totalCompressed += e.csize;
    totalReal += data.length;
    if (totalReal > limits.maxTotalBytes) throw new ZipReadError('too_big_total', 'conteúdo descompactado grande demais');
    out.push({ path: e.path, data });
  }
  if (totalReal > 0 && totalReal / Math.max(totalCompressed, 1) > limits.maxRatio) throw new ZipReadError('ratio', `razão de compressão total acima de ${limits.maxRatio}:1`);
  return out;
}
