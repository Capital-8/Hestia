import { describe, expect, it } from 'vitest';
import { CenaV2 } from './cena.ts';
import { CODIGOS, CONSULTAS, ESQUEMA_VERSAO, SECOES } from './esquema.gerado.ts';
import { ErroKernelLeve } from './erros.ts';
import { gerenciadorFalso } from './falso.ts';
import { fonteDeSecoes, type SecoesDaCena } from './quadros.ts';

/** Duas paredes em L e um tipo de uma camada, só números. */
const secoes = (): SecoesDaCena => ({
  paredes: { n: 2, colunas: { id_num: [1, 2], nivel_num: [0, 0], ax: [0, 4], ay: [0, 0], bx: [4, 4], by: [0, 4], espessura: [0.2, 0.2] } },
  tipos_parede: { n: 1, colunas: { id_num: [1], n_camadas: [1] } },
  camadas: { n: 1, colunas: { id_num: [1], tipo_num: [1], indice: [0], espessura: [0.2], funcao: [0], tem_prioridade: [0], prioridade: [0] } },
  paredes_quadro: {
    n: 2,
    colunas: {
      id_num: [1, 2], tipo_num: [1, 1], ordem: [1, 2], linha_loc: [0, 0], invertida: [0, 0], sem_junta_a: [0, 0], sem_junta_b: [0, 0],
      junta_a_tipo: [0, 0], junta_a_inverte: [0, 0], junta_b_tipo: [0, 0], junta_b_inverte: [0, 0], sag: [0, 0], z0: [0, 0], topo: [2.8, 2.8],
    },
  },
});

describe('esquema v2 (A1) no lado TypeScript', () => {
  it('versão 2, seções novas e a consulta quadros_e_juncoes no esquema', () => {
    expect(ESQUEMA_VERSAO).toBe(2);
    expect(Object.keys(SECOES)).toEqual(['paredes', 'paredes_quadro', 'tipos_parede', 'camadas']);
    expect(CONSULTAS.quadros_e_juncoes.id).toBe(4);
    expect([...CONSULTAS.quadros_e_juncoes.args]).toEqual(['nivel_num', 'tol_juncao']);
    expect(CONSULTAS.quadros_e_juncoes.saidas.map((s) => s.nome)).toEqual([
      'ids', 'quadro', 'arco', 'estado_pontas', 'parceiros', 'pontas_cab', 'pontas_dados', 'cordas_cab', 'cordas', 'grupos',
    ]);
  });

  it('o falso aceita as quatro seções e responde NAO_IMPLEMENTADO à consulta de geometria', () => {
    const { ger } = gerenciadorFalso();
    const cena = CenaV2.criar(ger, fonteDeSecoes(secoes));
    try {
      try {
        cena.consultar('quadros_e_juncoes', [0, 0.02]);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ErroKernelLeve);
        expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.NAO_IMPLEMENTADO);
      }
      // as consultas da Fase 0 continuam funcionando na mesma cena
      expect(cena.consultar('estatisticas_nivel', [0])['n_paredes']![0]).toBe(2);
    } finally {
      cena.destruir();
    }
  });

  it('o falso recusa enum e flag fora do domínio (como o Rust)', () => {
    const { ger } = gerenciadorFalso();
    const cena = CenaV2.criar(ger, fonteDeSecoes(secoes));
    try {
      const q = secoes().paredes_quadro!;
      expect(() => cena.definirSecao('paredes_quadro', { ...q.colunas, linha_loc: [6, 0] }, q.n)).toThrow(ErroKernelLeve);
      expect(() => cena.definirSecao('paredes_quadro', { ...q.colunas, invertida: [2, 0] }, q.n)).toThrow(ErroKernelLeve);
      expect(() => cena.definirSecao('paredes_quadro', { ...q.colunas, sag: [Number.NaN, 0] }, q.n)).toThrow(ErroKernelLeve);
      expect(() => cena.definirSecao('camadas', { ...secoes().camadas!.colunas, funcao: [6] }, 1)).toThrow(ErroKernelLeve);
    } finally {
      cena.destruir();
    }
  });
});
