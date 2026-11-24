import { describe, expect, it } from 'vitest';
import { encaixarLigacoes, ligacoesCompativeis, type LigacaoNoMundo } from './ligacoesEncaixe';

/*
 * Teste CEGO (ADR 0061, ficha C4-cego): escrito só a partir de CONTRATO.md §3 e §10 (N8) e dos tipos
 * de `corposTipos.ts`. Não lê a implementação. Valores em metros; direções unitárias no MUNDO.
 */

const DN50 = 0.05;
const DN75 = 0.075;
const MM = 0.001;

/** Ligação de teste: campos locais iguais aos do mundo, salvo sobrescritos. */
function ligacao(sobrescrever: Partial<LigacaoNoMundo> = {}): LigacaoNoMundo {
  return {
    id: 'l1',
    nome: 'L1',
    dominio: 'agua_fria',
    sistema: null,
    secao: 'redonda',
    posicao: [0, 0, 0],
    direcao: [1, 0, 0],
    diametro: DN50,
    largura: 0,
    altura: 0,
    fluxo: 'ambos',
    aceita: ['agua_fria'],
    propriedades: {},
    propagaParametro: null,
    posicaoMundo: [0, 0, 0],
    direcaoMundo: [1, 0, 0],
    ...sobrescrever,
  };
}

/** Par de ligações voltadas uma para a outra (direções opostas no eixo X), DN50 e compatíveis. */
function par(a: Partial<LigacaoNoMundo> = {}, b: Partial<LigacaoNoMundo> = {}) {
  return {
    a: ligacao({ id: 'a', ...a }),
    b: ligacao({ id: 'b', direcaoMundo: [-1, 0, 0], direcao: [-1, 0, 0], ...b }),
  };
}

/** Direção unitária de `b` que faz `graus` com a oposta exata de `a = (1,0,0)`. */
function direcaoDesviada(graus: number): [number, number, number] {
  const r = (graus * Math.PI) / 180;
  return [-Math.cos(r), Math.sin(r), 0];
}

describe('ligacoesCompativeis (N8)', () => {
  it('aceita agua_fria DN50 com agua_fria DN50 voltadas uma para a outra', () => {
    const { a, b } = par();
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: true });
  });

  it('recusa DN50 com DN75 com o motivo "bitolas diferentes"', () => {
    const { a, b } = par({}, { diametro: DN75 });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'bitolas diferentes' });
  });

  it('recusa agua_fria com esgoto com o motivo "domínios incompatíveis"', () => {
    const { a, b } = par({ aceita: ['agua_fria'] }, { dominio: 'esgoto', aceita: ['esgoto'] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'domínios incompatíveis' });
  });

  it('recusa direções iguais com o motivo "ligações precisam apontar uma para a outra"', () => {
    const { a, b } = par({}, { direcaoMundo: [1, 0, 0], direcao: [1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({
      ok: false,
      motivo: 'ligações precisam apontar uma para a outra',
    });
  });
});

describe('ligacoesCompativeis: domínio (regra 1)', () => {
  it('exige que a aceite o domínio de b e b aceite o de a', () => {
    const { a, b } = par({ aceita: ['agua_fria', 'esgoto'] }, { dominio: 'esgoto', aceita: ['esgoto'] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'domínios incompatíveis' });
  });

  it('aceita quando a aceita o domínio de b e b aceita o de a', () => {
    const { a, b } = par({ aceita: ['agua_fria', 'esgoto'] }, { dominio: 'esgoto', aceita: ['agua_fria', 'esgoto'] });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: true });
  });
});

describe('ligacoesCompativeis: seção (regra 2)', () => {
  it('recusa redonda com retangular com o motivo "seções diferentes"', () => {
    const { a, b } = par({}, { secao: 'retangular', diametro: 0, largura: DN50, altura: DN50 });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'seções diferentes' });
  });

  it('aceita retangular 50 × 30 com retangular 50 × 30', () => {
    const medidas = { secao: 'retangular' as const, diametro: 0, largura: 0.05, altura: 0.03 };
    const { a, b } = par(medidas, medidas);
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: true });
  });
});

describe('ligacoesCompativeis: medidas com tolerância de 0,5 mm (regra 3)', () => {
  it('aceita diâmetros que diferem 0,4 mm', () => {
    const { a, b } = par({}, { diametro: DN50 + 0.4 * MM });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: true });
  });

  it('recusa diâmetros que diferem 0,6 mm', () => {
    const { a, b } = par({}, { diametro: DN50 + 0.6 * MM });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'bitolas diferentes' });
  });

  it('retangular: recusa se só a altura diferir 0,6 mm', () => {
    const a = ligacao({ id: 'a', secao: 'retangular', diametro: 0, largura: 0.05, altura: 0.03 });
    const b = ligacao({
      id: 'b',
      secao: 'retangular',
      diametro: 0,
      largura: 0.05,
      altura: 0.03 + 0.6 * MM,
      direcaoMundo: [-1, 0, 0],
      direcao: [-1, 0, 0],
    });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'bitolas diferentes' });
  });

  it.skip('AMBIGUIDADE: diferença de exatamente 0,5 mm é aceita ou recusada? O CONTRATO diz "tolerância de 0,5 mm" sem dizer se o limite é inclusivo.', () => {
    // AMBIGUIDADE: limite inclusivo (<=) ou exclusivo (<) não está definido. Não cravar até o orquestrador arbitrar.
    const { a, b } = par({}, { diametro: DN50 + 0.5 * MM });
    expect(ligacoesCompativeis(a, b).ok).toBe(true);
  });
});

describe('ligacoesCompativeis: direções opostas com ≈ 2,5° (regra 4)', () => {
  it('aceita desvio de 2,0° da oposição exata', () => {
    const { a, b } = par({}, { direcaoMundo: direcaoDesviada(2.0) });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: true });
  });

  it('aceita desvio de 2,5°', () => {
    const { a, b } = par({}, { direcaoMundo: direcaoDesviada(2.5) });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: true });
  });

  it('recusa desvio de 3,0°', () => {
    const { a, b } = par({}, { direcaoMundo: direcaoDesviada(3.0) });
    expect(ligacoesCompativeis(a, b)).toEqual({
      ok: false,
      motivo: 'ligações precisam apontar uma para a outra',
    });
  });

  it('recusa desvio de 2,6°', () => {
    const { a, b } = par({}, { direcaoMundo: direcaoDesviada(2.6) });
    expect(ligacoesCompativeis(a, b)).toEqual({
      ok: false,
      motivo: 'ligações precisam apontar uma para a outra',
    });
  });

  it('usa a direção do MUNDO, não a local (direcao local oposta não basta)', () => {
    // Local: a e b opostos. Mundo: direções iguais. Deve recusar.
    const a = ligacao({ id: 'a', direcao: [1, 0, 0], direcaoMundo: [1, 0, 0] });
    const b = ligacao({ id: 'b', direcao: [-1, 0, 0], direcaoMundo: [1, 0, 0] });
    expect(ligacoesCompativeis(a, b)).toEqual({
      ok: false,
      motivo: 'ligações precisam apontar uma para a outra',
    });
  });

  it.skip('AMBIGUIDADE: o limiar -0,999 do CONTRATO corresponde a ≈ 2,56°, não 2,5°; o limite exato não está cravado', () => {
    // AMBIGUIDADE: "≈ 2,5°" versus "a·b ≤ −0,999" (arccos(0,999) ≈ 2,56°). Qual valor de referência vale?
    const { a, b } = par({}, { direcaoMundo: direcaoDesviada(2.55) });
    expect(ligacoesCompativeis(a, b).ok).toBe(true);
  });
});

describe('ligacoesCompativeis: fluxo (regra 5)', () => {
  it('recusa entrada com entrada com o motivo "fluxos incompatíveis"', () => {
    const { a, b } = par({ fluxo: 'entrada' }, { fluxo: 'entrada' });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'fluxos incompatíveis' });
  });

  it('recusa saida com saida com o motivo "fluxos incompatíveis"', () => {
    const { a, b } = par({ fluxo: 'saida' }, { fluxo: 'saida' });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: false, motivo: 'fluxos incompatíveis' });
  });

  it('aceita entrada com saida', () => {
    const { a, b } = par({ fluxo: 'entrada' }, { fluxo: 'saida' });
    expect(ligacoesCompativeis(a, b)).toEqual({ ok: true });
  });

  it('aceita ambos com entrada, saida e ambos', () => {
    for (const outro of ['entrada', 'saida', 'ambos'] as const) {
      const { a, b } = par({ fluxo: 'ambos' }, { fluxo: outro });
      expect(ligacoesCompativeis(a, b)).toEqual({ ok: true });
      const { a: a2, b: b2 } = par({ fluxo: outro }, { fluxo: 'ambos' });
      expect(ligacoesCompativeis(a2, b2)).toEqual({ ok: true });
    }
  });

  it.skip('AMBIGUIDADE: ordem de precedência dos motivos quando duas regras falham ao mesmo tempo', () => {
    // AMBIGUIDADE: o CONTRATO não define qual motivo vale quando bitola E domínio falham juntos.
    const { a, b } = par({}, { diametro: DN75, dominio: 'esgoto', aceita: ['esgoto'] });
    expect(ligacoesCompativeis(a, b).ok).toBe(false);
  });
});

describe('encaixarLigacoes', () => {
  it('devolve null sem candidatas', () => {
    expect(encaixarLigacoes(ligacao({ id: 'alvo' }), [])).toBeNull();
  });

  it('devolve null quando a única candidata compatível está além de 50 mm', () => {
    const alvo = ligacao({ id: 'alvo', posicaoMundo: [0, 0, 0] });
    const longe = ligacao({ id: 'c', posicaoMundo: [0.06, 0, 0], direcaoMundo: [-1, 0, 0] });
    expect(encaixarLigacoes(alvo, [longe])).toBeNull();
  });

  it('aceita candidata a 49 mm e recusa a 51 mm (tolerância padrão de 50 mm)', () => {
    const alvo = ligacao({ id: 'alvo', posicaoMundo: [0, 0, 0] });
    const perto = ligacao({ id: 'perto', posicaoMundo: [0.049, 0, 0], direcaoMundo: [-1, 0, 0] });
    const fora = ligacao({ id: 'fora', posicaoMundo: [0.051, 0, 0], direcaoMundo: [-1, 0, 0] });
    expect(encaixarLigacoes(alvo, [fora])).toBeNull();
    expect(encaixarLigacoes(alvo, [perto])?.candidata.id).toBe('perto');
  });

  it.skip('AMBIGUIDADE: distância de exatamente 50 mm é inclusiva ou exclusiva?', () => {
    // AMBIGUIDADE: o CONTRATO diz "dentro de tolerância de 50 mm" sem definir o limite.
    const alvo = ligacao({ id: 'alvo', posicaoMundo: [0, 0, 0] });
    const limite = ligacao({ id: 'limite', posicaoMundo: [0.05, 0, 0], direcaoMundo: [-1, 0, 0] });
    expect(encaixarLigacoes(alvo, [limite])).not.toBeNull();
  });

  it('escolhe a candidata compatível mais próxima (3D)', () => {
    const alvo = ligacao({ id: 'alvo', posicaoMundo: [1, 2, 3] });
    const de30 = ligacao({ id: 'de30', posicaoMundo: [1, 2, 3.03], direcaoMundo: [-1, 0, 0] });
    const de10 = ligacao({ id: 'de10', posicaoMundo: [1.01, 2, 3], direcaoMundo: [-1, 0, 0] });
    const resultado = encaixarLigacoes(alvo, [de30, de10]);
    expect(resultado?.candidata.id).toBe('de10');
  });

  it('ignora candidata incompatível mesmo que seja a mais próxima', () => {
    const alvo = ligacao({ id: 'alvo', posicaoMundo: [0, 0, 0] });
    const incompativelPerto = ligacao({
      id: 'x',
      posicaoMundo: [0.005, 0, 0],
      direcaoMundo: [-1, 0, 0],
      diametro: DN75,
    });
    const compativelLonge = ligacao({ id: 'ok', posicaoMundo: [0.02, 0, 0], direcaoMundo: [-1, 0, 0] });
    expect(encaixarLigacoes(alvo, [incompativelPerto, compativelLonge])?.candidata.id).toBe('ok');
  });

  it('devolve o deslocamento que leva a posição do alvo à da candidata', () => {
    const alvo = ligacao({ id: 'alvo', posicaoMundo: [1, 2, 3] });
    const candidata = ligacao({ id: 'c', posicaoMundo: [1.01, 2, 3.02], direcaoMundo: [-1, 0, 0] });
    const resultado = encaixarLigacoes(alvo, [candidata]);
    expect(resultado).not.toBeNull();
    const [dx, dy, dz] = resultado?.deslocamento ?? [NaN, NaN, NaN];
    expect(dx).toBeCloseTo(0.01, 9);
    expect(dy).toBeCloseTo(0, 9);
    expect(dz).toBeCloseTo(0.02, 9);
  });

  it('respeita tolerância informada no lugar do padrão', () => {
    const alvo = ligacao({ id: 'alvo', posicaoMundo: [0, 0, 0] });
    const candidata = ligacao({ id: 'c', posicaoMundo: [0.02, 0, 0], direcaoMundo: [-1, 0, 0] });
    expect(encaixarLigacoes(alvo, [candidata], 0.01)).toBeNull();
    expect(encaixarLigacoes(alvo, [candidata], 0.03)?.candidata.id).toBe('c');
  });

  it('não encaixa candidata de domínio incompatível mesmo dentro da tolerância', () => {
    const alvo = ligacao({ id: 'alvo', posicaoMundo: [0, 0, 0] });
    const esgoto = ligacao({
      id: 'e',
      dominio: 'esgoto',
      aceita: ['esgoto'],
      posicaoMundo: [0.001, 0, 0],
      direcaoMundo: [-1, 0, 0],
    });
    expect(encaixarLigacoes(alvo, [esgoto])).toBeNull();
  });
});
