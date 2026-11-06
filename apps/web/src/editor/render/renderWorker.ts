/**
 * Worker do render GPU (fluidez da interface): gera os mips das texturas, codifica o HSTR, calcula o SHA-256 do HSTR e lê
 * os pixels das imagens fora da thread principal.
 *
 * Como `resolveWorker.ts`, este arquivo serve aos dois lados: o cliente (`workerRender.ts`, `renderWorkerClient.ts`) o abre
 * com `new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' })`, e o bloco do fim instala o servidor
 * só dentro de um worker. Fora dele (Node, testes) só as funções exportadas são usadas.
 *
 * O worker não tem lógica própria: chama as MESMAS funções puras da thread principal (`gerarMips`, `codificarCena`,
 * `chaveSha256DoCorpo`, `lerPixelsDeImagem`). Por isso o resultado é idêntico ao do caminho direto.
 *
 * Buffers: os pixels e o HSTR chegam TRANSFERIDOS (o chamador perde o acesso) e voltam transferidos na resposta. O bitmap
 * de uma imagem também é transferido e é fechado aqui, depois de lido.
 */
import type { RenderSceneSnapshot } from '@hestia/render';
import { ErroRenderWasm } from './erroRender.ts';
import { gerarMips } from './texturaRender.ts';
import { codificarCena } from './wasmClient.ts';
import { bufferesUnicos, chaveSha256DoCorpo, lerPixelsDeImagem } from './renderWorkerTarefas.ts';

/** Mips de uma textura: média 2×2 a partir dos pixels RGBA8 (ver `gerarMips`). */
export interface PedidoMips {
  tipo: 'mips';
  id: number;
  rgba: Uint8Array;
  largura: number;
  altura: number;
}

/** Codificação do HSTR. Os mips de cada textura vêm transferidos; a cena é copiada (o snapshot é reutilizado). */
export interface PedidoCodificar {
  tipo: 'codificar';
  id: number;
  cena: RenderSceneSnapshot;
}

/** SHA-256 do corpo do HSTR (sem o trailer). O HSTR vem transferido e volta na resposta. */
export interface PedidoHash {
  tipo: 'hash';
  id: number;
  hstr: Uint8Array;
}

/** Leitura dos pixels de uma imagem já decodificada. O bitmap vem transferido. */
export interface PedidoPixels {
  tipo: 'pixels';
  id: number;
  imagem: ImageBitmap;
  largura: number;
  altura: number;
}

export type PedidoRender = PedidoMips | PedidoCodificar | PedidoHash | PedidoPixels;

/**
 * Resposta de um pedido. Sucesso traz o resultado. Erro traz a mensagem e, quando a falha veio da ABI (`ErroRenderWasm`),
 * o código. Na codificação, a resposta devolve sempre os mips (também em erro), para a thread principal não perder as texturas.
 * `sem-offscreen` devolve o bitmap quando o worker não tem `OffscreenCanvas`: a thread principal lê a imagem.
 */
export type RespostaRender =
  | {
      id: number;
      ok: true;
      resultado:
        | { tipo: 'mips'; mips: Uint8Array[] }
        | { tipo: 'hstr'; hstr: Uint8Array; mipsPorTextura: Uint8Array[][] }
        | { tipo: 'hash'; chave: string | null; hstr: Uint8Array }
        | { tipo: 'pixels'; rgba: Uint8Array }
        | { tipo: 'sem-offscreen'; imagem: ImageBitmap };
    }
  | { id: number; ok: false; mensagem: string; codigo?: number; mipsPorTextura?: Uint8Array[][] };

function falha(id: number, erro: unknown, mipsPorTextura?: Uint8Array[][]): RespostaRender {
  return {
    id,
    ok: false,
    mensagem: erro instanceof Error ? erro.message : String(erro),
    codigo: erro instanceof ErroRenderWasm ? erro.codigo : undefined,
    mipsPorTextura,
  };
}

/**
 * Executa um pedido e manda a resposta por `enviar`, com a lista de buffers a transferir. É a lógica do worker, sem
 * depender do escopo do navegador: o worker chama com `postMessage`; os testes chamam com uma fila simulada.
 * Assíncrona só para o hash (o `subtle.digest` é assíncrono); os outros pedidos terminam antes do primeiro `await`.
 */
export async function tratarPedidoRender(
  pedido: PedidoRender,
  enviar: (resposta: RespostaRender, transferir: Transferable[]) => void,
): Promise<void> {
  if (pedido.tipo === 'mips') {
    try {
      const mips = gerarMips(pedido.rgba, pedido.largura, pedido.altura);
      enviar({ id: pedido.id, ok: true, resultado: { tipo: 'mips', mips } }, bufferesUnicos(mips));
    } catch (erro) {
      enviar(falha(pedido.id, erro), []);
    }
    return;
  }
  if (pedido.tipo === 'hash') {
    try {
      const chave = await chaveSha256DoCorpo(pedido.hstr);
      enviar({ id: pedido.id, ok: true, resultado: { tipo: 'hash', chave, hstr: pedido.hstr } }, bufferesUnicos([pedido.hstr]));
    } catch (erro) {
      enviar(falha(pedido.id, erro), []);
    }
    return;
  }
  if (pedido.tipo === 'pixels') {
    if (typeof OffscreenCanvas === 'undefined') {
      // Sem OffscreenCanvas aqui: o bitmap volta para a thread principal, que lê a imagem por lá.
      enviar({ id: pedido.id, ok: true, resultado: { tipo: 'sem-offscreen', imagem: pedido.imagem } }, [pedido.imagem]);
      return;
    }
    try {
      const rgba = lerPixelsDeImagem(pedido.imagem, pedido.largura, pedido.altura);
      enviar({ id: pedido.id, ok: true, resultado: { tipo: 'pixels', rgba } }, bufferesUnicos([rgba]));
    } catch (erro) {
      enviar(falha(pedido.id, erro), []);
    } finally {
      pedido.imagem.close();
    }
    return;
  }
  const texturas = pedido.cena.texturas ?? [];
  const mipsPorTextura = texturas.map((textura) => textura.mips);
  const mipsTodos = mipsPorTextura.flat();
  try {
    const hstr = codificarCena(pedido.cena);
    enviar(
      { id: pedido.id, ok: true, resultado: { tipo: 'hstr', hstr, mipsPorTextura } },
      bufferesUnicos([hstr, ...mipsTodos]),
    );
  } catch (erro) {
    enviar(falha(pedido.id, erro, mipsPorTextura), bufferesUnicos(mipsTodos));
  }
}

/** Verdadeiro dentro de um worker dedicado do navegador (não na janela). */
const ehEscopoDeWorker = (): boolean => {
  const g = globalThis as { WorkerGlobalScope?: new () => unknown; window?: unknown };
  return g.window === undefined && typeof g.WorkerGlobalScope === 'function' && (globalThis as unknown) instanceof g.WorkerGlobalScope;
};

if (ehEscopoDeWorker()) {
  const escopo = globalThis as unknown as {
    onmessage: ((evento: MessageEvent<PedidoRender>) => void) | null;
    postMessage(mensagem: RespostaRender, transferir: Transferable[]): void;
  };
  escopo.onmessage = (evento) => {
    void tratarPedidoRender(evento.data, (resposta, transferir) => escopo.postMessage(resposta, transferir));
  };
}
