import { describe, expect, it } from 'vitest';
import { DEFAULT_DIMENSION_STYLE, ProjectStore, createEmptyProject, dimensionStyleOf } from '@hestia/model';
import {
  defaultStyleDraft,
  formatDecimal,
  formatDimValue,
  fontOptions,
  hasStyleErrors,
  isStyleDirty,
  parseDecimal,
  styleDiff,
  styleDraftFromProject,
  validateStyleDraft,
} from './dimensionStyleModel.ts';

describe('estilo global de cotas: rascunho', () => {
  it('restaurar padrão devolve DEFAULT_DIMENSION_STYLE como cópia independente', () => {
    const d = defaultStyleDraft();
    expect(d).toEqual(DEFAULT_DIMENSION_STYLE);
    d.tickSize = 9;
    expect(DEFAULT_DIMENSION_STYLE.tickSize).toBe(2.8);
  });

  it('rascunho inicial vem do estilo efetivo do projeto (campos ausentes caem no padrão)', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(styleDraftFromProject(s.project)).toEqual(dimensionStyleOf(undefined));
    s.exec({ type: 'setSettings', patch: { dimensionStyle: { tick: 'dot', precision: 1 } } });
    const d = styleDraftFromProject(s.project);
    expect(d.tick).toBe('dot');
    expect(d.precision).toBe(1);
    expect(d.textHeight).toBe(DEFAULT_DIMENSION_STYLE.textHeight);
  });
});

describe('estilo global de cotas: validação', () => {
  it('padrão é válido', () => {
    expect(validateStyleDraft(defaultStyleDraft())).toEqual({});
  });

  it('recusa números fora da faixa e valores não numéricos', () => {
    const d = defaultStyleDraft();
    d.tickSize = 0;
    d.textHeight = 16;
    d.stackSpacing = Number.NaN;
    const e = validateStyleDraft(d);
    expect(Object.keys(e).sort()).toEqual(['stackSpacing', 'textHeight', 'tickSize']);
    expect(hasStyleErrors(e)).toBe(true);
  });

  it('folga e ultrapassagem aceitam zero, mas não negativo', () => {
    const d = defaultStyleDraft();
    d.extensionGap = 0;
    d.extensionOvershoot = 0;
    expect(validateStyleDraft(d)).toEqual({});
    d.extensionGap = -0.1;
    expect(validateStyleDraft(d).extensionGap).toBeDefined();
  });

  it('limites inclusivos nas pontas da faixa', () => {
    const d = defaultStyleDraft();
    d.tickSize = 0.5;
    d.stackSpacing = 50;
    expect(validateStyleDraft(d)).toEqual({});
  });

  it('fonte vazia, prefixo/sufixo longos, precisão e unidade inválidos são recusados', () => {
    const d = defaultStyleDraft();
    d.font = '   ';
    d.prefix = 'x'.repeat(13);
    d.suffix = 'y'.repeat(13);
    d.precision = 4 as never;
    d.unit = 'ft' as never;
    const e = validateStyleDraft(d);
    expect(Object.keys(e).sort()).toEqual(['font', 'precision', 'prefix', 'suffix', 'unit']);
  });
});

describe('estilo global de cotas: diff contra o projeto', () => {
  it('só os campos alterados entram no patch', () => {
    const current = defaultStyleDraft();
    const draft = { ...current, tick: 'arrow-filled' as const, precision: 0 as const };
    expect(styleDiff(draft, current)).toEqual({ tick: 'arrow-filled', precision: 0 });
  });

  it('rascunho igual ao atual não é sujo e gera patch vazio', () => {
    const current = defaultStyleDraft();
    expect(styleDiff({ ...current }, current)).toEqual({});
    expect(isStyleDirty({ ...current }, current)).toBe(false);
  });

  it('editar e voltar ao valor atual deixa de ser sujo', () => {
    const current = defaultStyleDraft();
    const draft = { ...current, prefix: 'Ø ' };
    expect(isStyleDirty(draft, current)).toBe(true);
    expect(styleDiff({ ...draft, prefix: '' }, current)).toEqual({});
  });

  it('restaurar padrão a partir de um projeto personalizado gera patch só com o que volta ao padrão', () => {
    const custom = { ...defaultStyleDraft(), tickSize: 4, unit: 'cm' as const };
    const restored = defaultStyleDraft();
    expect(styleDiff(restored, custom)).toEqual({ tickSize: DEFAULT_DIMENSION_STYLE.tickSize, unit: 'project' });
  });
});

describe('estilo global de cotas: utilitários de texto', () => {
  it('aceita vírgula ou ponto e recusa lixo', () => {
    expect(parseDecimal('3,5')).toBe(3.5);
    expect(parseDecimal(' 2.8 ')).toBe(2.8);
    expect(parseDecimal('')).toBeNaN();
    expect(parseDecimal('1,2,3')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
  });

  it('formata com vírgula decimal', () => {
    expect(formatDecimal(2.5)).toBe('2,5');
    expect(formatDecimal(Number.NaN)).toBe('');
  });

  it('valor de exemplo segue precisão, prefixo e sufixo', () => {
    expect(formatDimValue(3.5, { precision: 2, prefix: '', suffix: '' })).toBe('3,50');
    expect(formatDimValue(3.5, { precision: 0, prefix: 'Ø ', suffix: ' m' })).toBe('Ø 4 m');
  });

  it('fonte fora da lista entra como primeira opção', () => {
    const custom = 'Minha Fonte, serif';
    expect(fontOptions(custom)[0]).toBe(custom);
    expect(fontOptions(DEFAULT_DIMENSION_STYLE.font)).toContain(DEFAULT_DIMENSION_STYLE.font);
  });
});
