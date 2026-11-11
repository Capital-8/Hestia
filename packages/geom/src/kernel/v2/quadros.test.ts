import { describe, expect, it } from 'vitest';
import { CenaV2 } from './cena.ts';
import { CODIGOS, CONSULTAS, ESQUEMA_VERSAO, SECOES } from './esquema.gerado.ts';
import { ErroKernelLeve } from './erros.ts';
import { gerenciadorFalso } from './falso.ts';
import { fonteDeSecoes, type SecoesDaCena } from './quadros.ts';

/** Duas paredes em L e um tipo de uma camada, só números. */
const secoes = (): SecoesDaCena => ({
  paredes: { n: 2, colunas: { id_num: [1, 2], nivel_num: [0, 0], ax: [0, 4], ay: [0, 0], bx: [4, 4], by: [0, 4], espessura: [0.2, 0.2] } },
  tipos_parede: { n: 1, colunas: { id_num: [1], n_camadas: [1], wrap_ends: [0], n_faixas: [0], wrap_inserts: [0] } },
  camadas: { n: 1, colunas: { id_num: [1], tipo_num: [1], indice: [0], espessura: [0.2], funcao: [0], tem_prioridade: [0], prioridade: [0], material_num: [1], envolve: [0] } },
  faixas: { n: 0, colunas: { id_num: [], tipo_num: [], indice: [], lado: [], material_num: [], espessura: [], z0: [], z1: [] } },
  paredes_z: { n: 2, colunas: { id_num: [1, 2], z0: [0, 0], altura: [2.8, 2.8] } },
  paredes_quadro: {
    n: 2,
    colunas: {
      id_num: [1, 2], tipo_num: [1, 1], ordem: [1, 2], linha_loc: [0, 0], invertida: [0, 0], sem_junta_a: [0, 0], sem_junta_b: [0, 0],
      junta_a_tipo: [0, 0], junta_a_inverte: [0, 0], junta_b_tipo: [0, 0], junta_b_inverte: [0, 0], sag: [0, 0], z0: [0, 0], topo: [2.8, 2.8],
    },
  },
});

describe('esquema v11 (A1, A2, A3a, A3b, A3c, A3d, B1, B2 e B3) no lado TypeScript', () => {
  it('versão 11, seções novas e as consultas quadros_e_juncoes, itens_pintados, aberturas_geom, retornos_geom, cluster_resolvido, resolver_nivel, pisos_lajes_nivel, pisos_lajes_com_paredes e junction_nivel no esquema', () => {
    expect(ESQUEMA_VERSAO).toBe(14);
    expect(Object.keys(SECOES)).toEqual(['paredes', 'paredes_quadro', 'tipos_parede', 'camadas', 'faixas', 'paredes_z', 'tipos_abertura', 'aberturas', 'perfis_z', 'pisos', 'lajes', 'tipos_piso', 'tipos_laje', 'camadas_piso', 'camadas_laje', 'contornos_estaticos', 'contornos_vinculados', 'furos_nivel', 'niveis', 'paredes_z_juncao', 'perfis_z_juncao', 'faixas_juncao', 'pontos_faixas_juncao', 'camadas_forro', 'pontos_forro', 'escadas_gc', 'escada_componentes_gc', 'escada_curvas_gc', 'escada_espelhos_gc', 'escada_patamares_gc', 'rampas_gc', 'rampa_lances_gc', 'rampa_patamares_gc', 'guardas_corpo', 'guarda_caminhos_manuais', 'tipos_guarda', 'perfis_guarda', 'perfis_guarda_pontos', 'trilhos_guarda', 'corrimaos_guarda', 'postes_guarda', 'padroes_guarda', 'padrao_elementos_guarda', 'paineis_guarda', 'normas_guarda']);
    expect(CONSULTAS.pisos_lajes_nivel.id).toBe(10);
    expect([...CONSULTAS.pisos_lajes_nivel.args]).toEqual(['nivel_num']);
    expect(CONSULTAS.pisos_lajes_nivel.saidas.map((s) => s.nome)).toEqual(['elementos', 'elementos_num', 'camadas', 'camadas_num', 'poligonos', 'aneis', 'pontos']);
    expect(CONSULTAS.pisos_lajes_com_paredes.id).toBe(11);
    expect([...CONSULTAS.pisos_lajes_com_paredes.args]).toEqual(['nivel_num', 'tol_juncao']);
    expect(CONSULTAS.pisos_lajes_com_paredes.saidas.map((s) => s.nome)).toEqual(['elementos', 'elementos_num', 'camadas', 'camadas_num', 'poligonos', 'aneis', 'pontos']);
    expect(CONSULTAS.junction_nivel.id).toBe(12);
    expect([...CONSULTAS.junction_nivel.args]).toEqual(['nivel_num', 'tol_juncao']);
    expect(CONSULTAS.junction_nivel.saidas.map((s) => s.nome)).toEqual(['cortadores', 'pecas', 'pecas_num', 'elementos', 'camadas', 'camadas_indice', 'paredes', 'faixas', 'faixas_camada', 'partes', 'partes_z', 'poligonos', 'aneis', 'pontos']);
    expect(SECOES.paredes_z_juncao.id).toBe(20);
    expect(SECOES.perfis_z_juncao.id).toBe(21);
    expect(SECOES.faixas_juncao.id).toBe(22);
    expect(SECOES.pontos_faixas_juncao.id).toBe(23);
    expect(SECOES.camadas_forro.id).toBe(24);
    expect(SECOES.pontos_forro.id).toBe(25);
    expect(CONSULTAS.quadros_e_juncoes.id).toBe(4);
    expect([...CONSULTAS.quadros_e_juncoes.args]).toEqual(['nivel_num', 'tol_juncao']);
    expect(CONSULTAS.quadros_e_juncoes.saidas.map((s) => s.nome)).toEqual([
      'ids', 'quadro', 'arco', 'estado_pontas', 'parceiros', 'pontas_cab', 'pontas_dados', 'cordas_cab', 'cordas', 'grupos',
    ]);
    expect(CONSULTAS.itens_pintados.id).toBe(5);
    expect([...CONSULTAS.itens_pintados.args]).toEqual(['nivel_num', 'tol_juncao', 'tem_corte_z', 'corte_z', 'n_contorno']);
    expect(CONSULTAS.itens_pintados.argsVariaveis).toBe(true);
    expect(CONSULTAS.itens_pintados.saidas.map((s) => s.nome)).toEqual(['itens', 'itens_num', 'formas_cab', 'poligonos', 'aneis', 'pontos']);
    expect(CONSULTAS.retornos_geom.id).toBe(7);
    expect([...CONSULTAS.retornos_geom.args]).toEqual(['nivel_num', 'tol_juncao', 'tem_corte_z', 'corte_z', 'n_contorno']);
    expect(CONSULTAS.retornos_geom.argsVariaveis).toBe(true);
    expect(CONSULTAS.retornos_geom.saidas.map((s) => s.nome)).toEqual(['retornos', 'formas_cab', 'poligonos', 'aneis', 'pontos']);
    expect(CONSULTAS.cluster_resolvido.id).toBe(8);
    expect([...CONSULTAS.cluster_resolvido.args]).toEqual(['nivel_num', 'tol_juncao', 'tem_corte_z', 'corte_z', 'n_contorno', 'tem_aberturas_planta', 'n_aberturas_planta']);
    expect(CONSULTAS.cluster_resolvido.argsVariaveis).toBe(true);
    expect(CONSULTAS.cluster_resolvido.saidas.map((s) => s.nome)).toEqual(['camadas', 'camadas_num', 'camadas_formas', 'faixas', 'faixas_forma', 'regioes', 'silhuetas', 'poligonos', 'aneis', 'pontos']);
    expect(CONSULTAS.resolver_nivel.id).toBe(9);
    expect([...CONSULTAS.resolver_nivel.args]).toEqual([...CONSULTAS.cluster_resolvido.args]);
    expect(CONSULTAS.resolver_nivel.argsVariaveis).toBe(true);
    expect(CONSULTAS.resolver_nivel.saidas.map((s) => s.nome)).toEqual([
      'paredes', 'paredes_num', 'perfis', 'membranas', 'membranas_pts', 'camadas', 'camadas_num', 'camadas_formas', 'faixas', 'faixas_forma', 'regioes', 'silhuetas', 'poligonos', 'aneis', 'pontos',
    ]);
  });

  it('o falso aceita as seções e responde NAO_IMPLEMENTADO às consultas de geometria', () => {
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
      try {
        cena.consultar('itens_pintados', [0, 0.02, 0, 0, 1, 7]);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ErroKernelLeve);
        expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.NAO_IMPLEMENTADO);
      }
      try {
        cena.consultar('retornos_geom', [0, 0.02, 0, 0, 0]);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ErroKernelLeve);
        expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.NAO_IMPLEMENTADO);
      }
      try {
        cena.consultar('cluster_resolvido', [0, 0.02, 0, 0, 0, 0, 0]);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ErroKernelLeve);
        expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.NAO_IMPLEMENTADO);
      }
      try {
        cena.consultar('resolver_nivel', [0, 0.02, 0, 0, 0, 0, 0]);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ErroKernelLeve);
        expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.NAO_IMPLEMENTADO);
      }
      try {
        cena.consultar('pisos_lajes_com_paredes', [0, 0.001]);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ErroKernelLeve);
        expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.NAO_IMPLEMENTADO);
      }
      try {
        cena.consultar('junction_nivel', [0, 0.001]);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ErroKernelLeve);
        expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.NAO_IMPLEMENTADO);
      }
      try {
        cena.consultar('pisos_lajes_nivel', [0]);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ErroKernelLeve);
        expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.NAO_IMPLEMENTADO);
      }
      try {
        cena.consultar('aberturas_geom', [0]);
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ErroKernelLeve);
        expect((e as ErroKernelLeve).codigo).toBe(CODIGOS.NAO_IMPLEMENTADO);
      }
      // argumentos variáveis: menos que os fixos é ENTRADA
      expect(() => cena.consultar('itens_pintados', [0, 0.02])).toThrow(ErroKernelLeve);
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
