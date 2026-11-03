import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CAMINHO_GERADO, CAMINHO_JSON, gerarTexto } from '../../../../../scripts/gerar-esquema-kernel.mjs';
import { ABI_VERSAO, CODIGOS, CONSULTAS, ESQUEMA_VERSAO, LIMITES, NIVEL_TODOS, SECOES, TIPOS } from './esquema.gerado.ts';

const json = JSON.parse(readFileSync(CAMINHO_JSON, 'utf8'));
const lf = (t: string): string => t.replace(/\r\n/g, '\n');

describe('esquema gerado (cena-v9.json)', () => {
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
});
