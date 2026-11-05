import * as THREE from 'three';
import {
  materialEmissive,
  materialIor,
  materialMapping,
  materialMetallic,
  materialRoughness,
  materialTexture,
  materialTransmission,
  type Id,
  type Material,
  type MaterialTexturePreset,
  type Project,
} from '@hestia/model';
import type { RenderMaterial } from '../offline/cena.ts';
import { LISO, MADEIRA, METAL, PISO, REBOCO, TELHA, TIJOLO, VIDRO, tipoProceduralDoElemento } from './tipoMaterial.ts';

/**
 * Material de render da exportação (F2): cada triângulo leva o MATERIAL DE MODELO que o gerou, não a categoria do elemento.
 *
 * Ordem da fonte (regra única, documentada aqui e testada em `materialRender.test.ts`):
 *   1. Material de modelo da malha: a camada (`layer.materialId`, para paredes, pisos, lajes, forros e telhados), ou o
 *      material próprio do tipo (esquadrias, escadas) e o material de beiral. Vem em `userData.materialId` (resolvido no
 *      projeto ao exportar) ou em `userData.material` (quando não é do projeto, ex.: testeira escurecida).
 *   2. Fallback: sem material de modelo (elemento sem camada, malha sem origem), o tipo vem da CATEGORIA do elemento
 *      (`tipoProceduralDoElemento`, em `tipoMaterial.ts`) e as demais propriedades vêm do material three.js da malha.
 *
 * Mapeamento preset → tipo (`tipoDoPreset`): reboco 1, madeira 2, telha 3, piso 4, metal 5, tijolo 7. `nenhum`/sem preset:
 * vidro (6) quando a transmissão é maior que zero ou a opacidade é menor que 1, senão liso (0). `pedra` e `concreto` ainda
 * não têm tipo procedural no motor: ficam lisos (0) até a textura de imagem (F3).
 */

/** Tipo procedural de cada preset de textura do modelo (os que têm padrão procedural no motor). */
const TIPO_DO_PRESET: Partial<Record<MaterialTexturePreset, number>> = {
  reboco: REBOCO,
  madeira: MADEIRA,
  telha: TELHA,
  piso: PISO,
  metal: METAL,
  tijolo: TIJOLO,
};

const unitario = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/** Tipo procedural (0..7) de um material de modelo, pelo preset e, sem preset, pela transparência (ver o cabeçalho). */
export function tipoDoPreset(m: Material): number {
  const preset = materialTexture(m)?.preset;
  if (preset !== undefined && preset !== 'nenhum') return TIPO_DO_PRESET[preset] ?? LISO;
  return materialTransmission(m) > 0 || m.opacity < 1 ? VIDRO : LISO;
}

/**
 * Material de render de um material de modelo. Cor em linear (como o three.js converte `material.color`), propriedades PBR
 * pelos leitores de `materialPbr.ts` (valores efetivos, com padrão) e tipo/escala do preset e do mapeamento.
 */
export function renderMaterialDoModelo(m: Material): RenderMaterial {
  const cor = new THREE.Color(m.color);
  const emissao = materialEmissive(m);
  let emissive: [number, number, number] = [0, 0, 0];
  if (emissao) {
    const c = new THREE.Color(emissao.color);
    const k = Number.isFinite(emissao.intensity) ? Math.max(0, emissao.intensity) : 0;
    emissive = [c.r * k, c.g * k, c.b * k];
  }
  const escala = materialMapping(m).scale;
  return {
    baseColor: [cor.r, cor.g, cor.b],
    roughness: unitario(materialRoughness(m)),
    metallic: unitario(materialMetallic(m)),
    opacity: unitario(m.opacity),
    transmission: unitario(materialTransmission(m)),
    ior: materialIor(m),
    emissive,
    tipo: tipoDoPreset(m),
    escala: Number.isFinite(escala) && escala > 0 ? escala : 1,
  };
}

/**
 * FALLBACK: material de render de uma malha SEM material de modelo. O tipo vem da categoria do elemento (`kind`); as
 * propriedades vêm do material three.js (cor, opacidade, rugosidade e metalicidade), com os padrões de antes.
 */
export function renderMaterialDaMalha(mat: THREE.Material | THREE.Material[] | undefined, kind: string | undefined): RenderMaterial {
  const escolhido = (Array.isArray(mat) ? mat[0] : mat) as (THREE.MeshStandardMaterial & { color?: THREE.Color; opacity?: number }) | undefined;
  const { tipo, escala } = tipoProceduralDoElemento(kind);
  const cor = escolhido?.color ?? new THREE.Color(0x999999);
  const opacity = typeof escolhido?.opacity === 'number' ? unitario(escolhido.opacity) : 1;
  const roughness = typeof escolhido?.roughness === 'number' ? unitario(escolhido.roughness) : 0.8;
  const metallic = typeof escolhido?.metalness === 'number' ? unitario(escolhido.metalness) : 0;
  return {
    baseColor: [cor.r, cor.g, cor.b],
    roughness,
    metallic,
    opacity,
    transmission: Math.max(0, 1 - opacity),
    ior: 1.5,
    emissive: [0, 0, 0],
    tipo,
    escala,
  };
}

/**
 * Material de modelo de uma malha: `userData.material` quando a malha guarda o próprio material (fora do projeto); senão o
 * `userData.materialId` procurado no projeto. Sem nenhum dos dois, a malha usa o fallback por categoria.
 */
export function materialDaOrigem(userData: Record<string, unknown>, projeto: Pick<Project, 'materials'> | null | undefined): Material | undefined {
  const direto = userData.material;
  if (direto && typeof direto === 'object') return direto as Material;
  const id = userData.materialId;
  if (typeof id !== 'string' || !projeto) return undefined;
  return projeto.materials[id] as Material | undefined;
}

/**
 * Origem do material que vai no `userData` de uma malha criada a partir de um material de modelo: o id (resolvido no projeto
 * ao exportar) e o próprio material quando ele não é o do projeto. Sem material, nada entra (cai no fallback).
 */
export function origemDoMaterial(m: Material | undefined, projeto: Pick<Project, 'materials'> | null | undefined): { materialId?: Id; material?: Material } {
  if (m === undefined) return {};
  return projeto?.materials[m.id] === m ? { materialId: m.id } : { materialId: m.id, material: m };
}
