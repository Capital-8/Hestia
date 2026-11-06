/**
 * Tarefas pesadas do render que rodam no worker (`renderWorker.ts`) ou, sem worker, na thread principal: o SHA-256 do
 * HSTR e a leitura dos pixels de uma imagem já decodificada. São funções de entrada e saída, sem estado e sem efeito no
 * topo do módulo, para que o worker e o caminho direto usem exatamente o mesmo código e dêem o mesmo resultado.
 *
 * Este módulo não importa nenhum outro módulo do render: é a folha da árvore de importações. Assim `texturaRender.ts`,
 * `workerRender.ts` e `renderWorker.ts` podem todos depender dele sem ciclo.
 */

/** Bytes finais do HSTR com a câmera (37 f32). Ficam fora da chave do cache do serviço (main.rs). */
export const TAMANHO_TRAILER_CAMERA = 37 * 4;

/** Os buffers de `arrays` sem repetição (um buffer listado duas vezes em `transfer` lança erro). */
export function bufferesUnicos(arrays: Iterable<Uint8Array>): ArrayBuffer[] {
  const unicos = new Set<ArrayBuffer>();
  for (const array of arrays) unicos.add(array.buffer as ArrayBuffer);
  return [...unicos];
}

/**
 * O próprio array se ele ocupa o buffer inteiro (pode ser transferido); senão uma cópia exata. Transferir uma vista
 * parcial levaria o buffer inteiro e deixaria outras vistas do mesmo buffer sem dados.
 */
export function paraTransferir(array: Uint8Array): Uint8Array {
  return array.byteOffset === 0 && array.byteLength === array.buffer.byteLength ? array : array.slice();
}

/**
 * SHA-256 em hex do corpo do HSTR (sem o trailer da câmera). `null` se não há `crypto.subtle` ou o HSTR é menor que o
 * trailer. Não é o hash do serviço (que usa SipHash no Rust): é só a chave do cache de conteúdo do cliente.
 */
export async function chaveSha256DoCorpo(hstr: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || hstr.length < TAMANHO_TRAILER_CAMERA) return null;
  // Sem cópia: digest aceita a visão (respeita byteOffset).
  const corpo = hstr.subarray(0, hstr.length - TAMANHO_TRAILER_CAMERA);
  const digest = await subtle.digest('SHA-256', corpo as BufferSource);
  let hex = '';
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/**
 * RGBA8 de `imagem` desenhada no tamanho `largura`×`altura` (redução de alta qualidade do canvas). Precisa de
 * `OffscreenCanvas` (no worker ou na janela). Não fecha `imagem`: quem a recebeu é quem fecha.
 */
export function lerPixelsDeImagem(imagem: ImageBitmap, largura: number, altura: number): Uint8Array {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('textura: OffscreenCanvas indisponível neste ambiente');
  const canvas = new OffscreenCanvas(largura, altura);
  const contexto = canvas.getContext('2d');
  if (!contexto) throw new Error('textura: canvas 2D indisponível neste ambiente');
  contexto.imageSmoothingQuality = 'high';
  contexto.drawImage(imagem, 0, 0, largura, altura);
  const pixels = contexto.getImageData(0, 0, largura, altura).data;
  return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
}
