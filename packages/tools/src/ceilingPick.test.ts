import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeCeiling } from '@hestia/model';
import { pickCeilingAt } from './ceilingPick.ts';

const RECT = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];

function store(direction: 'down' | 'up') {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c', typeId: 'ct_gesso', levelId: 'lv_0', boundary: RECT }) });
  if (direction === 'up') s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { direction: 'up' } });
  return s.project;
}

describe('captura de forro', () => {
  it('na planta de forro acha o forro pelo interior e pela borda', () => {
    expect(pickCeilingAt(store('up'), 'lv_0', { x: 2, y: 1 }, 0.01)).toBe('c');
    expect(pickCeilingAt(store('up'), 'lv_0', { x: 4, y: 1.5 }, 0.01)).toBe('c');
    expect(pickCeilingAt(store('up'), 'lv_0', { x: 9, y: 9 }, 0.01)).toBeNull();
  });

  it('na planta baixa o forro não é clicável', () => {
    expect(pickCeilingAt(store('down'), 'lv_0', { x: 2, y: 1 }, 0.01)).toBeNull();
  });
});
