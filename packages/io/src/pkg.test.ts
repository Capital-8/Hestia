import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { openPackage, openPackageFolder, PkgError } from './pkg.ts';
import { PKG_ZIP_LIMITS, readZip, safeEntryPath, ZipReadError } from './zipRead.ts';
import { createZip } from './zip.ts';

const enc = new TextEncoder();

const MANIFEST = {
  manifestVersion: 2,
  id: 'dev.exemplo.teste',
  name: 'Teste',
  version: '1.0.0',
  hestiaApi: '2.0',
  runtime: 'script',
  entry: 'main.js',
  capabilities: ['model.read'],
};

function pkg(extra: { path: string; data: string | Uint8Array }[] = [], manifest: unknown = MANIFEST): Uint8Array {
  return createZip([{ path: 'manifest.json', data: JSON.stringify(manifest) }, { path: 'main.js', data: 'export const x = 1;' }, ...extra]);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc(d: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of d) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface CraftEntry {
  name: string;
  data: Uint8Array;
  method?: number;
  usize?: number;
  flags?: number;
  attrs?: number;
}

/** Zip artesanal com método, tamanhos, flags e atributos controláveis (para casos hostis). */
function craft(entries: CraftEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const method = e.method ?? 0;
    const comp = method === 8 ? new Uint8Array(deflateRawSync(e.data)) : e.data;
    const usize = e.usize ?? e.data.length;
    const l = new Uint8Array(30 + name.length);
    const lv = new DataView(l.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc(e.data), true);
    lv.setUint32(18, comp.length, true);
    lv.setUint32(22, usize, true);
    lv.setUint16(26, name.length, true);
    l.set(name, 30);
    parts.push(l, comp);
    const c = new Uint8Array(46 + name.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, e.flags ?? 0, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc(e.data), true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, usize, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(38, e.attrs ?? 0, true);
    cv.setUint32(42, offset, true);
    c.set(name, 46);
    central.push(c);
    offset += l.length + comp.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ZipReadError || e instanceof PkgError) return e.code;
    throw e;
  }
  return 'ok';
}

describe('safeEntryPath', () => {
  it('aceita relativos e recusa perigosos', () => {
    expect(safeEntryPath('data/a.json')).toBe('data/a.json');
    for (const bad of ['../x', 'a/../b', '/abs', 'C:/x', 'a\\b', 'a//b', './a', 'con.txt', 'a\u0000b', '']) expect(safeEntryPath(bad)).toBeNull();
  });
});

describe('readZip', () => {
  it('lê store e deflate', async () => {
    const zip = craft([
      { name: 'a.txt', data: enc.encode('olá') },
      { name: 'b.txt', data: enc.encode('x'.repeat(500) + 'abc'), method: 8 },
    ]);
    const files = await readZip(zip);
    expect(files.map((f) => f.path)).toEqual(['a.txt', 'b.txt']);
    expect(new TextDecoder().decode(files[1]!.data)).toHaveLength(503);
  });
  it('recusa caminhos com .., absolutos e links', async () => {
    expect(await codeOf(readZip(craft([{ name: '../fora.js', data: enc.encode('1') }])))).toBe('bad_path');
    expect(await codeOf(readZip(craft([{ name: '/abs.js', data: enc.encode('1') }])))).toBe('bad_path');
    expect(await codeOf(readZip(craft([{ name: 'l', data: enc.encode('x'), attrs: 0xa1ff0000 }])))).toBe('bad_path');
  });
  it('recusa repetido, cifrado e método desconhecido', async () => {
    expect(await codeOf(readZip(craft([{ name: 'a', data: enc.encode('1') }, { name: 'a', data: enc.encode('2') }])))).toBe('duplicate');
    expect(await codeOf(readZip(craft([{ name: 'a', data: enc.encode('1'), flags: 1 }])))).toBe('encrypted');
    expect(await codeOf(readZip(craft([{ name: 'a', data: enc.encode('1'), method: 12 }])))).toBe('method');
  });
  it('recusa não-zip e CRC inválido', async () => {
    expect(await codeOf(readZip(new Uint8Array(50)))).toBe('not_zip');
    const zip = craft([{ name: 'a', data: enc.encode('hello') }]);
    zip[30 + 1] = 0x7a; // corrompe o conteúdo
    expect(await codeOf(readZip(zip))).toBe('crc');
  });
  it('barra zip bomb por razão e por tamanho', async () => {
    const zeros = new Uint8Array(2 * 1024 * 1024);
    expect(await codeOf(readZip(craft([{ name: 'z.txt', data: zeros, method: 8 }])))).toBe('ratio');
    expect(await codeOf(readZip(craft([{ name: 'z.txt', data: zeros }]), { ...PKG_ZIP_LIMITS, maxFileBytes: 1024 }))).toBe('too_big_file');
    expect(await codeOf(readZip(craft([{ name: 'a', data: new Uint8Array(10) }, { name: 'b', data: new Uint8Array(10) }]), { ...PKG_ZIP_LIMITS, maxTotalBytes: 15 }))).toBe('too_big_total');
    expect(await codeOf(readZip(craft([{ name: 'a', data: new Uint8Array(1) }, { name: 'b', data: new Uint8Array(1) }]), { ...PKG_ZIP_LIMITS, maxFiles: 1 }))).toBe('too_many_files');
  });
  it('corta quando o cabeçalho mente sobre o tamanho', async () => {
    const data = enc.encode('ab'.repeat(2000));
    expect(await codeOf(readZip(craft([{ name: 'a.txt', data, method: 8, usize: 10 }])))).toBe('too_big_file');
  });
});

describe('openPackage', () => {
  it('abre pacote válido com aviso de falta de assinatura', async () => {
    const p = await openPackage(pkg([{ path: 'README.md', data: '# oi' }]));
    expect(p.manifest.id).toBe('dev.exemplo.teste');
    expect(p.manifest.runtime).toBe('script');
    expect(p.files.has('main.js')).toBe(true);
    expect(p.warnings.join(' ')).toMatch(/assinatura/);
    expect(p.readme).toBe('# oi');
  });
  it('recusa .wasm, executáveis e tipos fora da lista', async () => {
    expect(await codeOf(openPackage(pkg([{ path: 'x.wasm', data: new Uint8Array(4) }])))).toBe('wasm');
    expect(await codeOf(openPackage(pkg([{ path: 'x.exe', data: new Uint8Array(4) }])))).toBe('file_type');
    expect(await codeOf(openPackage(pkg([{ path: 'x.html', data: 'a' }])))).toBe('file_type');
  });
  it('recusa manifesto ausente, inválido e entrada faltando', async () => {
    expect(await codeOf(openPackage(createZip([{ path: 'main.js', data: 'x' }])))).toBe('no_manifest');
    expect(await codeOf(openPackage(createZip([{ path: 'manifest.json', data: '{' }])))).toBe('manifest_json');
    expect(await codeOf(openPackage(pkg([], { ...MANIFEST, id: 'MAIUSCULO' })))).toBe('manifest_field');
    expect(await codeOf(openPackage(pkg([], { ...MANIFEST, entry: '../x.js' })))).toBe('manifest_field');
    expect(await codeOf(openPackage(pkg([], { ...MANIFEST, entry: 'outro.js' })))).toBe('entry_missing');
    expect(await codeOf(openPackage(pkg([], { ...MANIFEST, runtime: 'declarative', entry: undefined, capabilities: ['model.write'] })))).toBe('manifest_field');
    expect(await codeOf(openPackage(pkg([], { ...MANIFEST, capabilities: ['model.read', 'model.read'] })))).toBe('manifest_field');
  });
  it('recusa pacote acima de 16 MiB', async () => {
    expect(await codeOf(openPackage(new Uint8Array(16 * 1024 * 1024 + 1)))).toBe('too_big_pkg');
  });
  it('aceita pasta de desenvolvimento com as mesmas regras', () => {
    const p = openPackageFolder([
      { path: 'manifest.json', data: enc.encode(JSON.stringify(MANIFEST)) },
      { path: 'main.js', data: enc.encode('1') },
    ]);
    expect(p.manifest.entry).toBe('main.js');
    expect(() => openPackageFolder([{ path: '../manifest.json', data: enc.encode('{}') }])).toThrow(PkgError);
  });
});
