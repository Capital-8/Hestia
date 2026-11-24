import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import type { Familia } from './tipos.ts';
import { validarFamilia, type CodigoProblema, type Problema } from './validar.ts';
import { validarLigacoes } from './validarLigacoes.ts';
import { LIMITES_LIGACAO, type Ligacao } from './tiposLigacao.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);

const redonda = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  nome: id,
  dominio: 'agua_fria',
  secao: 'redonda',
  posicao: ['0', '0', '0'],
  direcao: ['1', '0', '0'],
  diametro: '50',
  fluxo: 'entrada',
  ...extra,
});

const retangular = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  nome: id,
  dominio: 'ventilacao',
  secao: 'retangular',
  posicao: ['0', '0', '0'],
  direcao: ['0', '1', '0'],
  largura: '200',
  altura: '100',
  fluxo: 'saida',
  ...extra,
});

/** Família de exemplo com estas ligações (o conteúdo é o do teste). */
const comLigacoes = (...ligacoes: unknown[]): Familia => {
  const f = nova();
  f.ligacoes = ligacoes as Ligacao[];
  return f;
};

const codigos = (problemas: Problema[]): CodigoProblema[] => problemas.map((p) => p.codigo);

describe('validarLigacoes', () => {
  it('família sem ligações não tem problema de ligação', () => {
    expect(validarLigacoes(nova())).toEqual([]);
  });

  it('família com ligações válidas (redonda e retangular) não tem problema', () => {
    const f = comLigacoes(redonda('agua'), retangular('ar', { aceita: ['ar_insuflamento'], propriedades: { vazao: '12' } }));
    expect(validarLigacoes(f)).toEqual([]);
    expect(validarFamilia(f).filter((p) => p.onde.startsWith('ligacao:'))).toEqual([]);
  });

  it('id duplicado entre ligações aponta a segunda', () => {
    const r = validarLigacoes(comLigacoes(redonda('x'), redonda('x')));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ codigo: 'id_duplicado', onde: 'ligacao:x' });
  });

  it('id ausente ou vazio é id_invalido', () => {
    const r = validarLigacoes(comLigacoes(redonda(''), { ...redonda('y'), id: undefined }));
    expect(codigos(r)).toEqual(['id_invalido', 'id_invalido']);
  });

  it('passa do limite de ligações', () => {
    const muitas = Array.from({ length: LIMITES_LIGACAO.ligacoes + 1 }, (_, k) => redonda(`l${k}`));
    const r = validarLigacoes(comLigacoes(...muitas));
    expect(r.some((p) => p.codigo === 'limite' && p.onde === 'familia')).toBe(true);
  });

  it('seção redonda sem diâmetro é obrigatorio em ligacao:x.diametro', () => {
    const { diametro: _removido, ...semDiametro } = redonda('x');
    const r = validarLigacoes(comLigacoes(semDiametro));
    expect(r).toContainEqual(expect.objectContaining({ codigo: 'obrigatorio', onde: 'ligacao:x.diametro' }));
  });

  it('seção retangular sem altura é obrigatorio em ligacao:x.altura', () => {
    const { altura: _removida, ...semAltura } = retangular('x');
    const r = validarLigacoes(comLigacoes(semAltura));
    expect(r).toContainEqual(expect.objectContaining({ codigo: 'obrigatorio', onde: 'ligacao:x.altura' }));
  });

  it('medida literal não positiva vira faixa', () => {
    const r = validarLigacoes(comLigacoes(redonda('x', { diametro: '0' })));
    expect(r).toContainEqual(expect.objectContaining({ codigo: 'faixa', onde: 'ligacao:x.diametro' }));
  });

  it('direção literal toda zero é faixa; direção com fórmula não é julgada aqui', () => {
    expect(validarLigacoes(comLigacoes(redonda('x', { direcao: ['0', '0', '0'] })))).toContainEqual(
      expect.objectContaining({ codigo: 'faixa', onde: 'ligacao:x.direcao' }),
    );
    expect(validarLigacoes(comLigacoes(redonda('x', { direcao: ['L', '0', '0'] })))).toEqual([]);
  });

  it('domínio, seção e fluxo desconhecidos são tipo', () => {
    const r = validarLigacoes(comLigacoes(redonda('x', { dominio: 'vapor' }), redonda('y', { secao: 'oval' }), redonda('z', { fluxo: 'ida' })));
    expect(r).toEqual([
      expect.objectContaining({ codigo: 'tipo', onde: 'ligacao:x.dominio' }),
      expect.objectContaining({ codigo: 'tipo', onde: 'ligacao:y.secao' }),
      expect.objectContaining({ codigo: 'tipo', onde: 'ligacao:z.fluxo' }),
    ]);
  });

  it('aceita com domínio inválido aponta o item', () => {
    const r = validarLigacoes(comLigacoes(redonda('x', { aceita: ['agua_fria', 'vapor'] })));
    expect(r).toEqual([expect.objectContaining({ codigo: 'tipo', onde: 'ligacao:x.aceita[1]' })]);
  });

  it('quando com referência inexistente é referencia; fórmula inválida é formula', () => {
    const r = validarLigacoes(comLigacoes(redonda('x', { quando: 'naoExiste > 1' }), redonda('y', { posicao: ['(', '0', '0'] })));
    expect(r).toContainEqual(expect.objectContaining({ codigo: 'referencia', onde: 'ligacao:x.quando' }));
    expect(r).toContainEqual(expect.objectContaining({ codigo: 'formula', onde: 'ligacao:y.posicao[0]' }));
  });

  it('i e n não existem em ligação (ela não repete)', () => {
    const r = validarLigacoes(comLigacoes(redonda('x', { posicao: ['i * 10', '0', '0'] })));
    expect(r).toContainEqual(expect.objectContaining({ codigo: 'referencia', onde: 'ligacao:x.posicao[0]' }));
  });

  it('propriedades com fórmula inválida apontam a chave', () => {
    const r = validarLigacoes(comLigacoes(redonda('x', { propriedades: { pressao: '3 +' } })));
    expect(r).toEqual([expect.objectContaining({ codigo: 'formula', onde: 'ligacao:x.propriedades.pressao' })]);
  });

  it('propagaParametro inexistente é referencia; parâmetro de tipo não numérico é tipo', () => {
    const inexistente = validarLigacoes(comLigacoes(redonda('x', { propagaParametro: 'DN' })));
    expect(inexistente).toEqual([expect.objectContaining({ codigo: 'referencia', onde: 'ligacao:x.propagaParametro' })]);
    // `nPrat` é inteiro de escopo tipo: nem instância nem comprimento/numero.
    const errado = validarLigacoes(comLigacoes(redonda('x', { propagaParametro: 'nPrat' })));
    expect(errado).toEqual([expect.objectContaining({ codigo: 'tipo', onde: 'ligacao:x.propagaParametro' })]);
  });

  it('propagaParametro para parâmetro de instância comprimento é aceito', () => {
    expect(validarLigacoes(comLigacoes(redonda('x', { propagaParametro: 'L' })))).toEqual([]);
  });

  it('chapa.esp é referência válida em fórmula de ligação', () => {
    expect(validarLigacoes(comLigacoes(redonda('x', { posicao: ['corpo.esp', '0', '0'] })))).toEqual([]);
  });
});
