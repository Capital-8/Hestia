import type { ImportedModel } from './types';

/** Pixels RGBA 8 bits (sRGB), `width * height * 4` bytes, como o `getImageData` do canvas. */
export interface SmallImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** Decodifica PNG/JPEG e devolve uma versao pequena (ate ~32 px de lado). Devolve null se nao for possivel. */
export type ImageDecoder = (bytes: Uint8Array, mime: string) => Promise<SmallImage | null>;

const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (v: number): number => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(1, c));
};

/**
 * Cor media de uma imagem, calculada em espaco LINEAR e devolvida em sRGB 0..1. Pixels quase transparentes pesam menos
 * (peso = alfa). Devolve null se a imagem nao tem pixels opacos.
 */
export function averageColor(img: SmallImage): [number, number, number] | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let w = 0;
  const n = Math.min(img.width * img.height, Math.floor(img.data.length / 4));
  for (let i = 0; i < n; i++) {
    const a = img.data[i * 4 + 3]! / 255;
    if (a <= 0) continue;
    r += srgbToLinear(img.data[i * 4]!) * a;
    g += srgbToLinear(img.data[i * 4 + 1]!) * a;
    b += srgbToLinear(img.data[i * 4 + 2]!) * a;
    w += a;
  }
  if (w <= 0) return null;
  return [linearToSrgb(r / w), linearToSrgb(g / w), linearToSrgb(b / w)];
}

/** Decodificador do navegador/Worker (createImageBitmap + OffscreenCanvas). Em Node nao existe e devolve null. */
export const browserImageDecoder: ImageDecoder = async (bytes, mime) => {
  const g = globalThis as unknown as {
    createImageBitmap?: (b: Blob) => Promise<{ width: number; height: number; close?: () => void }>;
    OffscreenCanvas?: new (w: number, h: number) => {
      getContext(t: '2d'): { drawImage(i: unknown, x: number, y: number, w: number, h: number): void; getImageData(x: number, y: number, w: number, h: number): SmallImage } | null;
    };
  };
  if (!g.createImageBitmap || !g.OffscreenCanvas) return null;
  try {
    const bmp = await g.createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
    const side = 32;
    const w = Math.max(1, Math.min(side, bmp.width));
    const h = Math.max(1, Math.min(side, bmp.height));
    const ctx = new g.OffscreenCanvas(w, h).getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
};

/**
 * Para cada material com textura, troca a cor de reserva do arquivo (no .skp costuma ser uma cor qualquer, por exemplo um
 * vermelho) pela COR MEDIA da imagem. Sem decodificador a cor fica como esta e o aviso e registrado uma vez.
 * Devolve quantos materiais mudaram.
 */
export async function applyAverageTextureColors(model: ImportedModel, decode: ImageDecoder = browserImageDecoder): Promise<number> {
  const cache = new Map<number, [number, number, number] | null>();
  let changed = 0;
  let failed = 0;
  for (const m of model.materials) {
    if (m.textureIndex === undefined) continue;
    let avg = cache.get(m.textureIndex);
    if (avg === undefined) {
      const t = model.textures[m.textureIndex];
      const img = t ? await decode(t.bytes, t.mime) : null;
      avg = img ? averageColor(img) : null;
      cache.set(m.textureIndex, avg);
    }
    if (avg) {
      m.color = avg;
      changed++;
    } else {
      failed++;
    }
  }
  if (failed > 0 && changed === 0) {
    model.warnings.push('Nao foi possivel calcular a cor media das texturas: os materiais ficam com a cor do arquivo.');
  }
  return changed;
}
