import { describe, expect, it } from 'vitest';
import { buildTemplate, createEmptyProject } from '@hestia/model';
import { levelDataOf, levelElevationLabel, levelProjectBox, LEVEL_HEAD_GAP, LEVEL_LINE_OFFSET } from './levelsData.ts';

describe('datum de nível no 3D (dados)', () => {
  it('cota com sinal e vírgula', () => {
    expect(levelElevationLabel(0)).toBe('+0,00');
    expect(levelElevationLabel(3)).toBe('+3,00');
    expect(levelElevationLabel(-1.2)).toBe('-1,20');
  });

  it('ordena por elevação e calcula Δ abaixo/acima', () => {
    const data = levelDataOf(buildTemplate('house2'));
    expect(data.map((d) => d.levelId)).toEqual(['lv_0', 'lv_1']);
    expect(data[0]!.deltaBelow).toBeUndefined();
    expect(data[0]!.deltaAbove).toBeCloseTo(3, 6);
    expect(data[1]!.deltaBelow).toBeCloseTo(3, 6);
    expect(data[1]!.deltaAbove).toBeUndefined();
    expect(data[0]!.text).toMatch(/Térreo \+0,00/);
    expect(data[1]!.text).toMatch(/Pavimento 2 \+3,00/);
  });

  it('a linha fica na caixa do projeto afastada, na cota do nível; o plano usa a margem curta', () => {
    const p = buildTemplate('house2');
    const box = levelProjectBox(p, LEVEL_LINE_OFFSET);
    const planoBox = levelProjectBox(p);
    const data = levelDataOf(p);
    for (const d of data) {
      expect(d.line.a).toMatchObject({ x: box.minX, y: box.minY, z: d.elevation });
      expect(d.line.b).toMatchObject({ x: box.maxX, y: box.minY, z: d.elevation });
      expect(d.headAt.x).toBeCloseTo(box.maxX + LEVEL_HEAD_GAP, 6);
      expect(d.textAt.x).toBeGreaterThan(d.headAt.x);
      expect(d.plane).toMatchObject({ ...planoBox, z: d.elevation });
      expect(d.plane.minY).toBeGreaterThan(box.minY);
    }
  });

  it('projeto sem paredes cai na caixa 0..10 e mantém o nível', () => {
    const p = structuredClone(createEmptyProject());
    p.levels = p.levels.slice(0, 1);
    const data = levelDataOf(p);
    expect(data).toHaveLength(1);
    expect(data[0]!.line.a.x).toBe(0);
    expect(data[0]!.line.b.x).toBe(10);
    expect(data[0]!.deltaBelow).toBeUndefined();
    expect(data[0]!.deltaAbove).toBeUndefined();
  });

  it('a caixa do projeto é a união das caixas dos níveis com margem', () => {
    const p = buildTemplate('house2');
    const box = levelProjectBox(p, 0);
    expect(box.maxX).toBeGreaterThan(box.minX);
    expect(box.maxY).toBeGreaterThan(box.minY);
    const comMargem = levelProjectBox(p, 2);
    expect(comMargem.minX).toBeCloseTo(box.minX - 2, 6);
    expect(comMargem.maxY).toBeCloseTo(box.maxY + 2, 6);
  });
});
