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
