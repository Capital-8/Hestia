import { describe, expect, it } from 'vitest';
import { coordenadaDaBase, elevacaoDaBase } from './cotasBase.ts';
import type { Project } from './types.ts';

const base = (extra: Partial<Project> & { settings?: Partial<Project['settings']> } = {}): Project => ({ settings: { ...(extra.settings ?? {}) }, ...(extra.localizacao ? { localizacao: extra.localizacao } : {}) }) as unknown as Project;
const loc = (g: number) => ({ origemE: 500000, origemN: 7000000, cotaZero: 760, norteVerdadeiro: (g * Math.PI) / 180 });

describe('coordenadaDaBase', () => {
  it('project com Localização: real (E 500010, N 7000005 com norte 0)', () => {
    const r = coordenadaDaBase(base({ localizacao: loc(0) }), 'project', { x: 10, y: 5 });
    expect(r.leste).toBeCloseTo(500010, 6);
    expect(r.norte).toBeCloseTo(7000005, 6);
  });
  it('project com Localização e norte 90°: E 499995, N 7000010', () => {
    const r = coordenadaDaBase(base({ localizacao: loc(90) }), 'project', { x: 10, y: 5 });
    expect(r.leste).toBeCloseTo(499995, 6);
    expect(r.norte).toBeCloseTo(7000010, 6);
  });
  it('project sem Localização: relativa ao ponto-base (10 - 4 = 6; 5 - 1 = 4)', () => {
    expect(coordenadaDaBase(base({ settings: { projectBasePoint: { x: 4, y: 1, z: 0 } } }), 'project', { x: 10, y: 5 })).toEqual({ leste: 6, norte: 4 });
  });
  it('relative: relativa ao ponto-base, mesmo com Localização', () => {
    expect(coordenadaDaBase(base({ localizacao: loc(0), settings: { projectBasePoint: { x: 4, y: 1, z: 0 } } }), 'relative', { x: 10, y: 5 })).toEqual({ leste: 6, norte: 4 });
  });
  it('survey com ponto de levantamento girado 90°: (sx, sy) = (6, 4) -> leste 4, norte -6', () => {
    const r = coordenadaDaBase(base({ settings: { surveyPoint: { x: 4, y: 1, z: 0, trueNorthDeg: 90 } } }), 'survey', { x: 10, y: 5 });
    expect(r.leste).toBeCloseTo(4, 9);
    expect(r.norte).toBeCloseTo(-6, 9);
  });
  it('survey sem ponto de levantamento usa a Localização', () => {
    expect(coordenadaDaBase(base({ localizacao: loc(0) }), 'survey', { x: 10, y: 5 }).leste).toBeCloseTo(500010, 6);
  });
});

describe('elevacaoDaBase', () => {
  it('project com Localização: z + cotaZero (2,5 + 760 = 762,5)', () => {
    expect(elevacaoDaBase(base({ localizacao: loc(0) }), 'project', 2.5, 0)).toBeCloseTo(762.5, 9);
  });
  it('project sem Localização: z menos a cota do ponto-base (2,5 - 1 = 1,5)', () => {
    expect(elevacaoDaBase(base({ settings: { projectBasePoint: { x: 0, y: 0, z: 1 } } }), 'project', 2.5, 0)).toBe(1.5);
  });
  it('relative: z menos a cota do nível (2,5 - 3 = -0,5), sem Localização', () => {
    expect(elevacaoDaBase(base({ localizacao: loc(0) }), 'relative', 2.5, 3)).toBe(-0.5);
  });
  it('survey: z menos a cota do levantamento (2,5 - 0,5 = 2)', () => {
    expect(elevacaoDaBase(base({ settings: { surveyPoint: { x: 0, y: 0, z: 0.5 } } }), 'survey', 2.5, 0)).toBe(2);
  });
});
