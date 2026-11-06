/**
 * Acesso ao worker do render (`renderWorker.ts`) para os módulos de textura e de cena. Fica separado de
 * `renderWorkerClient.ts` porque `texturaRender.ts` também precisa do worker, e `renderWorkerClient.ts` importa
 * `texturasCena.ts` (que importa `texturaRender.ts`): um ciclo de módulos.
 *
 * Dois jeitos de usar o worker:
 * - COMPARTILHADO, de vida longa (mips e leitura de pixels): um worker só, com pedidos identificados por `id`. Não é
 *   encerrado a cada pedido. Um worker que cai rejeita os pedidos em voo; o próximo pedido cria outro.
 * - DEDICADO, encerrado ao fim ou ao cancelamento (hash do HSTR e codificação da cena): um worker por chamada. O hash de
 *   ~118 MB não pode ficar na fila de um worker compartilhado (atrasaria os outros pedidos) e precisa poder ser abortado
 *   com `terminate` (que libera a memória dele).
 *
 * Sem Worker (Node, testes, navegador sem `Worker`, ou se o navegador recusar), o chamador usa o caminho direto e
 * `avisarUmaVez` registra o motivo, uma vez por tipo. Falha de um worker depois de criado não cai para a thread
 * principal em silêncio: a promessa rejeita com a mensagem do erro.
 */
import { CODIGO_RENDER, ErroRenderWasm } from './erroRender.ts';
import type { PedidoRender, RespostaRender } from './renderWorker.ts';
import { bufferesUnicos, chaveSha256DoCorpo, lerPixelsDeImagem, paraTransferir } from './renderWorkerTarefas.ts';

const avisados = new Set<string>();

/** Um aviso no console por motivo (não se repete a cada textura nem a cada render). */
export function avisarUmaVez(chave: string, motivo: string): void {
  if (avisados.has(chave)) return;
  avisados.add(chave);
  console.warn(`render: ${motivo}. O trabalho roda na thread principal; o resultado é o mesmo, só a thread muda.`);
}

/** Um worker novo do render, ou `null` (sem `Worker` no ambiente, ou se o navegador recusar) com o aviso. */
export function criarWorkerRender(): Worker | null {
  if (typeof Worker === 'undefined') {
    avisarUmaVez('worker', 'Worker indisponível neste ambiente');
    return null;
  }
  try {
    // O Vite reconhece este `new URL(..., import.meta.url)` e empacota o worker à parte (mesmo padrão de ifcImport.ts).
    return new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' });
  } catch (erro) {
    avisarUmaVez('worker', `o navegador recusou o worker (${erro instanceof Error ? erro.message : String(erro)})`);
    return null;
  }
}

let proximoId = 1;

/** Identificador único de pedido (compartilhado pelos workers compartilhado e dedicados). */
export function proximoIdRender(): number {
  return proximoId++;
}

/** Erro reconstruído da resposta do worker: com código ABI quando a falha veio do renderizador. */
export function erroDaResposta(resposta: { mensagem: string; codigo?: number }): Error {
  return resposta.codigo !== undefined ? new ErroRenderWasm(resposta.codigo, resposta.mensagem) : new Error(resposta.mensagem);
}

/** Cancelamento com o mesmo código da ABI (`ehCancelamento` reconhece). */
export function erroDeCancelamento(): ErroRenderWasm {
  return new ErroRenderWasm(CODIGO_RENDER.cancelado, 'a operação foi cancelada');
}

/** Lança o cancelamento se o sinal já estiver abortado. */
export function lancarSeCancelado(sinal?: AbortSignal): void {
  if (sinal?.aborted) throw erroDeCancelamento();
}

/* ------------------------------------------------------------------ worker compartilhado ------------------------------------------------------------------ */

interface Espera {
  receber(resposta: RespostaRender): void;
  rejeitar(erro: Error): void;
}

let compartilhado: Worker | null = null;
const esperando = new Map<number, Espera>();

function obterCompartilhado(): Worker | null {
  if (compartilhado) return compartilhado;
  const worker = criarWorkerRender();
  if (!worker) return null;
  worker.onmessage = (evento: MessageEvent<RespostaRender>) => {
    const resposta = evento.data;
    const espera = esperando.get(resposta.id);
    if (!espera) return;
    esperando.delete(resposta.id);
    espera.receber(resposta);
  };
  worker.onerror = (evento: ErrorEvent) => {
    // Erro atrasado de um worker já substituído: não pode rejeitar os pedidos do worker novo.
    if (compartilhado !== worker) return;
    const erro = new Error(`render: o worker falhou${evento.message ? `: ${evento.message}` : ''}`);
    worker.terminate();
    compartilhado = null;
    for (const espera of esperando.values()) espera.rejeitar(erro);
    esperando.clear();
  };
  compartilhado = worker;
  return worker;
}

/**
 * Envia um pedido ao worker compartilhado e devolve a resposta (de sucesso ou de erro, a quem chama interpretar). `null`
 * se não há worker: o chamador faz o trabalho na thread atual. `montar` recebe o `id` e devolve o pedido com a lista de
 * buffers a transferir (só é chamado quando há worker, para não copiar à toa).
 */
export function pedirAoWorker(
  montar: (id: number) => { pedido: PedidoRender; transferir: Transferable[] },
): Promise<RespostaRender> | null {
  const worker = obterCompartilhado();
  if (!worker) return null;
  const id = proximoIdRender();
  return new Promise<RespostaRender>((resolver, rejeitar) => {
    esperando.set(id, { receber: resolver, rejeitar });
    try {
      const { pedido, transferir } = montar(id);
      worker.postMessage(pedido, transferir);
    } catch (erro) {
      esperando.delete(id);
      rejeitar(erro instanceof Error ? erro : new Error(String(erro)));
    }
  });
}

/** Encerra o worker compartilhado (o próximo pedido cria outro). Usado pelos testes; o app não precisa chamar. */
export function encerrarWorkerCompartilhado(): void {
  compartilhado?.terminate();
  compartilhado = null;
  esperando.clear();
}

/* ------------------------------------------------------------------ leitura de pixels ------------------------------------------------------------------ */

/**
 * RGBA8 de uma imagem já decodificada (`createImageBitmap`, que o navegador decodifica fora da thread principal), no
 * tamanho `largura`×`altura`. Com `OffscreenCanvas` no worker, o bitmap é TRANSFERIDO e a leitura (desenho e
 * `getImageData`) sai da thread principal. Sem `OffscreenCanvas`, a leitura é direta, com um aviso.
 *
 * Quem chama não usa `imagem` depois: ela pode ter sido transferida (fechar um bitmap transferido não faz nada).
 * O worker é compartilhado: o cancelamento de quem chama rejeita a espera, mas uma leitura já em andamento termina e
 * seu resultado é descartado. Ela não é encerrada porque é compartilhada com outras chamadas (uma textura é lida
 * uma vez e fica no cache de imagens).
 */
export async function lerPixelsNoWorker(imagem: ImageBitmap, largura: number, altura: number): Promise<Uint8Array> {
  // Sem OffscreenCanvas nem na janela, a leitura lança o erro explícito (`lerPixelsDeImagem`): não há caminho direto.
  if (typeof OffscreenCanvas === 'undefined') return lerPixelsDeImagem(imagem, largura, altura);
  const pendente = pedirAoWorker((id) => ({
    pedido: { tipo: 'pixels', id, imagem, largura, altura },
    transferir: [imagem],
  }));
  if (!pendente) return lerPixelsDeImagem(imagem, largura, altura);
  const resposta = await pendente;
  if (!resposta.ok) throw erroDaResposta(resposta);
  if (resposta.resultado.tipo === 'pixels') return resposta.resultado.rgba;
  if (resposta.resultado.tipo === 'sem-offscreen') {
    // O worker não tem OffscreenCanvas e devolveu o bitmap: lê aqui e libera.
    avisarUmaVez('offscreen', 'OffscreenCanvas indisponível no worker');
    const devolvida = resposta.resultado.imagem;
    try {
      return lerPixelsDeImagem(devolvida, largura, altura);
    } finally {
      devolvida.close();
    }
  }
  throw new Error('render: resposta inesperada do worker de pixels');
}

/* ------------------------------------------------------------------ hash do HSTR ------------------------------------------------------------------ */

/**
 * SHA-256 do corpo do HSTR (sem o trailer) no worker DEDICADO desta chamada. O HSTR é TRANSFERIDO (sem cópia): quem chama
 * não pode usar `hstr` depois da chamada; o buffer volta no resultado (`hstr`), e é com ele que o chamador segue.
 * Sem Worker, o cálculo é direto e `hstr` volta o próprio objeto. Sinal abortado encerra o worker (a memória dele é
 * liberada) e rejeita com o cancelamento; abortado antes de começar, nem cria worker.
 */
export async function hashHstrNoWorker(
  hstr: Uint8Array,
  sinal?: AbortSignal,
): Promise<{ chave: string | null; hstr: Uint8Array }> {
  lancarSeCancelado(sinal);
  const worker = criarWorkerRender();
  if (!worker) {
    const chave = await chaveSha256DoCorpo(hstr);
    lancarSeCancelado(sinal);
    return { chave, hstr };
  }
  return new Promise((resolver, rejeitar) => {
    let encerrado = false;
    const encerrar = (): void => {
      encerrado = true;
      sinal?.removeEventListener('abort', abortar);
      worker.terminate();
    };
    const abortar = (): void => {
      if (encerrado) return;
      encerrar();
      rejeitar(erroDeCancelamento());
    };
    sinal?.addEventListener('abort', abortar, { once: true });
    worker.onerror = (evento: ErrorEvent) => {
      if (encerrado) return;
      encerrar();
      rejeitar(new Error(`render: o worker de hash falhou${evento.message ? `: ${evento.message}` : ''}`));
    };
    worker.onmessage = (evento: MessageEvent<RespostaRender>) => {
      if (encerrado) return;
      encerrar();
      const resposta = evento.data;
      if (!resposta.ok) rejeitar(erroDaResposta(resposta));
      else if (resposta.resultado.tipo === 'hash') resolver({ chave: resposta.resultado.chave, hstr: resposta.resultado.hstr });
      else rejeitar(new Error('render: resposta inesperada do worker de hash'));
    };
    try {
      const entrada = paraTransferir(hstr);
      worker.postMessage({ tipo: 'hash', id: proximoIdRender(), hstr: entrada }, bufferesUnicos([entrada]));
    } catch (erro) {
      encerrar();
      rejeitar(erro instanceof Error ? erro : new Error(String(erro)));
    }
  });
}
