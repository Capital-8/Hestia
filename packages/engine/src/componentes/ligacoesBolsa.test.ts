import { describe, expect, it } from 'vitest';
import { BIBLIOTECA_MEP, FAMILIA_ARMARIO, validarFamilia, type Familia } from '@hestia/model';
import { ligacoesCompativeis, type LigacaoNoMundo } from './ligacoesEncaixe.ts';
import { resolverFamilia } from './resolver.ts';

/*
 * Ficha P1: encaixe físico das ligações (bolsa × ponta). Sem `encaixe` nada muda; com ele, bolsa só encaixa em ponta (salvo
 * `aceitaMesmoTipo`). O motor resolve a profundidade da bolsa em metros.
 */

const base = (id: string, tipo: 'bolsa' | 'ponta' | undefined, extra: Partial<LigacaoNoMundo> = {}): LigacaoNoMundo => ({
  id, nome: id, dominio: 'esgoto', sistema: null, secao: 'redonda', posicao: [0, 0, 0], direcao: [0, 0, 1], diametro: 0.1016, largura: 0, altura: 0,
  fluxo: 'ambos', aceita: ['esgoto'], propriedades: {}, propagaParametro: null, posicaoMundo: [0, 0, 0], direcaoMundo: [0, 0, 1],
  ...(tipo ? { encaixe: { tipo, profundidade: tipo === 'bolsa' ? 0.05 : 0, aceitaMesmoTipo: false } } : {}),
  ...extra,
});
const oposta = (l: LigacaoNoMundo): LigacaoNoMundo => ({ ...l, direcaoMundo: [0, 0, -1] });

describe('P1: compatibilidade bolsa × ponta', () => {
  it('bolsa encaixa em ponta (nos dois sentidos)', () => {
    expect(ligacoesCompativeis(base('a', 'bolsa'), oposta(base('b', 'ponta')))).toEqual({ ok: true });
    expect(ligacoesCompativeis(base('a', 'ponta'), oposta(base('b', 'bolsa')))).toEqual({ ok: true });
  });
  it('bolsa com bolsa e ponta com ponta são recusadas, com motivo fixo', () => {
    expect(ligacoesCompativeis(base('a', 'bolsa'), oposta(base('b', 'bolsa')))).toEqual({ ok: false, motivo: 'bolsa não encaixa em bolsa' });
    expect(ligacoesCompativeis(base('a', 'ponta'), oposta(base('b', 'ponta')))).toEqual({ ok: false, motivo: 'ponta não encaixa em ponta' });
  });
  it('aceitaMesmoTipo libera (luva dupla, manga de correr)', () => {
    const luva = base('l', 'bolsa', { encaixe: { tipo: 'bolsa', profundidade: 0.05, aceitaMesmoTipo: true } });
    expect(ligacoesCompativeis(luva, oposta(base('b', 'bolsa')))).toEqual({ ok: true });
  });
  it('sem encaixe em alguma das duas, a regra não vale (ligações antigas seguem casando)', () => {
    expect(ligacoesCompativeis(base('a', undefined), oposta(base('b', 'bolsa')))).toEqual({ ok: true });
    expect(ligacoesCompativeis(base('a', undefined), oposta(base('b', undefined)))).toEqual({ ok: true });
  });
  it('as regras anteriores continuam valendo antes da do encaixe (bitola)', () => {
    expect(ligacoesCompativeis(base('a', 'bolsa'), oposta(base('b', 'ponta', { diametro: 0.075 })))).toEqual({ ok: false, motivo: 'bitolas diferentes' });
  });
});

const tuboKrona = (): Familia => {
  const f = BIBLIOTECA_MEP.find((x) => x.id === 'fam_krona_esgoto_tubo');
  if (!f) throw new Error('tubo da Krona ausente');
  return f;
};

describe('P1: resolução e validação do encaixe', () => {
  it('o motor resolve a profundidade da bolsa em metros e a ponta com 0', () => {
    const r = resolverFamilia(tuboKrona(), { tipoId: 'dn100' });
    expect(r.erros).toEqual([]);
    const [a, b] = r.ligacoes ?? [];
    expect(a?.encaixe).toEqual({ tipo: 'bolsa', profundidade: 0.05, aceitaMesmoTipo: false });
    expect(b?.encaixe).toEqual({ tipo: 'ponta', profundidade: 0, aceitaMesmoTipo: false });
  });
  it('a ponta do tubo encaixa na bolsa do tubo seguinte (mesmo De, direções opostas)', () => {
    const r = resolverFamilia(tuboKrona(), { tipoId: 'dn100' });
    const [a, b] = r.ligacoes ?? [];
    if (!a || !b) throw new Error('ligações ausentes');
    const bolsa = { ...a, posicaoMundo: a.posicao, direcaoMundo: a.direcao };
    const ponta = { ...b, posicaoMundo: b.posicao, direcaoMundo: [0, 0, 1] as [number, number, number] };
    expect(ligacoesCompativeis(ponta, bolsa)).toEqual({ ok: true });
    expect(ligacoesCompativeis(bolsa, { ...a, posicaoMundo: a.posicao, direcaoMundo: [0, 0, 1] })).toEqual({ ok: false, motivo: 'bolsa não encaixa em bolsa' });
  });
  it('validação: bolsa sem profundidade, ponta com profundidade e tipo desconhecido são erros', () => {
    const mexer = (encaixe: unknown): string[] => {
      const f = tuboKrona();
      const ligacoes = (f.ligacoes ?? []).map((l, i) => (i === 0 ? { ...l, encaixe: encaixe as never } : l));
      return validarFamilia({ ...f, ligacoes }).filter((p) => p.nivel === 'erro').map((p) => p.onde);
    };
    expect(mexer({ tipo: 'bolsa' })).toContain('ligacao:a.encaixe.profundidade');
    expect(mexer({ tipo: 'ponta', profundidade: 'B' })).toContain('ligacao:a.encaixe.profundidade');
    expect(mexer({ tipo: 'luva' })).toContain('ligacao:a.encaixe.tipo');
    expect(mexer({ tipo: 'bolsa', profundidade: 'B' })).toEqual([]);
    expect(mexer({ tipo: 'bolsa', profundidade: 'inexistente + 1' }).length).toBeGreaterThan(0);
  });
  it('família sem ligações não é afetada', () => {
    expect(validarFamilia(FAMILIA_ARMARIO).filter((p) => p.nivel === 'erro')).toEqual([]);
  });
});

import { afastamentoDoPar, comprimentoDeCorte, encaixarLigacoes, posicaoDaPontaNaBolsa } from './ligacoesEncaixe.ts';

/*
 * Ficha P2: o tubo ENTRA na bolsa. A ponta fica `profundidade` para dentro da abertura; o afastamento da conexão é medido contra
 * essa posição (ponta parada na abertura = profundidade inteira de afastamento), e o encaixe leva o tubo até lá.
 */

// Bolsa na origem apontando para +Z (para fora do corpo), profundidade 50 mm. A ponta do tubo vem de fora, apontando para −Z.
const bolsaZ = (): LigacaoNoMundo => base('bolsa', 'bolsa', { posicaoMundo: [0, 0, 0], direcaoMundo: [0, 0, 1] });
const pontaEm = (z: number): LigacaoNoMundo => base('ponta', 'ponta', { posicaoMundo: [0, 0, z], direcaoMundo: [0, 0, -1] });

describe('P2: a ponta entra na bolsa', () => {
  it('a posição certa da ponta é a abertura recuada pela profundidade, para dentro', () => {
    expect(posicaoDaPontaNaBolsa(bolsaZ())).toEqual([0, 0, -0.05]);
  });
  it('ponta na profundidade certa: afastamento 0; parada na abertura: a profundidade inteira', () => {
    expect(afastamentoDoPar(bolsaZ(), pontaEm(-0.05))).toBeCloseTo(0, 12);
    expect(afastamentoDoPar(pontaEm(0), bolsaZ())).toBeCloseTo(0.05, 12);
    expect(afastamentoDoPar(bolsaZ(), pontaEm(-0.02))).toBeCloseTo(0.03, 12);
  });
  it('sem encaixe nas duas (ou bolsa sem profundidade) vale a distância simples de sempre', () => {
    expect(afastamentoDoPar(base('a', undefined), base('b', undefined, { posicaoMundo: [0, 0, 0.003] }))).toBeCloseTo(0.003, 12);
    const rasa = base('r', 'bolsa', { encaixe: { tipo: 'bolsa', profundidade: 0, aceitaMesmoTipo: false } });
    expect(afastamentoDoPar(rasa, pontaEm(0.004))).toBeCloseTo(0.004, 12);
  });
  it('fora do alcance (considerando a profundidade) não encaixa: 80 mm da posição certa passa dos 50 mm de tolerância', () => {
    expect(encaixarLigacoes(pontaEm(0.03), [bolsaZ()])).toBeNull();
  });
  it('encaixar leva o tubo (alvo = ponta) até dentro da bolsa; afastamento final 0', () => {
    const alvo = pontaEm(-0.03);
    const r = encaixarLigacoes(alvo, [bolsaZ()]);
    expect(r).not.toBeNull();
    const [dx = NaN, dy = NaN, dz = NaN] = r?.deslocamento ?? [];
    expect([dx, dy]).toEqual([0, 0]);
    expect(dz).toBeCloseTo(-0.05 + 0.03, 12);
    const movida = { ...alvo, posicaoMundo: [alvo.posicaoMundo[0] + dx, alvo.posicaoMundo[1] + dy, alvo.posicaoMundo[2] + dz] as [number, number, number] };
    expect(afastamentoDoPar(movida, bolsaZ())).toBeCloseTo(0, 12);
  });
  it('encaixar leva a peça com bolsa (alvo = bolsa) até a ponta ficar dentro dela', () => {
    const ponta = pontaEm(-0.2);
    const alvo = base('bolsa', 'bolsa', { posicaoMundo: [0, 0, -0.14], direcaoMundo: [0, 0, 1] });
    const r = encaixarLigacoes(alvo, [ponta]);
    const dz = r?.deslocamento[2] ?? NaN;
    // O alvo tem de ir para onde a ponta (em −0,2) fique 0,05 para dentro: abertura em −0,2 + 0,05 = −0,15.
    expect(alvo.posicaoMundo[2] + dz).toBeCloseTo(-0.15, 12);
    const movida = { ...alvo, posicaoMundo: [0, 0, alvo.posicaoMundo[2] + dz] as [number, number, number] };
    expect(afastamentoDoPar(movida, ponta)).toBeCloseTo(0, 12);
  });
  it('encaixe sem bolsa mantém o deslocamento de sempre (até a posição da candidata)', () => {
    const r = encaixarLigacoes(base('a', undefined, { posicaoMundo: [0, 0, 0.01] }), [oposta(base('b', undefined, { posicaoMundo: [0, 0, 0] }))]);
    expect(r?.deslocamento[2]).toBeCloseTo(-0.01, 12);
  });
  it('comprimento de corte = distância entre aberturas + o que entra em cada bolsa', () => {
    expect(comprimentoDeCorte(1, 0.05, 0.045)).toBeCloseTo(1.095, 12);
    expect(comprimentoDeCorte(1, 0.05)).toBeCloseTo(1.05, 12);
    expect(comprimentoDeCorte(1)).toBe(1);
    expect(comprimentoDeCorte(1, -1)).toBe(1);
  });
});
