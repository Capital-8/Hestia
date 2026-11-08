import { KernelV1Pendente } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { MemoriaPatch } from '../fluxoPatch.ts';
import { aguardarKernel, diagnosticoLocalDoDespacho, iniciarDespachoKernel, KernelPendente } from '../kernelDespacho.ts';
import { executarResolucao } from './executor.ts';
import { colherBuffers, chaveDoPedido, ehCancelamento, ERRO_PROJETO_AUSENTE, type MensagemResolucao, type PedidoResolucao, type RespostaResolucao, type TipoResolucao } from './protocolo.ts';

/** Parte do escopo do worker que o servidor usa (`self` em um Worker dedicado). */
export interface EscopoServidor {
  postMessage(mensagem: unknown, transferencia?: Transferable[]): void;
  onmessage: ((evento: { data: unknown }) => void) | null;
}

/** Versão do projeto e base do patch de um pedido (ver `PedidoResolucao`). */
export interface ContextoPedido {
  versao: number;
  base: number | null;
}

/** Função que resolve um pedido; no worker é `executarResolucao`, em testes pode ser outra. */
export type Executor = (tipo: TipoResolucao, projeto: Project, nivel: Id, contexto: ContextoPedido) => unknown;

/** Executor padrão, com a memória dos últimos resultados de nível deste servidor (base dos patches de diferença). */
function criarExecutorPadrao(): Executor {
  const memoria = new MemoriaPatch();
  return (tipo, projeto, nivel, contexto) => executarResolucao(tipo, projeto, nivel, undefined, { ...contexto, memoria });
}

/** Pedido na fila: o projeto já está resolvido (o da mensagem ou o último recebido por inteiro). */
type PedidoNaFila = PedidoResolucao & { projeto: { versao: number; estrutura: Project } };

/** Mensagem de erro legível para o cliente. */
const textoDoErro = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Instala o servidor do protocolo no escopo do worker. Os pedidos entram numa fila processada um por tarefa do event
 * loop, para que cancelamentos chegados depois possam tirar da fila um pedido que ainda não começou. Ao chegar um pedido,
 * os da mesma chave (tipo + nível) que ainda estão na fila saem: só o mais recente interessa.
 * Devolve a função que desinstala o servidor.
 */
export function instalarServidor(escopo: EscopoServidor, executor: Executor = criarExecutorPadrao()): () => void {
  const fila: PedidoNaFila[] = [];
  let agendado = false;
  /** Último projeto recebido por inteiro: os pedidos que omitem a `estrutura` (mesma versão) usam este. */
  let ultimo: { versao: number; estrutura: Project } | null = null;

  const executar = (pedido: PedidoNaFila, jaEsperou = false): void => {
    const { id } = pedido;
    try {
      const resultado = executor(pedido.tipo, pedido.projeto.estrutura, pedido.nivel, { versao: pedido.projeto.versao, base: pedido.base ?? null });
      const resposta: RespostaResolucao = { id, resultado, erro: null };
      const diag = diagnosticoLocalDoDespacho();
      if (diag) resposta.kernelDiag = diag;
      escopo.postMessage(resposta, colherBuffers(resultado));
    } catch (e) {
      // Kernel pendente (wasm ainda carregando): nada de resultado do TypeScript; o pedido espera o wasm e roda de novo (uma vez).
      if ((e instanceof KernelPendente || e instanceof KernelV1Pendente) && !jaEsperou) {
        void aguardarKernel().then(() => executar(pedido, true));
        return;
      }
      const resposta: RespostaResolucao = { id, resultado: null, erro: textoDoErro(e) };
      escopo.postMessage(resposta);
    }
  };

  const processar = (): void => {
    agendado = false;
    const pedido = fila.shift();
    if (pedido) executar(pedido);
    agendar();
  };

  const agendar = (): void => {
    if (agendado || fila.length === 0) return;
    agendado = true;
    setTimeout(processar, 0);
  };

  escopo.onmessage = (evento) => {
    const mensagem = evento.data as MensagemResolucao;
    if (ehCancelamento(mensagem)) {
      const i = fila.findIndex((p) => p.id === mensagem.id);
      if (i >= 0) fila.splice(i, 1);
      return;
    }
    // Despacho das fatias A e B e kernel v1 (0047 §12, 0050; decisão do dono de 2026-11-06): o Rust é o único caminho de produção; a configuração viaja no pedido; o wasm carrega em segundo plano e, até ficar pronto, os pedidos esperam (`KernelPendente`), nunca valem o TS.
    if (mensagem.kernelV2?.fatiaA === true || mensagem.kernelV2?.fatiaB === true) void iniciarDespachoKernel(mensagem.kernelV2);
    // O projeto é fixado ao chegar o pedido (não ao executá-lo): um pedido da fila de uma versão antiga não vê a seguinte.
    const { versao, estrutura } = mensagem.projeto;
    if (estrutura) ultimo = { versao, estrutura };
    else if (!ultimo || ultimo.versao !== versao) {
      escopo.postMessage({ id: mensagem.id, resultado: null, erro: ERRO_PROJETO_AUSENTE } satisfies RespostaResolucao);
      return;
    }
    const chave = chaveDoPedido(mensagem.tipo, mensagem.nivel);
    for (let i = fila.length - 1; i >= 0; i--) {
      const antigo = fila[i]!;
      if (chaveDoPedido(antigo.tipo, antigo.nivel) === chave) fila.splice(i, 1);
    }
    fila.push({ ...mensagem, projeto: { versao, estrutura: estrutura ?? ultimo!.estrutura } });
    agendar();
  };

  return () => {
    escopo.onmessage = null;
    fila.length = 0;
  };
}
