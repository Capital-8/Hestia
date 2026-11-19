import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES } from './defaults.ts';
import { OPENING_FAMILIES, openingFamilyOf, type OpeningFamilyId } from './opening.ts';
import { OPENING_SHAPE_KINDS, defaultOpeningShape } from './openingShapeKinds.ts';
import { compatibleShapes, familyShapeCompat, shapeCompat, shapeCompatMatrix, shapeIncompatible } from './openingShapeCompat.ts';

const FAMILIAS = OPENING_FAMILIES.map((f) => f.id);

describe('matriz de compatibilidade operação x forma (docs/estudo-esquadrias/39)', () => {
  it('cobre as 19 famílias x 9 formas, cada célula com veredito e motivo em português', () => {
    expect(FAMILIAS).toHaveLength(19);
    expect(OPENING_SHAPE_KINDS).toHaveLength(9);
    const m = shapeCompatMatrix();
    for (const f of FAMILIAS) {
      expect(Object.keys(m[f]).sort()).toEqual([...OPENING_SHAPE_KINDS].sort());
      for (const k of OPENING_SHAPE_KINDS) {
        const c = m[f][k];
        expect(['ok', 'adaptado', 'incompatível'], `${f}/${k}`).toContain(c.verdict);
        expect(c.reason.length, `${f}/${k}`).toBeGreaterThan(20);
        expect(c.rule).toMatch(/^G\d+$/);
      }
    }
  });

  it('o vão retangular é compatível com toda operação', () => {
    for (const f of FAMILIAS) expect(familyShapeCompat(f, 'rect').verdict, f).toBe('ok');
  });

  it('formas simples não restringem a fixa e o vão livre', () => {
    for (const f of ['window_fixed', 'window_void', 'door_void'] as OpeningFamilyId[]) for (const k of OPENING_SHAPE_KINDS) expect(familyShapeCompat(f, k).verdict, `${f}/${k}`).toBe('ok');
  });

  it('casos de referência: correr em círculo e sanfonada em arco são incompatíveis; giro em arco e pivô em círculo funcionam', () => {
    expect(familyShapeCompat('window_sliding', 'circle').verdict).toBe('incompatível');
    expect(familyShapeCompat('door_sliding', 'circle').verdict).toBe('incompatível');
    expect(familyShapeCompat('window_hung', 'circle').verdict).toBe('incompatível');
    expect(familyShapeCompat('door_accordion', 'pointed').verdict).toBe('incompatível');
    expect(familyShapeCompat('door_accordion', 'round').verdict).toBe('incompatível');
    expect(familyShapeCompat('door_swing', 'round').verdict).toBe('ok');
    expect(familyShapeCompat('door_swing', 'pointed').verdict).toBe('ok');
    expect(familyShapeCompat('window_pivot', 'circle').verdict).toBe('ok');
    expect(familyShapeCompat('window_tilt', 'circle').verdict).toBe('ok');
    expect(familyShapeCompat('window_sliding', 'pointed').verdict).toBe('adaptado');
    expect(familyShapeCompat('window_sliding', 'round').verdict).toBe('adaptado');
    expect(familyShapeCompat('window_casement', 'round').verdict).toBe('adaptado');
    // ferradura: o arco passa das ombreiras, nenhuma operação de giro ou eixo horizontal cabe
    for (const f of ['door_swing', 'window_hinged', 'window_casement', 'window_tilt'] as OpeningFamilyId[]) expect(familyShapeCompat(f, 'horseshoe').verdict, f).toBe('incompatível');
  });

  it('uma folha de abrir em círculo é adaptada; duas ou mais folhas em círculo são incompatíveis', () => {
    const um = { kind: 'window', plan: 'hinged', leaves: 1 } as const;
    const dois = { kind: 'window', plan: 'hinged', leaves: 2 } as const;
    expect(shapeCompat(um, 'circle').verdict).toBe('adaptado');
    expect(shapeCompat(dois, 'circle').verdict).toBe('incompatível');
    expect(shapeCompat(dois, 'round').verdict).toBe('ok');
  });

  it('basculante de eixo excêntrico em círculo passa a adaptado', () => {
    const t = { kind: 'window', plan: 'tilt', leaves: 1 } as const;
    expect(shapeCompat({ ...t, tiltAxis: 0.5 }, 'circle').verdict).toBe('ok');
    expect(shapeCompat({ ...t, tiltAxis: 0.25 }, 'circle').verdict).toBe('adaptado');
  });

  it('forma ausente, objeto de forma e tipo sem família', () => {
    const t = { kind: 'window', plan: 'sliding', leaves: 2 } as const;
    expect(shapeCompat(t, undefined).verdict).toBe('ok');
    expect(shapeCompat(t, defaultOpeningShape('circle', 1, 1)).verdict).toBe('incompatível');
    expect(shapeIncompatible(t, defaultOpeningShape('circle', 1, 1))).toBe(true);
    expect(shapeIncompatible(t, defaultOpeningShape('round', 1, 1.5))).toBe(false);
    expect(shapeCompat({ kind: 'window', plan: 'sliding', leaves: 1 }, 'circle').verdict).toBe('ok'); // família inexistente: quem recusa é openingTypeIssue
  });

  it('compatibleShapes: a lista da interface sempre traz o retângulo e tira só as incompatíveis', () => {
    const correr = compatibleShapes({ kind: 'window', plan: 'sliding', leaves: 2 });
    expect(correr).toContain('rect');
    expect(correr).toContain('round');
    expect(correr).not.toContain('circle');
    expect(correr).not.toContain('horseshoe');
    expect(compatibleShapes({ kind: 'window', plan: 'fixed', leaves: 1 })).toEqual([...OPENING_SHAPE_KINDS]);
    expect(compatibleShapes({ kind: 'door', plan: 'accordion', leaves: 1 })).toEqual(['rect']);
  });

  it('os 162 tipos do catálogo têm família e veredito para as 9 formas', () => {
    expect(DEFAULT_OPENING_TYPES).toHaveLength(162);
    for (const t of DEFAULT_OPENING_TYPES) {
      expect(openingFamilyOf(t), t.id).not.toBeNull();
      expect(compatibleShapes(t)).toContain('rect');
      for (const k of OPENING_SHAPE_KINDS) expect(['ok', 'adaptado', 'incompatível']).toContain(shapeCompat(t, k).verdict);
    }
  });

  it('os tipos do catálogo que já nascem com forma são compatíveis com ela (J-60 a J-64, P-86 a P-88)', () => {
    const comForma = DEFAULT_OPENING_TYPES.filter((t) => t.shape);
    expect(comForma.length).toBeGreaterThanOrEqual(8);
    for (const t of comForma) expect(shapeCompat(t, t.shape).verdict, `${t.id} ${t.shape!.kind}`).not.toBe('incompatível');
  });
});
