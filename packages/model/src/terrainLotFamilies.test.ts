import { describe, expect, it } from 'vitest';
import { defaultLotFamilyIdOf, defaultTerrainTextFamilyIdOf, formatLengthByFamily, lotFamilyFor, removeLotFamilyFrom, removeTerrainTextFamilyFrom, terrainTextFamiliesOf, terrainTextFamilyFor, writeLotFamily, writeTerrainTextFamily } from './terrainLotFamilies.ts';
import type { Project, ProjectSettings } from './types.ts';

const s0 = {} as ProjectSettings;

describe('famílias do terreno e do lote', () => {
  it('padrões: 1,8 mm para curva e cota de ponto; 1,5 mm para o lote', () => {
    expect(terrainTextFamilyFor(s0, 'contour').textMm).toBe(1.8);
    expect(terrainTextFamilyFor(s0, 'spot').textMm).toBe(1.8);
    expect(lotFamilyFor(s0).textMm).toBe(1.5);
    expect(terrainTextFamiliesOf(s0, 'spot').map((f) => f.id)).toEqual(['tntxt_spot_std', 'tntxt_spot_title']);
  });
  it('upsert grava a lista inteira e o padrão é o escolhido', () => {
    const f = { ...terrainTextFamilyFor(s0, 'spot'), id: 'x1', name: 'X', textMm: 3 };
    const s1 = { ...writeTerrainTextFamily(s0, f), defaultTerrainSpotFamilyId: 'x1' };
    expect(defaultTerrainTextFamilyIdOf(s1, 'spot')).toBe('x1');
    expect(terrainTextFamilyFor(s1, 'spot', 'x1').textMm).toBe(3);
    expect(terrainTextFamilyFor(s1, 'spot', 'inexistente').id).toBe('x1');
  });
  it('remover tira o padrão e nunca a última de um tipo', () => {
    const s1 = { ...writeTerrainTextFamily(s0, { ...terrainTextFamilyFor(s0, 'spot'), id: 'x1', name: 'X' }), defaultTerrainSpotFamilyId: 'x1' };
    const s2 = removeTerrainTextFamilyFrom(s1, 'x1');
    expect(s2.defaultTerrainSpotFamilyId).toBeUndefined();
    expect(removeTerrainTextFamilyFrom(s0, 'tntxt_contour_std')).toBe(s0);
    const l1 = { ...writeLotFamily(s0, { ...lotFamilyFor(s0), id: 'l1', name: 'L' }), defaultLotFamilyId: 'l1' };
    expect(defaultLotFamilyIdOf(l1)).toBe('l1');
    expect(removeLotFamilyFrom(l1, 'l1').defaultLotFamilyId).toBeUndefined();
  });
  it('formata o comprimento pela unidade e casas da família', () => {
    const p = { settings: s0 } as Project;
    expect(formatLengthByFamily(p, 12.3456, { unit: 'cm', precision: 1 })).toBe('1234,6 cm');
    expect(formatLengthByFamily(p, 12.3456, { unit: 'm', precision: 3 })).toBe('12,346 m');
  });
});
