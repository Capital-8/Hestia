import { describe, expect, it } from 'vitest';
import { createEmptyProject, migrateProject, type Project } from './index.ts';
import { lintelOverWarning, openingRough, openingSettingClearance, SETTING_CLEARANCE_DEFAULTS } from './openingExtras.ts';
import { acabamentoIssue } from './openingExtras.ts';
import { DEFAULT_OPENING_TYPES } from './index.ts';

/** Projeto com os campos novos (folga de assentamento e verga) e um antigo, sem eles, para a migração. */
function comCampos(): Project {
  const p = createEmptyProject();
  const base = DEFAULT_OPENING_TYPES.find((t) => t.kind === 'door')!;
  p.openingTypes = {
    ...p.openingTypes,
    ot_novo: { ...base, id: 'ot_novo', settingSystem: 'espuma', settingClearance: 0.012, lintel: { over: 0.15 } },
    ot_antigo: { ...base, id: 'ot_antigo' },
  };
  return p;
}

describe('folga de assentamento e verga no projeto (round-trip, sem perda)', () => {
  it('os campos opcionais sobrevivem à gravação em JSON e à migração', () => {
    const p = comCampos();
    const back = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(back.openingTypes.ot_novo).toMatchObject({ settingSystem: 'espuma', settingClearance: 0.012, lintel: { over: 0.15 } });
    expect(back.openingTypes.ot_antigo!.settingSystem).toBeUndefined();
    expect(back).toEqual(migrateProject(JSON.parse(JSON.stringify(back))));
  });

  it('tipo antigo (sem os campos) tem a mesma folga e o mesmo vão bruto de antes', () => {
    const antigo = comCampos().openingTypes.ot_antigo!;
    expect(openingSettingClearance(antigo)).toBe(0);
    expect(openingRough(antigo)).toEqual({ width: antigo.width + (antigo.roughOversize?.w ?? 0), height: antigo.height + (antigo.roughOversize?.h ?? 0) });
  });

  it('valores de folga do sistema e a sobrescrita pelo tipo', () => {
    expect(openingSettingClearance({ settingSystem: 'grapa' })).toBe(SETTING_CLEARANCE_DEFAULTS.grapa);
    expect(openingSettingClearance({ settingSystem: 'espuma', settingClearance: 0.012 })).toBe(0.012);
    expect(openingSettingClearance({ settingSystem: 'espuma', settingClearance: -1 })).toBe(SETTING_CLEARANCE_DEFAULTS.espuma);
  });

  it('acabamentoIssue recusa folga fora da faixa e sistema desconhecido; aceita o que é válido', () => {
    expect(acabamentoIssue({ settingClearance: 0.06 })).toBe('Folga de assentamento: use um valor de 0 a 5 cm.');
    expect(acabamentoIssue({ settingSystem: 'ferro' as 'grapa' })).toBe('Sistema de assentamento: use grapa, espuma ou contramarco.');
    expect(acabamentoIssue({ settingSystem: 'grapa', settingClearance: 0.005 })).toBeNull();
  });

  it('transpasse abaixo do mínimo gera aviso (não erro); acima ou sem verga, não', () => {
    expect(lintelOverWarning({ lintel: { over: 0.15 } }, 'pt')).toBe('Transpasse da verga de 15 cm é menor que o mínimo de referência de 20 cm: o estrutural prevalece. Confira no projeto estrutural.');
    expect(lintelOverWarning({ lintel: { over: 0.15 } }, 'en')).toMatch(/structural design prevails/);
    expect(lintelOverWarning({ lintel: { over: 0.3 } }, 'pt')).toBeNull();
    expect(lintelOverWarning({}, 'pt')).toBeNull();
    expect(acabamentoIssue({ lintel: { over: 0.15 } })).toBeNull(); // o aviso não bloqueia o salvamento
  });
});
