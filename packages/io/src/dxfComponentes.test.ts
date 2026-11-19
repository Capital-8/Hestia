import { describe, expect, it } from 'vitest';
import { createEmptyProject, FAMILIA_ARMARIO, type Component, type Project } from '@hestia/model';
import { DXF_LAYER_COMPONENTE, dxfComponentEntities } from './dxfComponentes.ts';

/** Componente mínimo: a família de exemplo do model e o tipo padrão A80. */
function component(id: string, levelId: string, extra: Partial<Component> = {}): Component {
  return {
    id,
    kind: 'component',
    familyId: FAMILIA_ARMARIO.id,
    typeId: 'A80',
    levelId,
    order: 1,
    x: 1,
    y: 2,
    z: 0,
    rotation: 0,
    mirrored: false,
    mark: id,
    ...extra,
  };
}

/** Projeto vazio (dois níveis: `lv_0` em 0 m e `lv_1` em 3 m) com a biblioteca e os componentes dados. */
function projectWith(...components: Component[]): Project {
  const p = createEmptyProject('Componentes');
  p.componentFamilies = { [FAMILIA_ARMARIO.id]: structuredClone(FAMILIA_ARMARIO) };
  for (const comp of components) p.elements[comp.id] = comp;
  return p;
}

describe('E8 · componentes no DXF da planta', () => {
  it('a camada dos componentes é COMPONENTES', () => {
    expect(DXF_LAYER_COMPONENTE).toBe('COMPONENTES');
  });

  it('um componente vira ao menos uma polilinha fechada, verde, na camada COMPONENTES', () => {
    const p = projectWith(component('c1', 'lv_0'));
    const entities = dxfComponentEntities(p, 'lv_0');
    expect(entities.length).toBeGreaterThanOrEqual(1);
    for (const entity of entities) {
      expect(entity.kind).toBe('polyline');
      expect(entity.layer).toBe(DXF_LAYER_COMPONENTE);
      expect(entity.closed).toBe(true);
      expect(entity.color).toBe(3);
      expect(entity.points.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('componente de outro nível não sai', () => {
    const p = projectWith(component('c1', 'lv_0'));
    expect(dxfComponentEntities(p, 'lv_1')).toEqual([]);
  });

  it('espelhado ou girado muda os pontos da pegada', () => {
    const base = dxfComponentEntities(projectWith(component('c1', 'lv_0')), 'lv_0');
    const rotated = dxfComponentEntities(projectWith(component('c1', 'lv_0', { rotation: Math.PI / 2 })), 'lv_0');
    const mirrored = dxfComponentEntities(projectWith(component('c1', 'lv_0', { mirrored: true })), 'lv_0');
    expect(rotated[0]!.points).not.toEqual(base[0]!.points);
    expect(mirrored[0]!.points).not.toEqual(base[0]!.points);
  });

  it('ordem determinística por id, mesmo com a inserção fora de ordem', () => {
    const left = component('c_a', 'lv_0', { x: 0 });
    const right = component('c_z', 'lv_0', { x: 5 });
    const combined = dxfComponentEntities(projectWith(right, left), 'lv_0');
    const onlyLeft = dxfComponentEntities(projectWith(left), 'lv_0');
    const onlyRight = dxfComponentEntities(projectWith(right), 'lv_0');
    expect(combined).toEqual([...onlyLeft, ...onlyRight]);
  });

  it('componente sem família (sem pegada) não desenha nada', () => {
    const p = projectWith(component('c1', 'lv_0', { familyId: 'familia_ausente' }));
    expect(dxfComponentEntities(p, 'lv_0')).toEqual([]);
  });

  it('a camada pode ser trocada pelo parâmetro', () => {
    const p = projectWith(component('c1', 'lv_0'));
    const entities = dxfComponentEntities(p, 'lv_0', 'OUTRA');
    expect(entities.length).toBeGreaterThan(0);
    expect(entities.every((q) => q.layer === 'OUTRA')).toBe(true);
  });
});
