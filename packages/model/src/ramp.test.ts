import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RAMP_TYPES,
  ProjectStore,
  RAMP_SLOPE_EPS,
  createEmptyProject,
  defaultRampTypeId,
  formatRampPercent,
  formatRampRatio,
  formatRampSlope,
  makeRamp,
  migrateProject,
  rampMaxSlope,
  rampNormRowFor,
  rampTypeIssue,
  ramps,
  type Project,
  type RampNormRow,
} from './index.ts';

const typeOf = (id: string) => DEFAULT_RAMP_TYPES.find((t) => t.id === id)!;
const nbr = typeOf('rmt_nbr9050');

describe('makeRamp e tipos padrão', () => {
  it('rampa nova usa os valores padrão', () => {
    const r = makeRamp({ id: 'rp_1', typeId: defaultRampTypeId, levelId: 'lv_0' });
    expect(r).toMatchObject({
      id: 'rp_1',
      kind: 'ramp',
      levelId: 'lv_0',
      typeId: defaultRampTypeId,
      topLevelId: null,
      baseOffset: 0,
      topOffset: 0,
      height: 0.8,
      components: [],
      shape: 'straight',
      turn: 'left',
      landingDepth: 1.2,
      inputMode: 'length',
      slopeTarget: null,
      openingMode: 'headroom',
      openingHeadroom: null,
      openingMargin: 0.05,
      openingRect: false,
      mark: '',
      comments: '',
    });
  });

  it('os 2 tipos padrão passam na validação', () => {
    expect(DEFAULT_RAMP_TYPES).toHaveLength(2);
    for (const t of DEFAULT_RAMP_TYPES) expect(rampTypeIssue(t)).toBeNull();
  });

  it('project novo traz os tipos de rampa', () => {
    const p = createEmptyProject();
    expect(Object.keys(p.rampTypes).sort()).toEqual(['rmt_ada', 'rmt_nbr9050']);
    expect(p.rampTypes.rmt_nbr9050!.normChecked).toBe(false);
    expect(p.rampTypes.rmt_ada!.landingMinLength).toBeCloseTo(1.525);
  });

  it('valida os campos do tipo', () => {
    expect(rampTypeIssue({ ...nbr, defaultSlope: 0 })).toBe('A inclinação padrão deve ser maior que zero.');
    expect(rampTypeIssue({ ...nbr, structuralDepth: 0 })).toBe('A espessura estrutural deve ser maior que zero.');
    expect(rampTypeIssue({ ...nbr, normTable: [{ maxSlope: 0.1, maxRise: 1, maxFlights: null }, { maxSlope: 0.05, maxRise: 1, maxFlights: null }] })).toBe(
      'A tabela de norma deve estar em ordem crescente de inclinação, com valores positivos.',
    );
    expect(rampTypeIssue({ ...nbr, normTable: [{ maxSlope: 0.05, maxRise: 1, maxFlights: 0 }] })).toBe('O máximo de lances deve ser vazio ou um inteiro positivo.');
  });
});

describe('consulta da tabela de norma', () => {
  const rows: RampNormRow[] = nbr.normTable;

  it('escolhe a primeira linha que comporta a inclinação', () => {
    expect(rampNormRowFor(nbr, 0.05)!.maxRise).toBeCloseTo(1.5);
    expect(rampNormRowFor(nbr, 0.06)!.maxSlope).toBeCloseTo(0.0625);
    expect(rampNormRowFor(nbr, 1 / 12)!.maxRise).toBeCloseTo(0.8);
    expect(rampNormRowFor(nbr, 0.09)).toBeNull();
    expect(rampNormRowFor({ normTable: [] }, 0.05)).toBeNull();
    expect(rampNormRowFor(nbr, 0.05 + RAMP_SLOPE_EPS / 2)!.maxRise).toBeCloseTo(1.5);
  });

  it('maior inclinação da tabela é a da última linha', () => {
    expect(rampMaxSlope(nbr)).toBeCloseTo(rows[rows.length - 1]!.maxSlope);
    expect(rampMaxSlope({ normTable: [] })).toBeNull();
  });
});

describe('formatação da inclinação', () => {
  it('percentual com 2 casas e vírgula', () => {
    expect(formatRampPercent(1 / 12)).toBe('8,33 %');
    expect(formatRampPercent(0.075)).toBe('7,50 %');
    expect(formatRampPercent(0.05)).toBe('5,00 %');
  });

  it('razão 1:X com 1 casa, sem ,0 no fim', () => {
    expect(formatRampRatio(1 / 12)).toBe('1:12');
    expect(formatRampRatio(0.075)).toBe('1:13,3');
    expect(formatRampRatio(0.05)).toBe('1:20');
    expect(formatRampRatio(0)).toBe('—');
    expect(formatRampRatio(-0.1)).toBe('—');
  });

  it('texto composto', () => {
    expect(formatRampSlope(1 / 12)).toBe('8,33 % (1:12)');
    expect(formatRampSlope(0.05)).toBe('5,00 % (1:20)');
  });
});

describe('comandos da rampa', () => {
  it('addRamp com tipo inexistente lança', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'addRamp', ramp: makeRamp({ id: 'rp_1', typeId: 'nope', levelId: 'lv_0' }) })).toThrow('Tipo de rampa inexistente');
  });

  it('addRamp depois undo remove', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addRamp', ramp: makeRamp({ id: 'rp_1', typeId: defaultRampTypeId, levelId: 'lv_0' }) });
    expect(ramps(s.project)).toHaveLength(1);
    s.undo();
    expect(ramps(s.project)).toHaveLength(0);
  });

  it('deleteRampType em uso lança', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addRamp', ramp: makeRamp({ id: 'rp_1', typeId: defaultRampTypeId, levelId: 'lv_0' }) });
    expect(() => s.exec({ type: 'deleteRampType', id: defaultRampTypeId })).toThrow('Tipo em uso');
  });

  it('upsertRampType com tipo inválido lança', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'upsertRampType', rampType: { ...nbr, defaultWidth: 0 } })).toThrow('A largura padrão deve ser maior que zero.');
  });
});

describe('migração para a rampa', () => {
  it('projeto da versão antiga sem rampTypes ganha os 2 tipos e nenhuma rampa', () => {
    const raw = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown> & { schemaVersion: number; rampTypes?: unknown };
    raw.schemaVersion = 20;
    delete raw.rampTypes;
    const p: Project = migrateProject(raw);
    expect(p.schemaVersion).toBe(26);
    expect(Object.keys(p.rampTypes).sort()).toEqual(['rmt_ada', 'rmt_nbr9050']);
    expect(ramps(p)).toHaveLength(0);
  });
});
