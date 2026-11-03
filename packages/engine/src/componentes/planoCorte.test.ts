import { describe, expect, it } from 'vitest';
import type { LinhaLista } from './listaPecas.ts';
import { orientacoesPermitidas, pecasParaCorte, planoDeCorte, type ChapaParaCorte, type PecaParaCorte, type PlanoCorte } from './planoCorte.ts';

const CH: ChapaParaCorte = { largura: 2750, altura: 1850, refilo: 10, veio: true, kerf: 3 };
const p = (id: string, c: number, l: number, veio: PecaParaCorte['veio'] = 'comprimento'): PecaParaCorte => ({ id, comprimento: c, largura: l, veio });

function verificar(pecas: readonly PecaParaCorte[], chapa: ChapaParaCorte, plano: PlanoCorte): void {
  const colocadas = new Map<number, number>();
  for (const c of plano.chapas) {
    for (const q of c.posicoes) {
      colocadas.set(q.peca, (colocadas.get(q.peca) ?? 0) + 1);
      const pc = pecas[q.peca]!;
      expect(q.w).toBeCloseTo(q.girada ? pc.largura : pc.comprimento, 9);
      expect(q.h).toBeCloseTo(q.girada ? pc.comprimento : pc.largura, 9);
      expect(orientacoesPermitidas(pc, chapa)).toContain(q.girada);
      expect(q.x).toBeGreaterThanOrEqual(chapa.refilo - 1e-9);
      expect(q.y).toBeGreaterThanOrEqual(chapa.refilo - 1e-9);
      expect(q.x + q.w).toBeLessThanOrEqual(chapa.largura - chapa.refilo + 1e-9);
      expect(q.y + q.h).toBeLessThanOrEqual(chapa.altura - chapa.refilo + 1e-9);
    }
    const ps = c.posicoes;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]!; const b = ps[j]!;
      const folgaX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const folgaY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      expect(Math.max(folgaX, folgaY), `chapa: peças ${a.peca} e ${b.peca}`).toBeGreaterThanOrEqual(chapa.kerf - 1e-9);
    }
    expect(c.areaUsada).toBeCloseTo(ps.reduce((s, q) => s + q.w * q.h, 0), 6);
  }
  for (const [i, n] of colocadas) expect(n, `peça ${i}`).toBe(1);
  const fora = new Set(plano.naoCouberam);
  for (let i = 0; i < pecas.length; i++) expect(colocadas.has(i) !== fora.has(i), `peça ${i} colocada ou fora, nunca os dois nem nenhum`).toBe(true);
  expect([...plano.naoCouberam]).toEqual([...plano.naoCouberam].sort((a, b) => a - b));
  const util = (chapa.largura - 2 * chapa.refilo) * (chapa.altura - 2 * chapa.refilo);
  expect(plano.areaChapas).toBeCloseTo(plano.chapas.length * util, 6);
  expect(plano.areaPecas).toBeCloseTo(plano.chapas.reduce((s, c) => s + c.areaUsada, 0), 6);
  expect(plano.aproveitamento).toBeCloseTo(plano.chapas.length ? plano.areaPecas / plano.areaChapas : 0, 9);
  expect(plano.aproveitamento).toBeLessThanOrEqual(1 + 1e-9);
}

describe('orientacoesPermitidas', () => {
  it('veio da chapa manda; livre e sem veio giram', () => {
    expect(orientacoesPermitidas(p('a', 500, 300, 'comprimento'), CH)).toEqual([false]);
    expect(orientacoesPermitidas(p('a', 500, 300, 'largura'), CH)).toEqual([true]);
    expect(orientacoesPermitidas(p('a', 500, 300, 'livre'), CH)).toEqual([false, true]);
    expect(orientacoesPermitidas(p('a', 500, 300, null), CH)).toEqual([false, true]);
    expect(orientacoesPermitidas(p('a', 500, 300, 'comprimento'), { ...CH, veio: false })).toEqual([false, true]);
    expect(orientacoesPermitidas(p('a', 500, 300, 'largura'), { ...CH, veio: false })).toEqual([false, true]);
  });
});

describe('planoDeCorte: casos exatos', () => {
  it('lista vazia: nenhuma chapa e aproveitamento 0', () => {
    expect(planoDeCorte([], CH)).toEqual({ chapas: [], naoCouberam: [], areaPecas: 0, areaChapas: 0, aproveitamento: 0 });
  });
  it('4 peças que enchem a chapa sem refilo nem kerf cabem em 1 chapa, aproveitamento 1', () => {
    const chapa: ChapaParaCorte = { largura: 2000, altura: 1000, refilo: 0, veio: false, kerf: 0 };
    const pecas = [p('a', 1000, 500), p('b', 1000, 500), p('c', 1000, 500), p('d', 1000, 500)];
    const r = planoDeCorte(pecas, chapa);
    verificar(pecas, chapa, r);
    expect(r.chapas).toHaveLength(1);
    expect(r.aproveitamento).toBeCloseTo(1, 9);
  });
  it('primeira peça no canto da área útil e a segunda ao lado, separada pelo kerf', () => {
    const pecas = [p('grande', 1000, 800), p('menor', 900, 400)];
    const r = planoDeCorte(pecas, CH);
    verificar(pecas, CH, r);
    expect(r.chapas[0]!.posicoes[0]).toMatchObject({ peca: 0, x: 10, y: 10, w: 1000, h: 800, girada: false });
    expect(r.chapas[0]!.posicoes[1]).toMatchObject({ peca: 1, x: 1013, y: 10, w: 900, h: 400 });
  });
  it('peça maior que a área útil em qualquer orientação não cabe', () => {
    const pecas = [p('enorme', 3000, 500, 'livre'), p('ok', 500, 500)];
    const r = planoDeCorte(pecas, CH);
    expect(r.naoCouberam).toEqual([0]);
    verificar(pecas, CH, r);
  });
  it('o veio decide o que cabe: 2400 de veio na largura não cabe com chapa de veio, cabe sem veio', () => {
    const pecas = [p('a', 2400, 300, 'largura')];
    expect(planoDeCorte(pecas, CH).naoCouberam).toEqual([0]);
    const r = planoDeCorte(pecas, { ...CH, veio: false });
    expect(r.naoCouberam).toEqual([]);
    expect(r.chapas[0]!.posicoes[0]!.girada).toBe(false);
  });
  it('uma peça que só cabe girada é girada', () => {
    const chapa: ChapaParaCorte = { largura: 1000, altura: 2000, refilo: 0, veio: false, kerf: 0 };
    const r = planoDeCorte([p('alta', 1900, 500, 'livre')], chapa);
    expect(r.chapas[0]!.posicoes[0]).toMatchObject({ girada: true, w: 500, h: 1900 });
  });
  it('muitas peças abrem mais de uma chapa, e o número de chapas nunca é menor que a área exige', () => {
    const pecas = Array.from({ length: 12 }, (_, i) => p(`p${i}`, 1500, 800));
    const r = planoDeCorte(pecas, CH);
    verificar(pecas, CH, r);
    expect(r.chapas.length).toBeGreaterThanOrEqual(Math.ceil((12 * 1500 * 800) / ((2750 - 20) * (1850 - 20))));
  });
});

describe('planoDeCorte: propriedades', () => {
  it('200 conjuntos aleatórios respeitam todos os invariantes e são determinísticos', () => {
    let s = 2024;
    const r = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
    const vieos: PecaParaCorte['veio'][] = ['comprimento', 'largura', 'livre', null];
    for (let k = 0; k < 200; k++) {
      const n = 1 + Math.floor(r() * 30);
      const chapa: ChapaParaCorte = { largura: 2750, altura: 1850, refilo: Math.floor(r() * 15), veio: r() < 0.7, kerf: Math.floor(r() * 6) };
      const pecas = Array.from({ length: n }, (_, i) => { const c = 100 + Math.floor(r() * 1500); const l = 50 + Math.floor(r() * Math.min(c, 900)); return p(`p${i}`, c, l, vieos[Math.floor(r() * 4)]!); });
      const plano = planoDeCorte(pecas, chapa);
      verificar(pecas, chapa, plano);
      expect(planoDeCorte(pecas, chapa)).toEqual(plano);
    }
  });
  it('não altera a entrada', () => {
    const pecas = [p('a', 800, 400), p('b', 700, 300)];
    const antes = JSON.stringify(pecas);
    planoDeCorte(pecas, CH);
    expect(JSON.stringify(pecas)).toBe(antes);
  });
});

describe('pecasParaCorte', () => {
  const linha = (nome: string, q: number, c: number, l: number, veio: LinhaLista['veio']): LinhaLista => ({
    nome, nomes: [nome], papel: 'painel', quantidade: q, comprimento: c, largura: l, espessura: 18, chapa: 'mdf18', material: null, veio, fita: { c1: null, c2: null, l1: null, l2: null },
    furos: 0, rasgos: 0, recortes: 0, area: (c * l) / 1e6, ids: [nome],
  });
  it('uma por unidade, com id numerado, na ordem das linhas', () => {
    const r = pecasParaCorte([linha('Lateral', 2, 577, 560, 'comprimento'), linha('Base', 1, 800, 560, 'largura')]);
    expect(r).toEqual([
      { id: 'Lateral #1', comprimento: 577, largura: 560, veio: 'comprimento' },
      { id: 'Lateral #2', comprimento: 577, largura: 560, veio: 'comprimento' },
      { id: 'Base #1', comprimento: 800, largura: 560, veio: 'largura' },
    ]);
    expect(pecasParaCorte([])).toEqual([]);
  });
});
