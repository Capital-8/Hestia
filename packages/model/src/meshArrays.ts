import type { Generic, GenericMesh, Project } from './types.ts';

/**
 * Malha dos objetos genéricos em memória: `Float32Array` (posições) e `Uint32Array` (índices). O arquivo salvo
 * continua com arrays JSON comuns (formato idêntico ao anterior), então não há migração de esquema: a leitura aceita
 * os dois formatos e normaliza, e a gravação (`serializeProject`) converte de volta.
 */

/** Malha com arrays tipados; devolve a mesma referência quando já está normalizada. */
export function typedMesh(mesh: GenericMesh): { positions: Float32Array; indices: Uint32Array } {
  const { positions, indices } = mesh;
  if (positions instanceof Float32Array && indices instanceof Uint32Array) return { positions, indices };
  return {
    positions: positions instanceof Float32Array ? positions : Float32Array.from(positions),
    indices: indices instanceof Uint32Array ? indices : Uint32Array.from(indices),
  };
}

/** Desloca o Z (terceira coordenada) de uma lista x, y, z...; sempre devolve uma cópia tipada. */
export function meshShiftedZ(positions: GenericMesh['positions'], dz: number): Float32Array {
  const out = Float32Array.from(positions);
  for (let i = 2; i < out.length; i += 3) out[i] = out[i]! + dz;
  return out;
}

/**
 * Normaliza as malhas de todos os genéricos para arrays tipados (in place no mapa `elements`, que é do chamador:
 * vem de um `JSON.parse` ou de um import recém-montado). Libera os arrays comuns assim que cada malha é convertida.
 */
export function normalizeProjectMeshes<T extends Pick<Project, 'elements'>>(p: T): T {
  for (const [id, e] of Object.entries(p.elements)) {
    if (e?.kind !== 'generic') continue;
    const g = e as Generic;
    if (!g.mesh) continue;
    if (g.mesh.positions instanceof Float32Array && g.mesh.indices instanceof Uint32Array) continue;
    (p.elements as Record<string, unknown>)[id] = { ...g, mesh: typedMesh(g.mesh) };
  }
  return p;
}

const POW10 = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];

/** Menor texto decimal que volta ao mesmo float32 (evita `0.10000000149011612` no arquivo). Aritmética barata primeiro. */
function shortFloat32(x: number): number {
  if (!Number.isFinite(x) || Number.isInteger(x)) return x;
  for (let d = 1; d < POW10.length; d++) {
    const y = Math.round(x * POW10[d]!) / POW10[d]!;
    if (Math.fround(y) === x) return y;
  }
  return Number(x.toPrecision(9));
}

/** Replacer do `JSON.stringify`: typed array vira array comum (posições com o texto mais curto que preserva o float32). */
export function meshJsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Float32Array) {
    const out = new Array<number>(value.length);
    for (let i = 0; i < value.length; i++) out[i] = shortFloat32(value[i]!);
    return out;
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return Array.from(value as unknown as ArrayLike<number>);
  return value;
}

const PH = '\u0001HESTIA_TA_';

const MAX_NUM = 32; // bytes máximos por número (float32 curto cabe em ~20; fallback em exponencial ~25)
const BUF_SIZE = 1 << 20;

/** Escreve os dígitos de um inteiro >= 0 (< 2^53) terminando antes de `end`; devolve o início. */
function putDigits(buf: Uint8Array, end: number, v: number, minDigits: number): number {
  let q = end;
  let n = 0;
  while (v >= 1 || n < minDigits) {
    const t = Math.floor(v / 10);
    buf[--q] = 48 + (v - t * 10);
    v = t;
    n++;
  }
  return q;
}

function putString(buf: Uint8Array, pos: number, str: string): number {
  for (let i = 0; i < str.length; i++) buf[pos++] = str.charCodeAt(i);
  return pos;
}

/** Escreve em `buf` o mesmo texto de `String(shortFloat32(x))` (ou do inteiro); devolve a nova posição. */
function putNumber(buf: Uint8Array, pos: number, x: number, f32: boolean): number {
  if (!Number.isFinite(x)) return putString(buf, pos, 'null');
  const ax = x < 0 ? -x : x;
  if (Number.isInteger(x)) {
    if (ax >= 1e15) return putString(buf, pos, String(x));
    if (x < 0) buf[pos++] = 45;
    const len = ax < 10 ? 1 : ax < 100 ? 2 : ax < 1e3 ? 3 : ax < 1e4 ? 4 : ax < 1e5 ? 5 : ax < 1e6 ? 6 : ax < 1e7 ? 7 : ax < 1e8 ? 8 : ax < 1e9 ? 9 : ax < 1e10 ? 10 : 15;
    const start = putDigits(buf, pos + len, ax, 1);
    // len pode superestimar (15): recompacta
    if (len === 15 || start !== pos) {
      const w = putDigits(buf, pos + 15, ax, 1);
      const used = pos + 15 - w;
      buf.copyWithin(pos, w, pos + 15);
      return pos + used;
    }
    return pos + len;
  }
  if (f32 && ax >= 1e-6 && ax < 1e7) {
    for (let d = 1; d < POW10.length; d++) {
      const P = POW10[d]!;
      const r = Math.round(x * P);
      if (Math.fround(r / P) !== x) continue;
      const ar = r < 0 ? -r : r;
      if (r < 0) buf[pos++] = 45;
      const ip = Math.floor(ar / P);
      const il = ip < 10 ? 1 : ip < 100 ? 2 : ip < 1e3 ? 3 : ip < 1e4 ? 4 : ip < 1e5 ? 5 : ip < 1e6 ? 6 : ip < 1e7 ? 7 : 8;
      const end = pos + il + 1 + d;
      putDigits(buf, end, ar - ip * P, d);
      buf[pos + il] = 46;
      putDigits(buf, pos + il, ip, 1);
      return end;
    }
  }
  return putString(buf, pos, String(f32 ? shortFloat32(x) : x));
}

const sharedBuf = new Uint8Array(BUF_SIZE);
const decoder = new TextDecoder();

function typedArrayText(a: ArrayLike<number>, f32: boolean, ind0: string, gap: string): string {
  const n = a.length;
  if (n === 0) return '[]';
  const sep = gap ? ',\n' + ind0 + gap : ',';
  const head = gap ? '[\n' + ind0 + gap : '[';
  const tail = gap ? '\n' + ind0 + ']' : ']';
  const buf = sharedBuf;
  const parts: string[] = [];
  let pos = putString(buf, 0, head);
  for (let i = 0; i < n; i++) {
    if (i > 0) pos = putString(buf, pos, sep);
    pos = putNumber(buf, pos, a[i]!, f32);
    if (pos > BUF_SIZE - MAX_NUM - sep.length) {
      parts.push(decoder.decode(buf.subarray(0, pos)));
      pos = 0;
    }
  }
  parts.push(decoder.decode(buf.subarray(0, pos)));
  parts.push(tail);
  return parts.join('');
}

/**
 * Ponto único de gravação do projeto (Salvar, autosave, biblioteca): mesmo JSON de sempre, com as malhas como arrays.
 * Os arrays tipados saem do `JSON.stringify` como marcadores curtos e o texto deles é gerado por loops diretos,
 * sem criar arrays JS temporários por elemento.
 */
export function serializeProject(p: Project, space?: number): string {
  const tas: ArrayBufferView[] = [];
  const text = JSON.stringify(
    p,
    (_k, v) => {
      if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
        tas.push(v);
        return PH + (tas.length - 1) + '\u0001';
      }
      return v;
    },
    space,
  );
  if (tas.length === 0) return text;
  const gap = typeof space === 'number' ? ' '.repeat(Math.max(0, Math.min(10, Math.floor(space)))) : typeof space === 'string' ? String(space as unknown).slice(0, 10) : '';
  const open = '"\\u0001HESTIA_TA_'; // texto escapado do marcador, como sai no JSON
  const close = '\\u0001"';
  const out: string[] = [];
  let last = 0;
  for (let at = text.indexOf(open); at >= 0; at = text.indexOf(open, last)) {
    const numEnd = text.indexOf(close, at);
    const m = [text.slice(at, numEnd + close.length), text.slice(at + open.length, numEnd)];
    out.push(text.slice(last, at));
    last = numEnd + close.length;
    let ind0 = '';
    if (gap) {
      const nl = text.lastIndexOf('\n', at);
      const ls = nl + 1;
      let j = ls;
      while (text[j] === ' ' || text[j] === '\t') j++;
      ind0 = text.slice(ls, j);
    }
    const a = tas[Number(m[1])]!;
    out.push(typedArrayText(a as unknown as ArrayLike<number>, a instanceof Float32Array, ind0, gap));
  }
  out.push(text.slice(last));
  return out.join('');
}
