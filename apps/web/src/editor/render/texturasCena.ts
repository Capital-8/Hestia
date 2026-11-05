/**
 * Seção de texturas do `HSTR` v3 (ver `codificarCena` em `wasmClient.ts`): tamanho e validação das texturas e os
 * índices de textura de cada material. Também a geometria da cadeia de mips, que o carregador do navegador usa.
 */
import type { RenderMaterialMapas, RenderTextura } from '@hestia/render';
import { CODIGO_RENDER, ErroRenderWasm } from './erroRender.ts';

/** Índice de textura de um canal sem textura (`0xFFFFFFFF` no HSTR). */
export const SEM_TEXTURA = 0xffffffff;
export const MAX_TEXTURAS = 64;
export const MAX_LADO_TEXTURA = 8192;
const MAX_SECAO_TEXTURAS = 1024 * 1024 * 1024;

/** Dimensões (largura, altura) do nível `nivel` da cadeia de mips: metade a cada nível, mínimo 1. */
export function dimensoesDoNivelMip(largura: number, altura: number, nivel: number): [number, number] {
  const divisor = 2 ** nivel;
  return [Math.max(1, Math.floor(largura / divisor)), Math.max(1, Math.floor(altura / divisor))];
}

/** Número de níveis de uma cadeia completa, até o 1×1. */
export function niveisDeMip(largura: number, altura: number): number {
  let niveis = 1;
  let [l, a] = [largura, altura];
  while (l > 1 || a > 1) {
    l = Math.max(1, Math.floor(l / 2));
    a = Math.max(1, Math.floor(a / 2));
    niveis++;
  }
  return niveis;
}

/**
 * Confere as texturas antes de reservar memória e devolve o tamanho da seção (quantidade + texturas).
 * Limites: 1..64 texturas; largura e altura 1..8192; cada nível com RGBA8 do tamanho exato; seção até 1 GB.
 */
export function tamanhoDasTexturas(texturas: RenderTextura[]): number {
  if (texturas.length > MAX_TEXTURAS) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, `a cena tem ${texturas.length} texturas; o máximo é ${MAX_TEXTURAS}`);
  }
  let tamanho = 4;
  texturas.forEach((textura, i) => {
    const { largura, altura, mips } = textura;
    if (
      !Number.isInteger(largura) || !Number.isInteger(altura) ||
      largura < 1 || largura > MAX_LADO_TEXTURA || altura < 1 || altura > MAX_LADO_TEXTURA
    ) {
      throw new ErroRenderWasm(
        CODIGO_RENDER.cenaInvalida,
        `textura ${i} tem ${largura}×${altura}; largura e altura devem ficar entre 1 e ${MAX_LADO_TEXTURA}`,
      );
    }
    const maximo = niveisDeMip(largura, altura);
    if (mips.length < 1 || mips.length > maximo) {
      throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, `textura ${i} tem ${mips.length} níveis de mip; esperado entre 1 e ${maximo}`);
    }
    tamanho += 12;
    for (let nivel = 0; nivel < mips.length; nivel++) {
      const [l, a] = dimensoesDoNivelMip(largura, altura, nivel);
      const esperado = l * a * 4;
      const pixels = mips[nivel];
      if (!(pixels instanceof Uint8Array) || pixels.length !== esperado) {
        throw new ErroRenderWasm(
          CODIGO_RENDER.cenaInvalida,
          `textura ${i}, nível ${nivel}: esperados ${esperado} bytes RGBA8 (${l}×${a})`,
        );
      }
      tamanho += esperado;
    }
  });
  if (tamanho > MAX_SECAO_TEXTURAS) {
    throw new ErroRenderWasm(CODIGO_RENDER.cenaInvalida, 'a seção de texturas passa de 1 GB');
  }
  return tamanho;
}

/** Quatro índices (albedo, normal, rugosidade, metálico) de um material; `SEM_TEXTURA` quando o canal não tem textura. */
export function indicesDeTextura(mapas: RenderMaterialMapas | undefined, nTexturas: number, material: number): number[] {
  const canais: (keyof RenderMaterialMapas)[] = ['albedo', 'normal', 'roughness', 'metallic'];
  return canais.map((canal) => {
    const indice = mapas?.[canal];
    if (indice === undefined) return SEM_TEXTURA;
    if (!Number.isInteger(indice) || indice < 0 || indice >= nTexturas) {
      throw new ErroRenderWasm(
        CODIGO_RENDER.cenaInvalida,
        `material ${material}: ${canal} aponta para a textura ${indice}, fora de 0..${nTexturas - 1}`,
      );
    }
    return indice;
  });
}
