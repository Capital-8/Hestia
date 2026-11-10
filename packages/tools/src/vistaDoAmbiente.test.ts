import { describe, expect, it } from 'vitest';
import { floorViewId } from '@hestia/model';
import { viewIdOfEnv } from './vistaDoAmbiente.ts';

describe('viewIdOfEnv', () => {
  it('sem planta de área aberta, a vista é a planta de piso do nível', () => {
    expect(viewIdOfEnv({ levelId: () => 'nivel-1' })).toBe(floorViewId('nivel-1'));
    expect(viewIdOfEnv({ levelId: () => 'nivel-1', areaPlanId: () => null })).toBe(floorViewId('nivel-1'));
  });

  it('com planta de área aberta, a vista é a própria planta de área', () => {
    expect(viewIdOfEnv({ levelId: () => 'nivel-1', areaPlanId: () => 'area-9' })).toBe('area-9');
  });

  it('planta de área vence o nível mesmo quando o id de área é texto qualquer', () => {
    expect(viewIdOfEnv({ levelId: () => 'nivel-2', areaPlanId: () => 'ambiente-x' })).toBe('ambiente-x');
  });
});
