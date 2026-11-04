import { describe, expect, it } from 'vitest';
import type { Project } from '@hestia/model';
import { ClienteResolucao, type WorkerLike } from './cliente.ts';
import { executarResolucao } from './executor.ts';
import { projetoComPavimentos } from './fixturePavimentos.ts';
import { ResolucaoCancelada, type PedidoResolucao, type TipoResolucao } from './protocolo.ts';
import { criarWorkerSimulado } from './workerSimulado.ts';

const TIPOS: TipoResolucao[] = ['nivel', 'pisos', 'lajes', 'telhados', 'ambientes'];

/** Projeto com uma parede movida: o resultado de nível muda, para o teste de descarte ser significativo. */
function editado(p: Project, levelId: string): Project {
  const parede = p.elements[`${levelId}_w1`] ?? Object.values(p.elements).find((e) => e.kind === 'wall' && e.levelId === levelId);
  if (!parede || parede.kind !== 'wall') throw new Error('parede de teste não encontrada');
  return { ...p, elements: { ...p.elements, [parede.id]: { ...parede, b: { ...parede.b, x: parede.b.x + 1.5 } } } };
}

/** Espera a fila de tarefas do event loop esvaziar (mensagens simuladas são macrotarefas). */
const esperar = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe('ClienteResolucao: resultado igual ao cálculo direto', () => {
  it('1 nível, todos os tipos: worker simulado e fallback dão o mesmo resultado', async () => {
    const p = projetoComPavimentos(1);
    const comWorker = new ClienteResolucao({ usarWorker: true, criarWorker: () => criarWorkerSimulado() });
    const local = new ClienteResolucao();
    expect(comWorker.modo).toBe('worker');
    expect(local.modo).toBe('principal');
    for (const tipo of TIPOS) {
      const direto = executarResolucao(tipo, p, 'pav_0');
      expect(await comWorker.resolver(tipo, 'pav_0', p, 1)).toEqual(direto);
      expect(await local.resolver(tipo, 'pav_0', p, 1)).toEqual(direto);
    }
  }, 60_000);

  it('20 níveis, todos os tipos: worker simulado e fallback dão o mesmo resultado', async () => {
    const p = projetoComPavimentos(20);
    const comWorker = new ClienteResolucao({ usarWorker: true, criarWorker: () => criarWorkerSimulado() });
    const local = new ClienteResolucao();
    for (let i = 0; i < 20; i++) {
      const nivel = `pav_${i}`;
      for (const tipo of TIPOS) {
        const direto = executarResolucao(tipo, p, nivel);
        expect(await comWorker.resolver(tipo, nivel, p, 1)).toEqual(direto);
        expect(await local.resolver(tipo, nivel, p, 1)).toEqual(direto);
      }
    }
  }, 120_000);

  it('sem Worker disponível (criação ausente ou lançando) roda na thread principal', async () => {
    const p = projetoComPavimentos(1);
    const semFabrica = new ClienteResolucao({ usarWorker: true });
    const lanca = new ClienteResolucao({
      usarWorker: true,
      criarWorker: () => {
        throw new Error('Worker indisponível neste ambiente');
      },
    });
    expect(semFabrica.modo).toBe('principal');
    expect(lanca.modo).toBe('principal');
    expect(await lanca.resolver('nivel', 'pav_0', p, 1)).toEqual(executarResolucao('nivel', p, 'pav_0'));
  });

  it('projeto não clonável: este pedido vai para a thread principal e o resultado continua certo', async () => {
    const p = { ...projetoComPavimentos(1), naoClonavel: () => 1 } as Project & { naoClonavel: () => number };
    const cliente = new ClienteResolucao({ usarWorker: true, criarWorker: () => criarWorkerSimulado() });
    const { naoClonavel: _ignorado, ...semFuncao } = p;
    expect(await cliente.resolver('nivel', 'pav_0', p, 1)).toEqual(executarResolucao('nivel', semFuncao as Project, 'pav_0'));
    expect(cliente.modo).toBe('worker');
  });
});

describe('ClienteResolucao: cancelamento e descarte', () => {
  it('cancelar rejeita a promessa com ResolucaoCancelada e não afeta os demais pedidos', async () => {
    const p = projetoComPavimentos(2);
    const cliente = new ClienteResolucao({ usarWorker: true, criarWorker: () => criarWorkerSimulado({ latenciaMs: 2 }) });
    // O id do primeiro pedido é 1 (ordem de criação dentro do cliente).
    const cancelado = cliente.resolver('nivel', 'pav_0', p, 1);
    const seguinte = cliente.resolver('nivel', 'pav_1', p, 1);
    cliente.cancelar(1);
    await expect(cancelado).rejects.toBeInstanceOf(ResolucaoCancelada);
    await expect(cancelado).rejects.toMatchObject({ motivo: 'cancelado' });
    expect(await seguinte).toEqual(executarResolucao('nivel', p, 'pav_1'));
  });

  it('pedido mais antigo do mesmo tipo+nível é substituído; o mais recente vale', async () => {
    const v1 = projetoComPavimentos(1);
    const v2 = editado(v1, 'pav_0');
    expect(executarResolucao('nivel', v1, 'pav_0')).not.toEqual(executarResolucao('nivel', v2, 'pav_0'));
    const cliente = new ClienteResolucao({ usarWorker: true, criarWorker: () => criarWorkerSimulado({ latenciaMs: 3 }) });
    const antigo = cliente.resolver('nivel', 'pav_0', v1, 1);
    const novo = cliente.resolver('nivel', 'pav_0', v2, 2);
    await expect(antigo).rejects.toMatchObject({ motivo: 'substituido' });
    expect(await novo).toEqual(executarResolucao('nivel', v2, 'pav_0'));
  });

  it('resposta atrasada de pedido substituído é descartada (não resolve duas vezes)', async () => {
    const v1 = projetoComPavimentos(1);
    const v2 = editado(v1, 'pav_0');
    let resolvidos = 0;
    const cliente = new ClienteResolucao({ usarWorker: true, criarWorker: () => criarWorkerSimulado({ latenciaMs: 10 }) });
    const antigo = cliente.resolver('nivel', 'pav_0', v1, 1).then(
      () => {
        resolvidos++;
      },
      () => undefined,
    );
    const novo = cliente.resolver('nivel', 'pav_0', v2, 2);
    await novo;
    await antigo;
    await esperar(20);
    expect(resolvidos).toBe(0);
    expect(cliente.pendentesAbertos).toBe(0);
  });

  it('pedidos de níveis diferentes não se substituem', async () => {
    const p = projetoComPavimentos(2);
    const cliente = new ClienteResolucao({ usarWorker: true, criarWorker: () => criarWorkerSimulado() });
    const [a, b] = await Promise.all([cliente.resolver('pisos', 'pav_0', p, 1), cliente.resolver('pisos', 'pav_1', p, 1)]);
    expect(a).toEqual(executarResolucao('pisos', p, 'pav_0'));
    expect(b).toEqual(executarResolucao('pisos', p, 'pav_1'));
  });

  it('queda do worker no meio refaz os pedidos pendentes na thread principal, com o mesmo resultado', async () => {
    const p = projetoComPavimentos(2);
    const worker = criarWorkerSimulado({ latenciaMs: 20 });
    const cliente = new ClienteResolucao({ usarWorker: true, criarWorker: () => worker });
    const pendente = cliente.resolver('nivel', 'pav_1', p, 1);
    worker.quebrar();
    expect(await pendente).toEqual(executarResolucao('nivel', p, 'pav_1'));
    expect(cliente.modo).toBe('principal');
  });

  it('encerrar cancela tudo e desliga o worker; depois o cliente segue na thread principal', async () => {
    const p = projetoComPavimentos(1);
    const cliente = new ClienteResolucao({ usarWorker: true, criarWorker: () => criarWorkerSimulado({ latenciaMs: 50 }) });
    const aberto = cliente.resolver('nivel', 'pav_0', p, 1);
    cliente.encerrar();
    await expect(aberto).rejects.toMatchObject({ motivo: 'cancelado' });
    expect(cliente.modo).toBe('principal');
    expect(await cliente.resolver('nivel', 'pav_0', p, 2)).toEqual(executarResolucao('nivel', p, 'pav_0'));
  });
});

/** Worker que recebe e nunca responde: usado para ver que o cliente não trava quando nada volta. */
function workerMudo(): WorkerLike {
  return { postMessage: () => undefined, terminate: () => undefined, onmessage: null, onerror: null };
}

describe('ClienteResolucao: worker que não responde', () => {
  it('o pedido fica pendente até ser cancelado (sem resolver nada por conta própria)', async () => {
    const p = projetoComPavimentos(1);
    const cliente = new ClienteResolucao({ usarWorker: true, criarWorker: workerMudo });
    const pendente = cliente.resolver('nivel', 'pav_0', p, 1);
    expect(cliente.pendentesAbertos).toBe(1);
    cliente.cancelar(1);
    await expect(pendente).rejects.toMatchObject({ motivo: 'cancelado' });
  });
});

describe('ClienteResolucao: kernel v2 das fatias A e B', () => {
  /** Worker que só guarda as mensagens: o pedido fica pendente e é cancelado no fim do teste. */
  function workerQueGuarda(mensagens: PedidoResolucao[]): WorkerLike {
    return {
      postMessage: (m: unknown) => {
        mensagens.push(structuredClone(m) as PedidoResolucao);
      },
      terminate: () => undefined,
      onmessage: null,
      onerror: null,
    };
  }

  it('com a fatia B ligada o pedido leva kernelV2 com a configuração da B', async () => {
    const mensagens: PedidoResolucao[] = [];
    const config = { fatiaA: false, fatiaB: true, sombra: false } as const;
    const cliente = new ClienteResolucao({ usarWorker: true, criarWorker: () => workerQueGuarda(mensagens), kernelV2: () => config });
    const pendente = cliente.resolver('pisos', 'pav_0', projetoComPavimentos(1), 1);
    expect(mensagens[0]?.kernelV2).toEqual(config);
    cliente.cancelar(1);
    await expect(pendente).rejects.toBeInstanceOf(ResolucaoCancelada);
  });

  it('sem fatia ligada o pedido não leva kernelV2 (o worker não instala nada)', async () => {
    const mensagens: PedidoResolucao[] = [];
    const cliente = new ClienteResolucao({ usarWorker: true, criarWorker: () => workerQueGuarda(mensagens), kernelV2: () => ({ fatiaA: false, fatiaB: false, sombra: true }) });
    const pendente = cliente.resolver('pisos', 'pav_0', projetoComPavimentos(1), 1);
    expect(mensagens[0]?.kernelV2).toBeUndefined();
    cliente.cancelar(1);
    await expect(pendente).rejects.toBeInstanceOf(ResolucaoCancelada);
  });
});
