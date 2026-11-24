import { describe, expect, it } from 'vitest';
import { APELIDOS_MATERIAL_CORPO, MATERIAIS_INSTALACOES, MATERIAL_NEUTRO, OPCOES_MATERIAL_CORPO, corDoMaterialInstalacao, resolverMaterialVisualCorpo } from './materiaisInstalacoes.ts';
import { MAPA_ACABAMENTOS } from './acabamentos.ts';

/* Fichas K1 e K2: o corpo resolve o material como a peça; sem material ou desconhecido = cinza neutro, nunca madeira. */

const MADEIRAS = new Set(['comp_carvalho', 'comp_freijo', 'comp_nogueira', 'comp_madeira_clara', 'comp_corpo', 'comp_fundo']);
const conhecidos = (id: string): boolean => MAPA_ACABAMENTOS[id] !== undefined;

describe('material do corpo', () => {
  it('sem material, vazio ou desconhecido: cinza neutro', () => {
    for (const m of [undefined, null, '', '   ', 'mat_inexistente', '#ff0000']) expect(resolverMaterialVisualCorpo(m)).toBe(MATERIAL_NEUTRO);
    expect(corDoMaterialInstalacao(MATERIAL_NEUTRO)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('apelidos de família viram PVC, aço, cobre etc.; mat_pvc antigo vira PVC branco', () => {
    expect(resolverMaterialVisualCorpo('mat_pvc')).toBe('comp_pvc_branco');
    expect(resolverMaterialVisualCorpo('mat_pvc_marrom')).toBe('comp_pvc_marrom');
    expect(resolverMaterialVisualCorpo('mat_cobre', {}, conhecidos)).toBe('comp_cobre');
    expect(resolverMaterialVisualCorpo('mat_metal')).toBe('comp_aco');
  });
  it('id do catálogo vale como está; id de material do projeto vence', () => {
    expect(resolverMaterialVisualCorpo('comp_pvc_azul')).toBe('comp_pvc_azul');
    expect(resolverMaterialVisualCorpo('comp_cobre', {}, conhecidos)).toBe('comp_cobre');
    expect(resolverMaterialVisualCorpo('mat_parede_1', { mat_parede_1: {} })).toBe('mat_parede_1');
  });
  it('nenhum apelido nem opção do seletor resolve para madeira', () => {
    for (const ap of Object.keys(APELIDOS_MATERIAL_CORPO)) expect(MADEIRAS.has(resolverMaterialVisualCorpo(ap, {}, conhecidos))).toBe(false);
    for (const o of OPCOES_MATERIAL_CORPO) expect(MADEIRAS.has(resolverMaterialVisualCorpo(o.apelido, {}, conhecidos))).toBe(false);
  });
  it('o catálogo de instalações tem cores válidas, ids únicos e hachura de corte', () => {
    expect(new Set(MATERIAIS_INSTALACOES.map((m) => m.id)).size).toBe(MATERIAIS_INSTALACOES.length);
    for (const m of MATERIAIS_INSTALACOES) {
      expect(m.cor).toMatch(/^#[0-9a-f]{6}$/);
      expect(['solid', 'diagonal', 'cross']).toContain(m.hachura);
    }
    for (const id of ['comp_pvc_branco', 'comp_pvc_marrom', 'comp_pvc_azul', 'comp_aco_galv', 'comp_concreto']) expect(corDoMaterialInstalacao(id)).toBeDefined();
  });
});
