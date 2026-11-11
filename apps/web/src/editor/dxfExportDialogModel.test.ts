import { describe, expect, it } from 'vitest';
import { createEmptyProject, type Project } from '@hestia/model';
import {
  activeDxfTargetKey,
  defaultDxfSelection,
  defaultDxfUnitOf,
  dxfGroupRows,
  dxfGroupState,
  type DxfActiveView,
} from './dxfExportDialogModel.ts';
import type { DxfBatchTarget } from './dxfBatch.types.ts';

const targets: DxfBatchTarget[] = [
  { kind: 'plan', key: 'plan:lv_0', levelId: 'lv_0', label: 'Térreo', group: 'plantas' },
  { kind: 'plan', key: 'plan:lv_1', levelId: 'lv_1', label: 'Superior', group: 'plantas' },
  { kind: 'area', key: 'area:ap1', planId: 'ap1', label: 'Área Térreo', group: 'areas' },
  { kind: 'section', key: 'section:v1', viewId: 'v1', label: 'Corte A', group: 'cortes', elevation: false },
  { kind: 'section', key: 'section:v2', viewId: 'v2', label: 'Elevação Norte', group: 'cortes', elevation: true },
  { kind: 'sheet', key: 'sheet:s1', sheetId: 's1', label: 'A-101 Planta', group: 'pranchas' },
];

const withUnits = (unit: 'm' | 'cm' | 'mm' | 'ft' | 'in' | 'ft-in'): Project => {
  const p = structuredClone(createEmptyProject());
  p.settings = { ...p.settings, units: { length: { unit, decimals: 2 } } };
  return p;
};

describe('unidade padrão do DXF', () => {
  it('segue a unidade do desenho e cai em metros sem configuração', () => {
    expect(defaultDxfUnitOf(createEmptyProject())).toBe('m');
    expect(defaultDxfUnitOf(withUnits('cm'))).toBe('cm');
    expect(defaultDxfUnitOf(withUnits('mm'))).toBe('mm');
    expect(defaultDxfUnitOf(withUnits('in'))).toBe('in');
  });

  it('pés-polegadas (ft-in) não tem $INSUNITS próprio: vira pés', () => {
    expect(defaultDxfUnitOf(withUnits('ft-in'))).toBe('ft');
  });
});

describe('agrupamento da lista', () => {
  it('mantém a ordem dos grupos, o rótulo e os itens na ordem recebida', () => {
    const rows = dxfGroupRows(targets);
    expect(rows.map((r) => r.group)).toEqual(['plantas', 'areas', 'cortes', 'pranchas']);
    expect(rows.map((r) => r.label)).toEqual(['Plantas de piso', 'Plantas de área', 'Cortes e elevações', 'Pranchas']);
    expect(rows[0]!.targets.map((t) => t.label)).toEqual(['Térreo', 'Superior']);
    expect(rows[2]!.targets.map((t) => t.label)).toEqual(['Corte A', 'Elevação Norte']);
  });

  it('grupo vazio não aparece', () => {
    const rows = dxfGroupRows(targets.filter((t) => t.group === 'cortes'));
    expect(rows.map((r) => r.group)).toEqual(['cortes']);
  });

  it('estado do grupo: todos, nenhum ou alguns', () => {
    expect(dxfGroupState(targets, [], 'plantas')).toBe('none');
    expect(dxfGroupState(targets, ['plan:lv_0'], 'plantas')).toBe('some');
    expect(dxfGroupState(targets, ['plan:lv_0', 'plan:lv_1'], 'plantas')).toBe('all');
    expect(dxfGroupState(targets, [], 'areas')).toBe('none');
  });
});

describe('alvo ativo e seleção inicial', () => {
  const view = (patch: Partial<DxfActiveView>): DxfActiveView => ({ view: 'plan', planKind: 'floor', levelId: 'lv_0', planViewId: 'pv_lv_0', sectionId: null, ...patch });

  it('planta, área e corte viram a chave do alvo; cobertura, prancha e 3D não têm DXF', () => {
    expect(activeDxfTargetKey(view({}))).toBe('plan:lv_0');
    expect(activeDxfTargetKey(view({ planKind: 'area', planViewId: 'ap1' }))).toBe('area:ap1');
    expect(activeDxfTargetKey(view({ view: 'section', sectionId: 'v1' }))).toBe('section:v1');
    expect(activeDxfTargetKey(view({ planKind: 'roof' }))).toBeNull();
    expect(activeDxfTargetKey(view({ view: 'sheet' }))).toBeNull();
    expect(activeDxfTargetKey(view({ view: '3d' }))).toBeNull();
  });

  it('abre com o alvo ativo marcado e, sem ele, com a primeira planta', () => {
    expect(defaultDxfSelection(targets, 'section:v1')).toEqual(['section:v1']);
    expect(defaultDxfSelection(targets, 'plan:lv_9')).toEqual(['plan:lv_0']);
    expect(defaultDxfSelection(targets, null)).toEqual(['plan:lv_0']);
    expect(defaultDxfSelection([], 'plan:lv_0')).toEqual([]);
  });
});
