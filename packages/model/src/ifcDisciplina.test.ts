import { describe, expect, it } from 'vitest';
import { categoriaDoElemento, createEmptyProject, disciplineDaClasseIfc, disciplineOfElement, type Element } from './index.ts';

/** Genérico mínimo: a disciplina e a categoria só leem o kind e a classe de origem (nunca a malha). */
const generico = (sourceClass?: string): Element =>
  ({
    id: 'g1',
    kind: 'generic',
    levelId: 'lv_0',
    name: 'Objeto importado',
    ...(sourceClass === undefined ? {} : { sourceClass }),
    mesh: { positions: [], indices: [] },
    order: 0,
  }) as unknown as Element;

describe('disciplina da classe IFC de origem (adendo 3, fase 7)', () => {
  it('classes específicas de cada disciplina', () => {
    expect(disciplineDaClasseIfc('IFCPIPESEGMENT')).toBe('hidrossanitario');
    expect(disciplineDaClasseIfc('IFCDUCTSEGMENT')).toBe('hvac');
    expect(disciplineDaClasseIfc('IFCCABLESEGMENT')).toBe('eletrico');
    expect(disciplineDaClasseIfc('IFCCOLUMN')).toBe('estrutura');
    expect(disciplineDaClasseIfc('IFCROOF')).toBe('geral');
  });

  it('normaliza espaços e caixa da classe', () => {
    expect(disciplineDaClasseIfc(' ifcbeam ')).toBe('estrutura');
  });

  it('classe genérica de fluxo usa o tipo predefinido ou o tipo de objeto', () => {
    expect(disciplineDaClasseIfc('IFCFLOWSEGMENT', 'DOMESTICCOLDWATER')).toBe('hidrossanitario');
    expect(disciplineDaClasseIfc('IFCFLOWSEGMENT', 'CABLE')).toBe('eletrico');
    expect(disciplineDaClasseIfc('IFCFLOWFITTING', 'DUCT')).toBe('hvac');
    expect(disciplineDaClasseIfc('IFCFLOWTERMINAL')).toBe('geral');
  });

  it('classe desconhecida, vazia ou ausente é geral e nunca lança', () => {
    expect(disciplineDaClasseIfc('IFCROOF')).toBe('geral');
    expect(disciplineDaClasseIfc('')).toBe('geral');
    expect(disciplineDaClasseIfc(undefined as unknown as string)).toBe('geral');
  });
});

describe('disciplineOfElement do produto importado', () => {
  const p = createEmptyProject();

  it('generic com classe de tubulação é hidrossanitário', () => {
    expect(disciplineOfElement(generico('IFCPIPESEGMENT'), p)).toBe('hidrossanitario');
  });

  it('generic com classe de viga é estrutura', () => {
    expect(disciplineOfElement(generico('IFCBEAM'), p)).toBe('estrutura');
  });

  it('generic sem sourceClass continua geral', () => {
    expect(disciplineOfElement(generico(), p)).toBe('geral');
  });
});

describe('categoriaDoElemento do produto importado', () => {
  it('tubulação, duto e cabo ganham a categoria do MEP; o resto continua generic', () => {
    expect(categoriaDoElemento(generico('IFCPIPESEGMENT'))).toBe('plumbingFixture');
    expect(categoriaDoElemento(generico('IFCDUCTSEGMENT'))).toBe('mechanicalEquipment');
    expect(categoriaDoElemento(generico('IFCCABLESEGMENT'))).toBe('electricalFixture');
    expect(categoriaDoElemento(generico('IFCROOF'))).toBe('generic');
  });

  it('cad sem sourceClass continua generic', () => {
    expect(categoriaDoElemento({ kind: 'cad' })).toBe('generic');
  });
});
