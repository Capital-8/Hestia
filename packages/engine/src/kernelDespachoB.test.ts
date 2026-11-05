/**
 * Despacho da fatia B (decisão 0050, B5), sem o binário do Rust: o falso do ABI v2 (`falso.ts`) aceita as seções e devolve NAO_IMPLEMENTADO em
 * `pisos_lajes_com_paredes` e `junction_nivel`, e deixa injetar trap e códigos graves. Cada chamada usa um projeto novo (`structuredClone`): o
 * despacho guarda por projeto e nível, inclusive a falha. A equivalência com o Rust de verdade, a sombra e a edição estão em `tests/kernel-b5.wasm.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@hestia/model';
import { CODIGOS } from '../../geom/src/kernel/v2/esquema.gerado.ts';
import { gerenciadorFalso } from '../../geom/src/kernel/v2/falso.ts';
import { resolveFloors, resolveFloorsTs } from './floors.ts';
import { syntheticProject } from './fixtureSintetica.ts';
import { junctionLevel, junctionLevelTs } from './junctionLevel.ts';
import { ErroDespachoKernel, instalarDespachoKernel, removerDespachoKernel, type ConfigDespacho } from './kernelDespacho.ts';
import { resolveLevel, resolveLevelTs } from './resolve.ts';
import { resolveSlabs, resolveSlabsTs } from './slabs.ts';

afterEach(() => removerDespachoKernel());

const B: ConfigDespacho = { fatiaA: false, fatiaB: true, sombra: false };
const base = syntheticProject(2);
const nivel = base.levels[0]!.id;
const novo = (): Project => structuredClone(base);
/** Fora da sombra uma falha do Rust é erro explícito: nunca o resultado do TypeScript no lugar. */
const falha = (f: () => unknown): ErroDespachoKernel => {
  try {
    f();
  } catch (e) {
    expect(e).toBeInstanceOf(ErroDespachoKernel);
    return e as ErroDespachoKernel;
  }
  throw new Error('esperava ErroDespachoKernel, mas a chamada devolveu um resultado');
};

describe('despacho da B: fatia desligada', () => {
  it('com a fatia B desligada (mesmo com a sombra ligada) o gerenciador nem é consultado e o resultado é o do TS', () => {
    const { ger } = gerenciadorFalso();
    const espiao = vi.fn(() => ger);
    const d = instalarDespachoKernel({ gerenciador: espiao, config: () => ({ fatiaA: false, fatiaB: false, sombra: true }) });
    const p = novo();
    expect(resolveFloors(p, nivel)).toEqual(resolveFloorsTs(p, nivel));
    expect(resolveSlabs(p, nivel)).toEqual(resolveSlabsTs(p, nivel));
    expect(junctionLevel(p, nivel)).toEqual(junctionLevelTs(p, nivel));
    expect(espiao).not.toHaveBeenCalled();
    const diag = d.diagnostico();
    expect(diag.entreguesB + diag.voltasLeves + diag.voltasGraves + diag.comparacoes).toBe(0);
  });

  it('sem despachante instalado as funções são o TS de sempre', () => {
    const p = novo();
    expect(resolveFloors(p, nivel)).toEqual(resolveFloorsTs(p, nivel));
    expect(resolveSlabs(p, nivel)).toEqual(resolveSlabsTs(p, nivel));
    expect(junctionLevel(p, nivel)).toEqual(junctionLevelTs(p, nivel));
  });

  it('fatia B ligada mas wasm ainda não carregado: TS, sem erro', () => {
    const d = instalarDespachoKernel({ gerenciador: () => null, config: () => B });
    const p = novo();
    expect(resolveFloors(p, nivel)).toEqual(resolveFloorsTs(p, nivel));
    expect(d.diagnostico().pronto).toBe(false);
    expect(d.diagnostico().voltasLeves).toBe(0);
  });

  it('as opções de planta (layers: false) nunca são despachadas, nem com a B ligada', () => {
    const { ger, instancias } = gerenciadorFalso();
    instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    const p = novo();
    expect(resolveFloors(p, nivel, { layers: false })).toEqual(resolveFloorsTs(p, nivel, { layers: false }));
    expect(resolveSlabs(p, nivel, { layers: false })).toEqual(resolveSlabsTs(p, nivel, { layers: false }));
    expect(instancias.length === 0 || instancias[0]!.controle.chamadas('cena_executar') === 0).toBe(true);
  });

  it('a fatia B não muda resolveLevel (a fatia A segue desligada)', () => {
    const { ger } = gerenciadorFalso();
    const espiao = vi.fn(() => ger);
    instalarDespachoKernel({ gerenciador: espiao, config: () => B });
    const p = novo();
    espiao.mockClear();
    expect(resolveLevel(p, nivel, new Map())).toEqual(resolveLevelTs(p, nivel, new Map()));
    expect(espiao).not.toHaveBeenCalled();
  });
});

describe('despacho da B: falha leve', () => {
  it('falha do Rust vira ErroDespachoKernel em pisos, lajes e junção (fatia, nível e mensagem original), não o resultado do TS', () => {
    const { ger } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    const p = novo();
    for (const f of [() => resolveFloors(p, nivel), () => resolveSlabs(p, nivel), () => junctionLevel(p, nivel)]) {
      const e = falha(f);
      expect(e.fatia).toBe('B');
      expect(e.nivel).toBe(nivel);
      expect(e.mensagemOriginal).toContain('NAO_IMPLEMENTADO');
    }
    expect(d.diagnostico().ultimoErro).toContain('NAO_IMPLEMENTADO'); // chega ao painel de diagnóstico
    expect(d.diagnostico().entreguesB).toBe(0);
  });

  it('NAO_IMPLEMENTADO falha só aquela chamada (erro explícito), sem recriar a instância (pisos e lajes)', () => {
    const { ger, instancias } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    for (let i = 0; i < 2; i++) {
      const p = novo();
      falha(() => resolveFloors(p, nivel));
      falha(() => resolveSlabs(p, nivel));
    }
    expect(ger.estado().recriacoesTotal).toBe(0);
    expect(ger.ligado).toBe(true);
    expect(instancias.length).toBe(1);
    const diag = d.diagnostico();
    // pisos e lajes compartilham a consulta: uma falha por projeto e nível
    expect(diag.voltasLeves).toBe(2);
    expect(diag.voltasGraves).toBe(0);
    expect(diag.entreguesB).toBe(0);
    expect(diag.ultimoErro).toContain('NAO_IMPLEMENTADO');
  });

  it('a junção (B3) com a B ligada também exige o Rust: falha vira erro explícito, não junctionLevelTs', () => {
    const { ger } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    const p = novo();
    falha(() => junctionLevel(p, nivel));
    expect(d.diagnostico().voltasGraves).toBe(0);
    expect(d.diagnostico().entreguesB).toBe(0);
  });

  it('a falha de um projeto e nível não se repete na mesma entrada (a consulta não é refeita a cada chamada)', () => {
    const { ger, instancias } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    const p = novo();
    const primeira = falha(() => resolveFloors(p, nivel));
    const antes = instancias[0]!.controle.chamadas('cena_executar');
    expect(falha(() => resolveFloors(p, nivel)).mensagemOriginal).toBe(primeira.mensagemOriginal); // o erro se repete sem refazer a consulta
    falha(() => resolveSlabs(p, nivel));
    expect(instancias[0]!.controle.chamadas('cena_executar')).toBe(antes);
    expect(d.diagnostico().voltasLeves).toBe(1);
  });

  it('LIMITE e ENTRADA injetados em cena_executar também são leves', () => {
    const { ger, instancias } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    falha(() => resolveFloors(novo(), nivel)); // cria a cena
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: CODIGOS.LIMITE });
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: CODIGOS.ENTRADA });
    falha(() => resolveFloors(novo(), nivel));
    falha(() => resolveFloors(novo(), nivel));
    expect(ger.estado().recriacoesTotal).toBe(0);
    expect(d.diagnostico().voltasLeves).toBe(3);
  });

  it('projeto com parede de nível inexistente (que a cena não cobre) falha com erro explícito sem enviar nada', () => {
    const { ger, instancias } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    const p = novo();
    const parede = Object.values(p.elements).find((e) => e.kind === 'wall' && e.levelId === nivel)!;
    (parede as { levelId: string }).levelId = 'nivel-fantasma';
    expect(falha(() => resolveFloors(p, nivel)).mensagemOriginal).toContain('a consulta não a cobre');
    expect(falha(() => resolveSlabs(p, nivel)).mensagemOriginal).toContain('a consulta não a cobre');
    expect(d.diagnostico().voltasLeves).toBe(1); // a cobertura é verificada uma vez por projeto
    expect(d.diagnostico().ultimoErro).toContain('a consulta não a cobre');
    expect(instancias.length === 0 || instancias[0]!.controle.chamadas('cena_executar') === 0).toBe(true);
    expect(ger.estado().recriacoesTotal).toBe(0);
  });
});

describe('despacho da B: falha grave', () => {
  it('trap: recria a instância, reenvia a cena e repete a chamada (que cai em NAO_IMPLEMENTADO leve do falso, agora erro explícito)', () => {
    const { ger, instancias } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    falha(() => resolveFloors(novo(), nivel));
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: 'trap' });
    const p = novo();
    falha(() => resolveFloors(p, nivel));
    expect(ger.estado().recriacoesTotal).toBe(1);
    expect(instancias.length).toBe(2);
    expect(instancias[1]!.controle.cenasVivas()).toBe(1);
    expect(d.diagnostico().voltasGraves).toBe(0); // a repetição resolveu: só falhou leve na instância nova
  });

  it('HANDLE (grave) também recria e repete, em pisos e lajes', () => {
    const { ger, instancias } = gerenciadorFalso();
    instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    falha(() => resolveFloors(novo(), nivel));
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: CODIGOS.HANDLE });
    const p = novo();
    falha(() => resolveFloors(p, nivel));
    expect(ger.estado().recriacoesTotal).toBe(1);
    expect(ger.ligado).toBe(true);
  });

  it('no máximo 3 recriações em 5 min: a quarta desliga o kernel e o despacho passa a lançar erro explícito, nunca o TS (relógio injetado)', () => {
    let agora = 0;
    const { ger, instancias } = gerenciadorFalso({ agora: () => agora, aoCriar: (i) => i.controle.injetar({ funcao: 'cena_executar', efeito: 'trap', vezes: 1000 }) });
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    for (let i = 1; i <= 3; i++) {
      agora = i * 60_000;
      const p = novo();
      falha(() => resolveFloors(p, nivel));
      expect(ger.estado().recriacoesTotal).toBe(i);
      expect(ger.ligado).toBe(true);
    }
    agora = 4 * 60_000;
    const p4 = novo();
    falha(() => resolveFloors(p4, nivel));
    expect(ger.ligado).toBe(false);
    expect(ger.estado().recriacoesTotal).toBe(3);
    const criadas = instancias.length;
    // desligado: o despacho nem tenta; nada novo é criado, e o erro explícito diz que o kernel está desligado
    const p5 = novo();
    expect(falha(() => resolveSlabs(p5, nivel)).mensagemOriginal).toContain('kernel desligado');
    expect(instancias.length).toBe(criadas);
    const diag = d.diagnostico();
    expect(diag.voltasGraves).toBe(4);
    expect(diag.pronto).toBe(false);
    expect(diag.indisponivel).toContain('3 recriações em 5 min');
  });

  it('passada a janela de 5 min as recriações antigas deixam de contar', () => {
    let agora = 0;
    const { ger } = gerenciadorFalso({ agora: () => agora, aoCriar: (i) => i.controle.injetar({ funcao: 'cena_executar', efeito: 'trap', vezes: 1000 }) });
    instalarDespachoKernel({ gerenciador: () => ger, config: () => B });
    for (let i = 0; i < 3; i++) {
      agora = i * 1000;
      falha(() => resolveFloors(novo(), nivel));
    }
    expect(ger.estado().recriacoesNaJanela).toBe(3);
    agora = 6 * 60_000;
    falha(() => resolveFloors(novo(), nivel));
    expect(ger.ligado).toBe(true);
    expect(ger.estado().recriacoesNaJanela).toBe(1);
    expect(ger.estado().recriacoesTotal).toBe(4);
  });
});
