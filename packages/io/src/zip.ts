/**
 * Escritor ZIP mínimo para o lote de DXF: método "store" (sem compressão), nomes em UTF-8 e datas DOS.
 *
 * Sem dependência nova: o pacote do Hestia não tem biblioteca de ZIP e o lote precisa entregar uma pasta de arquivos num
 * download só (o navegador não deixa escrever pasta). Um ZIP sem compressão é suficiente: os DXF são texto e o ganho de
 * deflate não paga o custo de manter a implementação. Arquivos acima de 4 GB ou 65.535 entradas não são suportados (ZIP64).
 */
import { t, type Lang } from './i18n.ts';

/** Um arquivo do ZIP: caminho com `/` (pastas inclusive) e conteúdo em texto (UTF-8) ou bytes. */
export interface ZipFile {
  path: string;
  data: string | Uint8Array;
}

/** Tabela do CRC-32 (polinômio 0xEDB88320), calculada uma vez. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** CRC-32 de um bloco de bytes. */
function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Hora no formato DOS (2 s de resolução), em UTC para o resultado não depender do fuso. */
function dosTime(date: Date): number {
  return ((date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1)) & 0xffff;
}

/** Data no formato DOS (a partir de 1980), em UTC. */
function dosDate(date: Date): number {
  const year = Math.max(1980, date.getUTCFullYear());
  return (((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()) & 0xffff;
}

/** Caminho do ZIP: `/` como separador, sem barra inicial e sem `..` (o pacote é gerado pelo app, mas não custa). */
function zipPath(path: string): string {
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = clean.split('/').filter((p) => p !== '' && p !== '.' && p !== '..');
  return parts.join('/');
}

const encoder = new TextEncoder();

/** Concatena partes num só `Uint8Array`. */
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * Monta um ZIP com os arquivos dados, na ordem recebida. `date` (opcional) fixa a data DOS para testes e para o pacote
 * sair determinístico. Nomes em UTF-8 (flag 11 do cabeçalho) e CRC-32 por arquivo.
 */
export function createZip(files: readonly ZipFile[], date = new Date(), lang: Lang = 'pt'): Uint8Array {
  if (files.length > 0xffff) throw new Error(t(lang, 'io_err_zip_too_many'));
  const time = dosTime(date);
  const day = dosDate(date);
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(zipPath(file.path));
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // versão necessária
    lv.setUint16(6, 0x0800, true); // nomes em UTF-8
    lv.setUint16(8, 0, true); // método: store
    lv.setUint16(10, time, true);
    lv.setUint16(12, day, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // extra
    local.set(name, 30);
    locals.push(local, data);

    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // versão de quem criou
    cv.setUint16(6, 20, true); // versão necessária
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comentário
    cv.setUint16(34, 0, true); // disco
    cv.setUint16(36, 0, true); // atributos internos
    cv.setUint32(38, 0, true); // atributos externos
    cv.setUint32(42, offset, true); // deslocamento do cabeçalho local
    entry.set(name, 46);
    central.push(entry);

    offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, p) => sum + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  return concat([...locals, ...central, end]);
}
