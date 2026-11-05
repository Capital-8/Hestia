import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LevelResolveCache, type ResolvedLevel } from '@hestia/engine';
import { ClienteResolucao, type WorkerLike } from '@hestia/engine/src/worker/cliente.ts';
import { projetoComPavimentos } from '@hestia/engine/src/worker/fixturePavimentos.ts';
import type { TipoResolucao } from '@hestia/engine/src/worker/protocolo.ts';
import { criarWorkerSimulado } from '@hestia/engine/src/worker/workerSimulado.ts';
import { makeLevel, ProjectStore, type Id, type Project } from '@hestia/model';
import { ModelScene, type Scene3DOptions } from '@hestia/render';
import { FluxoEdicao } from '../editor/fluxoEdicao.ts';
import { ResolucaoProgressiva } from '../editor/resolucaoAssincrona.ts';
import { criarFonteNiveisWorker } from './montagem3dNiveis.ts';
import { Montagem3dProgressiva, ordemDeMontagem, proximoLote, type CenaMontagem, type FonteNiveis, type FonteWorker } from './montagem3dProgressiva.ts';

/** Projeto mínimo só com os ids dos níveis (a montagem só lê os níveis e a chave de conteúdo deles). */
const projetoDeIds = (ids: Id[]): Project => ({ levels: ids.map((id, i) => ({ id, name: id, elevation: i * 3 })), elements: {} }) as unknown as Project;
/** Nível falso: a montagem só repassa o objeto à cena. */
const nivelFalso = (id: Id): ResolvedLevel => ({ levelId: id }) as unknown as ResolvedLevel;
const OPT: Scene3DOptions = { edges: false, shadows: false, dark: false };

/** Cena que anota cada atualização (ids dos níveis, o projeto e as opções). */
class CenaAnotada implements CenaMontagem {
  readonly chamadas: Array<{ ids: Id[]; projeto: Project; opt: Scene3DOptions }> = [];
  update(p: Project, niveis: ResolvedLevel[], opt: Scene3DOptions): void {
    this.chamadas.push({ ids: niveis.map((n) => (n as unknown as { levelId: Id }).levelId), projeto: p, opt });
  }
}

/** Agendador manual: as tarefas ficam numa fila até o teste rodá-las. */
function filaManual(): { agendar: (t: () => void) => void; rodar: () => void } {
  const fila: Array<() => void> = [];
  return {
    agendar: (t) => fila.push(t),
    rodar: () => {
      while (fila.length > 0) fila.shift()!();
    },
  };
}

/** Fonte que conta quantas vezes cada nível foi calculado na hora. */
function fonteContada(pronto?: (id: Id) => ResolvedLevel | null): FonteNiveis & { calculados: Id[] } {
  const calculados: Id[] = [];
  return {
    calculados,
    pronto,
    resolver: (id) => {
      calculados.push(id);
      return nivelFalso(id);
    },
  };
}

/** Cliente de resolução com worker simulado que anota cada pedido (tipo, nível e projeto). */
class ClienteContado extends ClienteResolucao {
  readonly pedidos: Array<{ tipo: TipoResolucao; nivel: Id; projeto: Project }> = [];

  constructor() {
    super({ usarWorker: true, criarWorker: () => criarWorkerSimulado() });
  }

  override resolver(tipo: TipoResolucao, nivel: Id, p: Project, versao: number, base: number | null = null): Promise<unknown> {
    this.pedidos.push({ tipo, nivel, projeto: p });
    return super.resolver(tipo, nivel, p, versao, base);
  }
}

/** Espera uma condição ficar verdadeira (a resolução em segundo plano chega por macrotarefas). */
async function esperarAte(condicao: () => boolean, limiteMs = 60_000): Promise<void> {
  const inicio = Date.now();
  while (!condicao()) {
    if (Date.now() - inicio > limiteMs) throw new Error('tempo esgotado esperando a resolução');
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe('ordemDeMontagem', () => {
  it('o visível vem primeiro, depois os mais perto dele (empate: a ordem do projeto)', () => {
    expect(ordemDeMontagem(['a', 'b', 'c', 'd', 'e'], 'c')).toEqual(['c', 'b', 'd', 'a', 'e']);
  });

  it('sem visível, ou com visível desconhecido, começa pelo primeiro nível', () => {
    expect(ordemDeMontagem(['a', 'b', 'c'], null)).toEqual(['a', 'b', 'c']);
    expect(ordemDeMontagem(['a', 'b', 'c'], 'x')).toEqual(['a', 'b', 'c']);
  });
});

describe('proximoLote', () => {
  it('dobra quando a fatia coube com folga', () => {
    expect(proximoLote(2, 1, 12)).toBe(4);
  });

  it('divide quando a fatia estourou o orçamento, sem passar de 1 para baixo', () => {
    expect(proximoLote(4, 20, 12)).toBe(2);
    expect(proximoLote(1, 20, 12)).toBe(1);
  });

  it('mantém o tamanho quando a fatia ficou na faixa do orçamento', () => {
    expect(proximoLote(3, 8, 12)).toBe(3);
  });

  it('não passa do teto', () => {
    expect(proximoLote(8, 1, 12)).toBe(8);
  });
});

describe('Montagem3dProgressiva: fatias', () => {
  it('a primeira fatia é síncrona e traz o visível com os dois vizinhos, na ordem do projeto', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `n${i}`);
    const p = projetoDeIds(ids);
    const cena = new CenaAnotada();
    const fila = filaManual();
    const m = new Montagem3dProgressiva({ cena, fonte: fonteContada(), aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar });
    m.iniciar(p, OPT, 'n10');
    expect(cena.chamadas).toHaveLength(1);
    expect(cena.chamadas[0]!.ids).toEqual(['n9', 'n10', 'n11']);
  });

  it('a cena cresce a cada fatia e termina com todos os níveis na ordem do projeto', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `n${i}`);
    const p = projetoDeIds(ids);
    const cena = new CenaAnotada();
    const fila = filaManual();
    let atualizacoes = 0;
    let concluidas = 0;
    const m = new Montagem3dProgressiva({ cena, fonte: fonteContada(), aoAtualizar: () => atualizacoes++, aoConcluir: () => concluidas++, agendar: fila.agendar });
    m.iniciar(p, OPT, 'n0');
    fila.rodar();
    const tamanhos = cena.chamadas.map((c) => c.ids.length);
    expect(tamanhos.every((t, i) => i === 0 || t > tamanhos[i - 1]!)).toBe(true);
    expect(cena.chamadas.at(-1)!.ids).toEqual(ids);
    expect(atualizacoes).toBe(cena.chamadas.length);
    expect(concluidas).toBe(1);
    expect(m.montados).toBe(20);
  });

  it('montarTudo resolve os pendentes e aplica uma única cena com todos os níveis', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `n${i}`);
    const cena = new CenaAnotada();
    const fila = filaManual();
    const fonte = fonteContada();
    const m = new Montagem3dProgressiva({ cena, fonte, aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar });
    m.iniciar(projetoDeIds(ids), OPT, 'n0');
    const antes = cena.chamadas.length;
    m.montarTudo();
    expect(m.montados).toBe(20);
    expect(fonte.calculados).toHaveLength(20);
    expect(cena.chamadas.at(-1)!.ids).toEqual(ids);
    expect(cena.chamadas.length).toBe(antes + 1);
    // As fatias antigas já agendadas não mexem mais na cena.
    fila.rodar();
    expect(cena.chamadas.length).toBe(antes + 1);
  });

  it('o lote cresce quando a fatia é barata (3, 6, 8, 3)', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `n${i}`);
    const cena = new CenaAnotada();
    const fila = filaManual();
    const m = new Montagem3dProgressiva({ cena, fonte: fonteContada(), aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar, relogio: () => 0 });
    m.iniciar(projetoDeIds(ids), OPT, 'n0');
    fila.rodar();
    expect(cena.chamadas.map((c) => c.ids.length)).toEqual([3, 9, 17, 20]);
  });

  it('o lote encolhe quando a fatia estoura o orçamento', () => {
    const ids = Array.from({ length: 6 }, (_, i) => `n${i}`);
    const cena = new CenaAnotada();
    const fila = filaManual();
    let t = 0;
    // Cada leitura do relógio avança 20 ms: a fatia dura 20 ms, acima do orçamento de 12 ms.
    const m = new Montagem3dProgressiva({ cena, fonte: fonteContada(), aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar, relogio: () => (t += 20), orcamentoMs: 12 });
    m.iniciar(projetoDeIds(ids), OPT, 'n0');
    fila.rodar();
    expect(cena.chamadas.map((c) => c.ids.length)).toEqual([3, 4, 5, 6]);
  });

  it('sem níveis: a cena é atualizada uma vez, vazia, e a montagem conclui', () => {
    const cena = new CenaAnotada();
    let concluidas = 0;
    const m = new Montagem3dProgressiva({ cena, fonte: fonteContada(), aoAtualizar: () => undefined, aoConcluir: () => concluidas++ });
    m.iniciar(projetoDeIds([]), OPT, null);
    expect(cena.chamadas).toHaveLength(1);
    expect(cena.chamadas[0]!.ids).toEqual([]);
    expect(concluidas).toBe(1);
  });
});

describe('Montagem3dProgressiva: fonte e cancelamento', () => {
  it('usa o pronto em segundo plano quando há, sem calcular esse nível de novo', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const cena = new CenaAnotada();
    const fila = filaManual();
    const fonte = fonteContada((id) => (id === 'c' ? nivelFalso('c') : null));
    const m = new Montagem3dProgressiva({ cena, fonte, aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar });
    m.iniciar(projetoDeIds(ids), OPT, 'a');
    fila.rodar();
    expect(fonte.calculados).not.toContain('c');
    expect(cena.chamadas.at(-1)!.ids).toEqual(ids);
  });

  it('iniciar de novo cancela a montagem anterior: as fatias antigas não mexem na cena', () => {
    const cena = new CenaAnotada();
    const fila = filaManual();
    const m = new Montagem3dProgressiva({ cena, fonte: fonteContada(), aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar });
    const antigo = projetoDeIds(['a', 'b', 'c', 'd', 'e']);
    const novo = projetoDeIds(['x', 'y']);
    m.iniciar(antigo, OPT, 'a');
    m.iniciar(novo, OPT, 'x');
    fila.rodar();
    expect(cena.chamadas.filter((c) => c.projeto === antigo)).toHaveLength(1);
    expect(cena.chamadas.at(-1)!.ids).toEqual(['x', 'y']);
  });

  it('cancelar: as fatias agendadas não atualizam a cena nem concluem', () => {
    const cena = new CenaAnotada();
    const fila = filaManual();
    let concluidas = 0;
    const m = new Montagem3dProgressiva({ cena, fonte: fonteContada(), aoAtualizar: () => undefined, aoConcluir: () => concluidas++, agendar: fila.agendar });
    m.iniciar(projetoDeIds(['a', 'b', 'c', 'd', 'e']), OPT, 'a');
    m.cancelar();
    fila.rodar();
    expect(cena.chamadas).toHaveLength(1);
    expect(concluidas).toBe(0);
  });
});

describe('Montagem3dProgressiva: prewarm completo', () => {
  it('todos os níveis prontos: monta em fatias (o visível primeiro), sem worker nem cálculo na hora', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const prontos = new Map(ids.map((id) => [id, nivelFalso(id)] as const));
    const cena = new CenaAnotada();
    const fila = filaManual();
    const fonte = fonteContada((id) => prontos.get(id) ?? null);
    const worker = new WorkerFalso();
    let concluidas = 0;
    const m = new Montagem3dProgressiva({ cena, fonte, worker, aoAtualizar: () => undefined, aoConcluir: () => concluidas++, agendar: fila.agendar });

    m.iniciar(projetoDeIds(ids), OPT, 'c');

    // Montar a malha é o que custa (~1 s por pavimento): a primeira fatia traz só o visível e a tela cede a thread.
    expect(cena.chamadas.map((c) => c.ids)).toEqual([['c']]);
    expect(concluidas).toBe(0);
    expect(m.total).toBe(ids.length);
    fila.rodar();
    // Ao fim, a cena recebe todos, na ordem do projeto; nada foi calculado na hora nem pedido ao worker.
    expect(cena.chamadas.length).toBeGreaterThan(1);
    expect(cena.chamadas.at(-1)!.ids).toEqual(ids);
    expect(fonte.calculados).toEqual([]);
    expect(worker.pedidos).toEqual([]);
    expect(worker.iniciados).toEqual([]);
    expect(concluidas).toBe(1);
    expect(m.montados).toBe(ids.length);
  });

  it('apenas alguns prontos: mantém o progressivo (primeira fatia só o visível e worker para o resto)', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const cena = new CenaAnotada();
    const fonte = fonteContada((id) => (id === 'c' ? nivelFalso('c') : null));
    const worker = new WorkerFalso();
    const m = new Montagem3dProgressiva({ cena, fonte, worker, aoAtualizar: () => undefined, aoConcluir: () => undefined });

    m.iniciar(projetoDeIds(ids), OPT, 'c');

    expect(cena.chamadas.map((c) => c.ids)).toEqual([['c']]);
    expect(fonte.calculados).toEqual([]); // o visível veio pronto; os outros vão ao worker
    expect(worker.pedidos).toEqual(['b', 'd']);
    expect(m.usandoWorker).toBe(true);
  });
});

describe('Montagem3dProgressiva: atualização incremental', () => {
  it('a primeira chamada de atualizar monta igual a iniciar', () => {
    const ids = Array.from({ length: 8 }, (_, i) => `n${i}`);
    const p = projetoDeIds(ids);

    const porIniciar = new CenaAnotada();
    const fonteIniciar = fonteContada();
    const filaIniciar = filaManual();
    new Montagem3dProgressiva({ cena: porIniciar, fonte: fonteIniciar, aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: filaIniciar.agendar }).iniciar(p, OPT, 'n3');
    filaIniciar.rodar();

    const porAtualizar = new CenaAnotada();
    const fonteAtualizar = fonteContada();
    const filaAtualizar = filaManual();
    new Montagem3dProgressiva({ cena: porAtualizar, fonte: fonteAtualizar, aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: filaAtualizar.agendar }).atualizar(p, OPT, 'n3');
    filaAtualizar.rodar();

    expect(porAtualizar.chamadas.map((c) => c.ids)).toEqual(porIniciar.chamadas.map((c) => c.ids));
    expect(fonteAtualizar.calculados).toEqual(fonteIniciar.calculados);
  });

  it('tema novo com o mesmo projeto reaplica a cena sem re-resolver nenhum nível', () => {
    const ids = Array.from({ length: 6 }, (_, i) => `n${i}`);
    const p = projetoDeIds(ids);
    const cena = new CenaAnotada();
    const fonte = fonteContada();
    const fila = filaManual();
    const m = new Montagem3dProgressiva({ cena, fonte, aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar });
    m.atualizar(p, OPT, 'n0');
    fila.rodar();
    expect(fonte.calculados).toEqual(ids);
    const antes = cena.chamadas.length;

    const escuro: Scene3DOptions = { ...OPT, dark: true };
    m.atualizar(p, escuro, 'n0');
    // Nenhum `resolver` novo: a geometria resolvida não depende do tema.
    expect(fonte.calculados).toEqual(ids);
    // A cena recebeu o tema novo com todos os níveis já prontos.
    expect(cena.chamadas).toHaveLength(antes + 1);
    expect(cena.chamadas.at(-1)!.opt).toEqual(escuro);
    expect(cena.chamadas.at(-1)!.ids).toEqual(ids);
    expect(m.montados).toBe(ids.length);
  });

  it('editar uma parede re-resolve só o nível dela e os vizinhos de cota; a cena termina com todos', () => {
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
    const cena = new CenaAnotada();
    const fila = filaManual();
    const m = new Montagem3dProgressiva({ cena, fonte, aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar });
    m.atualizar(projeto, OPT, 'pav_4');
    fila.rodar();
    expect(calculados).toEqual(ordemDeMontagem(ids, 'pav_4'));
    calculados.length = 0;

    // Edição: uma parede do pav_4 muda de ponta. O projeto novo tem outro mapa de elementos e os mesmos níveis.
    const store = new ProjectStore(projeto);
    store.exec({ type: 'setWallEnds', id: 'pav_4_w1', b: { x: 12, y: 8 } });
    projeto = store.project;
    expect(projeto.elements).not.toBe(cena.chamadas.at(-1)!.projeto.elements);

    m.atualizar(projeto, OPT, 'pav_4');
    fila.rodar();
    // Só a chave do nível editado e a dos vizinhos por cota (que incluem o conteúdo dele) mudou; o visível vem primeiro.
    expect(calculados).toEqual(['pav_4', 'pav_3', 'pav_5']);
    expect(cena.chamadas.at(-1)!.ids).toEqual(ids);
    expect(cena.chamadas.at(-1)!.projeto).toBe(projeto);
    expect(m.montados).toBe(ids.length);
  }, 60_000);

  it('níveis que entram e que saem deixam a cena coerente', () => {
    let projeto = projetoComPavimentos(3);
    const calculados: Id[] = [];
    const cache = new LevelResolveCache();
    const fonte: FonteNiveis = {
      resolver: (id) => {
        calculados.push(id);
        return cache.get(projeto, id);
      },
    };
    const cena = new CenaAnotada();
    const fila = filaManual();
    const m = new Montagem3dProgressiva({ cena, fonte, aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar });
    m.atualizar(projeto, OPT, 'pav_1');
    fila.rodar();
    expect(m.montados).toBe(3);

    // Um pavimento novo no topo: a lista de níveis entra no bloco global da chave (conservador), então todos os níveis
    // são re-resolvidos — inclusive o novo — e a cena termina com os quatro.
    calculados.length = 0;
    const comCobertura = new ProjectStore(projeto);
    comCobertura.exec({ type: 'upsertLevel', level: makeLevel({ id: 'pav_cobertura', name: 'Cobertura', elevation: 9 }) });
    projeto = comCobertura.project;
    m.atualizar(projeto, OPT, 'pav_1');
    fila.rodar();
    expect(new Set(calculados)).toEqual(new Set(['pav_0', 'pav_1', 'pav_2', 'pav_cobertura']));
    expect(cena.chamadas.at(-1)!.ids).toEqual(['pav_0', 'pav_1', 'pav_2', 'pav_cobertura']);
    expect(m.montados).toBe(4);

    // O pavimento vazio sai: a cena perde o nível e mantém os outros três (o que saiu não fica na cena).
    calculados.length = 0;
    const semCobertura = new ProjectStore(projeto);
    semCobertura.exec({ type: 'deleteLevel', id: 'pav_cobertura' });
    projeto = semCobertura.project;
    expect(projeto.levels.map((l) => l.id)).toEqual(['pav_0', 'pav_1', 'pav_2']);
    m.atualizar(projeto, OPT, 'pav_1');
    fila.rodar();
    expect(new Set(calculados)).toEqual(new Set(['pav_0', 'pav_1', 'pav_2']));
    expect(cena.chamadas.at(-1)!.ids).toEqual(['pav_0', 'pav_1', 'pav_2']);
    expect(m.montados).toBe(3);
  }, 60_000);
});

/** Conteúdo da cena: cada malha e linha com tipo, categoria, faixas de picking, matriz e posições. Na ordem da cena. */
function assinatura(ms: ModelScene): string[] {
  const linhas: string[] = [];
  ms.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.LineSegments)) return;
    const pos = o.geometry.getAttribute('position');
    linhas.push([o.type, String(o.userData.kind), JSON.stringify(o.userData.ranges ?? null), o.matrixWorld.elements.join(','), pos ? Array.from(pos.array as ArrayLike<number>).join(',') : ''].join('|'));
  });
  return linhas;
}

describe('Montagem3dProgressiva: resultado igual à montagem completa', () => {
  for (const opt of [OPT, { edges: true, shadows: false, dark: true }] as Scene3DOptions[]) {
    it(`20 pavimentos (edges=${opt.edges}, dark=${opt.dark}): a cena final é a mesma da montagem de uma vez`, () => {
      const p = projetoComPavimentos(20);
      const ids = p.levels.map((l) => l.id);

      const cheia = new ModelScene();
      const cacheCheia = new LevelResolveCache();
      cheia.update(p, ids.map((id) => cacheCheia.get(p, id)), opt);

      const parcial = new ModelScene();
      const cenaParcial: CenaMontagem = {
        update: (proj, niveis, o) => {
          parcial.update(proj, niveis, o);
        },
      };
      const cacheParcial = new LevelResolveCache();
      const fila = filaManual();
      let concluidas = 0;
      const m = new Montagem3dProgressiva({
        cena: cenaParcial,
        fonte: { resolver: (id) => cacheParcial.get(p, id) },
        aoAtualizar: () => undefined,
        aoConcluir: () => concluidas++,
        agendar: fila.agendar,
      });
      m.iniciar(p, opt, 'pav_10');
      fila.rodar();

      expect(concluidas).toBe(1);
      expect(assinatura(cheia).length).toBeGreaterThan(100);
      expect(assinatura(parcial)).toEqual(assinatura(cheia));
      expect(parcial.orbit.sceneRadius).toBe(cheia.orbit.sceneRadius);
    }, 120_000);
  }

  it('caminho pronto (resolução já em segundo plano) dá a mesma cena final que o caminho com resolução', () => {
    const p = projetoComPavimentos(20);
    const ids = p.levels.map((l) => l.id);
    const prontos = new LevelResolveCache();
    const niveisProntos = new Map(ids.map((id) => [id, prontos.get(p, id)] as const));

    const cheia = new ModelScene();
    cheia.update(p, ids.map((id) => niveisProntos.get(id)!), OPT);

    const comPronto = new ModelScene();
    const fila = filaManual();
    const m = new Montagem3dProgressiva({
      cena: { update: (proj, niveis, o) => comPronto.update(proj, niveis, o) },
      // Sem `resolver` útil: se a montagem calculasse algum nível, o teste acusaria a volta do cálculo na hora.
      fonte: { resolver: () => { throw new Error('não devia calcular: o nível já está pronto'); }, pronto: (id) => niveisProntos.get(id) ?? null },
      aoAtualizar: () => undefined,
      aoConcluir: () => undefined,
      agendar: fila.agendar,
    });
    m.iniciar(p, OPT, 'pav_10');
    fila.rodar();

    expect(assinatura(comPronto)).toEqual(assinatura(cheia));
  }, 120_000);
});

/** Worker simulado: guarda os pedidos e entrega o nível quando o teste manda (`entregar`), um de cada vez. */
class WorkerFalso implements FonteWorker {
  readonly iniciados: Project[] = [];
  readonly pedidos: Id[] = [];
  /** Pedidos ainda sem resposta, na ordem em que foram feitos. */
  private emCurso = new Map<Id, { resolver: (n: ResolvedLevel) => void; rejeitar: (e: unknown) => void }>();
  /** Falha todo pedido novo (teste da rede de segurança). */
  falhar = false;

  iniciar(projeto: Project): void {
    this.iniciados.push(projeto);
  }

  pedir(id: Id): Promise<ResolvedLevel> {
    this.pedidos.push(id);
    if (this.falhar) return Promise.reject(new Error('worker falhou'));
    return new Promise((resolver, rejeitar) => this.emCurso.set(id, { resolver, rejeitar }));
  }

  /** Responde o pedido do nível. */
  entregar(id: Id): void {
    const p = this.emCurso.get(id);
    if (!p) return;
    this.emCurso.delete(id);
    p.resolver(nivelFalso(id));
  }

  cancelar(): void {
    for (const p of this.emCurso.values()) p.rejeitar(new Error('cancelado'));
    this.emCurso.clear();
  }

  encerrar(): void {
    this.cancelar();
  }

  get abertos(): number {
    return this.emCurso.size;
  }
}

/** Deixa as promessas do worker assentarem (o `.then` da montagem roda em microtarefa). */
const assentar = (): Promise<void> => new Promise((res) => setTimeout(res, 0));

describe('Montagem3dProgressiva: níveis no worker', () => {
  it('a primeira fatia traz só o visível; o resto vem do worker, um pedido de cada vez e na ordem da montagem', async () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const cena = new CenaAnotada();
    const fonte = fonteContada();
    const worker = new WorkerFalso();
    const m = new Montagem3dProgressiva({
      cena, fonte, worker, aoAtualizar: () => undefined, aoConcluir: () => undefined,
    });
    m.iniciar(projetoDeIds(ids), OPT, 'c');
    // Primeira fatia na hora: só o visível, para o primeiro quadro ter o que mostrar. O worker já está com a fila cheia
    // (dois pedidos: a resolução de um nível corre enquanto a cena monta o outro).
    expect(cena.chamadas.map((c) => c.ids)).toEqual([['c']]);
    expect(fonte.calculados).toEqual(['c']);
    expect(worker.pedidos).toEqual(['b', 'd']);
    expect(worker.abertos).toBe(2);
    expect(worker.iniciados).toHaveLength(1);

    for (const id of ['b', 'd', 'a', 'e']) {
      worker.entregar(id);
      await assentar();
      expect(worker.pedidos.filter((x) => x === id)).toHaveLength(1);
    }
    expect(fonte.calculados).toEqual(['c']);
    // As respostas do worker entram na cena em lotes de até 3 níveis (um `ModelScene.update` por lote, não por nível);
    // o primeiro nível e o último sempre aparecem na hora.
    expect(cena.chamadas.map((c) => c.ids)).toEqual([['c'], ['a', 'b', 'c', 'd'], ids]);
    expect(m.montados).toBe(5);
    expect(m.usandoWorker).toBe(false);
  });

  it('cancelar cancela os pedidos: resposta que chega depois não mexe na cena', async () => {
    const cena = new CenaAnotada();
    const fonte = fonteContada();
    const worker = new WorkerFalso();
    const m = new Montagem3dProgressiva({ cena, fonte, worker, aoAtualizar: () => undefined, aoConcluir: () => undefined });
    m.iniciar(projetoDeIds(['a', 'b', 'c']), OPT, 'a');
    m.cancelar();
    expect(worker.abertos).toBe(0);
    await assentar();
    expect(cena.chamadas).toHaveLength(1);
  });

  it('iniciar de novo cancela os pedidos da montagem anterior', async () => {
    const cena = new CenaAnotada();
    const fonte = fonteContada();
    const worker = new WorkerFalso();
    const m = new Montagem3dProgressiva({ cena, fonte, worker, aoAtualizar: () => undefined, aoConcluir: () => undefined });
    const antigo = projetoDeIds(['a', 'b', 'c', 'd']);
    m.iniciar(antigo, OPT, 'a');
    m.iniciar(projetoDeIds(['x', 'y']), OPT, 'x');
    await assentar();
    // Os pedidos da montagem anterior ("b" e "c") são cancelados; o novo projeto já enche a fila com o "y".
    expect(worker.pedidos).toEqual(['b', 'c', 'y']);
    expect(cena.chamadas.filter((c) => c.projeto === antigo)).toHaveLength(1);
    worker.entregar('y');
    await assentar();
    expect(cena.chamadas.at(-1)!.ids).toEqual(['x', 'y']);
  });

  it('falha do worker cai na resolução da thread da interface e tenta de novo; duas falhas, desiste do worker', async () => {
    const ids = ['a', 'b', 'c', 'd'];
    const cena = new CenaAnotada();
    const fonte = fonteContada();
    const worker = new WorkerFalso();
    const m = new Montagem3dProgressiva({ cena, fonte, worker, aoAtualizar: () => undefined, aoConcluir: () => undefined });
    m.iniciar(projetoDeIds(ids), OPT, 'a');
    // O worker quebra: o pedido em curso é rejeitado e os próximos falham na hora.
    worker.falhar = true;
    worker.cancelar();
    await assentar();
    // A falha do pedido em curso calcula o nível aqui; a do pedido seguinte faz a montagem desistir do worker.
    expect(fonte.calculados).toContain('b');
    expect(m.usandoWorker).toBe(false);
    await assentar();
    await assentar();
    expect(cena.chamadas.at(-1)!.ids).toEqual(ids);
  });

  it('worker que não responde não trava a montagem: o prazo calcula o nível na thread da interface', async () => {
    const ids = ['a', 'b', 'c'];
    const cena = new CenaAnotada();
    const fonte = fonteContada();
    const worker = new WorkerFalso();
    const m = new Montagem3dProgressiva({
      cena, fonte, worker, aoAtualizar: () => undefined, aoConcluir: () => undefined, prazoWorkerMs: 15,
    });
    m.iniciar(projetoDeIds(ids), OPT, 'a');
    expect(worker.pedidos).toEqual(['b', 'c']);
    await new Promise((res) => setTimeout(res, 40));
    // O prazo venceu: 'b' foi calculado aqui e a montagem pediu o próximo; o segundo prazo desiste do worker.
    expect(fonte.calculados).toContain('b');
    await new Promise((res) => setTimeout(res, 40));
    expect(m.usandoWorker).toBe(false);
    expect(cena.chamadas.at(-1)!.ids).toEqual(ids);
  });

  it('caminho do worker dá a mesma cena final que a montagem de uma vez', async () => {
    const p = projetoComPavimentos(20);
    const ids = p.levels.map((l) => l.id);
    const cache = new LevelResolveCache();
    const niveis = new Map(ids.map((id) => [id, cache.get(p, id)] as const));

    const cheia = new ModelScene();
    cheia.update(p, ids.map((id) => niveis.get(id)!), OPT);

    const parcial = new ModelScene();
    const worker: FonteWorker = {
      iniciar: () => undefined,
      pedir: (id) => Promise.resolve(niveis.get(id)!),
      cancelar: () => undefined,
      encerrar: () => undefined,
    };
    const m = new Montagem3dProgressiva({
      cena: { update: (proj, lv, o) => parcial.update(proj, lv, o) },
      fonte: { pronto: (id) => niveis.get(id) ?? null, resolver: () => { throw new Error('não devia calcular: o nível está no worker'); } },
      worker,
      aoAtualizar: () => undefined,
      aoConcluir: () => undefined,
    });
    m.iniciar(p, OPT, 'pav_10');
    for (let i = 0; i < ids.length * 2 && m.montados < ids.length; i++) await assentar();
    expect(m.montados).toBe(ids.length);
    expect(assinatura(parcial)).toEqual(assinatura(cheia));
  }, 120_000);
});

describe('ResolucaoProgressiva: prewarm dos níveis', () => {
  it('resolve só os níveis que faltam, em tempo ocioso, e não repete um nível já pronto', async () => {
    const p = projetoComPavimentos(3);
    const cache = new LevelResolveCache();
    const cliente = new ClienteContado();
    const fila = filaManual();
    const r = new ResolucaoProgressiva({ cliente, agendarOcioso: fila.agendar });
    r.abrir(p);
    // Como o cache da abertura faria: dois níveis já prontos, um em falta.
    expect(r.semear('pav_0', cache.get(p, 'pav_0'))).toBe(true);
    expect(r.semear('pav_1', cache.get(p, 'pav_1'))).toBe(true);
    expect(r.niveisProntos()).toBe(false);

    r.preaquecerNiveis();
    fila.rodar();
    await esperarAte(() => r.nivelPronto('pav_2') !== null);

    // Só o nível em falta foi resolvido; os prontos não voltam para o worker.
    expect(cliente.pedidos.filter((x) => x.tipo === 'patchNivel').map((x) => x.nivel)).toEqual(['pav_2']);
    expect(r.niveisProntos()).toBe(true);
  });

  it('cancelar invalida a tarefa ociosa do prewarm: nenhum pedido sai', async () => {
    const p = projetoComPavimentos(3);
    const cliente = new ClienteContado();
    const fila = filaManual();
    const r = new ResolucaoProgressiva({ cliente, agendarOcioso: fila.agendar });
    r.abrir(p);
    r.preaquecerNiveis();
    r.cancelar();
    fila.rodar();
    await new Promise((res) => setTimeout(res, 10));
    expect(cliente.pedidos).toEqual([]);
  });

  it('abrir outro projeto invalida o prewarm do anterior', async () => {
    const antigo = projetoComPavimentos(2);
    const novo = projetoComPavimentos(1);
    const cliente = new ClienteContado();
    const fila = filaManual();
    const r = new ResolucaoProgressiva({ cliente, agendarOcioso: fila.agendar });
    r.abrir(antigo);
    r.preaquecerNiveis();
    r.abrir(novo);
    fila.rodar();
    await esperarAte(() => r.nivelPronto('pav_0') !== null);
    expect(cliente.pedidos.filter((x) => x.projeto === antigo)).toEqual([]);
  });

  it('FluxoEdicao.abrir agenda o prewarm sozinho: todos os níveis ficam prontos', async () => {
    const p = projetoComPavimentos(3);
    const fluxo = new FluxoEdicao({ cliente: new ClienteContado() });
    fluxo.abrir(p, 1);
    await esperarAte(() => fluxo.niveisProntos());
    expect(fluxo.niveisProntos()).toBe(true);
    fluxo.cancelar();
  });
});

/** Worker simulado do protocolo: responde cada pedido de nível com o nível falso e anota o que atravessou. */
class WorkerQueResponde implements WorkerLike {
  onmessage: ((evento: { data: unknown }) => void) | null = null;
  onerror: ((evento: unknown) => void) | null = null;
  readonly recebidos: Array<{ id: number; tipo: string; nivel: Id; projeto: { versao: number; estrutura?: Project } }> = [];
  /** Falso: guarda os pedidos sem responder (para o teste de cancelamento). */
  mudo = false;

  postMessage(mensagem: unknown): void {
    const m = mensagem as { id: number; tipo: string; nivel: Id; projeto: { versao: number; estrutura?: Project } };
    if (m.tipo === 'cancelar') return;
    this.recebidos.push(m);
    if (this.mudo) return;
    queueMicrotask(() => this.onmessage?.({ data: { id: m.id, resultado: nivelFalso(m.nivel), erro: null } }));
  }

  terminate(): void {
    // Nada a encerrar num substituto.
  }
}

describe('criarFonteNiveisWorker', () => {
  it('sem worker de verdade devolve null (a montagem fica no caminho síncrono)', () => {
    expect(criarFonteNiveisWorker({ cliente: new ClienteResolucao({ usarWorker: false }) })).toBeNull();
  });

  it('pede o nível ao worker e devolve o mesmo resultado da resolução local', async () => {
    const worker = new WorkerQueResponde();
    const fonte = criarFonteNiveisWorker({ cliente: new ClienteResolucao({ usarWorker: true, criarWorker: () => worker }) })!;
    const p = projetoDeIds(['a', 'b']);
    fonte.iniciar(p);
    const nivel = await fonte.pedir('a', p);
    expect((nivel as unknown as { levelId: Id }).levelId).toBe('a');
    expect(worker.recebidos.map((m) => [m.tipo, m.nivel])).toEqual([['nivel', 'a']]);
    fonte.encerrar();
  });

  it('a estrutura do projeto atravessa uma vez só (versão por projeto) e outro projeto ganha outra versão', async () => {
    const worker = new WorkerQueResponde();
    const fonte = criarFonteNiveisWorker({ cliente: new ClienteResolucao({ usarWorker: true, criarWorker: () => worker }) })!;
    const p = projetoDeIds(['a', 'b']);
    const outro = projetoDeIds(['c']);
    fonte.iniciar(p);
    await fonte.pedir('a', p);
    await fonte.pedir('b', p);
    await fonte.pedir('c', outro);
    const [primeiro, segundo, terceiro] = worker.recebidos;
    expect(primeiro!.projeto.estrutura).toBe(p);
    expect(segundo!.projeto.estrutura).toBeUndefined();
    expect(segundo!.projeto.versao).toBe(primeiro!.projeto.versao);
    expect(terceiro!.projeto.estrutura).toBe(outro);
    expect(terceiro!.projeto.versao).not.toBe(primeiro!.projeto.versao);
    fonte.encerrar();
  });

  it('cancelar rejeita o pedido em curso (a montagem trata como cancelamento)', async () => {
    const worker = new WorkerQueResponde();
    worker.mudo = true;
    const fonte = criarFonteNiveisWorker({ cliente: new ClienteResolucao({ usarWorker: true, criarWorker: () => worker }) })!;
    const p = projetoDeIds(['a']);
    fonte.iniciar(p);
    const promessa = fonte.pedir('a', p);
    fonte.cancelar();
    await expect(promessa).rejects.toThrow(/cancelad/i);
    fonte.encerrar();
  });
});

// ---- REPRODUÇÃO (temporária): colar parede+porta e depois excluir porta, cena de verdade (paredes do nível) ----
import { createEmptyProject as _cep, makeWall as _mw, makeLevel as _ml, wallsOnLevel as _wol, type Opening as _Op } from '@hestia/model';
import { resolveLevel as _rl } from '@hestia/engine';
import { clipboardFrom as _cf, pasteAlignedToLevelsCommand as _pa } from '@hestia/tools';

describe('REPRO montagem 3D após colar', () => {
  it('nível colado mostra as paredes; excluir porta não muda o resultado', () => {
    const store = new ProjectStore({ ..._cep(), levels: [] });
    for (const [id, elevation] of [['lv_0', 0], ['lv_1', 3]] as const) store.exec({ type: 'upsertLevel', level: _ml({ id, name: id, elevation }) });
    store.exec({ type: 'addWall', wall: _mw({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    store.exec({ type: 'addWall', wall: _mw({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 4, y: 0 }, b: { x: 4, y: 3 } }) });
    const op0: _Op = { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
    store.exec({ type: 'addOpening', opening: op0 });
    store.exec({ type: 'addOpening', opening: { ...op0, id: 'j1', kind: 'window', typeId: 'ot_j120', offset: 3 } });

    const fila = filaManual();
    const cenaLog: Record<string, string[]> = {};
    const cena: CenaMontagem = {
      update(_p, niveis) {
        for (const n of niveis) cenaLog[(n as unknown as { levelId: Id }).levelId] = Object.keys((n as unknown as { walls: object }).walls).sort();
      },
    };
    const m = new Montagem3dProgressiva({ cena, fonte: { resolver: (id) => _rl(store.project, id) }, aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar });
    m.iniciar(store.project, OPT, 'lv_0');
    fila.rodar();

    const clip = _cf(store.project, ['w1', 'w2', 'd1', 'j1'])!;
    store.exec(_pa(store.project, clip, ['lv_1'])!.command);
    m.atualizar(store.project, OPT, 'lv_0');
    fila.rodar();
    const esperado = _rl(store.project, 'lv_1');
    console.log('APOS COLAR cena lv_1 =', JSON.stringify(cenaLog['lv_1']), 'resolvido =', JSON.stringify(Object.keys(esperado.walls).sort()));
    expect(cenaLog['lv_1']).toEqual(Object.keys(esperado.walls).sort());

    store.exec({ type: 'deleteElements', ids: ['d1'] } as never);
    m.atualizar(store.project, OPT, 'lv_0');
    fila.rodar();
    const esperado2 = _rl(store.project, 'lv_1');
    console.log('APOS EXCLUIR PORTA cena lv_1 =', JSON.stringify(cenaLog['lv_1']), 'resolvido =', JSON.stringify(Object.keys(esperado2.walls).sort()));
    expect(cenaLog['lv_1']).toEqual(Object.keys(esperado2.walls).sort());
    void _wol;
  });
});

describe('REPRO 4 níveis copiar todo o térreo e colar nos outros', () => {
  it('cada nível colado recebe as paredes resolvidas', () => {
    const store = new ProjectStore({ ..._cep(), levels: [] });
    for (const [id, elevation] of [['lv_0', 0], ['lv_1', 3], ['lv_2', 6], ['lv_3', 9]] as const) store.exec({ type: 'upsertLevel', level: _ml({ id, name: id, elevation }) });
    const ws = [['w1', [0, 0], [4, 0]], ['w2', [4, 0], [4, 3]], ['w3', [4, 3], [0, 3]], ['w4', [0, 3], [0, 0]]] as const;
    for (const [id, a, b] of ws) store.exec({ type: 'addWall', wall: _mw({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] } }) });
    store.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    store.exec({ type: 'addOpening', opening: { id: 'j1', kind: 'window', typeId: 'ot_j120', hostId: 'w3', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const ids = Object.values(store.project.elements).filter((e) => (e as { levelId?: string }).levelId === 'lv_0' || (e.kind === 'door' || e.kind === 'window')).map((e) => e.id);
    const fila = filaManual();
    const log: Record<string, string[]> = {};
    const cena: CenaMontagem = { update(_p, niveis) { for (const n of niveis) log[(n as unknown as { levelId: Id }).levelId] = Object.keys((n as unknown as { walls: object }).walls).sort(); } };
    const m = new Montagem3dProgressiva({ cena, fonte: { resolver: (id) => _rl(store.project, id) }, aoAtualizar: () => undefined, aoConcluir: () => undefined, agendar: fila.agendar });
    m.iniciar(store.project, OPT, 'lv_0');
    fila.rodar();
    const clip = _cf(store.project, ids)!;
    store.exec(_pa(store.project, clip, ['lv_1', 'lv_2', 'lv_3'])!.command);
    m.atualizar(store.project, OPT, 'lv_0');
    fila.rodar();
    for (const l of ['lv_1', 'lv_2', 'lv_3']) {
      const esp = Object.keys(_rl(store.project, l).walls).sort();
      console.log('REPRO4', l, 'cena', log[l]?.length, 'resolvido', esp.length);
      expect(log[l]).toEqual(esp);
    }
  });
});
