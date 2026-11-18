import { describe, expect, it, vi } from 'vitest';
import { HistoricoFamilia } from './historico.ts';

interface Estado { nome: string; itens: number[]; sub: { a: number; b: number } }
const inicial = (): Estado => ({ nome: 'x', itens: [1, 2, 3], sub: { a: 1, b: 2 } });

describe('HistoricoFamilia', () => {
  it('começa sem passos e com versão 0', () => {
    const h = new HistoricoFamilia(inicial());
    expect(h.atual).toEqual(inicial());
    expect([h.podeDesfazer, h.podeRefazer, h.rotuloDesfazer, h.rotuloRefazer, h.versao]).toEqual([false, false, null, null, 0]);
    expect(h.desfazer()).toBe(false);
    expect(h.refazer()).toBe(false);
  });
  it('exec cria um passo; desfazer e refazer andam e trazem os rótulos', () => {
    const h = new HistoricoFamilia(inicial());
    h.exec('Renomear', (d) => { d.nome = 'y'; });
    h.exec('Adicionar item', (d) => { d.itens.push(4); });
    expect(h.atual.nome).toBe('y');
    expect(h.atual.itens).toEqual([1, 2, 3, 4]);
    expect(h.rotuloDesfazer).toBe('Adicionar item');
    expect(h.desfazer()).toBe(true);
    expect(h.atual.itens).toEqual([1, 2, 3]);
    expect(h.rotuloRefazer).toBe('Adicionar item');
    expect(h.rotuloDesfazer).toBe('Renomear');
    expect(h.desfazer()).toBe(true);
    expect(h.atual).toEqual(inicial());
    expect(h.refazer()).toBe(true);
    expect(h.refazer()).toBe(true);
    expect(h.atual.itens).toEqual([1, 2, 3, 4]);
    expect(h.podeRefazer).toBe(false);
  });
  it('exec depois de desfazer apaga o refazer', () => {
    const h = new HistoricoFamilia(inicial());
    h.exec('a', (d) => { d.nome = 'a'; });
    h.exec('b', (d) => { d.nome = 'b'; });
    h.desfazer();
    h.exec('c', (d) => { d.nome = 'c'; });
    expect(h.podeRefazer).toBe(false);
    expect(h.refazer()).toBe(false);
    expect(h.atual.nome).toBe('c');
  });
  it('é imutável: estado anterior não muda e o que não mudou é compartilhado', () => {
    const h = new HistoricoFamilia(inicial());
    const antes = h.atual;
    h.exec('mexe', (d) => { d.sub.a = 99; });
    expect(antes.sub.a).toBe(1);
    expect(h.atual).not.toBe(antes);
    expect(h.atual.itens).toBe(antes.itens);
    expect(() => { (h.atual as Estado).nome = 'direto'; }).toThrow();
  });
  it('receita que não muda nada não cria passo nem notifica', () => {
    const h = new HistoricoFamilia(inicial());
    const ouvinte = vi.fn();
    h.assinar(ouvinte);
    h.exec('nada', (d) => { d.nome = 'x'; });
    h.exec('nada de novo', () => undefined);
    expect(h.podeDesfazer).toBe(false);
    expect(h.versao).toBe(0);
    expect(ouvinte).not.toHaveBeenCalled();
  });
  it('receita que lança deixa tudo como estava e propaga o erro', () => {
    const h = new HistoricoFamilia(inicial());
    h.exec('ok', (d) => { d.nome = 'ok'; });
    const v = h.versao;
    expect(() => h.exec('falha', (d) => { d.nome = 'meio'; throw new Error('boom'); })).toThrow('boom');
    expect(h.atual.nome).toBe('ok');
    expect(h.versao).toBe(v);
    expect(h.rotuloDesfazer).toBe('ok');
  });
  it('agrupar junta vários exec num passo só', () => {
    const h = new HistoricoFamilia(inicial());
    h.agrupar('Arrastar', () => {
      h.exec('x', (d) => { d.sub.a = 10; });
      h.exec('y', (d) => { d.sub.a = 20; });
      h.exec('z', (d) => { d.sub.b = 30; });
    });
    expect(h.atual.sub).toEqual({ a: 20, b: 30 });
    expect(h.rotuloDesfazer).toBe('Arrastar');
    h.desfazer();
    expect(h.atual).toEqual(inicial());
    expect(h.podeDesfazer).toBe(false);
    h.refazer();
    expect(h.atual.sub).toEqual({ a: 20, b: 30 });
  });
  it('agrupar: aninhado vale como um só; vazio não cria passo; erro volta ao de antes', () => {
    const h = new HistoricoFamilia(inicial());
    h.agrupar('fora', () => { h.agrupar('dentro', () => { h.exec('a', (d) => { d.nome = 'a'; }); }); h.exec('b', (d) => { d.itens = []; }); });
    expect(h.rotuloDesfazer).toBe('fora');
    h.desfazer();
    expect(h.podeDesfazer).toBe(false);
    h.agrupar('vazio', () => undefined);
    expect(h.podeDesfazer).toBe(false);
    expect(() => h.agrupar('erro', () => { h.exec('m', (d) => { d.nome = 'meio'; }); throw new Error('falhou'); })).toThrow('falhou');
    expect(h.atual).toEqual(inicial());
    expect(h.podeDesfazer).toBe(false);
  });
  it('respeita o limite de passos guardados', () => {
    const h = new HistoricoFamilia(inicial(), 3);
    for (let i = 1; i <= 5; i++) h.exec(`p${i}`, (d) => { d.sub.a = 100 + i; });
    let n = 0;
    while (h.desfazer()) n++;
    expect(n).toBe(3);
    expect(h.atual.sub.a).toBe(102);
  });
  it('assinar notifica a cada mudança (exec, desfazer, refazer) e cancela', () => {
    const h = new HistoricoFamilia(inicial());
    const ouvinte = vi.fn();
    const cancela = h.assinar(ouvinte);
    h.exec('a', (d) => { d.nome = 'a'; });
    h.desfazer();
    h.refazer();
    expect(ouvinte).toHaveBeenCalledTimes(3);
    expect(h.versao).toBe(3);
    cancela();
    h.exec('b', (d) => { d.nome = 'b'; });
    expect(ouvinte).toHaveBeenCalledTimes(3);
    expect(h.desfazer()).toBe(true);
    h.desfazer();
    expect(h.desfazer()).toBe(false);
  });
  it('agrupar notifica uma vez só, no fim', () => {
    const h = new HistoricoFamilia(inicial());
    const ouvinte = vi.fn();
    h.assinar(ouvinte);
    h.agrupar('g', () => { h.exec('a', (d) => { d.nome = 'a'; }); h.exec('b', (d) => { d.nome = 'b'; }); });
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });
  it('desfazer tudo e refazer tudo devolve os mesmos estados (100 passos aleatórios)', () => {
    const h = new HistoricoFamilia(inicial(), 500);
    let s = 5;
    const rnd = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
    const estados: Estado[] = [h.atual];
    for (let i = 0; i < 100; i++) {
      h.exec(`p${i}`, (d) => { if (rnd() < 0.5) d.itens.push(i); else d.sub.a = i; d.nome = `n${i}`; });
      estados.push(h.atual);
    }
    for (let i = 99; i >= 0; i--) { h.desfazer(); expect(h.atual).toEqual(estados[i]); }
    for (let i = 1; i <= 100; i++) { h.refazer(); expect(h.atual).toEqual(estados[i]); }
  });
});
