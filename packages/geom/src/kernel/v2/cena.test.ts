import { describe, expect, it } from 'vitest';
import { CenaV2 } from './cena.ts';
import { ErroKernelGrave, ErroKernelLeve } from './erros.ts';
import { CODIGOS, NIVEL_TODOS } from './esquema.gerado.ts';
import { gerenciadorFalso } from './falso.ts';
import { colunasDeParedes, fonteDeParedes, paredesDeTeste } from './paredes.ts';

const montar = (ps = paredesDeTeste(2, 30), opcoes: Parameters<typeof gerenciadorFalso>[0] = {}) => {
  const g = gerenciadorFalso(opcoes);
  const cena = CenaV2.criar(g.ger, fonteDeParedes(() => ps));
  return { ...g, cena, ps };
};

const umaParede = () => ({ id: 99999, nivel: 0, ax: 0, ay: 0, bx: 1, by: 0, espessura: 0.1 });

describe('CenaV2', () => {
  it('upsert, remover e consultas sobre a cena', () => {
    const { cena, ps } = montar();
    const n0 = cena.consultar('estatisticas_nivel', [0]);
    expect(n0['n_paredes']![0]).toBe(30);
    expect(n0['caixa']).toHaveLength(4);
    expect(cena.consultar('estatisticas_nivel', [NIVEL_TODOS])['n_paredes']![0]).toBe(60);

    cena.remover('paredes', [ps[0]!.id, ps[1]!.id]);
    expect(cena.consultar('estatisticas_nivel', [0])['n_paredes']![0]).toBe(28);

    const nova = { ...ps[0]!, ax: 100, bx: 103, ay: 100, by: 100 };
    cena.upsert('paredes', colunasDeParedes([nova]), 1);
    expect(cena.consultar('estatisticas_nivel', [0])['n_paredes']![0]).toBe(29);
    const ids = cena.consultar('paredes_na_caixa', [0, 99, 99, 104, 101])['ids'] as Uint32Array;
    expect(Array.from(ids)).toEqual([nova.id]);
    expect(cena.consultar('estatisticas_nivel', [7])['n_paredes']![0]).toBe(0);
    cena.destruir();
  });

  it('leve: lança ErroKernelLeve, o kernel segue ligado e a cena continua utilizável', () => {
    const { cena, ger, ps } = montar();
    const duplicada = colunasDeParedes([ps[0]!, ps[0]!]);
    expect(() => cena.upsert('paredes', duplicada, 2)).toThrow(ErroKernelLeve);
    try {
      cena.upsert('paredes', duplicada, 2);
    } catch (e) {
      expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.ENTRADA);
      expect((e as Error).message).toMatch(/duplicada/);
    }
    expect(() => cena.consultar('estatisticas_nivel', [])).toThrow(ErroKernelLeve);
    expect(() => cena.upsert('paredes', { id_num: [1] }, 1)).toThrow(ErroKernelLeve);
    const nan = colunasDeParedes([{ ...ps[0]!, ax: NaN }]);
    expect(() => cena.upsert('paredes', nan, 1)).toThrow(/não finito/);
    expect(ger.ligado).toBe(true);
    expect(ger.estado().recriacoesTotal).toBe(0);
    expect(cena.consultar('estatisticas_nivel', [0])['n_paredes']![0]).toBe(30);
  });

  it('leve injetado (NAO_IMPLEMENTADO e LIMITE) não recria', () => {
    const { cena, ger, instancias } = montar();
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: CODIGOS.NAO_IMPLEMENTADO });
    expect(() => cena.consultar('estatisticas_nivel', [0])).toThrow(ErroKernelLeve);
    instancias[0]!.controle.injetar({ funcao: 'cena_upsert_linhas', efeito: CODIGOS.LIMITE });
    expect(() => cena.upsert('paredes', colunasDeParedes([umaParede()]), 1)).toThrow(ErroKernelLeve);
    expect(ger.estado().recriacoesTotal).toBe(0);
    expect(instancias).toHaveLength(1);
  });

  it('grave (INTERNO): recria, reenvia a cena e repete a chamada uma vez', () => {
    const { cena, ger, instancias } = montar();
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: CODIGOS.INTERNO });
    const r = cena.consultar('estatisticas_nivel', [0]);
    expect(r['n_paredes']![0]).toBe(30);
    expect(instancias).toHaveLength(2);
    expect(instancias[1]!.controle.chamadas('cena_executar')).toBe(1);
    expect(ger.estado().recriacoesTotal).toBe(1);
    expect(ger.ligado).toBe(true);
  });

  it('grave que se repete na instância recriada: o erro grave chega ao chamador (uma recriação só)', () => {
    const { cena, ger, instancias } = montar(undefined, {
      aoCriar: (inst, i) => {
        if (i === 1) inst.controle.injetar({ funcao: 'cena_executar', efeito: 'trap' });
      },
    });
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: 'trap' });
    expect(() => cena.consultar('estatisticas_nivel', [0])).toThrow(ErroKernelGrave);
    expect(ger.estado().recriacoesTotal).toBe(1);
    expect(ger.ligado).toBe(true);
    // a cena continua utilizável na instância recriada
    expect(cena.consultar('estatisticas_nivel', [0])['n_paredes']![0]).toBe(30);
  });

  it('HANDLE grave: recria e repete', () => {
    const { cena, instancias } = montar();
    instancias[0]!.controle.injetar({ funcao: 'cena_upsert_linhas', efeito: CODIGOS.HANDLE });
    cena.upsert('paredes', colunasDeParedes([umaParede()]), 1);
    expect(instancias).toHaveLength(2);
  });

  it('desligado: toda chamada lança ErroKernelGrave desligado', () => {
    const { cena, ger } = montar(undefined, { maxRecriacoes: 0 });
    expect(() => ger.recriar('x')).toThrow(ErroKernelGrave);
    try {
      cena.consultar('estatisticas_nivel', [0]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErroKernelGrave);
      expect((e as ErroKernelGrave).desligado).toBe(true);
    }
  });

  it('memória que cresce depois de cada chamada não quebra a leitura (views refeitas)', () => {
    const { cena } = montar(paredesDeTeste(1, 40), { opcoesDaInstancia: () => ({ crescerAposCadaChamada: true }) });
    const ids = cena.consultar('paredes_na_caixa', [0, -10, -10, 1000, 1000])['ids'] as Uint32Array;
    expect(ids).toHaveLength(40);
    expect(cena.consultar('pares_proximos', [0, 0.05])['pares']!.length % 2).toBe(0);
  });

  it('destruir devolve a memória ao valor inicial e a cena deixa de aceitar chamadas', () => {
    const { cena, ger } = montar();
    const inst = ger.instancia();
    const antes = inst.exports.memoria_usada();
    const c2 = CenaV2.criar(ger, fonteDeParedes(() => paredesDeTeste(3, 50)));
    c2.consultar('pares_proximos', [NIVEL_TODOS, 0.05]);
    expect(inst.exports.memoria_usada()).toBeGreaterThan(antes);
    c2.destruir();
    expect(inst.exports.memoria_usada()).toBe(antes);
    expect(() => c2.consultar('estatisticas_nivel', [0])).toThrow(ErroKernelLeve);
    cena.destruir();
  });
});
