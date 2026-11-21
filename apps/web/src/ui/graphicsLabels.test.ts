import { describe, expect, it } from 'vitest';
import { GRAPHICS_CATEGORIES, type GraphicsCategory } from '@hestia/model';
import { CATEGORY_GROUPS, categoriesInGroups, categoryGroupLabel, categoryLabel } from './graphicsLabels.ts';

/** As nove categorias do adendo 2 do ADR 0060, escritas à mão. */
const NOVAS: readonly GraphicsCategory[] = ['column', 'beam', 'footing', 'ceiling', 'ramp', 'component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment'];

/** Rótulos PT escritos à mão (não lidos do código testado). */
const ROTULOS_PT: Array<[GraphicsCategory, string]> = [
  ['column', 'Pilar'],
  ['beam', 'Viga'],
  ['footing', 'Sapata'],
  ['ceiling', 'Forro'],
  ['ramp', 'Rampa'],
  ['component', 'Componente'],
  ['plumbingFixture', 'Aparelho hidrossanitário'],
  ['electricalFixture', 'Dispositivo elétrico'],
  ['mechanicalEquipment', 'Equipamento de HVAC'],
];

describe('lista de categorias por grupo (etapa 4.5d)', () => {
  it('os grupos cobrem todas as categorias, sem sobra nem falta', () => {
    expect([...categoriesInGroups()].sort()).toEqual([...GRAPHICS_CATEGORIES].sort());
    expect(categoriesInGroups()).toHaveLength(23);
  });

  it('contém as nove categorias novas', () => {
    expect(categoriesInGroups()).toEqual(expect.arrayContaining([...NOVAS]));
    for (const c of NOVAS) expect(categoriesInGroups().filter((x) => x === c)).toHaveLength(1);
  });

  it('separa estrutura e componentes: estrutura junta os quatro; componentes ficam por disciplina', () => {
    const estrutura = CATEGORY_GROUPS.find((g) => g.id === 'structure');
    const componentes = CATEGORY_GROUPS.find((g) => g.id === 'components');
    expect(estrutura?.categories).toEqual(['column', 'beam', 'footing', 'slab']);
    expect(componentes?.categories).toEqual(['component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment']);
  });

  it('cada categoria nova tem rótulo próprio em PT (sem herdar o da categoria de origem)', () => {
    for (const [c, esperado] of ROTULOS_PT) expect(categoryLabel(c, 'pt')).toBe(esperado);
  });

  it('rótulos traduzidos nos sete idiomas', () => {
    expect(categoryLabel('column', 'en')).toBe('Column');
    expect(categoryLabel('column', 'es')).toBe('Columna');
    expect(categoryLabel('column', 'de')).toBe('Stütze');
    expect(categoryLabel('column', 'fr')).toBe('Poteau');
    expect(categoryLabel('column', 'it')).toBe('Pilastro');
    expect(categoryLabel('column', 'pl')).toBe('Słup');
    expect(categoryLabel('mechanicalEquipment', 'en')).toBe('Mechanical equipment');
    expect(categoryLabel('mechanicalEquipment', 'de')).toBe('HLK-Gerät');
    expect(categoryLabel('mechanicalEquipment', 'pl')).toBe('Urządzenie HVAC');
  });

  it('títulos dos grupos traduzidos', () => {
    const estrutura = CATEGORY_GROUPS.find((g) => g.id === 'structure')!;
    expect(categoryGroupLabel(estrutura, 'pt')).toBe('Estrutura');
    expect(categoryGroupLabel(estrutura, 'en')).toBe('Structure');
    expect(categoryGroupLabel(estrutura, 'es')).toBe('Estructura');
    expect(categoryGroupLabel(estrutura, 'de')).toBe('Tragwerk');
    expect(categoryGroupLabel(estrutura, 'fr')).toBe('Structure');
    expect(categoryGroupLabel(estrutura, 'it')).toBe('Struttura');
    expect(categoryGroupLabel(estrutura, 'pl')).toBe('Konstrukcja');
  });
});
