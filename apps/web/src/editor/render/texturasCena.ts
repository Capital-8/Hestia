/**
 * Seção de texturas do `HSTR` v3 (ver `codificarCena` em `wasmClient.ts`): tamanho e validação das texturas e os
 * índices de textura de cada material. Também o carregamento das texturas PENDENTES do snapshot
 * (`carregarTexturasDoSnapshot`, no navegador). A geometria da cadeia de mips fica em `texturaRender.ts`.
 */
import type { RenderMaterialMapas, RenderSceneSnapshot, RenderTextura } from '@hestia/render';
import { CODIGO_RENDER, ErroRenderWasm } from './erroRender.ts';
import { carregarTexturaRgba, dimensoesDoNivelMip, gerarMips, niveisDeMip, urlDaTextura } from './texturaRender.ts';

/** Índice de textura de um canal sem textura (`0xFFFFFFFF` no HSTR). */
export const SEM_TEXTURA = 0xffffffff;
export const MAX_TEXTURAS = 64;
export const MAX_LADO_TEXTURA = 8192;
const MAX_SECAO_TEXTURAS = 1024 * 1024 * 1024;

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
    if (mips.length === 0) {
      const arquivo = textura.caminho ? ` (${textura.caminho})` : '';
      throw new ErroRenderWasm(
        CODIGO_RENDER.cenaInvalida,
        `textura ${i}${arquivo} não foi carregada; carregue os pixels com carregarTexturasDoSnapshot antes de codificar`,
      );
    }
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

/**
 * Carrega os pixels de cada textura PENDENTE da lista do snapshot (`caminho` da biblioteca), na ordem dos índices: cada
 * arquivo vira RGBA8 com o lado maior em no máximo 1024 px e a cadeia de mips. Só roda no navegador (`fetch`,
 * `createImageBitmap`). Falha de uma textura lança erro com o caminho: nunca troca por branco em silêncio.
 * Devolve a lista na mesma ordem, pronta para `codificarCena` (ver `comTexturasCarregadas`).
 */
export async function carregarTexturasDoSnapshot(snapshot: RenderSceneSnapshot): Promise<RenderTextura[]> {
  const carregadas: RenderTextura[] = [];
  for (const [i, textura] of (snapshot.texturas ?? []).entries()) {
    const caminho = textura.caminho;
    if (!caminho) throw new Error(`textura ${i} da cena não tem caminho na biblioteca de texturas`);
    try {
      const { largura, altura, rgba } = await carregarTexturaRgba(urlDaTextura(caminho));
      carregadas.push({ caminho, largura, altura, mips: gerarMips(rgba, largura, altura) });
    } catch (e) {
      const motivo = e instanceof Error ? e.message : 'falha desconhecida';
      throw new Error(`não foi possível carregar a textura ${caminho}: ${motivo}`);
    }
  }
  return carregadas;
}

/** Cópia do snapshot com os pixels das texturas carregados (ver `carregarTexturasDoSnapshot`). Sem texturas, a mesma cena. */
export async function comTexturasCarregadas(snapshot: RenderSceneSnapshot): Promise<RenderSceneSnapshot> {
  if (!snapshot.texturas || snapshot.texturas.length === 0) return snapshot;
  return { ...snapshot, texturas: await carregarTexturasDoSnapshot(snapshot) };
}
