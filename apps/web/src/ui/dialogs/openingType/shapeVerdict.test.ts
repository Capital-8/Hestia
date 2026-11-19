import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, OPENING_SHAPE_KINDS, type OpeningType } from '@hestia/model';
import { t } from '../../../editor/i18n.ts';
import { shapeVerdictOf, verdictMark, verdictMessageKey, type ShapeVerdict } from './shapeVerdict.ts';

const tipo = (id: string): OpeningType => DEFAULT_OPENING_TYPES.find((x) => x.id === id)!;

describe('veredito tipo x forma no seletor de forma (matriz de openingShapeCompat)', () => {
  it('porta de giro: arcos e empena ok, círculo adaptado, ferradura incompatível; retangular sempre ok', () => {
    const p = tipo('ot_pgiro90');
    expect(shapeVerdictOf(p, 'rect').verdict).toBe('ok');
    expect(shapeVerdictOf(p, 'round').verdict).toBe('ok');
    expect(shapeVerdictOf(p, 'gable').verdict).toBe('ok');
    expect(shapeVerdictOf(p, 'circle').verdict).toBe('adaptado');
    expect(shapeVerdictOf(p, 'horseshoe').verdict).toBe('incompatível');
    expect(shapeVerdictOf(p, 'horseshoe').reason.length).toBeGreaterThan(10);
  });

  it('janela de correr: arco adaptado (só o trecho reto corre), círculo incompatível', () => {
    const j = tipo('ot_j120');
    expect(shapeVerdictOf(j, 'round').verdict).toBe('adaptado');
    expect(shapeVerdictOf(j, 'circle').verdict).toBe('incompatível');
  });

  it('todos os 162 tipos x as 9 formas têm veredito, e o retangular nunca é problema', () => {
    for (const d of DEFAULT_OPENING_TYPES) {
      for (const k of OPENING_SHAPE_KINDS) {
        const v = shapeVerdictOf(d, k);
        expect(['ok', 'adaptado', 'incompatível']).toContain(v.verdict);
        if (k === 'rect') expect(v.verdict).toBe('ok');
      }
    }
  });

  it('marca e mensagem: só aparecem para adaptado e incompatível, e existem nos 7 idiomas', () => {
    expect(verdictMark('ok')).toBeNull();
    expect(verdictMessageKey('ok')).toBeNull();
    for (const v of ['adaptado', 'incompatível'] as ShapeVerdict[]) {
      const mark = verdictMark(v)!;
      const msg = verdictMessageKey(v)!;
      for (const lang of ['pt', 'en', 'es', 'de', 'fr', 'it', 'pl'] as const) {
        expect(t(lang, mark.key).length).toBeGreaterThan(0);
        expect(t(lang, msg).length).toBeGreaterThan(10);
      }
    }
    expect(verdictMark('incompatível')!.icon).not.toBe(verdictMark('adaptado')!.icon);
  });
});
