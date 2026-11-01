import { describe, expect, it } from 'vitest';
import { PreparoProjeto, type ProgressoPreparo, type TarefaPreparo } from './preparoProjeto.ts';

/** Agendador manual: `rodar()` executa o próximo agendado, avançando o relógio pelo atraso pedido. */
function ambiente(opts: { ativo?: () => boolean } = {}) {
  let agora = 0;
  const agenda: { f: () => void; em: number; viva: boolean }[] = [];
  const progresso: ProgressoPreparo[] = [];
  const preparo = new PreparoProjeto({
    agendar: (f, atraso) => {
      const a = { f, em: agora + atraso, viva: true };
      agenda.push(a);
      return () => (a.viva = false);
    },
    agora: () => agora,
    usuarioAtivo: opts.ativo,
    aoProgresso: (p) => progresso.push({ ...p }),
    esperaMs: 100,
    intervaloPesadasMs: 50,
  });
  const rodar = (): boolean => {
    const i = agenda.findIndex((a) => a.viva);
    if (i < 0) return false;
    const [a] = agenda.splice(i, 1);
    agora = Math.max(agora, a!.em);
    a!.f();
    return true;
  };
  const tudo = async (): Promise<void> => {
    for (let n = 0; n < 200; n++) {
      rodar();
      await Promise.resolve();
    }
  };
  return { preparo, rodar, tudo, progresso, tempo: () => agora };
}

const t = (id: string, prioridade: number, log: string[], extra: Partial<TarefaPreparo> = {}): TarefaPreparo => ({
  id,
  grupo: id.split(':')[0]!,
  prioridade,
  executar: () => void log.push(id),
  ...extra,
});

describe('PreparoProjeto', () => {
  it('executa por prioridade e, no empate, pela ordem de entrada', async () => {
    const e = ambiente();
    const log: string[] = [];
    e.preparo.adicionar(t('b', 2, log));
    e.preparo.adicionar(t('a', 1, log));
    e.preparo.adicionar(t('c', 2, log));
    await e.tudo();
    expect(log).toEqual(['a', 'b', 'c']);
    expect(e.preparo.progresso).toMatchObject({ feitas: 3, total: 3 });
  });

  it('priorizar leva a tarefa para a frente', async () => {
    const e = ambiente();
    const log: string[] = [];
    for (const id of ['x', 'y', 'z']) e.preparo.adicionar(t(id, 5, log));
    expect(e.preparo.priorizar('z')).toBe(true);
    expect(e.preparo.priorizar('nao-existe')).toBe(false);
    await e.tudo();
    expect(log).toEqual(['z', 'x', 'y']);
  });

  it('priorizarGrupo promove só as que casam', async () => {
    const e = ambiente();
    const log: string[] = [];
    e.preparo.adicionar(t('corte:1', 3, log));
    e.preparo.adicionar(t('corte:2', 3, log));
    e.preparo.adicionar(t('nivel:1', 1, log));
    e.preparo.priorizarGrupo('corte', (id) => id === 'corte:2');
    await e.tudo();
    expect(log).toEqual(['corte:2', 'nivel:1', 'corte:1']);
  });

  it('cancelar descarta a fila e ignora a tarefa em curso', async () => {
    const e = ambiente();
    const log: string[] = [];
    let liberar!: () => void;
    e.preparo.adicionar({
      id: 'lenta',
      grupo: 'g',
      prioridade: 1,
      executar: () =>
        new Promise<void>((r) => {
          liberar = () => {
            log.push('lenta');
            r();
          };
        }),
    });
    e.preparo.adicionar(t('depois', 2, log));
    e.rodar();
    e.preparo.cancelar();
    liberar();
    await e.tudo();
    expect(log).toEqual(['lenta']);
    expect(e.preparo.pendentes).toBe(0);
    expect(e.preparo.progresso.total).toBe(0);
  });

  it('espera o usuário terminar o gesto antes de começar', async () => {
    let ativo = true;
    const e = ambiente({ ativo: () => ativo });
    const log: string[] = [];
    e.preparo.adicionar(t('a', 1, log));
    e.rodar();
    expect(log).toEqual([]);
    ativo = false;
    await e.tudo();
    expect(log).toEqual(['a']);
    expect(e.tempo()).toBeGreaterThanOrEqual(100);
  });

  it('espaça tarefas pesadas pelo intervalo', async () => {
    const e = ambiente();
    const inicios: number[] = [];
    for (const id of ['p1', 'p2']) e.preparo.adicionar({ id, grupo: 'planta', prioridade: 1, pesada: true, executar: () => void inicios.push(e.tempo()) });
    await e.tudo();
    expect(inicios[1]! - inicios[0]!).toBeGreaterThanOrEqual(50);
  });

  it('erro numa tarefa não para a fila', async () => {
    const e = ambiente();
    const log: string[] = [];
    e.preparo.adicionar({
      id: 'ruim',
      grupo: 'g',
      prioridade: 1,
      executar: () => {
        throw new Error('x');
      },
    });
    e.preparo.adicionar(t('ok', 2, log));
    await e.tudo();
    expect(log).toEqual(['ok']);
  });

  it('não duplica tarefa com o mesmo id', () => {
    const e = ambiente();
    e.preparo.adicionar(t('a', 1, []));
    e.preparo.adicionar(t('a', 1, []));
    expect(e.preparo.progresso.total).toBe(1);
  });
});
