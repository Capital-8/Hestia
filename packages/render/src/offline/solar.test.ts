import { describe, expect, it } from 'vitest';
import { dayOfYear, solarPosition } from './solar.ts';

describe('posição solar', () => {
  it('dia do ano', () => {
    expect(dayOfYear('2026-01-01')).toBe(1);
    expect(dayOfYear('2026-06-21')).toBe(172);
    expect(dayOfYear('2026-12-31')).toBe(365);
  });

  it('ao meio-dia a elevação é maior que de manhã e à tarde', () => {
    const base = { date: '2026-06-21', latitude: -23.55, longitude: -46.63, timezone: -3 };
    const manha = solarPosition({ ...base, hour: 8 });
    const meio = solarPosition({ ...base, hour: 12 });
    const tarde = solarPosition({ ...base, hour: 17 });
    expect(meio.elevation).toBeGreaterThan(manha.elevation);
    expect(meio.elevation).toBeGreaterThan(tarde.elevation);
  });

  it('manhã e tarde ficam em lados opostos do céu', () => {
    const base = { date: '2026-06-21', latitude: -23.55, longitude: -46.63, timezone: -3 };
    const manha = solarPosition({ ...base, hour: 9 });
    const tarde = solarPosition({ ...base, hour: 16 });
    expect(Math.abs(manha.azimuth - tarde.azimuth)).toBeGreaterThan(60);
  });

  it('devolve ângulos no intervalo esperado', () => {
    const p = solarPosition({ date: '2026-03-20', latitude: 0, longitude: 0, hour: 12 });
    expect(p.azimuth).toBeGreaterThanOrEqual(0);
    expect(p.azimuth).toBeLessThan(360);
    expect(p.elevation).toBeGreaterThan(80);
  });
});
