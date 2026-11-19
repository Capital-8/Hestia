import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeLevel, makeWall } from '@hestia/model';
import { pickAt } from './pick.ts';

describe('seleção na planta do N2 de uma parede do N1 que termina no N3', () => {
  it('pega a parede cruzante no N2 e não pega no N3', () => {
    const base = createEmptyProject();
    const s = new ProjectStore({ ...base, levels: [...base.levels, makeLevel({ id: 'lv_2', name: 'N3', elevation: 6 })] });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'W1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, topLevelId: 'lv_2', topOffset: 0 }) });
    expect(pickAt(s.project, 'lv_1', { x: 2, y: 0 }, 0.01)).toMatchObject({ id: 'W1' });
    expect(pickAt(s.project, 'lv_2', { x: 2, y: 0 }, 0.01)).toBeNull();
  });
});
