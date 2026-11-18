import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENING_TYPES, type OpeningType } from '@hestia/model';
import { setSettingClearance, setSettingSystem } from './openingTypeControls.ts';

const base = (): OpeningType => ({ ...DEFAULT_OPENING_TYPES.find((t) => t.kind === 'door')! });

describe('controles da folga de assentamento no tipo', () => {
  it('sistema: escolher grava o campo; vazio tira o campo (volta a folga zero, como antes)', () => {
    const com = setSettingSystem(base(), 'grapa');
    expect(com.settingSystem).toBe('grapa');
    const sem = setSettingSystem(com, '');
    expect('settingSystem' in sem).toBe(false);
  });

  it('folga por lado: grava em metros arredondados ao 0,1 mm e nunca negativa', () => {
    expect(setSettingClearance(base(), 0.0123456).settingClearance).toBeCloseTo(0.0123, 9);
    expect(setSettingClearance(base(), -0.01).settingClearance).toBeUndefined(); // negativo vira zero, que é o padrão sem sistema
  });

  it('igual ao padrão do sistema tira o campo (volta à leitura); outro valor grava', () => {
    const com = setSettingSystem(base(), 'contramarco');
    expect(setSettingClearance(com, 0.025).settingClearance).toBeUndefined();
    expect(setSettingClearance(com, 0.02).settingClearance).toBeCloseTo(0.02, 9);
    expect(setSettingClearance(base(), 0).settingClearance).toBeUndefined();
  });

  it('não altera o tipo original (função pura)', () => {
    const t = base();
    setSettingSystem(t, 'espuma');
    expect(t.settingSystem).toBeUndefined();
  });
});
