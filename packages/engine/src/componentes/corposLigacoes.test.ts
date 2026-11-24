import { FAMILIA_ARMARIO, type Familia, type Ligacao } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverLigacoes } from './corposLigacoes.ts';

const AMBIENTE = { L: 800, A: 720, P: 560, nPrat: 1 };

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

/** Família de exemplo (a do armário) com estas ligações; o conteúdo das ligações é o do teste. */
const comLigacoes = (...ligacoes: unknown[]): Familia => {
  const f = structuredClone(FAMILIA_ARMARIO);
  f.ligacoes = ligacoes as Ligacao[];
  return f;
};

describe('resolverLigacoes', () => {
  it('N7: direção [0,0,-5] normaliza para [0,0,-1]', () => {
    const r = resolverLigacoes(comLigacoes(redonda('x', { direcao: ['0', '0', '-5'] })), AMBIENTE);
    expect(r.ok).toBe(true);
    expect(r.ligacoes[0]?.direcao).toEqual([0, 0, -1]);
  });

  it('posição e diâmetro saem em metros (1 µm) e a seção redonda zera largura e altura', () => {
    const r = resolverLigacoes(comLigacoes(redonda('x', { posicao: ['L / 2', '10', '-A'], diametro: '50' })), AMBIENTE);
    const l = r.ligacoes[0];
    expect(l?.posicao).toEqual([0.4, 0.01, -0.72]);
    expect(l).toMatchObject({ secao: 'redonda', diametro: 0.05, largura: 0, altura: 0 });
  });

  it('aceita ausente vale [dominio]; sistema ausente vira null', () => {
    const l = resolverLigacoes(comLigacoes(redonda('x')), AMBIENTE).ligacoes[0];
    expect(l?.aceita).toEqual(['agua_fria']);
    expect(l?.sistema).toBeNull();
    expect(l?.propagaParametro).toBeNull();
  });

  it('retangular sem altura é erro obrigatorio e a ligação some da lista', () => {
    const { altura: _removida, ...semAltura } = retangular('x');
    const r = resolverLigacoes(comLigacoes(semAltura), AMBIENTE);
    expect(r.ok).toBe(false);
    expect(r.ligacoes).toEqual([]);
    expect(r.diagnosticos).toEqual([expect.objectContaining({ codigo: 'obrigatorio', onde: 'ligacao:x.altura' })]);
  });

  it('retangular com largura e altura resolve as duas medidas', () => {
    const l = resolverLigacoes(comLigacoes(retangular('ar')), AMBIENTE).ligacoes[0];
    expect(l).toMatchObject({ secao: 'retangular', largura: 0.2, altura: 0.1, diametro: 0 });
  });

  it('quando falso remove a ligação sem diagnóstico; quando verdadeiro a mantém', () => {
    const r = resolverLigacoes(
      comLigacoes(redonda('sai', { quando: 'nPrat > 5' }), redonda('fica', { quando: 'nPrat == 1' })),
      AMBIENTE,
    );
    expect(r.ok).toBe(true);
    expect(r.diagnosticos).toEqual([]);
    expect(r.ligacoes.map((l) => l.id)).toEqual(['fica']);
  });

  it('quando com fórmula que não resolve gera diagnóstico formula', () => {
    const r = resolverLigacoes(comLigacoes(redonda('x', { quando: 'naoExiste' })), AMBIENTE);
    expect(r.ok).toBe(false);
    expect(r.ligacoes).toEqual([]);
    expect(r.diagnosticos).toEqual([expect.objectContaining({ codigo: 'formula', onde: 'ligacao:x.quando' })]);
  });

  it('propriedades viram números; texto que não é número vira diagnóstico tipo', () => {
    const ok = resolverLigacoes(comLigacoes(redonda('x', { propriedades: { vazao: '2 * 3', pressao: '150' } })), AMBIENTE);
    expect(ok.ligacoes[0]?.propriedades).toEqual({ vazao: 6, pressao: 150 });
    const ruim = resolverLigacoes(comLigacoes(redonda('x', { propriedades: { vazao: '"seis"' } })), AMBIENTE);
    expect(ruim.diagnosticos).toEqual([expect.objectContaining({ codigo: 'tipo', onde: 'ligacao:x.propriedades.vazao' })]);
  });

  it('propagaParametro passa como texto; id inexistente não quebra a resolução (a validação aponta)', () => {
    const r = resolverLigacoes(comLigacoes(redonda('x', { propagaParametro: 'DN' })), AMBIENTE);
    expect(r.ok).toBe(true);
    expect(r.ligacoes[0]?.propagaParametro).toBe('DN');
  });

  it('família antiga sem ligacoes resolve lista vazia', () => {
    const antiga = structuredClone(FAMILIA_ARMARIO);
    delete (antiga as { ligacoes?: unknown }).ligacoes;
    expect(resolverLigacoes(antiga, AMBIENTE)).toEqual({ ok: true, ligacoes: [], diagnosticos: [] });
  });

  it('entrada que não é lista vira diagnóstico, sem lançar', () => {
    const f = structuredClone(FAMILIA_ARMARIO);
    (f as { ligacoes?: unknown }).ligacoes = 'não é lista';
    const r = resolverLigacoes(f, AMBIENTE);
    expect(r.ok).toBe(false);
    expect(r.diagnosticos).toEqual([expect.objectContaining({ codigo: 'tipo', onde: 'familia' })]);
  });

  it('direção nula é faixa e a ligação não entra', () => {
    const r = resolverLigacoes(comLigacoes(redonda('x', { direcao: ['0', '0', '0'] })), AMBIENTE);
    expect(r.ligacoes).toEqual([]);
    expect(r.diagnosticos).toEqual([expect.objectContaining({ codigo: 'faixa', onde: 'ligacao:x.direcao' })]);
  });

  it('ligações válidas mantêm a ordem da família', () => {
    const r = resolverLigacoes(comLigacoes(redonda('b'), retangular('a')), AMBIENTE);
    expect(r.ligacoes.map((l) => l.id)).toEqual(['b', 'a']);
  });
});
