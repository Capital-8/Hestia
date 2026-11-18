import { BIBLIOTECA_BASE, FAMILIA_ARMARIO } from '@hestia/model';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  criarCopiaDeFamilia,
  filtrarFamilias,
  normalizarTexto,
  proximoIdDeUsuario,
  reiniciarIdsAbertos,
} from './familiaNovo.ts';

beforeEach(() => reiniciarIdsAbertos());

describe('normalizarTexto e filtrarFamilias', () => {
  it('tira acento e caixa', () => {
    expect(normalizarTexto('  Cômoda BAIXA ')).toBe('comoda baixa');
  });

  it('limita pela categoria e por "todas"', () => {
    const moveis = filtrarFamilias(BIBLIOTECA_BASE, 'mobiliario', '');
    expect(moveis.length).toBeGreaterThan(0);
    expect(moveis.every((f) => f.categoria === 'mobiliario')).toBe(true);
    expect(filtrarFamilias(BIBLIOTECA_BASE, 'todas', '')).toHaveLength(BIBLIOTECA_BASE.length);
  });

  it('busca sem acento no nome e na descrição', () => {
    expect(filtrarFamilias(BIBLIOTECA_BASE, 'todas', 'comoda').map((f) => f.id)).toContain('fam_comoda');
    expect(filtrarFamilias(BIBLIOTECA_BASE, 'todas', 'CARCA').map((f) => f.id)).toContain('fam_comoda');
    expect(filtrarFamilias(BIBLIOTECA_BASE, 'todas', 'zzz_inexistente')).toEqual([]);
  });

  it('a categoria "meus" não filtra por categoria', () => {
    const lista = [FAMILIA_ARMARIO, ...BIBLIOTECA_BASE.filter((f) => f.categoria === 'mobiliario').slice(0, 2)];
    expect(filtrarFamilias(lista, 'meus', '')).toHaveLength(lista.length);
  });
});

describe('proximoIdDeUsuario', () => {
  it('começa em 1 e pula os ocupados', () => {
    expect(proximoIdDeUsuario([])).toBe('fam_usuario_1');
    expect(proximoIdDeUsuario(['fam_usuario_1'])).toBe('fam_usuario_2');
    expect(proximoIdDeUsuario(['fam_usuario_1', 'fam_usuario_3'])).toBe('fam_usuario_2');
    expect(proximoIdDeUsuario(['outra_familia'])).toBe('fam_usuario_1');
  });
});

describe('criarCopiaDeFamilia', () => {
  it('copia fundo, renomeia e dá ids em sequência', () => {
    const a = criarCopiaDeFamilia(FAMILIA_ARMARIO);
    const b = criarCopiaDeFamilia(FAMILIA_ARMARIO);
    expect(a.id).toBe('fam_usuario_1');
    expect(b.id).toBe('fam_usuario_2');
    expect(a.nome).toBe(`${FAMILIA_ARMARIO.nome} (nova)`);
    expect(a.parametros).not.toBe(FAMILIA_ARMARIO.parametros);
    expect(a.pecas).not.toBe(FAMILIA_ARMARIO.pecas);
    a.nome = 'outro';
    expect(FAMILIA_ARMARIO.nome).not.toBe('outro');
  });

  it('mantém os aninhados apontando para as famílias da biblioteca', () => {
    const original = BIBLIOTECA_BASE.find((f) => f.aninhados.length > 0);
    expect(original).toBeDefined();
    const copia = criarCopiaDeFamilia(original!);
    expect(copia.aninhados.map((a) => a.familiaId)).toEqual(original!.aninhados.map((a) => a.familiaId));
  });
});
