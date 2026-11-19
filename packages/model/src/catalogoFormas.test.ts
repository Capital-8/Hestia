import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, openingFamilyOf, openingName, openingShapeOf, openingShapeProblems, openingTypeCatalog, outline, type OpeningType } from './index.ts';
import { catalogoFormas } from './catalogoFormas.ts';

const COM_FORMA = DEFAULT_OPENING_TYPES.filter((t) => t.shape);

describe('catálogo com forma de vão (docs/estudo-esquadrias/34)', () => {
  it('8 tipos novos: 3 portas e 5 janelas, com os códigos P-86 a P-88 e J-60 a J-64', () => {
    expect(COM_FORMA.map((t) => t.code)).toEqual(['P-86', 'P-87', 'P-88', 'J-60', 'J-61', 'J-62', 'J-63', 'J-64']);
    expect(COM_FORMA.filter((t) => t.kind === 'door')).toHaveLength(3);
    expect(COM_FORMA.filter((t) => t.kind === 'window')).toHaveLength(5);
    expect(DEFAULT_OPENING_TYPES).toHaveLength(162);
  });

  it('só as formas que as fontes sustentam: arco pleno, abatido, ogival, círculo e empena (sem ferradura nem trapézio)', () => {
    expect(new Set(COM_FORMA.map((t) => t.shape!.kind))).toEqual(new Set(['round', 'segmental', 'pointed', 'circle', 'gable']));
  });

  it('todos marcam "Dimensão ilustrativa" no campo de nota', () => {
    for (const t of COM_FORMA) expect(t.description, t.id).toMatch(/^Dimensão ilustrativa\./);
  });

  it('a forma é válida no vão do tipo, tem contorno e a família é a esperada', () => {
    for (const t of COM_FORMA) {
      expect(openingShapeProblems(t), t.id).toEqual([]);
      const s = openingShapeOf(t)!;
      expect(s.width, t.id).toBeCloseTo(t.width, 9);
      expect(s.height, t.id).toBeCloseTo(t.height, 9);
      expect(outline(s).length, t.id).toBeGreaterThanOrEqual(4);
      expect(openingFamilyOf(t), t.id).not.toBeNull();
      expect(t.nominalRef, t.id).toBeUndefined();
    }
  });

  it('os 154 tipos de antes ficam como eram: nenhum tem forma, e a lista deles é prefixo da nova', () => {
    const antes = DEFAULT_OPENING_TYPES.filter((t) => !t.shape);
    expect(antes).toHaveLength(154);
    for (const t of antes) expect('shape' in t, t.id).toBe(false);
    expect(openingTypeCatalog('pt').slice(0, 154).every((t: OpeningType) => !t.shape)).toBe(true);
  });

  it('nomes traduzidos nos 7 idiomas, sem sobra de português', () => {
    for (const lang of ['en', 'es', 'de', 'fr', 'it', 'pl'] as const) {
      for (const t of catalogoFormas(lang)) {
        expect(t.name, `${lang} ${t.id}`).not.toMatch(/\b(Porta|Janela|arco|empena|óculo)\b/);
      }
    }
    expect(openingName('Janela circular (óculo) 80 x 80', 'en')).toBe('Round Window (Oculus) 80 x 80');
  });

  it('cada chamada devolve formas independentes (editar uma cópia não muda o catálogo)', () => {
    const a = catalogoFormas('pt');
    (a[0]!.shape as { width: number }).width = 9;
    expect((catalogoFormas('pt')[0]!.shape as { width: number }).width).toBe(0.9);
  });
});
