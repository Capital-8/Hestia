import type { MaterialTexturePreset } from '@hestia/model';

/**
 * Preset de textura do modelo → arquivos da biblioteca de texturas do render (`apps/web/public/texturas-render/`).
 * Os caminhos são relativos à biblioteca, como os de `MaterialTexture`. Função pura, sem DOM nem I/O.
 */

/** Nome-base dos arquivos de cada preset (`<base>_albedo.jpg`, `<base>_normal.jpg`, ...). */
const BASE_DO_PRESET: Record<Exclude<MaterialTexturePreset, 'nenhum'>, string> = {
  tijolo: 'tijolo_vermelho',
  reboco: 'reboco_estuque',
  madeira: 'madeira_tabua',
  telha: 'telha_argila',
  pedra: 'pedra_arenito',
  concreto: 'concreto_parede',
  metal: 'metal_chapa',
  piso: 'piso_ceramico',
};

export interface ArquivosTexturaPreset {
  albedo: string;
  normal: string;
  roughness: string;
  /** Só existe no preset de metal (chapa). */
  metallic?: string;
}

/** Caminhos dos mapas de um preset, relativos à biblioteca. `nenhum` (ou preset desconhecido) devolve `null`. */
export function arquivosDoPreset(preset: MaterialTexturePreset | undefined): ArquivosTexturaPreset | null {
  if (preset === undefined || preset === 'nenhum' || !Object.hasOwn(BASE_DO_PRESET, preset)) return null;
  const base = BASE_DO_PRESET[preset as Exclude<MaterialTexturePreset, 'nenhum'>];
  const arquivos: ArquivosTexturaPreset = {
    albedo: `${base}_albedo.jpg`,
    normal: `${base}_normal.jpg`,
    roughness: `${base}_roughness.jpg`,
  };
  if (preset === 'metal') arquivos.metallic = `${base}_metalness.jpg`;
  return arquivos;
}
