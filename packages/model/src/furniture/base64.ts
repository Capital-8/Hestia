/** Base64 e arrays tipados little-endian, independentes da plataforma (sem Buffer). */
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const REV = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) REV[ABC.charCodeAt(i)] = i;

export function bytesToBase64(b: Uint8Array): string {
  const out: string[] = [];
  const CH = 3 * 8192;
  for (let o = 0; o < b.length; o += CH) {
    const end = Math.min(b.length, o + CH);
    let s = '';
    let i = o;
    for (; i + 2 < end; i += 3) {
      const n = (b[i]! << 16) | (b[i + 1]! << 8) | b[i + 2]!;
      s += ABC[(n >> 18) & 63]! + ABC[(n >> 12) & 63]! + ABC[(n >> 6) & 63]! + ABC[n & 63]!;
    }
    if (i < end) {
      const r = end - i;
      const n = (b[i]! << 16) | (r === 2 ? b[i + 1]! << 8 : 0);
      s += ABC[(n >> 18) & 63]! + ABC[(n >> 12) & 63]! + (r === 2 ? ABC[(n >> 6) & 63]! : '=') + '=';
    }
    out.push(s);
  }
  return out.join('');
}

export function base64ToBytes(s: string): Uint8Array {
  if (s.length % 4 !== 0) throw new Error('base64 invalido');
  let pad = 0;
  if (s.endsWith('==')) pad = 2;
  else if (s.endsWith('=')) pad = 1;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const ch = s.charCodeAt(i + k);
      let v = 0;
      if (ch !== 61) {
        v = ch < 128 ? REV[ch]! : -1;
        if (v < 0) throw new Error('base64 invalido');
      }
      n = (n << 6) | v;
    }
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export function float32ToBase64(a: Float32Array): string {
  const b = new Uint8Array(a.length * 4);
  const dv = new DataView(b.buffer);
  for (let i = 0; i < a.length; i++) dv.setFloat32(i * 4, a[i]!, true);
  return bytesToBase64(b);
}

export function base64ToFloat32(s: string): Float32Array {
  const b = base64ToBytes(s);
  if (b.length % 4 !== 0) throw new Error('Float32 truncado');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = new Float32Array(b.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = dv.getFloat32(i * 4, true);
  return out;
}

export function uint32ToBase64(a: Uint32Array): string {
  const b = new Uint8Array(a.length * 4);
  const dv = new DataView(b.buffer);
  for (let i = 0; i < a.length; i++) dv.setUint32(i * 4, a[i]!, true);
  return bytesToBase64(b);
}

export function base64ToUint32(s: string): Uint32Array {
  const b = base64ToBytes(s);
  if (b.length % 4 !== 0) throw new Error('Uint32 truncado');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = new Uint32Array(b.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = dv.getUint32(i * 4, true);
  return out;
}
