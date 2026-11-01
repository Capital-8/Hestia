import { describe, expect, it } from 'vitest';
import { DEFAULT_STAIR_TYPES, type StairType } from '@hestia/model';
import { duplicateDraft, finalizeForSave, hasUnsavedChanges, preserveOnStyleChange, validateStairType, STAIR_FIELD_LIMITS } from './stairTypeForm.ts';

const mono = (over: Partial<StairType> = {}): StairType => ({ ...structuredClone(DEFAULT_STAIR_TYPES[0]!), ...over });
const errors = (t: StairType): string[] => validateStairType(t).filter((i) => i.severity === 'error').map((i) => i.code);
const warnings = (t: StairType): string[] => validateStairType(t).filter((i) => i.severity === 'warning').map((i) => i.code);

describe('validação estruturada do tipo de escada', () => {
  it('aceita os tipos padrão dos dois estilos, sem erros nem avisos', () => {
    expect(validateStairType(mono())).toEqual([]);
    expect(validateStairType(DEFAULT_STAIR_TYPES[1]!)).toEqual([]);
  });

  it('reporta todos os problemas de uma vez', () => {
    const t = mono({ name: '  ', minTread: 0.44, maxTread: 0.3, calcTarget: 0.5 });
    const list = validateStairType(t);
    expect(list.filter((i) => i.severity === 'error')).toHaveLength(3);
    expect(errors(t)).toEqual(['stt-name-empty', 'stt-tread-range', 'stt-calc-range']);
    expect(warnings(t)).toContain('stt-warn-sum');
  });

  it('regras cruzadas: piso máximo, faixa de cálculo, fatores, nariz e sobreposição', () => {
    expect(errors(mono({ maxTread: 0.27 }))).toContain('stt-tread-range');
    expect(errors(mono({ calcTarget: 0.7 }))).toContain('stt-calc-range');
    expect(errors(mono({ calcRiserFactor: 0 }))).toContain('stt-factor');
    expect(errors(mono({ nosing: 0.3 }))).toContain('stt-nosing');
    expect(errors(mono({ runStyle: 'post', treadThickness: 0.03, treadOverlap: 0.04 }))).toContain('stt-overlap');
  });

  it('espelho mínimo: precisa ser > 0 e menor que o máximo', () => {
    expect(errors(mono({ minRiser: 0.16, maxRiser: 0.18 }))).toEqual([]);
    expect(errors(mono({ minRiser: 0 }))).toEqual(['stt-riser-min']);
    expect(errors(mono({ minRiser: 0.18, maxRiser: 0.18 }))).toEqual(['stt-riser-min-range']);
    expect(errors(mono({ minRiser: 0.2, maxRiser: 0.18 }))).toEqual(['stt-riser-min-range']);
    expect(STAIR_FIELD_LIMITS.minRiser).toMatchObject({ unit: 'cm', scale: 100 });
  });

  it('espessuras por estilo e nome obrigatório', () => {
    expect(errors(mono({ structuralDepth: 0 }))).toEqual(['stt-mono-depth']);
    expect(errors({ ...DEFAULT_STAIR_TYPES[1]!, treadThickness: 0 })).toEqual(['stt-assembled']);
    expect(errors(mono({ runStyle: 'post', treadThickness: 0 }))).toEqual(['stt-post-tread']);
    expect(errors(mono({ name: '' }))).toEqual(['stt-name-empty']);
  });

  it('materiais existentes são conferidos quando a lista é fornecida', () => {
    expect(errors(mono({ materialId: 'mat_fora' }))).toEqual([]);
    expect(validateStairType(mono({ materialId: 'mat_fora' }), ['mat_concreto']).map((i) => i.code)).toContain('stt-material');
  });

  it('avisos: soma fora da faixa, espelho acima de 19 cm e piso abaixo de 25 cm', () => {
    expect(warnings(mono({ maxRiser: 0.2, minTread: 0.22 }))).toEqual(expect.arrayContaining(['stt-warn-sum', 'stt-warn-riser', 'stt-warn-tread']));
  });

  it('a tabela de limites cobre os campos da especificação', () => {
    expect(STAIR_FIELD_LIMITS.maxRiser).toMatchObject({ min: 0.1, max: 0.25, unit: 'cm', scale: 100 });
    expect(STAIR_FIELD_LIMITS.minHeadroom).toMatchObject({ min: 1.8, max: 3, unit: 'm', scale: 1 });
    expect(STAIR_FIELD_LIMITS.cost).toMatchObject({ min: 0, unit: 'R$' });
  });
});

describe('troca de estilo e gravação', () => {
  it('monolítico → montado → monolítico restaura a espessura estrutural', () => {
    const store: { current: Partial<StairType> } = { current: {} };
    const start = mono({ structuralDepth: 0.22 });
    const assembled = preserveOnStyleChange(start, 'assembled', store);
    expect(assembled.runStyle).toBe('assembled');
    expect(assembled.structuralDepth).toBe(0.22);
    expect(assembled.treadThickness).toBeCloseTo(0.03, 9);
    const back = preserveOnStyleChange(assembled, 'monolithic', store);
    expect(back.runStyle).toBe('monolithic');
    expect(back.structuralDepth).toBe(0.22);
  });

  it('campos ocultos não vazam para o tipo salvo', () => {
    const store: { current: Partial<StairType> } = { current: {} };
    const assembled = preserveOnStyleChange(mono({ structuralDepth: 0.22 }), 'assembled', store);
    const saved = finalizeForSave({ ...assembled, treadThickness: 0.04 });
    expect(saved.structuralDepth).toBe(0);
    expect(saved.treadThickness).toBeCloseTo(0.04, 9);
    const monoBack = finalizeForSave({ ...mono({ structuralDepth: 0.22 }), treadThickness: 0.04, riserThickness: 0.02 });
    expect(monoBack.treadThickness).toBe(0);
    expect(monoBack.riserThickness).toBe(0);
  });
});

describe('rascunho do tipo de escada', () => {
  it('hasUnsavedChanges detecta alteração e ignora rascunho igual ao salvo', () => {
    const saved = mono();
    expect(hasUnsavedChanges(structuredClone(saved), saved)).toBe(false);
    expect(hasUnsavedChanges({ ...saved, name: 'Outro' }, saved)).toBe(true);
    expect(hasUnsavedChanges(null, saved)).toBe(false);
  });

  it('duplicateDraft parte do rascunho (não do salvo), com id novo e sem alias', () => {
    const saved = mono({ name: 'Base' });
    const draft = { ...structuredClone(saved), maxRiser: 0.17 };
    const copy = duplicateDraft(draft, 'stt_novo');
    expect(copy.id).toBe('stt_novo');
    expect(copy.name).toBe('Base (cópia)');
    expect(copy.maxRiser).toBe(0.17);
    expect(copy.maxRiser).not.toBe(saved.maxRiser);
    expect(draft.id).toBe(saved.id);
    expect(duplicateDraft(draft).id).not.toBe(draft.id);
  });
});
