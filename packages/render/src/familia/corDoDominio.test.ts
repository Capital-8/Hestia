import type { DominioLigacao } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { COR_DOMINIO, corCssDoDominio, corDoDominio } from './corDoDominio.ts';

const TODOS: DominioLigacao[] = [
  'agua_fria', 'agua_quente', 'esgoto', 'ventilacao', 'pluvial', 'gas', 'incendio', 'eletrica_forca', 'eletrica_dados',
  'eletroduto', 'eletrocalha', 'ar_insuflamento', 'ar_retorno', 'refrigerante', 'estrutural',
];

describe('corDoDominio', () => {
  it('todo domínio tem cor, e só os quinze domínios do modelo estão no mapa', () => {
    expect(Object.keys(COR_DOMINIO).sort()).toEqual([...TODOS].sort());
    for (const d of TODOS) expect(Number.isInteger(corDoDominio(d))).toBe(true);
  });

  it('cores de domínios diferentes são diferentes (cada domínio se distingue no 3D)', () => {
    const valores = new Set(TODOS.map((d) => corDoDominio(d)));
    expect(valores.size).toBe(TODOS.length);
  });

  it('valores ficam no intervalo 0xRRGGBB', () => {
    for (const d of TODOS) {
      expect(corDoDominio(d)).toBeGreaterThanOrEqual(0);
      expect(corDoDominio(d)).toBeLessThanOrEqual(0xffffff);
    }
  });

  it('a cor CSS é o mesmo valor em "#rrggbb"', () => {
    expect(corCssDoDominio('agua_fria')).toBe('#1e88e5');
    expect(corCssDoDominio('esgoto')).toBe('#6d4c41');
    expect(corCssDoDominio('pluvial')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
