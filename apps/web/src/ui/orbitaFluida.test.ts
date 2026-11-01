import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LevelResolveCache, type ResolvedLevel } from '@hestia/engine';
import { projetoComPavimentos } from '@hestia/engine/src/worker/fixturePavimentos.ts';
import { ProjectStore, type Id, type ValidationIssue } from '@hestia/model';
import type { Scene3DOptions } from '@hestia/render';
import { SETTLE_MS, agendarAvisos } from '../editor/avisosProjeto.ts';
import { VERIFICADORES_DE_AVISOS } from '../editor/avisosCalculo.ts';
import { FOLGA_GESTO_MS, encerrarGesto, interacaoAtiva, iniciarGesto, marcarInteracao, msAteLiberar, quandoLivre, reiniciarInteracaoParaTeste } from '../editor/interacaoAtiva.ts';
import { Montagem3dProgressiva, type CenaMontagem, type FonteNiveis } from './montagem3dProgressiva.ts';

/**
 * Regressão de desempenho da órbita logo depois de uma edição: o trabalho de fundo (remontagem de níveis, avisos do projeto)
 * cede a thread entre as fatias e não roda durante um gesto de câmera. Relógio e agendador injetados: determinístico, sem GPU.
 */

const OPT: Scene3DOptions = { edges: false, shadows: false, dark: false };

class Cena implements CenaMontagem {
  readonly chamadas: Id[][] = [];
  update(_p: unknown, niveis: ResolvedLevel[]): void {
    this.chamadas.push(niveis.map((n) => n.levelId));
  }
}

/** Fila manual: cada `rodarUma` é uma tarefa do navegador (a thread é cedida entre elas). */
function fila(): { agendar: (t: () => void) => void; rodarUma: () => boolean; tamanho: () => number } {
  const f: Array<() => void> = [];
  return { agendar: (t) => f.push(t), rodarUma: () => (f.shift()?.(), true), tamanho: () => f.length };
}

describe('interacaoAtiva', () => {
  let t = 0;
  beforeEach(() => {
    t = 1000;
    reiniciarInteracaoParaTeste(() => t);
  });
  afterEach(() => reiniciarInteracaoParaTeste());

  it('gesto aberto ou recente conta como ativo; passa a folga depois de soltar', () => {
    expect(interacaoAtiva()).toBe(false);
    iniciarGesto();
    t += 1000;
    expect(interacaoAtiva()).toBe(true);
    encerrarGesto();
    t += FOLGA_GESTO_MS - 1;
    expect(interacaoAtiva()).toBe(true);
    t += 2;
    expect(interacaoAtiva()).toBe(false);
  });

  it('roda de imediato sem gesto; com gesto espera o fim dele', () => {
    const acao = vi.fn();
    const esperas: Array<() => void> = [];
    marcarInteracao();
    quandoLivre(acao, (_ms, f) => esperas.push(f));
    expect(acao).not.toHaveBeenCalled();
    expect(msAteLiberar()).toBeGreaterThan(0);
    t += FOLGA_GESTO_MS + 1;
    esperas.shift()!();
    expect(acao).toHaveBeenCalledTimes(1);
  });
});

describe('remontagem depois de uma edição', () => {
  let t = 0;
  beforeEach(() => {
    t = 1000;
    reiniciarInteracaoParaTeste(() => t);
  });
  afterEach(() => reiniciarInteracaoParaTeste());

  function montagemEditada(): { m: Montagem3dProgressiva; f: ReturnType<typeof fila>; cena: Cena; calculados: Id[]; ids: Id[]; editar: () => void } {
    let projeto = projetoComPavimentos(8);
    const ids = projeto.levels.map((l) => l.id);
    const calculados: Id[] = [];
    const cache = new LevelResolveCache();
    const fonte: FonteNiveis = {
      resolver: (id) => {
        calculados.push(id);
        return cache.get(projeto, id);
      },
    };
    const cena = new Cena();
    const f = fila();
    // `quandoLivre` real, mas a espera do gesto cai na própria fila (cada espera é uma tarefa).
    const m = new Montagem3dProgressiva({
      cena,
      fonte,
      aoAtualizar: () => undefined,
      aoConcluir: () => undefined,
      agendar: f.agendar,
      quandoLivre: (acao) => quandoLivre(acao, (_ms, g) => f.agendar(g)),
    });
    m.atualizar(projeto, OPT, 'pav_4');
    while (f.tamanho() > 0) f.rodarUma();
    calculados.length = 0;
    const editar = (): void => {
      const store = new ProjectStore(projeto);
      store.exec({ type: 'setWallEnds', id: 'pav_4_w1', b: { x: 12, y: 8 } });
      projeto = store.project;
      m.atualizar(projeto, OPT, 'pav_4');
    };
    return { m, f, cena, calculados, ids, editar };
  }

  it('sem gesto: o nível editado entra na hora e cada vizinho ganha a sua própria tarefa', () => {
    const { f, calculados, editar, cena, ids } = montagemEditada();
    editar();
    expect(calculados).toEqual(['pav_4']); // só o visível, no mesmo turno
    expect(f.tamanho()).toBe(1);
    f.rodarUma();
    expect(calculados).toEqual(['pav_4', 'pav_3']); // um nível por tarefa
    f.rodarUma();
    expect(calculados).toEqual(['pav_4', 'pav_3', 'pav_5']);
    expect(cena.chamadas.at(-1)).toEqual(ids);
  }, 60_000);

  it('a cena nunca perde um nível enquanto a remontagem está pendente (a malha antiga fica até a nova chegar)', () => {
    const { f, editar, cena, ids } = montagemEditada();
    editar();
    while (f.tamanho() > 0) f.rodarUma();
    for (const chamada of cena.chamadas.slice(-3)) expect(chamada).toEqual(ids);
  }, 60_000);

  it('com gesto ativo nenhuma fatia roda; ~150 ms depois do fim dele a remontagem volta', () => {
    const { m, f, calculados, editar, cena, ids } = montagemEditada();
    iniciarGesto();
    const antes = cena.chamadas.length;
    editar();
    // Gesto aberto: mesmo rodando todas as tarefas agendadas o tempo todo, nenhum nível é calculado.
    for (let i = 0; i < 50; i++) {
      t += 16;
      marcarInteracao();
      f.rodarUma();
    }
    expect(calculados).toEqual([]);
    expect(cena.chamadas.length).toBe(antes);
    expect(cena.chamadas.length === antes && m.montados).toBeLessThan(ids.length + 1);

    encerrarGesto();
    t += FOLGA_GESTO_MS - 10;
    f.rodarUma();
    expect(calculados).toEqual([]); // ainda dentro da folga
    t += 20;
    while (f.tamanho() > 0) f.rodarUma();
    expect(calculados).toEqual(['pav_4', 'pav_3', 'pav_5']);
    expect(cena.chamadas.at(-1)).toEqual(ids);
    expect(m.montados).toBe(ids.length);
  }, 60_000);
});

describe('avisos do projeto em fatias', () => {
  let t = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    t = 1000;
    reiniciarInteracaoParaTeste(() => t);
  });
  afterEach(() => {
    vi.useRealTimers();
    reiniciarInteracaoParaTeste();
  });

  it('sem worker: um verificador por tarefa e a entrega só no fim', () => {
    const recebido: ValidationIssue[][] = [];
    const tarefas: Array<() => void> = [];
    agendarAvisos(projetoComPavimentos(2), (a) => recebido.push(a), SETTLE_MS, { worker: null, ceder: (x) => tarefas.push(x) });
    vi.advanceTimersByTime(SETTLE_MS);
    // O primeiro verificador rodou e a thread foi cedida; o resto espera.
    expect(tarefas).toHaveLength(1);
    let rodadas = 1;
    while (tarefas.length > 0) {
      tarefas.shift()!();
      rodadas++;
      if (tarefas.length > 0) expect(recebido).toHaveLength(0);
    }
    expect(rodadas).toBe(VERIFICADORES_DE_AVISOS.length + 1);
    expect(recebido).toHaveLength(1);
  }, 60_000);

  it('gesto ativo adia o cálculo; nova edição (cancelar) descarta o que estava em curso', () => {
    const recebido: ValidationIssue[][] = [];
    const tarefas: Array<() => void> = [];
    iniciarGesto();
    const cancelar = agendarAvisos(projetoComPavimentos(2), (a) => recebido.push(a), SETTLE_MS, { worker: null, ceder: (x) => tarefas.push(x) });
    vi.advanceTimersByTime(SETTLE_MS + 500);
    expect(tarefas).toHaveLength(0); // nada calculado durante o gesto
    encerrarGesto();
    t += FOLGA_GESTO_MS + 1;
    vi.advanceTimersByTime(3000);
    expect(tarefas).toHaveLength(1);
    cancelar();
    while (tarefas.length > 0) tarefas.shift()!();
    expect(recebido).toHaveLength(0);
  }, 60_000);
});
