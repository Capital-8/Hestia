import type { Material, MaterialMapping } from './types.ts';

/**
 * Propriedades físicas do material para o render PBR (campos opcionais em `Material`). Cada leitor devolve o valor
 * efetivo: o campo quando existe, senão o padrão. O render deve usar só estas funções, nunca o campo cru.
 */

/** Campos PBR que `updateMaterialPbr` aceita. `undefined` remove o campo e volta ao padrão. */
export type MaterialPbrPatch = Partial<Pick<Material, 'roughness' | 'metallic' | 'transmission' | 'ior' | 'emissive' | 'texture' | 'mapping'>>;

/** Rugosidade efetiva 0..1. Padrão: 1 - gloss. */
export function materialRoughness(m: Material): number {
  return m.roughness ?? 1 - m.gloss;
}

/** Metalicidade efetiva 0..1. Padrão: 0. */
export function materialMetallic(m: Material): number {
  return m.metallic ?? 0;
}

/** Transmissão efetiva 0..1. Padrão: 1 - opacity quando opacity < 1, senão 0. */
export function materialTransmission(m: Material): number {
  return m.transmission ?? (m.opacity < 1 ? 1 - m.opacity : 0);
}

/** Índice de refração efetivo. Padrão: 1.5. */
export function materialIor(m: Material): number {
  return m.ior ?? 1.5;
}

/** Emissão efetiva. Padrão: `undefined` (sem emissão). */
export function materialEmissive(m: Material): Material['emissive'] {
  return m.emissive;
}

/** Textura efetiva. Padrão: `undefined` (sem textura). */
export function materialTexture(m: Material): Material['texture'] {
  return m.texture;
}

/** Mapeamento efetivo. Padrão: escala 1.0 m por repetição, rotação 0. */
export function materialMapping(m: Material): { scale: number; rotationDeg: number } {
  return { scale: m.mapping?.scale ?? 1, rotationDeg: m.mapping?.rotationDeg ?? 0 };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const isNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const inUnit = (x: unknown): boolean => isNumber(x) && x >= 0 && x <= 1;

/**
 * Primeiro problema das propriedades físicas do material, em pt-BR, ou `null` se estiver válido.
 * Campos ausentes são válidos (valem os padrões).
 */
export function validarMaterialPbr(m: Material): string | null {
  if (!HEX_COLOR.test(m.color)) return 'Cor do material deve estar no formato #rrggbb.';
  if (m.roughness !== undefined && !inUnit(m.roughness)) return 'Rugosidade deve estar entre 0 e 1.';
  if (m.metallic !== undefined && !inUnit(m.metallic)) return 'Metalicidade deve estar entre 0 e 1.';
  if (m.transmission !== undefined && !inUnit(m.transmission)) return 'Transmissão deve estar entre 0 e 1.';
  if (m.ior !== undefined && (!isNumber(m.ior) || m.ior < 1 || m.ior > 3)) return 'Índice de refração (IOR) deve estar entre 1 e 3.';
  if (m.emissive !== undefined) {
    if (!HEX_COLOR.test(m.emissive.color)) return 'Cor de emissão deve estar no formato #rrggbb.';
    if (!isNumber(m.emissive.intensity) || m.emissive.intensity < 0) return 'Intensidade de emissão não pode ser negativa.';
  }
  if (m.mapping !== undefined) {
    const mapping: MaterialMapping = m.mapping;
    if (!isNumber(mapping.scale) || mapping.scale <= 0) return 'Escala da textura deve ser maior que zero (metros por repetição).';
    if (mapping.rotationDeg !== undefined && !isNumber(mapping.rotationDeg)) return 'Rotação da textura deve ser um número em graus.';
  }
  return null;
}
