import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import { avisosDoProjeto } from './avisosCalculo.ts';
import { ClienteAvisos, executarAviso, instalarServidorAvisos, type WorkerAvisoLike } from './avisosWorker.ts';

function projeto() {
  const s = new ProjectStore(createEmptyProject('Teste'));
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_ext19', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  return s.project;
}

/** Worker simulado: o servidor real ligado ao cliente por mensagens assíncronas. */
function workerSimulado(): WorkerAvisoLike {
  const w: WorkerAvisoLike = {
    onmessage: null,
    onerror: null,
    terminate: () => undefined,
    postMessage: (m) => {
      queueMicrotask(() => servidor.onmessage?.({ data: structuredClone(m) }));
    },
  };
  const servidor = {
    onmessage: null as ((ev: { data: unknown }) => void) | null,
    postMessage: (m: unknown) => queueMicrotask(() => w.onmessage?.({ data: m })),
  };
  instalarServidorAvisos(servidor);
  return w;
}

describe('worker de avisos', () => {
  it('sem worker, o cliente diz que não há e rejeita (quem chama calcula na thread principal)', async () => {
    const c = new ClienteAvisos();
    expect(c.disponivel).toBe(false);
    await expect(c.avisos(projeto())).rejects.toThrow();
  });

  it('o resultado pelo worker é igual ao cálculo direto, e o projeto só viaja uma vez', async () => {
    const p = projeto();
    const c = new ClienteAvisos(workerSimulado);
    expect(await c.avisos(p)).toEqual(avisosDoProjeto(p));
    const faixa = { top: 2, cut: 1.2, bottom: 0, depth: -1, direction: 'down' as const };
    expect(await c.vista(p, 'lv_0', faixa)).toEqual(executarAviso(p, { tipo: 'vista', nivel: 'lv_0', faixa }));
  });

  it('encerrar rejeita o que estava pendente', async () => {
    const c = new ClienteAvisos(workerSimulado);
    const pendente = c.avisos(projeto());
    c.encerrar();
    await expect(pendente).rejects.toThrow();
  });
});
