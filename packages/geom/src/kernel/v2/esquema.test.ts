import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAMINHO_GERADO, CAMINHO_JSON, gerarTexto } from '../../../../../scripts/gerar-esquema-kernel.mjs';
import { ABI_VERSAO, CODIGOS, CONSULTAS, ESQUEMA_VERSAO, LIMITES, NIVEL_TODOS, SECOES, TIPOS } from './esquema.gerado.ts';

const json = JSON.parse(readFileSync(CAMINHO_JSON, 'utf8'));
const lf = (t: string): string => t.replace(/\r\n/g, '\n');

describe('esquema gerado (cena-v11.json)', () => {
  it('esquema.gerado.ts não está defasado em relação ao JSON (rode scripts/gerar-esquema-kernel.mjs)', () => {
    expect(lf(readFileSync(CAMINHO_GERADO, 'utf8'))).toBe(gerarTexto(json));
  });

  it('as constantes batem com o JSON', () => {
    expect(ESQUEMA_VERSAO).toBe(json.versao);
    expect(ABI_VERSAO).toBe(json.abi);
    expect(NIVEL_TODOS).toBe(json.args.nivel_todos);
    expect(LIMITES).toEqual(json.limites);
    for (const [nome, t] of Object.entries(json.tipos as Record<string, { bytes: number; codigo: number }>)) {
      expect(TIPOS[nome as keyof typeof TIPOS].bytes).toBe(t.bytes);
      expect(TIPOS[nome as keyof typeof TIPOS].codigo).toBe(t.codigo);
    }
    for (const s of json.secoes) {
      const g = SECOES[s.nome as keyof typeof SECOES];
      expect(g.id).toBe(s.id);
      expect(g.chave).toBe(s.chave);
      expect(g.colunas.map((c) => [c.nome, c.tipo])).toEqual(s.colunas.map((c: { nome: string; tipo: string }) => [c.nome, c.tipo]));
    }
    for (const c of json.consultas) {
      const g = CONSULTAS[c.nome as keyof typeof CONSULTAS];
      expect(g.id).toBe(c.id);
      expect([...g.args]).toEqual(c.args);
      expect(g.saidas.map((o) => [o.nome, o.tipo, o.elementos])).toEqual(c.saidas.map((o: { nome: string; tipo: string; elementos: unknown }) => [o.nome, o.tipo, o.elementos]));
    }
    expect(Object.keys(SECOES)).toHaveLength(json.secoes.length);
    expect(Object.keys(CONSULTAS)).toHaveLength(json.consultas.length);
  });

  it('códigos de erro do 0046 §3.1', () => {
    expect(CODIGOS).toEqual({ OK: 0, VERSAO: 1, HANDLE: 2, ENTRADA: 3, NAO_IMPLEMENTADO: 4, LIMITE: 5, INTERNO: 6 });
  });

  it('massa (A.5 do plano): seções 140 a 142 e consultas 140 a 145, coluna por coluna', () => {
    const cols = (nome: keyof typeof SECOES): string[] => SECOES[nome].colunas.map((c) => `${c.nome}:${c.tipo}`);
    expect([SECOES.massas.id, SECOES.massa_secoes.id, SECOES.massa_pontos.id]).toEqual([140, 141, 142]);
    expect(cols('massas')).toEqual(['id_num:u32', 'nivel_num:u32', 'ox:f64', 'oy:f64', 'z_base:f64', 'interp:u8', 'resolucao:u32', 'arr_n:u32', 'arr_cx:f64', 'arr_cy:f64', 'arr_ang:f64']);
    expect(cols('massa_secoes')).toEqual(['id_num:u32', 'massa_num:u32', 'ordem:u32', 'z:f64', 'forma:u8', 'p1:f64', 'p2:f64', 'lados:u32', 'rot:f64', 'escala:f64', 'dx:f64', 'dy:f64']);
    expect(cols('massa_pontos')).toEqual(['id_num:u32', 'secao_num:u32', 'ordem:u32', 'x:f64', 'y:f64']);
    const q = (nome: keyof typeof CONSULTAS): [number, string[], string[]] => [CONSULTAS[nome].id, [...CONSULTAS[nome].args], CONSULTAS[nome].saidas.map((o) => `${o.nome}:${o.tipo}:${o.elementos}`)];
    expect(q('massa_malha')).toEqual([140, ['nivel_num', 'lod'], ['grupos:u32:5n', 'vertices:f64:3n', 'indices:u32:n']]);
    expect(q('massa_planta')).toEqual([141, ['nivel_num', 'corte_z', 'z_min', 'z_max'], ['linhas:u32:4n', 'pontos:f64:2n']]);
    expect(q('massa_fatias')).toEqual([142, ['nivel_num'], ['fatias:u32:4n', 'pontos:f64:2n', 'valores:f64:3n']]);
    expect(q('massa_corte')).toEqual([143, ['nivel_num', 'ox', 'oy', 'dx', 'dy', 'profundidade'], ['linhas:u32:4n', 'pontos:f64:2n']]);
    expect(q('quant_massa')).toEqual([144, ['nivel_num'], ['linhas:u32:n', 'valores:f64:5n']]);
    expect(q('massa_avisos')).toEqual([145, ['nivel_num'], ['avisos:u32:4n', 'valores:f64:5n']]);
    expect(ESQUEMA_VERSAO).toBe(19);
  });
});
