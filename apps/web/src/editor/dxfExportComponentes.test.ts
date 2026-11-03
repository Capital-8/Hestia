import { describe, expect, it } from 'vitest';
import { applyCommand, createEmptyProject, FAMILIA_ARMARIO, type Component, type Project } from '@hestia/model';
import { dxfLayerTableOf, planDxf } from './dxfExport.ts';

/** Componente mínimo da família de exemplo do model, no nível `lv_0`. */
function component(): Component {
  return {
    id: 'c1',
    kind: 'component',
    familyId: FAMILIA_ARMARIO.id,
    typeId: 'A80',
    levelId: 'lv_0',
    order: 1,
    x: 1,
    y: 2,
    z: 0,
    rotation: 0,
    mirrored: false,
    mark: 'M-01',
  };
}

/** Projeto vazio com a família de exemplo e um componente colocado no térreo. */
function projectWithComponent(): Project {
  const p = createEmptyProject('Componentes');
  p.componentFamilies = { [FAMILIA_ARMARIO.id]: structuredClone(FAMILIA_ARMARIO) };
  p.elements.c1 = component();
  return p;
}

describe('planDxf: componentes na planta', () => {
  it('registra a camada COMPONENTES no arquivo, com o verde (ACI 3)', () => {
    const p = projectWithComponent();
    const text = planDxf(p, 'lv_0');
    expect(text).toContain('\r\nCOMPONENTES\r\n');
    const row = dxfLayerTableOf(p, { kind: 'plan', levelId: 'lv_0' }).find((r) => r.name === 'COMPONENTES');
    expect(row?.style).toEqual({ color: 3, lineWeight: -3, linetype: 'CONTINUOUS' });
  });

  it('sem componente a camada não entra no arquivo nem na tabela', () => {
    const p = createEmptyProject('Sem componente');
    expect(planDxf(p, 'lv_0')).not.toContain('COMPONENTES');
    expect(dxfLayerTableOf(p, { kind: 'plan', levelId: 'lv_0' }).some((r) => r.name === 'COMPONENTES')).toBe(false);
  });

  it('a categoria generic oculta esconde os componentes, como os importados', () => {
    const p = projectWithComponent();
    applyCommand(p, { type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { generic: { visible: false } } } });
    expect(planDxf(p, 'lv_0')).not.toContain('COMPONENTES');
    expect(dxfLayerTableOf(p, { kind: 'plan', levelId: 'lv_0' }).some((r) => r.name === 'COMPONENTES')).toBe(false);
  });
});
