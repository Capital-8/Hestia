import { describe, expect, it } from 'vitest';
import { makeStair, type Stair } from '@hestia/model';
import { RISER_MODE_OPTIONS, riserModeOf } from './StairProperties.tsx';

const base = (extra: Partial<Stair> = {}): Stair =>
  ({ ...makeStair({ id: 'st1', typeId: 'stt_monolitica', levelId: 'lv_0' }), order: 0, ...extra }) as Stair;

describe('modo dos espelhos nas propriedades da escada', () => {
  it('escada sem o campo é automática (padrão do modelo)', () => {
    expect(riserModeOf(base())).toBe('auto');
  });

  it('respeita o modo fixo gravado', () => {
    expect(riserModeOf(base({ riserMode: 'fixed' }))).toBe('fixed');
    expect(riserModeOf(base({ riserMode: 'auto' }))).toBe('auto');
  });

  it('o select oferece automático e fixo, nesta ordem', () => {
    expect(RISER_MODE_OPTIONS.map((o) => o.value)).toEqual(['auto', 'fixed']);
  });

  it('os rótulos dizem o efeito de cada modo', () => {
    expect(RISER_MODE_OPTIONS.map((o) => o.label)).toEqual(['Automático (recalcula e continua)', 'Fixo (mantém o desenho)']);
  });
});
