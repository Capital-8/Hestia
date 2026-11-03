import { describe, expect, it } from 'vitest';
import { deColunas, EIXOS, FACES, metaDasPecas, PAPEIS, paraColunas, TIPOS_USINAGEM, validarColunas, type ColunasPecas } from './colunas.ts';
import type { PecaResolvida } from './pecas.ts';

const base = (extra: Partial<PecaResolvida>): PecaResolvida => ({
  id: 'p', nome: 'P', indice: 1, papel: 'painel', eixo: 'z', vazio: false, origem: [0, 0, 0], tamanho: [0.5, 0.4], espessura: 0.018,
  extensao: [0.5, 0.4, 0.018], contorno: null, material: null, fita: null, veio: null, grupo: null, deAninhado: null, chapa: null, usinagens: [], ...extra,
});
const amostra: PecaResolvida[] = [
  base({ id: 'latE', nome: 'Lateral esquerda', papel: 'lateral', eixo: 'x', origem: [0, 0, 0.1], tamanho: [0.56, 0.62], espessura: 0.018, extensao: [0.018, 0.56, 0.62], material: 'mdf18', fita: { n: 'fita_pvc' }, veio: 'b' }),
  base({ id: 'prat', nome: 'Prateleira 1', indice: 1, papel: 'prateleira', origem: [0.018, 0.02, 0.3], tamanho: [0.764, 0.5], extensao: [0.764, 0.5, 0.018], material: 'mdf18', veio: 'a', grupo: 'miolo' }),
  base({ id: 'prat', nome: 'Prateleira 2', indice: 2, papel: 'prateleira', origem: [0.018, 0.02, 0.5], tamanho: [0.764, 0.5], extensao: [0.764, 0.5, 0.018] }),
  base({ id: 'tampo', nome: 'Tampo L', papel: 'tampo', contorno: [0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2], tamanho: [2, 2], extensao: [2, 2, 0.025], espessura: 0.025, deAninhado: 'n1' }),
  base({ id: 'vz', nome: 'Vazio', papel: 'generica', vazio: true, fita: { n: 'a', s: 'b', l: 'c', o: 'd' }, veio: 'livre' }),
];

describe('tabelas fixas', () => {
  it('papéis e eixos têm códigos estáveis e sem repetição', () => {
    expect(new Set(PAPEIS).size).toBe(PAPEIS.length);
    expect(PAPEIS.slice(0, 3)).toEqual(['lateral', 'base', 'topo']);
    expect(PAPEIS.at(-1)).toBe('generica');
    expect([...EIXOS]).toEqual(['x', 'y', 'z']);
  });
});

describe('paraColunas', () => {
  it('layout: tamanhos, ids internados, códigos e contornos concatenados', () => {
    const c = paraColunas(amostra);
    expect(c.n).toBe(5);
    expect(c.ids).toEqual(['latE', 'prat', 'tampo', 'vz']);
    expect([...c.idNum]).toEqual([0, 1, 1, 2, 3]);
    expect([...c.indice]).toEqual([1, 1, 2, 1, 1]);
    expect([...c.papel]).toEqual([PAPEIS.indexOf('lateral'), PAPEIS.indexOf('prateleira'), PAPEIS.indexOf('prateleira'), PAPEIS.indexOf('tampo'), PAPEIS.indexOf('generica')]);
    expect([...c.eixo]).toEqual([0, 2, 2, 2, 2]);
    expect([...c.vazio]).toEqual([0, 0, 0, 0, 1]);
    expect(c.origem).toHaveLength(15);
    expect(c.tamanho).toHaveLength(10);
    expect(c.espessura).toHaveLength(5);
    expect(c.extensao).toHaveLength(15);
    expect([...c.origem.slice(0, 3)]).toEqual([0, 0, 0.1]);
    expect([...c.contornoN]).toEqual([0, 0, 0, 6, 0]);
    expect(c.contornoIni[3]).toBe(0);
    expect([...c.contornoDados]).toEqual([0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2]);
    expect(c.origem).toBeInstanceOf(Float64Array);
    expect(c.idNum).toBeInstanceOf(Uint32Array);
    expect(c.papel).toBeInstanceOf(Uint8Array);
  });
  it('vários contornos: contornoIni aponta para o início certo de cada um', () => {
    const tri = [0, 0, 1, 0, 0, 1];
    const c = paraColunas([base({ id: 'a', contorno: tri }), base({ id: 'b' }), base({ id: 'c', contorno: [0, 0, 2, 0, 2, 2, 0, 2] })]);
    expect([...c.contornoN]).toEqual([3, 0, 4]);
    expect(c.contornoIni[0]).toBe(0);
    expect(c.contornoIni[2]).toBe(6);
    expect([...c.contornoDados.slice(6, 14)]).toEqual([0, 0, 2, 0, 2, 2, 0, 2]);
  });
  it('lista vazia', () => {
    const c = paraColunas([]);
    expect(c.n).toBe(0);
    expect(c.ids).toEqual([]);
    expect(c.origem).toHaveLength(0);
    expect(validarColunas(c)).toBeNull();
  });
  it('papel desconhecido lança', () => {
    expect(() => paraColunas([base({ papel: 'inexistente' as never })])).toThrow('papel desconhecido: inexistente');
  });
});

describe('ida e volta', () => {
  it('deColunas(paraColunas(p), meta(p)) devolve exatamente as mesmas peças', () => {
    expect(deColunas(paraColunas(amostra), metaDasPecas(amostra))).toEqual(amostra);
    expect(deColunas(paraColunas([]), [])).toEqual([]);
  });
  it('metaDasPecas guarda só o texto, na ordem das peças', () => {
    const m = metaDasPecas(amostra);
    expect(m).toHaveLength(5);
    expect(m[0]).toEqual({ nome: 'Lateral esquerda', material: 'mdf18', fita: { n: 'fita_pvc' }, veio: 'b', grupo: null, deAninhado: null, chapa: null, usinagens: [] });
    expect(m[3]!.deAninhado).toBe('n1');
  });
  it('é cópia: mudar as colunas não muda as peças originais', () => {
    const c = paraColunas(amostra);
    c.origem[0] = 99;
    expect(amostra[0]!.origem[0]).toBe(0);
  });
  it('200 peças aleatórias com e sem contorno fazem a ida e volta', () => {
    let s = 3;
    const r = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
    const pecas = Array.from({ length: 200 }, (_, i) => base({
      id: `p${i % 17}`, nome: `P${i}`, indice: 1 + (i % 5), papel: PAPEIS[i % PAPEIS.length]!, eixo: EIXOS[i % 3]!, vazio: i % 7 === 0,
      origem: [r(), r(), r()], tamanho: [r() + 0.1, r() + 0.1], espessura: 0.018, extensao: [r() + 0.1, r() + 0.1, 0.018],
      contorno: i % 4 === 0 ? [0, 0, 1, 0, 1, 1, 0, 1].map((v) => v * (r() + 0.5)) : null,
      material: i % 3 === 0 ? 'm' : null, grupo: i % 5 === 0 ? 'g' : null,
    }));
    const c = paraColunas(pecas);
    expect(validarColunas(c)).toBeNull();
    expect(deColunas(c, metaDasPecas(pecas))).toEqual(pecas);
  });
});

describe('validarColunas', () => {
  const ok = (): ColunasPecas => paraColunas(amostra);
  it('aceita colunas íntegras', () => { expect(validarColunas(ok())).toBeNull(); });
  it('acusa array do tamanho errado, índice fora, código fora e contorno fora do bloco', () => {
    const a = ok(); a.origem = new Float64Array(14);
    expect(validarColunas(a)).toMatch(/origem/);
    const b = ok(); b.idNum[0] = 99;
    expect(validarColunas(b)).toMatch(/idNum/);
    const c = ok(); c.papel[1] = 200;
    expect(validarColunas(c)).toMatch(/papel/);
    const d = ok(); d.eixo[0] = 3;
    expect(validarColunas(d)).toMatch(/eixo/);
    const e = ok(); e.vazio[0] = 2;
    expect(validarColunas(e)).toMatch(/vazio/);
    const f = ok(); f.contornoN[3] = 50;
    expect(validarColunas(f)).toMatch(/contorno/);
    const g = ok(); g.espessura[0] = Number.NaN;
    expect(validarColunas(g)).toMatch(/finito|inválido/);
  });
});

describe('usinagens em colunas (E5)', () => {
  const us = (id: string, tipo: 'furo' | 'rasgo' | 'recorte', face: 'a' | 'b' | 'n' | 's' | 'l' | 'o', u: number, v: number, d: number, l: number, c: number, p: number) => ({ id, tipo, face, u, v, diametro: d, largura: l, comprimento: c, profundidade: p });
  const pecas = [
    base({ id: 'a', usinagens: [us('f1', 'furo', 'a', 0.05, 0.1, 0.005, 0, 0, 0.01), us('r1', 'rasgo', 'b', 0.01, 0.02, 0, 0.006, 0.3, -1)] }),
    base({ id: 'b' }),
    base({ id: 'c', usinagens: [us('c1', 'recorte', 'a', 0.1, 0.1, 0, 0.1, 0.2, -1), us('b1', 'furo', 'o', 0.1, 0.009, 0.008, 0, 0, 0.03)] }),
  ];
  it('tabelas fixas de face e tipo', () => {
    expect([...FACES]).toEqual(['a', 'b', 'n', 's', 'l', 'o']);
    expect([...TIPOS_USINAGEM]).toEqual(['furo', 'rasgo', 'recorte']);
  });
  it('layout: início e quantidade por peça, códigos e 6 números por usinagem', () => {
    const c = paraColunas(pecas);
    expect([...c.usinagemN]).toEqual([2, 0, 2]);
    expect([...c.usinagemIni]).toEqual([0, 0, 2]);
    expect([...c.usinagemTipo]).toEqual([0, 1, 2, 0]);
    expect([...c.usinagemFace]).toEqual([0, 1, 0, 5]);
    expect(c.usinagemDados).toHaveLength(24);
    expect([...c.usinagemDados.slice(0, 6)]).toEqual([0.05, 0.1, 0.005, 0, 0, 0.01]);
    expect([...c.usinagemDados.slice(6, 12)]).toEqual([0.01, 0.02, 0, 0.006, 0.3, -1]);
    expect([...c.usinagemDados.slice(18, 24)]).toEqual([0.1, 0.009, 0.008, 0, 0, 0.03]);
    expect(c.usinagemDados).toBeInstanceOf(Float64Array);
    expect(c.usinagemTipo).toBeInstanceOf(Uint8Array);
    expect(c.usinagemIni).toBeInstanceOf(Uint32Array);
    expect(validarColunas(c)).toBeNull();
  });
  it('ida e volta com ids das usinagens no meta', () => {
    expect(metaDasPecas(pecas).map((m) => m.usinagens)).toEqual([['f1', 'r1'], [], ['c1', 'b1']]);
    expect(deColunas(paraColunas(pecas), metaDasPecas(pecas))).toEqual(pecas);
  });
  it('sem usinagens: arrays vazios e nenhuma peça com usinagem', () => {
    const c = paraColunas([base({}), base({ id: 'z' })]);
    expect([...c.usinagemN]).toEqual([0, 0]);
    expect(c.usinagemDados).toHaveLength(0);
  });
  it('validarColunas confere os blocos de usinagem', () => {
    const ok = (): ColunasPecas => paraColunas(pecas);
    const a = ok(); a.usinagemN[0] = 99;
    expect(validarColunas(a)).toMatch(/usinagem/);
    const b = ok(); b.usinagemTipo[0] = 7;
    expect(validarColunas(b)).toMatch(/usinagem/);
    const c = ok(); c.usinagemFace[1] = 9;
    expect(validarColunas(c)).toMatch(/usinagem/);
    const d = ok(); d.usinagemDados = new Float64Array(23);
    expect(validarColunas(d)).toMatch(/usinagem/);
    const e = ok(); e.usinagemDados[3] = Number.NaN;
    expect(validarColunas(e)).toMatch(/finito|inválido/);
    const f = ok(); f.usinagemIni = new Uint32Array(2);
    expect(validarColunas(f)).toMatch(/usinagem/);
  });
});
