/**
 * Texturas de imagem do render offline (F3). Carrega um JPEG/PNG da biblioteca publicada em `/texturas-render/`, reduz
 * o lado maior a 1024 px (para a seção de texturas do HSTR não crescer sem limite) e gera a cadeia de mips por média 2×2.
 *
 * Só o carregamento usa APIs do navegador (`fetch`, `createImageBitmap`, `OffscreenCanvas`); as funções puras
 * (`dimensoesReduzidas`, `gerarMips`) não tocam em DOM e são testadas em `texturaRender.test.ts`.
 * A média é feita sobre os valores sRGB do arquivo (sem conversão para linear), como o resto da cadeia de texturas.
 */
import type { RenderTextura } from '@hestia/render';
import { dimensoesDoNivelMip, niveisDeMip } from './texturasCena.ts';

/** Lado maior máximo da textura carregada, em pixels. Acima disso a imagem é reduzida antes de gerar os mips. */
export const LADO_MAXIMO_TEXTURA = 1024;
/** Pasta publicada da biblioteca de texturas do render (`apps/web/public/texturas-render/`). */
export const BASE_TEXTURAS_RENDER = '/texturas-render/';

/** URL de um arquivo da biblioteca, a partir do caminho relativo que o modelo guarda (ver `arquivosDoPreset`). */
export function urlDaTextura(caminhoRelativo: string): string {
  return `${BASE_TEXTURAS_RENDER}${caminhoRelativo}`;
}

/** Dimensões depois de reduzir o lado maior até `lado` (mantém a proporção; mínimo 1 px; sem ampliar). */
export function dimensoesReduzidas(largura: number, altura: number, lado: number = LADO_MAXIMO_TEXTURA): [number, number] {
  const maior = Math.max(largura, altura);
  if (maior <= lado) return [largura, altura];
  const fator = lado / maior;
  return [Math.max(1, Math.round(largura * fator)), Math.max(1, Math.round(altura * fator))];
}

/**
 * Cadeia de mips em RGBA8: `mips[0]` é o próprio `rgba` (nível 0) e cada nível seguinte é a média 2×2 do anterior
 * (arredondada para cima na metade). Com lado ímpar, o último pixel da linha/coluna fica de fora da média; com lado
 * 1 px, a média repete o próprio pixel. Tamanhos: metade a cada nível, mínimo 1 (`dimensoesDoNivelMip`).
 */
export function gerarMips(rgba: Uint8Array, largura: number, altura: number): Uint8Array[] {
  if (rgba.length !== largura * altura * 4) {
    throw new Error(`textura: ${rgba.length} bytes para ${largura}×${altura}; esperado ${largura * altura * 4}`);
  }
  const mips: Uint8Array[] = [rgba];
  let atual = rgba;
  let [larguraAtual, alturaAtual] = [largura, altura];
  const niveis = niveisDeMip(largura, altura);
  for (let nivel = 1; nivel < niveis; nivel++) {
    const [larguraNova, alturaNova] = dimensoesDoNivelMip(largura, altura, nivel);
    const destino = new Uint8Array(larguraNova * alturaNova * 4);
    for (let y = 0; y < alturaNova; y++) {
      const y0 = Math.min(2 * y, alturaAtual - 1);
      const y1 = Math.min(2 * y + 1, alturaAtual - 1);
      for (let x = 0; x < larguraNova; x++) {
        const x0 = Math.min(2 * x, larguraAtual - 1);
        const x1 = Math.min(2 * x + 1, larguraAtual - 1);
        const a = (y0 * larguraAtual + x0) * 4;
        const b = (y0 * larguraAtual + x1) * 4;
        const c = (y1 * larguraAtual + x0) * 4;
        const d = (y1 * larguraAtual + x1) * 4;
        const o = (y * larguraNova + x) * 4;
        for (let canal = 0; canal < 4; canal++) {
          destino[o + canal] = (atual[a + canal]! + atual[b + canal]! + atual[c + canal]! + atual[d + canal]! + 2) >> 2;
        }
      }
    }
    mips.push(destino);
    atual = destino;
    larguraAtual = larguraNova;
    alturaAtual = alturaNova;
  }
  return mips;
}

/**
 * Busca a imagem, reduz o lado maior a `LADO_MAXIMO_TEXTURA` e devolve os pixels RGBA8. Só roda no navegador (ou em
 * worker com `OffscreenCanvas`); o teste não chama esta função.
 */
export async function carregarTexturaRgba(url: string): Promise<{ largura: number; altura: number; rgba: Uint8Array }> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`textura: HTTP ${resposta.status} ao buscar ${url}`);
  const imagem = await createImageBitmap(await resposta.blob());
  try {
    const [largura, altura] = dimensoesReduzidas(imagem.width, imagem.height);
    const canvas = new OffscreenCanvas(largura, altura);
    const contexto = canvas.getContext('2d');
    if (!contexto) throw new Error('textura: canvas 2D indisponível neste ambiente');
    contexto.imageSmoothingQuality = 'high';
    contexto.drawImage(imagem, 0, 0, largura, altura);
    const pixels = contexto.getImageData(0, 0, largura, altura).data;
    return { largura, altura, rgba: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength) };
  } finally {
    imagem.close();
  }
}

/** Textura pronta para `RenderSceneSnapshot.texturas`: pixels carregados e cadeia de mips. */
export async function carregarTexturaRender(caminhoRelativo: string): Promise<RenderTextura> {
  const { largura, altura, rgba } = await carregarTexturaRgba(urlDaTextura(caminhoRelativo));
  return { largura, altura, mips: gerarMips(rgba, largura, altura) };
}
