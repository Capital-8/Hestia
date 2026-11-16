import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, defaultUnits, type OpeningType } from '@hestia/model';
import { openingChecks } from './openingChecks.ts';

/*
 * Verificações do recuo do batente: batente fixo de 0,09 em parede de 0,20 (núcleo 0,20): folga de (0,20 - 0,09) / 2 = 0,055.
 */
const base = DEFAULT_OPENING_TYPES.find((t) => t.id === 'ot_p90')!;
const tipo = (extra: Partial<OpeningType>): OpeningType => ({ ...base, frameDepthMode: 'fixed', frameDepth: 0.09, ...extra });
const recuo = (t: OpeningType, parede?: number, nucleo = 0.2) => openingChecks(t, nucleo, defaultUnits(), 'pt', parede).find((c) => c.text.includes('Recuo do batente'));

describe('verificações: recuo do batente', () => {
  it('sem recuo, sem parede ou com recuo 0: nenhuma linha nova', () => {
    expect(recuo(tipo({}), 0.2)).toBeUndefined();
    expect(recuo(tipo({ reveal: { depth: 0 } }), 0.2)).toBeUndefined();
    expect(recuo(tipo({ reveal: { depth: 0.05 } }))).toBeUndefined();
    expect(openingChecks(tipo({}), 0.2).length).toBe(openingChecks(tipo({ reveal: { depth: 0.05 } }), 0.2).length);
  });

  it('0,05 cabe (limite 0,055): ok', () => {
    const c = recuo(tipo({ reveal: { depth: 0.05 } }), 0.2);
    expect(c?.level).toBe('ok');
    expect(c?.text).toContain('0,06');
  });

  it('0,10 passa do limite: aviso diz que foi limitado a 0,055', () => {
    const c = recuo(tipo({ reveal: { depth: 0.1 } }), 0.2);
    expect(c?.level).toBe('warn');
    expect(c?.text).toContain('limitado');
    expect(c?.text).toContain('0,06');
  });

  it('parede fina (0,09, batente 0,09): limite 0, aviso', () => {
    const c = recuo(tipo({ reveal: { depth: 0.01 } }), 0.09, 0.09);
    expect(c?.level).toBe('warn');
  });

  it('batente no modo wall ocupa a parede: qualquer recuo é limitado a 0', () => {
    const c = recuo({ ...base, frameDepthMode: 'wall', reveal: { depth: 0.03 } }, 0.2);
    expect(c?.level).toBe('warn');
  });
});
