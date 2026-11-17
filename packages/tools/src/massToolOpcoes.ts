import type { DictKey } from './i18n.ts';

/**
 * Opções da ferramenta Massa (ficha T1a): modo, perfil, altura e lados do polígono. A barra de opções (U1) lê e grava
 * estes valores pela ferramenta; os rótulos saem do i18n do pacote (chaves `tl_mass_mode_*` e `tl_mass_profile_*`).
 */
export type ModoMassa = 'extrusao' | 'mistura' | 'loft' | 'bulbo';
export type PerfilTipo = 'circulo' | 'elipse' | 'poligono' | 'livre';

export const MODOS_MASSA: readonly ModoMassa[] = ['extrusao', 'mistura', 'loft', 'bulbo'];
export const PERFIS_MASSA: readonly PerfilTipo[] = ['circulo', 'elipse', 'poligono', 'livre'];

/** Altura padrão da massa criada, em metros. */
export const ALTURA_PADRAO = 9;
/** Lados padrão e limites do polígono regular (A.3: 3 a 64). */
export const LADOS_PADRAO = 6;
export const LADOS_MIN = 3;
export const LADOS_MAX = 64;

/** Chave do rótulo de cada modo e de cada perfil, no idioma da interface. */
export const CHAVE_MODO: Record<ModoMassa, DictKey> = {
  extrusao: 'tl_mass_mode_extrusao',
  mistura: 'tl_mass_mode_mistura',
  loft: 'tl_mass_mode_loft',
  bulbo: 'tl_mass_mode_bulbo',
};

export const CHAVE_PERFIL: Record<PerfilTipo, DictKey> = {
  circulo: 'tl_mass_profile_circulo',
  elipse: 'tl_mass_profile_elipse',
  poligono: 'tl_mass_profile_poligono',
  livre: 'tl_mass_profile_livre',
};
