/**
 * Despacho da fatia A (decisão 0047 §12), sem o binário do Rust: o falso do ABI v2 (`falso.ts`) aceita as seções e devolve
 * NAO_IMPLEMENTADO em `resolver_nivel`, e deixa injetar trap e códigos graves. O despacho com o Rust de verdade (equivalência com o TS,
 * sombra, edição) está em `tests/kernel-a4.wasm.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CODIGOS } from '../../geom/src/kernel/v2/esquema.gerado.ts';
import { gerenciadorFalso } from '../../geom/src/kernel/v2/falso.ts';
import { syntheticProject } from './fixtureSintetica.ts';
import { ErroDespachoKernel, instalarDespachoKernel, removerDespachoKernel, type ConfigDespacho } from './kernelDespacho.ts';
import { resolveLevel, resolveLevelTs } from './resolve.ts';

afterEach(() => removerDespachoKernel());

const LIGADA: ConfigDespacho = { fatiaA: true, fatiaB: false, sombra: false };
const projeto = syntheticProject(2);
const nivel = projeto.levels[0]!.id;
/** Fora da sombra uma falha do Rust é erro explícito: nunca o resultado do TypeScript no lugar. */
const falha = (): unknown => {
  try {
    resolveLevel(projeto, nivel, new Map());
  } catch (e) {
    return e;
  }
  throw new Error('esperava ErroDespachoKernel, mas resolveLevel devolveu um resultado');
};

describe('despacho: fatia desligada', () => {
  it('o Rust nem é consultado (nem o gerenciador): o resultado é o do TS', () => {
    const { ger } = gerenciadorFalso();
    const espiao = vi.fn(() => ger);
    const d = instalarDespachoKernel({ gerenciador: espiao, config: () => ({ fatiaA: false, fatiaB: false, sombra: true }) });
    const r = resolveLevel(projeto, nivel, new Map());
    expect(espiao).not.toHaveBeenCalled();
    expect(r).toEqual(resolveLevelTs(projeto, nivel, new Map()));
    const diag = d.diagnostico();
    expect(diag.entreguesPeloRust + diag.voltasLeves + diag.voltasGraves + diag.comparacoes).toBe(0);
  });

  it('sem despachante instalado resolveLevel é o TS de sempre', () => {
    expect(resolveLevel(projeto, nivel, new Map())).toEqual(resolveLevelTs(projeto, nivel, new Map()));
  });

  it('fatia ligada mas wasm ainda não carregado: TS, sem erro', () => {
    const d = instalarDespachoKernel({ gerenciador: () => null, config: () => LIGADA });
    expect(resolveLevel(projeto, nivel, new Map())).toEqual(resolveLevelTs(projeto, nivel, new Map()));
    expect(d.diagnostico().pronto).toBe(false);
  });
});

describe('despacho: falha leve', () => {
  it('falha do Rust vira ErroDespachoKernel (fatia, nível e mensagem original), não o resultado do TS', () => {
    const { ger } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => LIGADA });
    const e = falha() as ErroDespachoKernel;
    expect(e).toBeInstanceOf(ErroDespachoKernel);
    expect(e.fatia).toBe('A');
    expect(e.nivel).toBe(nivel);
    expect(e.mensagemOriginal).toContain('NAO_IMPLEMENTADO');
    expect(d.diagnostico().ultimoErro).toContain('NAO_IMPLEMENTADO'); // chega ao painel de diagnóstico
  });

  it('NAO_IMPLEMENTADO falha só aquela chamada (erro explícito), sem recriar a instância', () => {
    const { ger, instancias } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => LIGADA });
    for (let i = 0; i < 3; i++) expect(falha()).toBeInstanceOf(ErroDespachoKernel);
    expect(ger.estado().recriacoesTotal).toBe(0);
    expect(ger.ligado).toBe(true);
    expect(instancias.length).toBe(1);
    const diag = d.diagnostico();
    expect(diag.voltasLeves).toBe(3);
    expect(diag.voltasGraves).toBe(0);
    expect(diag.ultimoErro).toContain('NAO_IMPLEMENTADO');
  });

  it('LIMITE e ENTRADA injetados em cena_executar também são leves', () => {
    const { ger, instancias } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => LIGADA });
    falha(); // cria a cena
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: CODIGOS.LIMITE });
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: CODIGOS.ENTRADA });
    falha();
    falha();
    expect(ger.estado().recriacoesTotal).toBe(0);
    expect(d.diagnostico().voltasLeves).toBe(3);
  });

  it('nível que a consulta não cobre (paredes de um nível que não está no projeto) falha sem consultar o Rust', () => {
    const { ger, instancias } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => LIGADA });
    const quebrado = structuredClone(projeto);
    for (const e of Object.values(quebrado.elements)) if (e.kind === 'wall' && e.levelId === nivel) (e as { levelId: string }).levelId = 'nivel-fantasma';
    falha(); // cria a cena
    const antes = instancias[0]!.controle.chamadas('cena_executar');
    expect(() => resolveLevel(quebrado, 'nivel-fantasma', new Map())).toThrow(ErroDespachoKernel);
    expect(instancias[0]!.controle.chamadas('cena_executar')).toBe(antes);
    expect(d.diagnostico().ultimoErro).toContain('fora do projeto');
    expect(ger.estado().recriacoesTotal).toBe(0);
  });
});

describe('despacho: falha grave', () => {
  it('trap: recria a instância, reenvia a cena e repete a chamada (que cai em NAO_IMPLEMENTADO leve do falso, agora erro explícito)', () => {
    const { ger, instancias } = gerenciadorFalso();
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => LIGADA });
    falha();
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: 'trap' });
    expect(falha()).toBeInstanceOf(ErroDespachoKernel);
    expect(ger.estado().recriacoesTotal).toBe(1);
    expect(instancias.length).toBe(2);
    expect(instancias[1]!.controle.cenasVivas()).toBe(1);
    expect(d.diagnostico().voltasGraves).toBe(0); // a repetição resolveu: só falhou leve na instância nova
  });

  it('HANDLE (grave) também recria e repete', () => {
    const { ger, instancias } = gerenciadorFalso();
    instalarDespachoKernel({ gerenciador: () => ger, config: () => LIGADA });
    falha();
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: CODIGOS.HANDLE });
    falha();
    expect(ger.estado().recriacoesTotal).toBe(1);
    expect(ger.ligado).toBe(true);
  });

  it('no máximo 3 recriações em 5 min: a quarta desliga o kernel e o despacho passa a lançar erro explícito (nunca o TS)', () => {
    let agora = 0;
    const { ger, instancias } = gerenciadorFalso({ agora: () => agora, aoCriar: (i) => i.controle.injetar({ funcao: 'cena_executar', efeito: 'trap', vezes: 1000 }) });
    const d = instalarDespachoKernel({ gerenciador: () => ger, config: () => LIGADA });
    for (let i = 1; i <= 3; i++) {
      agora = i * 60_000;
      expect(falha()).toBeInstanceOf(ErroDespachoKernel);
      expect(ger.estado().recriacoesTotal).toBe(i);
      expect(ger.ligado).toBe(true);
    }
    agora = 4 * 60_000;
    expect(falha()).toBeInstanceOf(ErroDespachoKernel);
    expect(ger.ligado).toBe(false);
    expect(ger.estado().recriacoesTotal).toBe(3);
    const criadas = instancias.length;
    // desligado: o despacho nem tenta; nada novo é criado, e o erro explícito diz que o kernel está desligado
    expect((falha() as ErroDespachoKernel).mensagemOriginal).toContain('kernel desligado');
    expect(instancias.length).toBe(criadas);
    const diag = d.diagnostico();
    expect(diag.voltasGraves).toBe(4);
    expect(diag.pronto).toBe(false);
    expect(diag.indisponivel).toContain('3 recriações em 5 min');
  });

  it('passada a janela de 5 min as recriações antigas deixam de contar', () => {
    let agora = 0;
    const { ger } = gerenciadorFalso({ agora: () => agora, aoCriar: (i) => i.controle.injetar({ funcao: 'cena_executar', efeito: 'trap', vezes: 1000 }) });
    instalarDespachoKernel({ gerenciador: () => ger, config: () => LIGADA });
    for (let i = 0; i < 3; i++) {
      agora = i * 1000;
      falha();
    }
    expect(ger.estado().recriacoesNaJanela).toBe(3);
    agora = 6 * 60_000;
    falha();
    expect(ger.ligado).toBe(true);
    expect(ger.estado().recriacoesNaJanela).toBe(1);
    expect(ger.estado().recriacoesTotal).toBe(4);
  });
});
