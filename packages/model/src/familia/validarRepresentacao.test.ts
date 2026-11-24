import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import type { Familia } from './tipos.ts';
import { LIMITES_REPRESENTACAO, type TabelaFamilia, type Verificacao } from './tiposRepresentacao.ts';
import type { CodigoProblema, Problema } from './validar.ts';
import { validarRepresentacao } from './validarRepresentacao.ts';

const nova = (): Familia => {
  const f = structuredClone(FAMILIA_ARMARIO);
  f.parametros = [
    { id: 'L', nome: 'Largura', tipo: 'comprimento', escopo: 'instancia', padrao: 600 },
    { id: 'P', nome: 'Profundidade', tipo: 'comprimento', escopo: 'instancia', padrao: 560 },
  ];
  return f;
};

const tabela = (id: string, extra: Partial<TabelaFamilia> = {}): TabelaFamilia => ({
  id,
  nome: id,
  porTipo: true,
  colunas: [{ titulo: 'Largura', valor: 'L' }],
  ...extra,
});

const verificacao = (id: string, extra: Partial<Verificacao> = {}): Verificacao => ({
  id,
  severidade: 'aviso',
  condicao: 'L < 500',
  mensagem: 'Largura {L} abaixo de 500',
  ...extra,
});

const achar = (problemas: Problema[], codigo: CodigoProblema, onde: string): Problema | undefined =>
  problemas.find((p) => p.codigo === codigo && p.onde === onde);

describe('validarRepresentacao', () => {
  it('família sem tabelas nem verificações não tem problema', () => {
    expect(validarRepresentacao(nova())).toEqual([]);
  });

  it('tabela e verificação válidas passam', () => {
    const f = nova();
    f.tabelas = [tabela('dimensoes', { colunas: [{ titulo: 'Volume', valor: 'L * P / 1000', unidade: 'mm³' }] })];
    f.verificacoes = [verificacao('curta')];
    expect(validarRepresentacao(f)).toEqual([]);
  });

  it('coluna com fórmula inválida é recusada', () => {
    const f = nova();
    f.tabelas = [tabela('t', { colunas: [{ titulo: 'X', valor: 'L +' }] })];

    const problemas = validarRepresentacao(f);

    expect(achar(problemas, 'formula', 'tabela:t.colunas[0].valor')).toBeDefined();
  });

  it('coluna que usa parâmetro inexistente é recusada como referência', () => {
    const f = nova();
    f.tabelas = [tabela('t', { colunas: [{ titulo: 'X', valor: 'L * Z' }] })];

    expect(achar(validarRepresentacao(f), 'referencia', 'tabela:t.colunas[0].valor')).toBeDefined();
  });

  it('i e n não valem em tabela (nada repete)', () => {
    const f = nova();
    f.tabelas = [tabela('t', { colunas: [{ titulo: 'X', valor: 'L + i' }] })];

    expect(achar(validarRepresentacao(f), 'referencia', 'tabela:t.colunas[0].valor')).toBeDefined();
  });

  it('id de tabela repetido é apontado', () => {
    const f = nova();
    f.tabelas = [tabela('t'), tabela('t')];

    expect(achar(validarRepresentacao(f), 'id_duplicado', 'tabela:t')).toBeDefined();
  });

  it('id de tabela fora do formato é recusado', () => {
    const f = nova();
    f.tabelas = [tabela('tabela 1')];

    expect(achar(validarRepresentacao(f), 'id_invalido', 'tabela:tabela 1')).toBeDefined();
  });

  it('mais tabelas que o limite gera limite', () => {
    const f = nova();
    f.tabelas = Array.from({ length: LIMITES_REPRESENTACAO.tabelas + 1 }, (_, k) => tabela(`t${k}`));

    expect(validarRepresentacao(f).some((p) => p.codigo === 'limite')).toBe(true);
  });

  it('coluna sem título e unidade que não é texto são apontadas', () => {
    const f = nova();
    f.tabelas = [tabela('t', { colunas: [{ titulo: '', valor: 'L' }] })];
    expect(achar(validarRepresentacao(f), 'obrigatorio', 'tabela:t.colunas[0].titulo')).toBeDefined();

    const g = nova();
    g.tabelas = [tabela('t', { colunas: [{ titulo: 'X', valor: 'L', unidade: 5 as unknown as string }] })];
    expect(achar(validarRepresentacao(g), 'tipo', 'tabela:t.colunas[0].unidade')).toBeDefined();
  });

  it('severidade fora de aviso/erro é recusada', () => {
    const f = nova();
    f.verificacoes = [verificacao('v', { severidade: 'info' as unknown as 'aviso' })];

    expect(achar(validarRepresentacao(f), 'tipo', 'verificacao:v.severidade')).toBeDefined();
  });

  it('placeholder {x} que não é parâmetro na mensagem é recusado', () => {
    const f = nova();
    f.verificacoes = [verificacao('v', { mensagem: 'Volume {naoExiste} baixo' })];

    expect(achar(validarRepresentacao(f), 'referencia', 'verificacao:v.mensagem')).toBeDefined();
  });

  it('condição com fórmula inválida é recusada', () => {
    const f = nova();
    f.verificacoes = [verificacao('v', { condicao: 'L <' })];

    expect(achar(validarRepresentacao(f), 'formula', 'verificacao:v.condicao')).toBeDefined();
  });
});
