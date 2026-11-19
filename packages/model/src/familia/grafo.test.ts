import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { dependenciasDaFamilia, ordemDeAvaliacao, ordenar, type Dependencia } from './grafo.ts';
import type { Familia } from './tipos.ts';

const d = (id: string, ...deps: string[]): Dependencia => ({ id, deps });
const clone = <T>(x: T): T => structuredClone(x);

describe('ordenar', () => {
  it('lista vazia e itens sem dependência mantêm a ordem de entrada', () => {
    expect(ordenar([])).toEqual({ ok: true, ordem: [] });
    expect(ordenar([d('c'), d('a'), d('b')])).toEqual({ ok: true, ordem: ['c', 'a', 'b'] });
  });
  it('põe as dependências antes de quem depende, de forma estável', () => {
    expect(ordenar([d('a', 'b'), d('b', 'c'), d('c')])).toEqual({ ok: true, ordem: ['c', 'b', 'a'] });
    expect(ordenar([d('x', 'z'), d('y'), d('z')])).toEqual({ ok: true, ordem: ['y', 'z', 'x'] });
    expect(ordenar([d('a'), d('b', 'a'), d('c', 'a'), d('d', 'b', 'c')])).toEqual({ ok: true, ordem: ['a', 'b', 'c', 'd'] });
  });
  it('ignora dependência de id desconhecido', () => {
    expect(ordenar([d('a', 'fantasma'), d('b', 'a')])).toEqual({ ok: true, ordem: ['a', 'b'] });
  });
  it('acusa auto-dependência e ciclos, devolvendo um ciclo no caminho de dependência', () => {
    expect(ordenar([d('a', 'a')])).toEqual({ ok: false, ciclo: ['a'] });
    expect(ordenar([d('ok'), d('a', 'b'), d('b', 'a')])).toEqual({ ok: false, ciclo: ['a', 'b'] });
    const tres = ordenar([d('a', 'c'), d('b', 'a'), d('c', 'b'), d('livre')]);
    expect(tres.ok).toBe(false);
    if (!tres.ok) {
      expect([...tres.ciclo].sort()).toEqual(['a', 'b', 'c']);
      const dep: Record<string, string> = { a: 'c', b: 'a', c: 'b' };
      tres.ciclo.forEach((id, i) => expect(dep[id]).toBe(tres.ciclo[(i + 1) % tres.ciclo.length]));
    }
  });
  it('ciclo longe do começo não confunde com quem só depende dele', () => {
    const r = ordenar([d('a', 'b'), d('b', 'c'), d('c', 'd'), d('d', 'c')]);
    expect(r).toEqual({ ok: false, ciclo: ['c', 'd'] });
  });
  it('é determinística e cada id sai uma vez (200 grafos aleatórios sem ciclo)', () => {
    let s = 12345;
    const rnd = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
    for (let g = 0; g < 200; g++) {
      const n = 1 + Math.floor(rnd() * 25);
      const itens = Array.from({ length: n }, (_, i) => d(`n${i}`, ...Array.from({ length: Math.floor(rnd() * 4) }, () => `n${Math.floor(rnd() * i)}`).filter((x) => i > 0 && x !== `n${i}`)));
      const r = ordenar(itens);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.ordem).toHaveLength(n);
      expect(new Set(r.ordem).size).toBe(n);
      const pos = new Map(r.ordem.map((id, i) => [id, i]));
      for (const it of itens) for (const dep of it.deps) expect(pos.get(dep)!).toBeLessThan(pos.get(it.id)!);
      expect(ordenar(itens)).toEqual(r);
    }
  });
});

describe('dependenciasDaFamilia e ordemDeAvaliacao', () => {
  it('um item por parâmetro e por plano, parâmetros primeiro', () => {
    const itens = dependenciasDaFamilia(FAMILIA_ARMARIO);
    expect(itens.map((i) => i.id)).toEqual([...FAMILIA_ARMARIO.parametros.map((p) => p.id), ...FAMILIA_ARMARIO.planos.map((p) => p.id)]);
  });
  it('lê as fórmulas: x.esp conta como x, só ids da família, sem repetição, em ordem alfabética', () => {
    const itens = Object.fromEntries(dependenciasDaFamilia(FAMILIA_ARMARIO).map((i) => [i.id, i.deps]));
    expect(itens.esp).toEqual(['corpo']);
    expect(itens.zBase).toEqual(['esp', 'rodape']);
    expect(itens.hCorpo).toEqual(['A', 'tampoEsp']);
    expect(itens.yFundo).toEqual(['P', 'fundo', 'fundoEsp']);
    expect(itens.L).toEqual([]);
    expect(itens.pDir).toEqual(['L']);
  });
  it('fórmula que não compila ou nome inexistente não gera dependência nem erro', () => {
    const f = clone(FAMILIA_ARMARIO);
    f.parametros.find((p) => p.id === 'esp')!.formula = 'corpo.esp +';
    f.parametros.find((p) => p.id === 'zBase')!.formula = 'rodape + naoExiste';
    const itens = Object.fromEntries(dependenciasDaFamilia(f).map((i) => [i.id, i.deps]));
    expect(itens.esp).toEqual([]);
    expect(itens.zBase).toEqual(['rodape']);
  });
  it('a família de exemplo tem ordem válida, com derivados depois do que usam', () => {
    const r = ordemDeAvaliacao(FAMILIA_ARMARIO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const pos = new Map(r.ordem.map((id, i) => [id, i]));
    expect(pos.get('corpo')!).toBeLessThan(pos.get('esp')!);
    expect(pos.get('esp')!).toBeLessThan(pos.get('zBase')!);
    expect(pos.get('hCorpo')!).toBeLessThan(pos.get('vao')!);
    expect(pos.get('L')!).toBeLessThan(pos.get('pDir')!);
  });
  it('detecta ciclo entre derivados', () => {
    const f: Familia = clone(FAMILIA_ARMARIO);
    f.parametros.find((p) => p.id === 'esp')!.formula = 'zBase - rodape';
    const r = ordemDeAvaliacao(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect([...r.ciclo].sort()).toEqual(['esp', 'zBase']);
  });
});
