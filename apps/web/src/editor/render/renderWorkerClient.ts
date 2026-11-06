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
 * texturas emprestadas do cache e rejeita com `ErroRenderWasm` de código cancelado (`ehCancelamento`). Se o cancelamento
 * vence a espera pelas texturas, a carga que ainda chega devolve o empréstimo na hora. Um worker encerrado não devolve os
 * pixels, por isso a próxima chamada recarrega as imagens.
 *
 * Os mips e a leitura de pixels usam o worker compartilhado (`workerRender.ts`); a codificação usa um worker próprio.
 */
import type { RenderSceneSnapshot, RenderTextura } from '@hestia/render';
import { gerarMips, LADO_MAXIMO_TEXTURA } from './texturaRender.ts';
import { emprestarTexturasCarregadas, type Emprestimo } from './texturasCena.ts';
import { codificarCena } from './wasmClient.ts';
import type { PedidoRender, RespostaRender } from './renderWorker.ts';
import { bufferesUnicos, paraTransferir } from './renderWorkerTarefas.ts';
import {
  criarWorkerRender,
  encerrarWorkerCompartilhado,
  erroDaResposta,
  erroDeCancelamento,
  lancarSeCancelado,
  pedirAoWorker,
  proximoIdRender,
} from './workerRender.ts';

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

/** Encerra o worker compartilhado (mips e leitura de pixels). Usado pelos testes; o app não precisa chamar. */
export function encerrarWorkerDeMips(): void {
  encerrarWorkerCompartilhado();
}

/**
 * Cadeia de mips de uma textura (média 2×2, como `gerarMips`), calculada no worker. Os pixels de `rgba` são TRANSFERIDOS
 * (o chamador não os usa depois); os mips voltam transferidos. Sem Worker, roda `gerarMips` na thread atual.
 */
export async function gerarMipsNoWorker(rgba: Uint8Array, largura: number, altura: number): Promise<Uint8Array[]> {
  const pendente = pedirAoWorker((id) => {
    const entrada = paraTransferir(rgba);
    const pedido: PedidoRender = { tipo: 'mips', id, rgba: entrada, largura, altura };
    return { pedido, transferir: bufferesUnicos([entrada]) };
  });
  if (!pendente) return gerarMips(rgba, largura, altura);
  const resposta = await pendente;
  if (!resposta.ok) throw erroDaResposta(resposta);
  if (resposta.resultado.tipo !== 'mips') throw new Error('render: resposta inesperada do worker de mips');
  return resposta.resultado.mips;
}

/**
 * Espera a carga das texturas ou o cancelamento, o que vier primeiro. Se o cancelamento vencer, a carga que ainda chega
 * registra um empréstimo: ele é devolvido na hora (os pixels continuam com a thread principal), para a lista não ficar
 * emprestada para sempre.
 */
function aguardarOuCancelar<T extends { cena: RenderSceneSnapshot; emprestimo: Emprestimo }>(
  promessa: Promise<T>,
  sinal: AbortSignal | undefined,
): Promise<T> {
  if (!sinal) return promessa;
  return new Promise<T>((resolver, rejeitar) => {
    const cancelar = (): void => {
      rejeitar(erroDeCancelamento());
      promessa.then(
        ({ cena, emprestimo }) => emprestimo.devolver((cena.texturas ?? []).map((textura) => textura.mips)),
        () => {
          // Carga que falhou: nada foi emprestado.
        },
      );
    };
    sinal.addEventListener('abort', cancelar, { once: true });
    promessa.then(
      (valor) => {
        sinal.removeEventListener('abort', cancelar);
        resolver(valor);
      },
      (erro: unknown) => {
        sinal.removeEventListener('abort', cancelar);
        rejeitar(erro);
      },
    );
  });
}

/**
 * Codifica o HSTR da cena num worker dedicado (encerrado ao fim, ao cancelamento ou à falha). Carrega as texturas no
 * lado pedido (com os mips no worker compartilhado), empresta-as ao worker de codificação e devolve o HSTR.
 *
 * `opcoes.lado` deve ser o mesmo com que as texturas do snapshot foram carregadas (padrão `LADO_MAXIMO_TEXTURA`): quando
 * elas já estão carregadas, a codificação usa os pixels que estão lá.
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
  const { cena, emprestimo } = await aguardarOuCancelar(
    emprestarTexturasCarregadas(snapshot, {
      lado,
      gerarMips: gerarMipsNoWorker,
      progresso: (feitas, total) => aoProgredir?.({ fase: 'texturas', feitas, total }),
    }),
    sinal,
  );
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
    id: proximoIdRender(),
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
