/**
 * Cliente do worker do render GPU (`renderWorker.ts`): gera os mips das texturas e codifica o HSTR fora da thread
 * principal, para a janela não travar enquanto a cena é preparada.
 *
 * Equivalência: o worker chama as MESMAS funções puras (`gerarMips`, `codificarCena`); só a thread muda. O HSTR é
 * idêntico byte a byte ao do caminho direto (provado por SHA-256 em `renderWorkerClient.test.ts`).
 *
 * Transferência: os pixels das texturas vão para o worker e voltam (Transferable, sem cópia; ver `texturasCena.ts`,
 * "empréstimo"). O HSTR sai transferido. Os dados da cena (posições, índices, materiais) são copiados pelo structured
 * clone, porque o snapshot é reutilizado pelo diálogo (prévia e botão GPU).
 *
 * Sem Worker (Node, testes, navegador sem `Worker`, ou se o navegador recusar o worker): usa as funções diretas, com UM
 * aviso no console. O resultado é o mesmo; só a thread muda. Falha do worker depois de criado não cai para a thread
 * principal em silêncio: a promessa rejeita com a mensagem do erro.
 *
 * Cancelamento: `sinal` abortado encerra o worker de codificação (`terminate`, que libera a memória dele), tira as
 * texturas emprestadas do cache e rejeita com `ErroRenderWasm` de código cancelado (`ehCancelamento`). Um worker
 * encerrado não devolve os pixels, por isso a próxima chamada recarrega as imagens.
 */
import type { RenderSceneSnapshot, RenderTextura } from '@hestia/render';
import { CODIGO_RENDER, ErroRenderWasm } from './erroRender.ts';
import { gerarMips, LADO_MAXIMO_TEXTURA } from './texturaRender.ts';
import { emprestarTexturasCarregadas, type Emprestimo } from './texturasCena.ts';
import { codificarCena } from './wasmClient.ts';
import { bufferesUnicos, paraTransferir, type PedidoRender, type RespostaRender } from './renderWorker.ts';

/** Progresso da preparação: 'texturas' (feitas de total, decodificadas e com mips) e 'codificando' (um passo só, sem fração). */
export interface ProgressoCodificacao {
  fase: 'texturas' | 'codificando';
  feitas: number;
  total: number;
}

export interface OpcoesCodificacao {
  /** Lado maior das texturas (padrão `LADO_MAXIMO_TEXTURA`; a prévia pede `LADO_PREVIA_TEXTURA`). */
  lado?: number;
}

let avisoEmitido = false;
function avisarModoSemWorker(motivo: string): void {
  if (avisoEmitido) return;
  avisoEmitido = true;
  console.warn(`render: ${motivo}. Mips e HSTR rodam na thread principal; o resultado é o mesmo, só a thread muda.`);
}

/** Um worker novo do render, ou `null` (sem `Worker` no ambiente, ou se o navegador recusar) com o aviso de modo sem worker. */
function criarWorkerRender(): Worker | null {
  if (typeof Worker === 'undefined') {
    avisarModoSemWorker('Worker indisponível neste ambiente');
    return null;
  }
  try {
    // O Vite reconhece este `new URL(..., import.meta.url)` e empacota o worker à parte (mesmo padrão de ifcImport.ts).
    return new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' });
  } catch (erro) {
    avisarModoSemWorker(`o navegador recusou o worker (${erro instanceof Error ? erro.message : String(erro)})`);
    return null;
  }
}

function erroDeCancelamento(): ErroRenderWasm {
  return new ErroRenderWasm(CODIGO_RENDER.cancelado, 'a codificação da cena foi cancelada');
}

function lancarSeCancelado(sinal?: AbortSignal): void {
  if (sinal?.aborted) throw erroDeCancelamento();
}

/** Erro reconstruído da resposta do worker: com código ABI quando a falha veio do renderizador. */
function erroDaResposta(resposta: { mensagem: string; codigo?: number }): Error {
  return resposta.codigo !== undefined ? new ErroRenderWasm(resposta.codigo, resposta.mensagem) : new Error(resposta.mensagem);
}

let proximoId = 1;

/** Worker compartilhado dos mips (curtos; não precisa ser encerrado a cada pedido). */
let workerMips: Worker | null = null;
const esperandoMips = new Map<number, { resolver: (mips: Uint8Array[]) => void; rejeitar: (erro: Error) => void }>();

function workerDeMips(): Worker | null {
  if (workerMips) return workerMips;
  const worker = criarWorkerRender();
  if (!worker) return null;
  worker.onmessage = (evento: MessageEvent<RespostaRender>) => {
    const resposta = evento.data;
    const espera = esperandoMips.get(resposta.id);
    if (!espera) return;
    esperandoMips.delete(resposta.id);
    if (!resposta.ok) espera.rejeitar(erroDaResposta(resposta));
    else if (resposta.resultado.tipo === 'mips') espera.resolver(resposta.resultado.mips);
    else espera.rejeitar(new Error('render: resposta inesperada do worker de mips'));
  };
  worker.onerror = (evento) => {
    // Erro atrasado de um worker já substituído: não pode rejeitar os pedidos do worker novo.
    if (workerMips !== worker) return;
    // Worker que caiu: rejeita o que estava em voo; o próximo pedido cria outro.
    const erro = new Error(`render: o worker de mips falhou${evento.message ? `: ${evento.message}` : ''}`);
    worker.terminate();
    if (workerMips === worker) workerMips = null;
    for (const espera of esperandoMips.values()) espera.rejeitar(erro);
    esperandoMips.clear();
  };
  workerMips = worker;
  return worker;
}

/** Encerra o worker compartilhado dos mips (o próximo pedido cria outro). Usado pelos testes; o app não precisa chamar. */
export function encerrarWorkerDeMips(): void {
  workerMips?.terminate();
  workerMips = null;
  esperandoMips.clear();
}

/**
 * Cadeia de mips de uma textura (média 2×2, como `gerarMips`), calculada no worker. Os pixels de `rgba` são TRANSFERIDOS
 * (o chamador não os usa depois); os mips voltam transferidos. Sem Worker, roda `gerarMips` na thread atual.
 */
export async function gerarMipsNoWorker(rgba: Uint8Array, largura: number, altura: number): Promise<Uint8Array[]> {
  const worker = workerDeMips();
  if (!worker) return gerarMips(rgba, largura, altura);
  const entrada = paraTransferir(rgba);
  const id = proximoId++;
  return new Promise<Uint8Array[]>((resolver, rejeitar) => {
    esperandoMips.set(id, { resolver, rejeitar });
    const pedido: PedidoRender = { tipo: 'mips', id, rgba: entrada, largura, altura };
    try {
      worker.postMessage(pedido, bufferesUnicos([entrada]));
    } catch (erro) {
      esperandoMips.delete(id);
      rejeitar(erro instanceof Error ? erro : new Error(String(erro)));
    }
  });
}

/**
 * Codifica o HSTR da cena num worker dedicado (encerrado ao fim, ao cancelamento ou à falha). Carrega as texturas no
 * lado pedido (com os mips no worker de mips), empresta-as ao worker de codificação e devolve o HSTR.
 *
 * `aoProgredir` recebe 'texturas' (feitas de total) enquanto carrega e um aviso 'codificando' antes da codificação.
 * `sinal` abortado antes ou durante a codificação rejeita com cancelamento; durante, o worker é encerrado (ver o cabeçalho).
 */
export async function codificarCenaNoWorker(
  snapshot: RenderSceneSnapshot,
  opcoes: OpcoesCodificacao = {},
  aoProgredir?: (progresso: ProgressoCodificacao) => void,
  sinal?: AbortSignal,
): Promise<Uint8Array> {
  const lado = opcoes.lado ?? LADO_MAXIMO_TEXTURA;
  lancarSeCancelado(sinal);
  const { cena, emprestimo } = await emprestarTexturasCarregadas(snapshot, {
    lado,
    gerarMips: gerarMipsNoWorker,
    progresso: (feitas, total) => aoProgredir?.({ fase: 'texturas', feitas, total }),
  });
  const texturas = cena.texturas ?? [];
  if (sinal?.aborted) {
    emprestimo.devolver(texturas.map((textura) => textura.mips));
    throw erroDeCancelamento();
  }
  const worker = criarWorkerRender();
  if (!worker) {
    try {
      aoProgredir?.({ fase: 'codificando', feitas: 0, total: 0 });
      return codificarCena(cena);
    } finally {
      emprestimo.devolver(texturas.map((textura) => textura.mips));
    }
  }
  return codificarNoWorker(worker, cena, texturas, emprestimo, aoProgredir, sinal);
}

function codificarNoWorker(
  worker: Worker,
  cena: RenderSceneSnapshot,
  texturas: RenderTextura[],
  emprestimo: Emprestimo,
  aoProgredir: ((progresso: ProgressoCodificacao) => void) | undefined,
  sinal: AbortSignal | undefined,
): Promise<Uint8Array> {
  // Cópia de cada textura com os mips transferíveis (uma vista parcial vira cópia exata; ver `paraTransferir`).
  const texturasDoPedido = texturas.map((textura) => ({ ...textura, mips: textura.mips.map(paraTransferir) }));
  const pedido: PedidoRender = {
    tipo: 'codificar',
    id: proximoId++,
    cena: { ...cena, texturas: cena.texturas === undefined ? undefined : texturasDoPedido },
  };
  const transferir = bufferesUnicos(texturasDoPedido.flatMap((textura) => textura.mips));
  return new Promise<Uint8Array>((resolver, rejeitar) => {
    let encerrado = false;
    const encerrar = (): void => {
      encerrado = true;
      sinal?.removeEventListener('abort', abortar);
      worker.terminate();
    };
    const abortar = (): void => {
      if (encerrado) return;
      encerrar();
      emprestimo.perder();
      rejeitar(erroDeCancelamento());
    };
    sinal?.addEventListener('abort', abortar, { once: true });
    worker.onerror = (evento) => {
      if (encerrado) return;
      encerrar();
      emprestimo.perder();
      rejeitar(new Error(`render: o worker de codificação falhou${evento.message ? `: ${evento.message}` : ''}`));
    };
    worker.onmessage = (evento: MessageEvent<RespostaRender>) => {
      if (encerrado) return;
      encerrar();
      const resposta = evento.data;
      if (resposta.ok && resposta.resultado.tipo === 'hstr') {
        emprestimo.devolver(resposta.resultado.mipsPorTextura);
        resolver(resposta.resultado.hstr);
      } else if (!resposta.ok && resposta.mipsPorTextura) {
        emprestimo.devolver(resposta.mipsPorTextura);
        rejeitar(erroDaResposta(resposta));
      } else {
        emprestimo.perder();
        rejeitar(new Error('render: resposta inesperada do worker de codificação'));
      }
    };
    try {
      worker.postMessage(pedido, transferir);
    } catch (erro) {
      encerrar();
      emprestimo.perder();
      rejeitar(erro instanceof Error ? erro : new Error(String(erro)));
      return;
    }
    aoProgredir?.({ fase: 'codificando', feitas: 0, total: 0 });
  });
}
