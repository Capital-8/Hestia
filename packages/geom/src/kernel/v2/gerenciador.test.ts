import { describe, expect, it } from 'vitest';
import { CenaV2 } from './cena.ts';
import { ErroKernelGrave } from './erros.ts';
import { CODIGOS } from './esquema.gerado.ts';
import { criarInstanciaFalsa, gerenciadorFalso } from './falso.ts';
import { GerenciadorKernelV2, JANELA_RECRIACAO_MS } from './gerenciador.ts';
import { fonteDeParedes, paredesDeTeste } from './paredes.ts';

function relogio(): { agora: () => number; avancar: (ms: number) => void } {
  let t = 1_000_000;
  return { agora: () => t, avancar: (ms) => (t += ms) };
}

describe('GerenciadorKernelV2', () => {
  it('valida as versões na criação', () => {
    expect(() => gerenciadorFalso({ opcoesDaInstancia: () => ({ versaoAbi: 1 }) })).toThrow(ErroKernelGrave);
    expect(() => gerenciadorFalso({ opcoesDaInstancia: () => ({ versaoEsquema: 1 }) })).toThrow(/abi2_esquema_versao=1/);
    try {
      GerenciadorKernelV2.criar({ criarInstancia: () => criarInstanciaFalsa({ versaoAbi: 3 }) });
      expect.unreachable();
    } catch (e) {
      expect((e as ErroKernelGrave).codigo).toBe(CODIGOS.VERSAO);
    }
    const { ger } = gerenciadorFalso();
    expect(ger.estado()).toMatchObject({ ligado: true, versaoAbi: 2, versaoEsquema: 7, recriacoesTotal: 0 });
  });

  it('recriar reenvia a cena pela fonte e troca a instância', () => {
    const ps = paredesDeTeste(1, 12);
    const { ger, instancias } = gerenciadorFalso();
    const cena = CenaV2.criar(ger, fonteDeParedes(() => ps));
    expect(cena.consultar('estatisticas_nivel', [0])['n_paredes']![0]).toBe(12);
    ger.recriar('teste');
    expect(instancias).toHaveLength(2);
    expect(ger.estado()).toMatchObject({ recriacoesTotal: 1, recriacoesNaJanela: 1, ultimoMotivoRecriacao: 'teste' });
    expect(cena.consultar('estatisticas_nivel', [0])['n_paredes']![0]).toBe(12);
    expect(instancias[1]!.controle.cenasVivas()).toBe(1);
  });

  it('a 4ª recriação em 5 min desliga o kernel com o motivo', () => {
    const r = relogio();
    const { ger } = gerenciadorFalso({ agora: r.agora });
    for (let i = 0; i < 3; i++) {
      ger.recriar(`falha ${i}`);
      r.avancar(10_000);
    }
    expect(ger.ligado).toBe(true);
    try {
      ger.recriar('falha 3');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ErroKernelGrave);
      expect((e as ErroKernelGrave).desligado).toBe(true);
    }
    const est = ger.estado();
    expect(est.ligado).toBe(false);
    expect(est.motivoDesligado).toMatch(/3 recriações em 5 min.*falha 3/);
    expect(() => ger.instancia()).toThrow(/desligado/);
    expect(() => ger.recriar('de novo')).toThrow(ErroKernelGrave);
  });

  it('passados 5 min o contador zera', () => {
    const r = relogio();
    const { ger } = gerenciadorFalso({ agora: r.agora });
    for (let i = 0; i < 3; i++) ger.recriar('x');
    expect(ger.estado().recriacoesNaJanela).toBe(3);
    r.avancar(JANELA_RECRIACAO_MS - 1);
    expect(ger.estado().recriacoesNaJanela).toBe(3);
    r.avancar(1);
    expect(ger.estado().recriacoesNaJanela).toBe(0);
    expect(ger.estado().recriacoesTotal).toBe(3);
    ger.recriar('y');
    expect(ger.ligado).toBe(true);
    expect(ger.estado().recriacoesNaJanela).toBe(1);
  });

  it('falha ao reenviar conta como nova recriação até desligar', () => {
    const { ger } = gerenciadorFalso({
      opcoesDaInstancia: (i) => (i === 0 ? {} : { versaoAbi: 9 }), // toda instância nova é inválida
    });
    expect(() => ger.recriar('inicial')).toThrow(/desligado|excedidas/);
    expect(ger.ligado).toBe(false);
    expect(ger.estado().recriacoesTotal).toBe(3);
  });

  it('trap na cena: recria, reenvia e repete a chamada', () => {
    const ps = paredesDeTeste(1, 20);
    const { ger, instancias } = gerenciadorFalso();
    const cena = CenaV2.criar(ger, fonteDeParedes(() => ps));
    instancias[0]!.controle.injetar({ funcao: 'cena_executar', efeito: 'trap' });
    const r = cena.consultar('estatisticas_nivel', [0]);
    expect(r['n_paredes']![0]).toBe(20);
    expect(ger.estado().recriacoesTotal).toBe(1);
    expect(ger.estado().ultimoMotivoRecriacao).toMatch(/TRAP/);
  });
});
