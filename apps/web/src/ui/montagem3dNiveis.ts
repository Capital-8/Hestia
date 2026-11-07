import type { ResolvedLevel } from '@hestia/engine';
import type { ClienteResolucao } from '@hestia/engine/src/worker/cliente.ts';
import type { Id, Project } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { criarClienteResolucao } from '../editor/resolveWorker.ts';
import type { FonteWorker } from './montagem3dProgressiva.ts';

/**
 * Fonte de níveis da montagem 3D no worker (ver `packages/engine/src/worker`): pede o nível ao mesmo protocolo que a
 * abertura usa, um de cada vez e na ordem em que a montagem pede (o visível primeiro), com cancelamento e fallback.
 * O resultado é o mesmo de `resolveLevel` na thread principal — o worker roda `executarResolucao('nivel')`.
 *
 * Diferença para o segundo plano da planta (`ResolucaoProgressiva`): aqui interessa só o nível (as junções ficam para o
 * segundo plano) e a ordem é a da câmera, não a da aba. Por isso a montagem pede na fila dela, em vez de esperar a
 * entrega de `nivel` + `juncoes` de cada pavimento.
 *
 * Transferência: `ResolvedLevel` é dado puro (números, ids e listas), então a resposta atravessa por structured clone;
 * não há `ArrayBuffer` para transferir. O protocolo do worker já transfere buffers quando o resultado os tem
 * (`colherBuffers`, em `packages/engine/src/worker/protocolo.ts`).
 *
 * Sem `Worker` no ambiente (ou se ele não subir), devolve `null` e a montagem fica no caminho síncrono de antes.
 */
export function criarFonteNiveisWorker(opcoes: { cliente?: ClienteResolucao } = {}): FonteWorker | null {
  let cliente: ClienteResolucao;
  try {
    cliente = opcoes.cliente ?? criarClienteResolucao({ usarWorker: true });
  } catch {
    return null;
  }
  if (cliente.modo !== 'worker') return null;
  /** Uma versão por projeto: a estrutura atravessa o `postMessage` uma vez e o worker a reaproveita nos pedidos seguintes. */
  const versoes = new WeakMap<Project, number>();
  let proximaVersao = 1;
  const versaoDe = (projeto: Project): number => {
    const existente = versoes.get(projeto);
    if (existente !== undefined) return existente;
    const nova = proximaVersao++;
    versoes.set(projeto, nova);
    return nova;
  };
  return {
    iniciar(projeto: Project): void {
      versaoDe(projeto);
    },
    pedir(nivel: Id, projeto: Project): Promise<ResolvedLevel> {
      return cliente.resolver('nivel', nivel, projeto, versaoDe(projeto)).then((valor) => {
        const resolvido = valor as ResolvedLevel;
        // O nível resolvido aqui também serve ao segundo plano da planta: sem isso os dois workers fariam o mesmo nível
        // duas vezes. O projeto tem de ser o mesmo (uma edição no meio do pedido invalida o resultado).
        if (editor.project === projeto) editor.fluxo.resolucao.semear(nivel, resolvido);
        return resolvido;
      });
    },
    cancelar(): void {
      cliente.cancelarTodos();
    },
    encerrar(): void {
      cliente.encerrar();
    },
  };
}
