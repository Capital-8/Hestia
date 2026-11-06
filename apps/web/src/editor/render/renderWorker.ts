/**
 * Worker do render GPU (fluidez da interface): gera os mips das texturas e codifica o HSTR fora da thread principal.
 *
 * Como `resolveWorker.ts`, este arquivo serve aos dois lados: o cliente (`renderWorkerClient.ts`) o abre com
 * `new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' })`, e o bloco do fim instala o servidor
 * só dentro de um worker. Fora dele (Node, testes) só as funções exportadas são usadas.
 *
 * O worker não tem lógica própria: chama `gerarMips` (texturaRender.ts) e `codificarCena` (wasmClient.ts), as mesmas
 * funções puras da thread principal. Por isso o HSTR é idêntico byte a byte ao do caminho direto.
 *
 * Buffers: os pixels chegam TRANSFERIDOS (o chamador perde o acesso) e voltam transferidos junto da resposta, para a
 * thread principal retomar as texturas do cache. O HSTR sai transferido.
 */
import type { RenderSceneSnapshot } from '@hestia/render';
import { ErroRenderWasm } from './erroRender.ts';
import { gerarMips } from './texturaRender.ts';
import { codificarCena } from './wasmClient.ts';

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

export type PedidoRender = PedidoMips | PedidoCodificar;

/**
 * Resposta de um pedido. Sucesso traz o resultado. Erro traz a mensagem e, quando a falha veio da ABI (`ErroRenderWasm`),
 * o código. Na codificação, a resposta devolve sempre os mips (também em erro), para a thread principal não perder as texturas.
 */
export type RespostaRender =
  | {
      id: number;
      ok: true;
      resultado: { tipo: 'mips'; mips: Uint8Array[] } | { tipo: 'hstr'; hstr: Uint8Array; mipsPorTextura: Uint8Array[][] };
    }
  | { id: number; ok: false; mensagem: string; codigo?: number; mipsPorTextura?: Uint8Array[][] };

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
 */
export function tratarPedidoRender(
  pedido: PedidoRender,
  enviar: (resposta: RespostaRender, transferir: ArrayBuffer[]) => void,
): void {
  if (pedido.tipo === 'mips') {
    try {
      const mips = gerarMips(pedido.rgba, pedido.largura, pedido.altura);
      enviar({ id: pedido.id, ok: true, resultado: { tipo: 'mips', mips } }, bufferesUnicos(mips));
    } catch (erro) {
      enviar(falha(pedido.id, erro), []);
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
    postMessage(mensagem: RespostaRender, transferir: ArrayBuffer[]): void;
  };
  escopo.onmessage = (evento) => {
    tratarPedidoRender(evento.data, (resposta, transferir) => escopo.postMessage(resposta, transferir));
  };
}
