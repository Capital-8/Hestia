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

  it('o contrato do terreno (seções 160 a 165, consultas 160 a 168) confere com a tabela de A.5 do PLANO', () => {
    expect(ESQUEMA_VERSAO).toBeGreaterThanOrEqual(19);
    const secoes: Record<string, [number, string[]]> = {
      terrenos: [160, ['id_num:u32', 'nivel_num:u32', 'espessura_base:f64', 'intervalo:f64', 'mestra_cada:u32']],
      terreno_linhas: [161, ['id_num:u32', 'terreno_num:u32', 'tipo:u8', 'fechada:u8']],
      terreno_vertices: [162, ['id_num:u32', 'terreno_num:u32', 'linha_num:u32', 'ordem:u32', 'x:f64', 'y:f64', 'z:f64']],
      terreno_regioes: [
        163,
        ['id_num:u32', 'terreno_num:u32', 'ordem:u32', 'papel:u8', 'cota:f64', 'inclinacao:f64', 'direcao:f64', 'ref_x:f64', 'ref_y:f64', 'talude_corte:f64', 'talude_aterro:f64'],
      ],
      terreno_regiao_pontos: [164, ['id_num:u32', 'regiao_num:u32', 'ordem:u32', 'x:f64', 'y:f64']],
      terreno_sondas: [165, ['id_num:u32', 'x:f64', 'y:f64']],
    };
    for (const [nome, [id, colunas]] of Object.entries(secoes)) {
      const s = SECOES[nome as keyof typeof SECOES];
      expect(s.id, nome).toBe(id);
      expect(s.chave, nome).toBe('id_num');
      expect(s.colunas.map((c) => `${c.nome}:${c.tipo}`), nome).toEqual(colunas);
    }
    type Saida = [string, string, number | string];
    const consultas: Record<string, [number, string[], Saida[]]> = {
      terreno_malha: [160, ['nivel_num', 'superficie'], [['grupos', 'u32', '5n'], ['vertices', 'f64', '3n'], ['indices', 'u32', 'n']]],
      terreno_curvas: [161, ['nivel_num', 'superficie'], [['linhas', 'u32', '4n'], ['pontos', 'f64', '2n'], ['cotas', 'f64', 'n']]],
      terreno_planta: [162, ['nivel_num', 'superficie'], [['linhas', 'u32', '4n'], ['pontos', 'f64', '2n']]],
      terreno_cotas: [163, ['superficie'], [['linhas', 'u32', '2n'], ['valores', 'f64', '2n']]],
      terreno_corte: [164, ['nivel_num', 'ox', 'oy', 'dx', 'dy', 'profundidade'], [['linhas', 'u32', '4n'], ['pontos', 'f64', '2n']]],
      quant_terreno: [165, ['nivel_num'], [['linhas', 'u32', 'n'], ['valores', 'f64', '8n']]],
      quant_terreno_regioes: [166, ['nivel_num'], [['linhas', 'u32', '2n'], ['valores', 'f64', '4n']]],
      terreno_corte_aterro: [167, ['nivel_num'], [['grupos', 'u32', '4n'], ['pontos', 'f64', '2n']]],
      terreno_avisos: [168, ['nivel_num'], [['avisos', 'u32', '4n'], ['valores', 'f64', '5n']]],
    };
    for (const [nome, [id, args, saidas]] of Object.entries(consultas)) {
      const c = CONSULTAS[nome as keyof typeof CONSULTAS];
      expect(c.id, nome).toBe(id);
      expect([...c.args], nome).toEqual(args);
      expect(c.saidas.map((o) => [o.nome, o.tipo, o.elementos]), nome).toEqual(saidas);
    }
  });

  it('códigos de erro do 0046 §3.1', () => {
    expect(CODIGOS).toEqual({ OK: 0, VERSAO: 1, HANDLE: 2, ENTRADA: 3, NAO_IMPLEMENTADO: 4, LIMITE: 5, INTERNO: 6 });
  });
});
