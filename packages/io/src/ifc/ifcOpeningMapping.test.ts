import { describe, expect, it } from 'vitest';
import { createEmptyProject, type OpeningType } from '@hestia/model';
import {
  doorGlazingAreaFraction,
  doorOperation,
  doorOperationOf,
  doorPredefinedType,
  openingGlazingProps,
  windowLeafOperation,
  windowOperation,
  windowPartitionOf,
} from './ifcOpeningTypes.ts';

/** Tipo de porta de referência do projeto vazio, com os campos de teste sobrescritos. */
const porta = (extra: Partial<OpeningType>): OpeningType => ({ ...createEmptyProject().openingTypes.ot_p90!, kind: 'door', ...extra });
const janela = (extra: Partial<OpeningType>): OpeningType => ({ ...createEmptyProject().openingTypes.ot_ja120!, kind: 'window', ...extra });

describe('B1: porta pivotante não vira REVOLVING', () => {
  it('pivot = USERDEFINED com rótulo PIVOT', () => {
    expect(doorOperationOf({ plan: 'pivot' }, false)).toEqual({ operation: 'USERDEFINED', userDefined: 'PIVOT' });
    expect(doorOperation({ plan: 'pivot' }, false)).not.toBe('REVOLVING');
  });
});

describe('B2: duas folhas usam a família de duas folhas', () => {
  it('porta de giro com duas folhas = DOUBLE_DOOR_SINGLE_SWING, não DOUBLE_DOOR_DOUBLE_SWING', () => {
    expect(doorOperation({ plan: 'double', leaves: 2 }, false)).toBe('DOUBLE_DOOR_SINGLE_SWING');
    expect(doorOperation({ plan: 'double', leaves: 2 }, true)).toBe('DOUBLE_DOOR_SINGLE_SWING');
  });

  it('vai-e-vem: uma folha = DOUBLE_SWING_*, duas folhas = DOUBLE_DOOR_DOUBLE_SWING', () => {
    expect(doorOperation({ plan: 'dblact', leaves: 1 }, false)).toBe('DOUBLE_SWING_LEFT');
    expect(doorOperation({ plan: 'dblact', leaves: 2 }, false)).toBe('DOUBLE_DOOR_DOUBLE_SWING');
  });
});

describe('B3: número de folhas da porta', () => {
  it('correr, sanfonada e dobrável com duas folhas usam o valor DOUBLE_DOOR_*', () => {
    expect(doorOperation({ plan: 'sliding', leaves: 2 }, false)).toBe('DOUBLE_DOOR_SLIDING');
    expect(doorOperation({ plan: 'bifold', leaves: 2 }, false)).toBe('DOUBLE_DOOR_FOLDING');
    expect(doorOperation({ plan: 'accordion', leaves: 2 }, true)).toBe('DOUBLE_DOOR_FOLDING');
  });

  it('uma folha com painel fixo lateral = SWING_FIXED_*', () => {
    expect(doorOperation({ plan: 'swing', leaves: 1, sidelights: { left: true, width: 0.4 } }, false)).toBe('SWING_FIXED_LEFT');
    expect(doorOperation({ plan: 'swing', leaves: 1, sidelights: { right: true, width: 0.4 } }, true)).toBe('SWING_FIXED_RIGHT');
  });

  it('uma folha sem painel lateral continua SINGLE_SWING', () => {
    expect(doorOperation({ plan: 'swing', leaves: 1 }, false)).toBe('SINGLE_SWING_LEFT');
  });
});

describe('B4: portão seccionado de garagem', () => {
  it('ROLLINGUP com PredefinedType GATE; as demais portas seguem DOOR', () => {
    expect(doorOperation({ plan: 'garage' }, false)).toBe('ROLLINGUP');
    expect(doorPredefinedType({ plan: 'garage' })).toBe('GATE');
    expect(doorPredefinedType({ plan: 'swing' })).toBe('DOOR');
  });
});

describe('B5: divisão da janela (grade, bandeira e número de folhas)', () => {
  it('quatro ou mais folhas não viram TRIPLE_PANEL_VERTICAL: USERDEFINED com rótulo', () => {
    expect(windowPartitionOf({ leaves: 4 })).toEqual({ partition: 'USERDEFINED', userDefined: '4 FOLHAS' });
    expect(windowPartitionOf({ leaves: 3 })).toEqual({ partition: 'TRIPLE_PANEL_VERTICAL' });
    expect(windowPartitionOf({ leaves: 2 })).toEqual({ partition: 'DOUBLE_PANEL_VERTICAL' });
    expect(windowPartitionOf({ leaves: 1 })).toEqual({ partition: 'SINGLE_PANEL' });
  });

  it('grade n×m = USERDEFINED com o rótulo da grade', () => {
    expect(windowPartitionOf({ leaves: 1, grid: { cols: 2, rows: 3 } })).toEqual({ partition: 'USERDEFINED', userDefined: 'GRADE 2x3' });
  });

  it('bandeira sobre uma folha = DOUBLE_PANEL_HORIZONTAL; bandeira com mais folhas = USERDEFINED', () => {
    expect(windowPartitionOf({ leaves: 1, transom: { height: 0.4 } })).toEqual({ partition: 'DOUBLE_PANEL_HORIZONTAL' });
    expect(windowPartitionOf({ leaves: 2, transom: { height: 0.4 } }).partition).toBe('USERDEFINED');
  });
});

describe('B6: uma folha de janela, um painel com a posição dela', () => {
  it('janela de giro com duas folhas espelha a dobradiça da segunda', () => {
    const t = janela({ plan: 'hinged', leaves: 2 });
    expect(windowLeafOperation(t, false, 0)).toBe('SIDEHUNGLEFTHAND');
    expect(windowLeafOperation(t, false, 1)).toBe('SIDEHUNGRIGHTHAND');
  });

  it('janela de correr com duas folhas: as duas abrem igual', () => {
    const t = janela({ plan: 'sliding', leaves: 2 });
    expect(windowLeafOperation(t, false, 0)).toBe('SLIDINGHORIZONTAL');
    expect(windowLeafOperation(t, false, 1)).toBe('SLIDINGHORIZONTAL');
  });
});

describe('B7: basculante', () => {
  it('eixo central (padrão ou 0,5) = PIVOTHORIZONTAL; eixo deslocado = OTHEROPERATION', () => {
    expect(windowOperation({ plan: 'tilt' }, false)).toBe('PIVOTHORIZONTAL');
    expect(windowOperation({ plan: 'tilt', tiltAxis: 0.5 }, false)).toBe('PIVOTHORIZONTAL');
    expect(windowOperation({ plan: 'tilt', tiltAxis: 0.2 }, false)).toBe('OTHEROPERATION');
    expect(windowOperation({ plan: 'tilt', tiltAxis: 0.8 }, false)).toBe('OTHEROPERATION');
  });
});

describe('B9: fator solar no Pset_DoorWindowGlazingType, só da janela', () => {
  it('janela com fator solar: pset próprio com IfcNormalisedRatioMeasure', () => {
    expect(openingGlazingProps(janela({ solarFactor: 0.35 }))).toEqual([['SolarHeatGainTransmittance', { ifc: 'IFCNORMALISEDRATIOMEASURE', value: 0.35 }]]);
  });

  it('sem fator solar, ou porta, não há conjunto', () => {
    expect(openingGlazingProps(janela({}))).toEqual([]);
    expect(openingGlazingProps(porta({ solarFactor: 0.5 }))).toEqual([]);
  });
});

describe('B11: fração vidrada da porta', () => {
  it('glassRatio × altura da folha sobre a altura do vão', () => {
    expect(doorGlazingAreaFraction(porta({ glassRatio: 0.5 }), 2.1)).toBeCloseTo(0.5, 9);
  });

  it('bandeira reduz a altura da folha', () => {
    expect(doorGlazingAreaFraction(porta({ glassRatio: 0.5, transom: { height: 0.3 } }), 2.1)).toBeCloseTo((0.5 * 1.8) / 2.1, 9);
  });

  it('porta sem vidro ou vão livre não tem fração', () => {
    expect(doorGlazingAreaFraction(porta({}), 2.1)).toBeNull();
    expect(doorGlazingAreaFraction(porta({ glassRatio: 0.5, leaves: 0 }), 2.1)).toBeNull();
  });
});
