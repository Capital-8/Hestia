import { describe, expect, it } from 'vitest';
import { floorViewId, roofViewId } from '@hestia/model';
import { viewIdOfEnv } from './vistaDoAmbiente.ts';

describe('viewIdOfEnv', () => {
  it('sem vista informada, a vista é a planta de piso do nível', () => {
    expect(viewIdOfEnv({ levelId: () => 'nivel-1' })).toBe(floorViewId('nivel-1'));
  });

  it('com env.viewId, a vista informada pelo editor vence: planta de área é a própria vista', () => {
    expect(viewIdOfEnv({ levelId: () => 'nivel-1', viewId: 'area-9' })).toBe('area-9');
  });

  it('com env.viewId, a cobertura não cai no piso', () => {
    expect(viewIdOfEnv({ levelId: () => 'nivel-1', viewId: roofViewId('nivel-1') })).toBe(roofViewId('nivel-1'));
  });
});
