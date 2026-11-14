import { resolveUnits } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { displayValue, fieldToText, fieldUnitSymbol, parsePlainNumber, textToField } from './fieldUnits.ts';

const m = resolveUnits({ length: { unit: 'm', decimals: 2 }, decimalSymbol: ',' });
const cm = resolveUnits({ length: { unit: 'cm', decimals: 0 }, decimalSymbol: '.' });
const ftin = resolveUnits({ length: { unit: 'ft-in', decimals: 0 } });
const graus = resolveUnits({ angle: { unit: 'deg', decimals: 1 }, decimalSymbol: ',' });
const radianos = resolveUnits({ angle: { unit: 'rad', decimals: 3 } });
const L = { type: 'length' } as const;
const A = { type: 'angle' } as const;
const N = { type: 'number' } as const;

describe('campos de suplemento nas unidades do projeto', () => {
  it('comprimento: a API é metro; exibe e lê em m, cm e pés-polegadas', () => {
    expect(fieldToText(L, 2.5, m)).toBe('2,50');
    expect(fieldToText(L, 2.5, cm)).toBe('250');
    expect(textToField(L, '2,5', m)).toBeCloseTo(2.5, 9);
    expect(textToField(L, '250', cm)).toBeCloseTo(2.5, 9);
    expect(textToField(L, '1.5 m', cm)).toBeCloseTo(1.5, 9); // sufixo de unidade explícito vence a do projeto
    expect(textToField(L, "10'", ftin)).toBeCloseTo(3.048, 6);
    expect(fieldToText(L, 3.048, ftin)).toContain("10'");
    expect(textToField(L, 'abc', m)).toBeNull();
    expect(textToField(L, '', m)).toBeNull();
  });

  it('ângulo: a API é radiano; o projeto pode mostrar em graus', () => {
    expect(fieldToText(A, Math.PI / 2, graus)).toBe('90,0');
    expect(textToField(A, '90', graus)).toBeCloseTo(Math.PI / 2, 9);
    expect(textToField(A, '45,5', graus)).toBeCloseTo((45.5 * Math.PI) / 180, 9);
    expect(textToField(A, '1,5', radianos)).toBeCloseTo(1.5, 9);
    expect(fieldToText(A, 1.5, radianos)).toBe('1,500');
  });

  it('número sem unidade usa o separador decimal do projeto e aceita ponto ou vírgula', () => {
    expect(fieldToText(N, 1.25, m)).toBe('1,25');
    expect(fieldToText(N, 1.25, cm)).toBe('1.25');
    expect(parsePlainNumber('1,25')).toBe(1.25);
    expect(parsePlainNumber('1.25')).toBe(1.25);
    expect(parsePlainNumber('1,2,3')).toBeNull();
    expect(parsePlainNumber('1e5')).toBeNull();
    expect(parsePlainNumber(' ')).toBeNull();
  });

  it('símbolo ao lado do campo e valores de painel formatados', () => {
    expect(fieldUnitSymbol(L, m)).toBe('m');
    expect(fieldUnitSymbol(L, cm)).toBe('cm');
    expect(fieldUnitSymbol(L, ftin)).toBe('');
    expect(fieldUnitSymbol(A, graus)).toBe('°');
    expect(fieldUnitSymbol(N, m)).toBe('');
    expect(displayValue(2.5, 'length', cm)).toBe('250 cm');
    expect(displayValue(Math.PI, 'angle', graus)).toBe('180,0°');
    expect(displayValue('wall', undefined, m)).toBe('wall');
    expect(displayValue(undefined, undefined, m)).toBe('');
  });
});
