import { describe, expect, it } from 'vitest';
import { isDiscipline, isDisciplineId, planTonesOf, presetTone } from './index.ts';

/**
 * Disciplina como identificador (adiado D0.2 do adendo 3 do ADR 0060): as cinco embutidas continuam com a tabela
 * §4.2 e qualquer outra disciplina cai no fallback (a mesma é `normal`, outra é `halftone`). Valores LITERAIS,
 * escritos à mão a partir da ficha, nunca calculados pelo código testado.
 */
describe('presetTone: tabela das embutidas e fallback das demais', () => {
  it('estrutura x arquitetura usa a tabela (halftone)', () => {
    expect(presetTone('estrutura', 'arquitetura')).toBe('halftone');
  });

  it('estrutura x hidrossanitario usa a tabela (hidden)', () => {
    expect(presetTone('estrutura', 'hidrossanitario')).toBe('hidden');
  });

  it('a mesma disciplina fora da tabela é normal', () => {
    expect(presetTone('paisagismo', 'paisagismo')).toBe('normal');
  });

  it('duas disciplinas diferentes fora da tabela: halftone', () => {
    expect(presetTone('paisagismo', 'estrutura')).toBe('halftone');
  });

  it('trabalho embutido x elemento fora da tabela: halftone', () => {
    expect(presetTone('estrutura', 'paisagismo')).toBe('halftone');
  });
});

describe('planTonesOf com disciplina fora das embutidas', () => {
  it('a própria disciplina é normal e as cinco embutidas são halftone', () => {
    expect(planTonesOf({ discipline: 'paisagismo' })).toEqual({
      arquitetura: 'halftone',
      estrutura: 'halftone',
      hidrossanitario: 'halftone',
      eletrico: 'halftone',
      hvac: 'halftone',
      paisagismo: 'normal',
    });
  });

  it('o desvio de PlanView.tones vence o predefinido (embutida)', () => {
    expect(planTonesOf({ discipline: 'paisagismo', tones: { eletrico: 'hidden' } })).toEqual({
      arquitetura: 'halftone',
      estrutura: 'halftone',
      hidrossanitario: 'halftone',
      eletrico: 'hidden',
      hvac: 'halftone',
      paisagismo: 'normal',
    });
  });
});

describe('isDisciplineId e isDiscipline', () => {
  it('identificador válido só como texto não vazio, sem espaços nas pontas', () => {
    expect(isDisciplineId('')).toBe(false);
    expect(isDisciplineId(' x')).toBe(false);
    expect(isDisciplineId(42)).toBe(false);
    expect(isDisciplineId('paisagismo')).toBe(true);
  });

  it('isDiscipline continua verdadeiro só para as cinco embutidas', () => {
    expect(isDiscipline('paisagismo')).toBe(false);
  });
});
