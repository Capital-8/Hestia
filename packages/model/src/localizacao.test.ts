import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { cotaDoProjeto, cotaExibida, coordenadaDoProjeto, coordenadaReal, localizacaoDe, localizacaoIssue, LOCALIZACAO_ZERO } from './localizacao.ts';

describe('cotaExibida e cotaDoProjeto (A.3 item 7)', () => {
  it('sem localizacao, a cota exibida é o próprio z', () => {
    const p = createEmptyProject();
    expect(localizacaoDe(p)).toBe(LOCALIZACAO_ZERO);
    expect(cotaExibida(p, 3.25)).toBe(3.25);
    expect(cotaDoProjeto(p, 3.25)).toBe(3.25);
  });

  it('com localizacao, soma e subtrai a altitude da cota zero', () => {
    const p = { localizacao: { origemE: 1, origemN: 2, cotaZero: 760.5, norteVerdadeiro: 0 } };
    expect(cotaExibida(p, -1.5)).toBeCloseTo(759, 12);
    expect(cotaDoProjeto(p, 759)).toBeCloseTo(-1.5, 12);
  });

  it('são inversas uma da outra', () => {
    const p = { localizacao: { origemE: 0, origemN: 0, cotaZero: 812.37, norteVerdadeiro: 0.1 } };
    for (const z of [-20, 0, 0.001, 1234.5]) expect(cotaDoProjeto(p, cotaExibida(p, z))).toBeCloseTo(z, 9);
  });

  it('setLocalizacao grava, valida e remove, com desfazer', () => {
    const s = new ProjectStore(createEmptyProject());
    const loc = { origemE: 500000, origemN: 7400000, cotaZero: 760, norteVerdadeiro: 0.3, sistema: 'SIRGAS 2000 / UTM 23S' };
    s.exec({ type: 'setLocalizacao', localizacao: loc });
    expect(s.project.localizacao).toEqual(loc);
    expect(cotaExibida(s.project, 1)).toBe(761);
    expect(() => s.exec({ type: 'setLocalizacao', localizacao: { ...loc, cotaZero: Number.NaN } })).toThrow();
    expect(s.project.localizacao).toEqual(loc);
    s.exec({ type: 'setLocalizacao', localizacao: null });
    expect(s.project.localizacao).toBeUndefined();
    s.undo();
    expect(s.project.localizacao).toEqual(loc);
    s.undo();
    expect(s.project.localizacao).toBeUndefined();
    s.redo();
    expect(s.project.localizacao).toEqual(loc);
  });

  it('localizacaoIssue recusa número não finito', () => {
    const ok = { origemE: 0, origemN: 0, cotaZero: 0, norteVerdadeiro: 0 };
    expect(localizacaoIssue(ok)).toBeNull();
    for (const k of ['origemE', 'origemN', 'cotaZero', 'norteVerdadeiro'] as const) expect(localizacaoIssue({ ...ok, [k]: Number.POSITIVE_INFINITY })).not.toBeNull();
  });
});

describe('coordenadaReal e coordenadaDoProjeto (norte verdadeiro, sentido horário a partir do +y)', () => {
  const loc = (norteVerdadeiro: number) => ({ localizacao: { origemE: 500000, origemN: 7000000, cotaZero: 760, norteVerdadeiro } });

  it('sem localização, a coordenada real é a própria coordenada do projeto', () => {
    expect(coordenadaReal({}, { x: 10, y: 20 })).toEqual({ leste: 10, norte: 20 });
  });

  it('norte 0: leste = origemE + x e norte = origemN + y (ponto (10, 20) → E 500010 / N 7000020)', () => {
    expect(coordenadaReal(loc(0), { x: 10, y: 20 })).toEqual({ leste: 500010, norte: 7000020 });
  });

  it('norte π/2 (90° horário): o +y do projeto aponta para o oeste (ponto (10, 20) → E 499980 / N 7000010)', () => {
    const r = coordenadaReal(loc(Math.PI / 2), { x: 10, y: 20 });
    expect(r.leste).toBeCloseTo(499980, 6);
    expect(r.norte).toBeCloseTo(7000010, 6);
  });

  it('norte π/4: o ponto (10, 0) cai 7,0710678 m ao leste e 7,0710678 m ao norte', () => {
    const r = coordenadaReal(loc(Math.PI / 4), { x: 10, y: 0 });
    expect(r.leste).toBeCloseTo(500007.0710678, 6);
    expect(r.norte).toBeCloseTo(7000007.0710678, 6);
  });

  it('ponto negativo, norte 0: (-5, -3) → E 499995 / N 6999997', () => {
    expect(coordenadaReal(loc(0), { x: -5, y: -3 })).toEqual({ leste: 499995, norte: 6999997 });
  });

  it('ponto negativo, norte π/2: (-5, -3) → E 500003 / N 6999995', () => {
    const r = coordenadaReal(loc(Math.PI / 2), { x: -5, y: -3 });
    expect(r.leste).toBeCloseTo(500003, 6);
    expect(r.norte).toBeCloseTo(6999995, 6);
  });

  it('inversa com valores literais: E 499980 / N 7000010 com norte π/2 volta para (10, 20)', () => {
    const p = coordenadaDoProjeto(loc(Math.PI / 2), { leste: 499980, norte: 7000010 });
    expect(p.x).toBeCloseTo(10, 6);
    expect(p.y).toBeCloseTo(20, 6);
  });

  it('ida e volta são inversas, com origem e norte quaisquer', () => {
    const p = { localizacao: { origemE: 500000, origemN: 7400000, cotaZero: 812.37, norteVerdadeiro: 0.3 } };
    for (const pt of [{ x: 12.5, y: -7.25 }, { x: -40, y: 0 }, { x: 0, y: 0 }]) {
      const back = coordenadaDoProjeto(p, coordenadaReal(p, pt));
      expect(back.x).toBeCloseTo(pt.x, 9);
      expect(back.y).toBeCloseTo(pt.y, 9);
    }
    for (const real of [{ leste: 500100, norte: 7400050 }, { leste: 499900, norte: 7399930.5 }]) {
      const back = coordenadaReal(p, coordenadaDoProjeto(p, real));
      expect(back.leste).toBeCloseTo(real.leste, 6);
      expect(back.norte).toBeCloseTo(real.norte, 6);
    }
  });

  it('cota exibida com cota zero 760 e z 2,5 vale 762,5 (literal)', () => {
    expect(cotaExibida(loc(0), 2.5)).toBe(762.5);
  });
});
