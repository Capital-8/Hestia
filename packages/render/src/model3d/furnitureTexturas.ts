import * as THREE from 'three';
import { furnitureTextureBytes, type FurnitureTexture } from '@hestia/model';

/** Textura embutida só entra na versão leve quando a imagem tem até este lado (px). Acima: só a cor. */
export const LADO_MAX_TEXTURA_LEVE = 1024;

const cache = new Map<string, THREE.Texture>();

/** A textura cabe na versão leve? Precisa de dimensões conhecidas e lado até `LADO_MAX_TEXTURA_LEVE`. */
export function texturaServeNaLeve(t: FurnitureTexture): boolean {
  return t.width !== undefined && t.height !== undefined && t.width > 0 && t.height > 0 && Math.max(t.width, t.height) <= LADO_MAX_TEXTURA_LEVE;
}

/**
 * Textura THREE da imagem embutida (PNG/JPEG), repetida. A decodificação é assíncrona (Blob + createImageBitmap): devolve já
 * o objeto, e `aoCarregar` roda quando a imagem chega (o material troca a cor pela textura). Em ambiente sem
 * `createImageBitmap` (testes em node) devolve null: a vista fica só com a cor. Uma textura por SHA-256, compartilhada.
 */
export function texturaDoMovel(t: FurnitureTexture, aoCarregar?: () => void): THREE.Texture | null {
  if (typeof createImageBitmap !== 'function' || typeof Blob === 'undefined') return null;
  const velha = cache.get(t.sha256);
  if (velha) return velha;
  const tex = new THREE.Texture();
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 4;
  cache.set(t.sha256, tex);
  const bytes = furnitureTextureBytes(t);
  createImageBitmap(new Blob([bytes as BlobPart], { type: t.mime }), { imageOrientation: 'flipY' })
    .then((bmp) => {
      tex.image = bmp;
      tex.needsUpdate = true;
      aoCarregar?.();
    })
    .catch(() => {
      cache.delete(t.sha256);
    });
  return tex;
}

/** Libera as texturas guardadas (ao descartar a cena ou nos testes). */
export function liberarTexturasDeMoveis(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
