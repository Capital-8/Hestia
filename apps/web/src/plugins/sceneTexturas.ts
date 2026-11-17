import { mapasDaTextura, type TexturasCatalogo } from '@hestia/io';
import { materialEfetivo, type Material } from '@hestia/model';
import type { SceneMaterial, SceneTexture } from '@hestia/plugin-api';
import { itemDoCatalogo } from '../editor/texturasOnline.ts';

/** Textura do catálogo online de um material → os campos de textura do contrato de cena (sem baixar nada). */
export function texturasDoMaterial(m: Material, catalogo: TexturasCatalogo | null, base: string): { campos: Pick<SceneMaterial, 'textures' | 'textureMapping'>; texturas: SceneTexture[] } | null {
  const t = materialEfetivo(m).aparencia.textura;
  if (!t) return null;
  const item = itemDoCatalogo(t.imagemId, catalogo);
  if (!item) return null;
  const mapas = mapasDaTextura(item, base);
  if (mapas.length === 0) return null;
  return {
    campos: {
      textures: mapas.map((x) => ({ slot: x.slot, textureId: x.textureId })),
      textureMapping: { scaleMeters: t.escalaMetros, rotationDeg: t.rotacao, offsetMeters: [t.deslocamento[0], t.deslocamento[1]], repeat: t.repetir },
    },
    texturas: mapas.map((x) => ({ id: x.textureId, mime: x.mime, hash: x.hash, uri: x.uri })),
  };
}
