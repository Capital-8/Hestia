import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { cotaDoProjeto, cotaExibida, localizacaoDe, localizacaoIssue, LOCALIZACAO_ZERO } from './localizacao.ts';

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
