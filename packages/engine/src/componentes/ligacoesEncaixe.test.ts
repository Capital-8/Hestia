import type { Component } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import type { LigacaoResolvida } from './corposTipos.ts';
import { encaixarLigacoes, ligacaoNoMundo, ligacoesCompativeis, type LigacaoNoMundo } from './ligacoesEncaixe.ts';

/** Ligação já no mundo, na origem e com direção (1,0,0), salvo o que for passado. */
function ligNoMundo(sobre: Partial<LigacaoNoMundo> = {}): LigacaoNoMundo {
  return {
    id: 'l1',
    nome: 'Entrada',
    dominio: 'agua_fria',
    sistema: null,
    secao: 'redonda',
    posicao: [0, 0, 0],
    direcao: [1, 0, 0],
    diametro: 0.05,
    largura: 0,
    altura: 0,
    fluxo: 'ambos',
    aceita: ['agua_fria'],
    propriedades: {},
    propagaParametro: null,
    posicaoMundo: [0, 0, 0],
    direcaoMundo: [1, 0, 0],
    ...sobre,
  };
}

/** Componente de teste com a posição e a rotação dadas; os demais campos não entram na geometria da ligação. */
function componente(sobre: Partial<Component> = {}): Component {
  return {
    id: 'c1',
    kind: 'component',
    familyId: 'f1',
    typeId: null,
    levelId: 'n0',
    order: 0,
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    mirrored: false,
    mark: 'C1',
    ...sobre,
  };
}

/** Ligação resolvida (sem mundo) para os testes de `ligacaoNoMundo`. */
function ligResolvida(sobre: Partial<LigacaoResolvida> = {}): LigacaoResolvida {
  return {
    id: 'l1',
    nome: 'Entrada',
    dominio: 'agua_fria',
    sistema: null,
    secao: 'redonda',
    posicao: [0, 0, 0],
    direcao: [1, 0, 0],
    diametro: 0.05,
    largura: 0,
    altura: 0,
    fluxo: 'ambos',
    aceita: ['agua_fria'],
    propriedades: {},
    propagaParametro: null,
    ...sobre,
  };
}

/** Direção a `graus` do eixo X negativo, girada no plano XY (sentido horário a partir de (−1,0,0)). */
function opostaA(graus: number): [number, number, number] {
  const r = (graus * Math.PI) / 180;
  return [-Math.cos(r), Math.sin(r), 0];
}

describe('ligacoesCompativeis (N8)', () => {
  it('agua_fria DN50 de frente para agua_fria DN50 é compatível', () => {
    const a = ligNoMundo({ direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: true });
  });

  it('DN50 com DN75 recusa por bitola', () => {
    const a = ligNoMundo({ direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ direcaoMundo: [-1, 0, 0], diametro: 0.075 });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'bitolas diferentes' });
  });

  it('agua_fria com esgoto recusa por domínio', () => {
    const a = ligNoMundo({ direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ dominio: 'esgoto', aceita: ['esgoto'], direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'domínios incompatíveis' });
  });

  it('direções iguais recusam por não apontarem uma para a outra', () => {
    const a = ligNoMundo({ direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ direcaoMundo: [1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'ligações precisam apontar uma para a outra' });
  });

  it('redonda com retangular recusa por seção', () => {
    const a = ligNoMundo({ direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ secao: 'retangular', diametro: 0, largura: 0.2, altura: 0.1, direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'seções diferentes' });
  });

  it('domínio vale nos dois sentidos: se b não aceita o domínio de a, recusa', () => {
    const a = ligNoMundo({ aceita: ['agua_fria', 'esgoto'], direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ aceita: ['agua_quente'], direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'domínios incompatíveis' });
  });

  it('a ordem das regras vale: domínio antes de bitola', () => {
    const a = ligNoMundo({ direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ dominio: 'esgoto', aceita: ['esgoto'], diametro: 0.075, direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'domínios incompatíveis' });
  });

  it('retangular compatível quando largura e altura batem', () => {
    const r = { secao: 'retangular' as const, diametro: 0, largura: 0.2, altura: 0.1 };
    const a = ligNoMundo({ ...r, direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ ...r, direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: true });
  });

  it('retangular com altura diferente recusa por bitola', () => {
    const a = ligNoMundo({ secao: 'retangular', largura: 0.2, altura: 0.1, diametro: 0, direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ secao: 'retangular', largura: 0.2, altura: 0.11, diametro: 0, direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'bitolas diferentes' });
  });

  it('tolerância de 0,5 mm nas medidas: 0,4 mm passa, 0,6 mm recusa', () => {
    const a = ligNoMundo({ diametro: 0.05, direcaoMundo: [1, 0, 0] });
    const perto = ligNoMundo({ diametro: 0.0504, direcaoMundo: [-1, 0, 0] });
    const longe = ligNoMundo({ diametro: 0.0506, direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, perto)).toEqual({ ok: true });
    expect(ligacoesCompativeis(a, longe)).toEqual({ ok: false, motivo: 'bitolas diferentes' });
  });

  it('tolerância de 0,5 mm vale também para largura e altura', () => {
    const a = ligNoMundo({ secao: 'retangular', largura: 0.2, altura: 0.1, diametro: 0, direcaoMundo: [1, 0, 0] });
    const ok = ligNoMundo({ secao: 'retangular', largura: 0.2004, altura: 0.0996, diametro: 0, direcaoMundo: [-1, 0, 0] });
    const nao = ligNoMundo({ secao: 'retangular', largura: 0.2006, altura: 0.1, diametro: 0, direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, ok)).toEqual({ ok: true });
    expect(ligacoesCompativeis(a, nao)).toEqual({ ok: false, motivo: 'bitolas diferentes' });
  });

  it('direção a 2° passa e a 5° não', () => {
    const a = ligNoMundo({ direcaoMundo: [1, 0, 0] });
    const dois = ligNoMundo({ direcaoMundo: opostaA(2) });
    const cinco = ligNoMundo({ direcaoMundo: opostaA(5) });
    expect(ligacoesCompativeis(a, dois)).toEqual({ ok: true });
    expect(ligacoesCompativeis(a, cinco)).toEqual({ ok: false, motivo: 'ligações precisam apontar uma para a outra' });
  });

  it('entrada com entrada recusa por fluxo', () => {
    const a = ligNoMundo({ fluxo: 'entrada', direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ fluxo: 'entrada', direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'fluxos incompatíveis' });
  });

  it('saída com saída recusa por fluxo', () => {
    const a = ligNoMundo({ fluxo: 'saida', direcaoMundo: [1, 0, 0] });
    const b = ligNoMundo({ fluxo: 'saida', direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'fluxos incompatíveis' });
  });

  it('entrada com saída casa, e ambos casa com qualquer fluxo', () => {
    const entrada = ligNoMundo({ fluxo: 'entrada', direcaoMundo: [1, 0, 0] });
    const saida = ligNoMundo({ fluxo: 'saida', direcaoMundo: [-1, 0, 0] });
    const ambos = ligNoMundo({ fluxo: 'ambos', direcaoMundo: [-1, 0, 0] });
    expect(ligacoesCompativeis(entrada, saida)).toEqual({ ok: true });
    expect(ligacoesCompativeis(entrada, ambos)).toEqual({ ok: true });
    const ambosOposto = ligNoMundo({ fluxo: 'ambos', direcaoMundo: [1, 0, 0] });
    expect(ligacoesCompativeis(ambos, ambosOposto)).toEqual({ ok: true });
  });
});

describe('encaixarLigacoes', () => {
  const alvo = ligNoMundo({ posicaoMundo: [0, 0, 0], direcaoMundo: [1, 0, 0] });
  const frente = (sobre: Partial<LigacaoNoMundo>): LigacaoNoMundo => ligNoMundo({ direcaoMundo: [-1, 0, 0], ...sobre });

  it('escolhe a compatível mais próxima dentro de 50 mm e devolve o deslocamento', () => {
    const longe = frente({ id: 'longe', posicaoMundo: [0.03, 0, 0] });
    const perto = frente({ id: 'perto', posicaoMundo: [0.01, 0, 0] });
    const r = encaixarLigacoes(alvo, [longe, perto]);
    expect(r?.candidata.id).toBe('perto');
    expect(r?.deslocamento).toEqual([0.01, 0, 0]);
  });

  it('ignora a candidata mais próxima se ela não for compatível', () => {
    const errada = frente({ id: 'errada', posicaoMundo: [0.001, 0, 0], diametro: 0.075 });
    const boa = frente({ id: 'boa', posicaoMundo: [0.04, 0.02, 0] });
    const r = encaixarLigacoes(alvo, [errada, boa]);
    expect(r?.candidata.id).toBe('boa');
    expect(r?.deslocamento[0]).toBeCloseTo(0.04, 12);
    expect(r?.deslocamento[1]).toBeCloseTo(0.02, 12);
  });

  it('não encaixa nenhuma candidata fora da tolerância', () => {
    const fora = frente({ posicaoMundo: [0.06, 0, 0] });
    expect(encaixarLigacoes(alvo, [fora])).toBeNull();
  });

  it('tolerância passada explicitamente vale no lugar da padrão', () => {
    const c = frente({ posicaoMundo: [0.03, 0, 0] });
    expect(encaixarLigacoes(alvo, [c], 0.01)).toBeNull();
    expect(encaixarLigacoes(alvo, [c], 0.04)?.candidata.id).toBe(c.id);
  });

  it('sem candidatas devolve null', () => {
    expect(encaixarLigacoes(alvo, [])).toBeNull();
  });
});

describe('ligacaoNoMundo', () => {
  it('posição e direção com rotação de 90° em torno de Z e translação', () => {
    const c = componente({ x: 1, y: 2, z: 3, rotation: Math.PI / 2 });
    const m = ligacaoNoMundo(ligResolvida({ posicao: [1, 0, 0], direcao: [1, 0, 0] }), c);
    expect(m.posicaoMundo[0]).toBeCloseTo(1, 12);
    expect(m.posicaoMundo[1]).toBeCloseTo(3, 12);
    expect(m.posicaoMundo[2]).toBeCloseTo(3, 12);
    expect(m.direcaoMundo[0]).toBeCloseTo(0, 12);
    expect(m.direcaoMundo[1]).toBeCloseTo(1, 12);
    expect(m.direcaoMundo[2]).toBeCloseTo(0, 12);
  });

  it('a direção não recebe a translação do componente', () => {
    const c = componente({ x: 5, y: -4, z: 2 });
    const m = ligacaoNoMundo(ligResolvida({ direcao: [0, 0, -1] }), c);
    expect(m.direcaoMundo).toEqual([0, 0, -1]);
    expect(m.posicaoMundo).toEqual([5, -4, 2]);
  });

  it('espelhado troca o sinal do X local', () => {
    const c = componente({ mirrored: true });
    const m = ligacaoNoMundo(ligResolvida({ posicao: [0.5, 0.2, 0], direcao: [1, 0, 0] }), c);
    expect(m.posicaoMundo[0]).toBeCloseTo(-0.5, 12);
    expect(m.posicaoMundo[1]).toBeCloseTo(0.2, 12);
    expect(m.direcaoMundo[0]).toBeCloseTo(-1, 12);
  });

  it('mantém os campos da ligação resolvida', () => {
    const lig = ligResolvida({ id: 'x9', diametro: 0.032 });
    const m = ligacaoNoMundo(lig, componente());
    expect(m.id).toBe('x9');
    expect(m.diametro).toBe(0.032);
  });
});
