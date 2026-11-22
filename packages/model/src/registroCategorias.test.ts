import { describe, expect, it } from 'vitest';
import {
  BIBLIOTECA_BASE,
  CATEGORY_REGISTRY,
  DISCIPLINAS_EXEMPLO,
  DISCIPLINE_OF_KIND,
  DISCIPLINE_ORDER,
  GRAPHICS_CATEGORIES,
  categoriaDoElemento,
  categoriasPorDisciplina,
  isDiscipline,
  makeBeam,
  makeCeiling,
  makeColumn,
  makeFloor,
  makeFooting,
  makeGuardaCorpo,
  makeLot,
  makeMass,
  makeRamp,
  makeRoof,
  makeRoom,
  makeSlab,
  makeStair,
  makeTerrain,
  makeTerrainRegion,
  makeWall,
  tomPredefinidoDaCategoria,
  type Discipline,
  type Element,
  type ElementDiscipline,
  type Familia,
  type GraphicsCategory,
  type Tone,
} from './index.ts';
// A versão do REGISTRO puro (sem remapeamento por projeto); a do barril é a de `disciplineProfile.ts`.
import { disciplinaDaCategoria } from './registroCategorias.ts';

/*
 * Registro único de categorias (decisão 0060, adendo 3, §2) e garantia de cobertura de disciplina
 * (docs/disciplinas/06-checklist-novo-elemento.md). Todos os valores de referência são LITERAIS, escritos à mão a
 * partir do ADR; nenhum é calculado pelo código testado.
 */

/** Disciplina de origem padrão de cada categoria, literal do adendo 3. */
const ESPERADO_REGISTRO: Record<GraphicsCategory, ElementDiscipline> = {
  wall: 'arquitetura',
  door: 'arquitetura',
  window: 'arquitetura',
  floor: 'arquitetura',
  slab: 'estrutura',
  roof: 'arquitetura',
  stair: 'arquitetura',
  railing: 'arquitetura',
  mass: 'arquitetura',
  site: 'geral',
  lot: 'geral',
  room: 'arquitetura',
  annotation: 'geral',
  generic: 'geral',
  column: 'estrutura',
  beam: 'estrutura',
  footing: 'estrutura',
  ceiling: 'arquitetura',
  ramp: 'arquitetura',
  component: 'arquitetura',
  plumbingFixture: 'hidrossanitario',
  electricalFixture: 'eletrico',
  mechanicalEquipment: 'hvac',
};

/** Categoria gráfica de cada kind de `Element`, literal do adendo 2 (o teste de coerência parte desta tabela). */
const ESPERADO_POR_KIND: Record<Element['kind'], GraphicsCategory> = {
  wall: 'wall',
  door: 'door',
  window: 'window',
  floor: 'floor',
  slab: 'slab',
  ceiling: 'ceiling',
  roof: 'roof',
  stair: 'stair',
  ramp: 'ramp',
  railing: 'railing',
  mass: 'mass',
  room: 'room',
  furniture: 'component',
  component: 'component',
  column: 'column',
  beam: 'beam',
  footing: 'footing',
  terrain: 'site',
  terrainRegion: 'site',
  lot: 'lot',
  cad: 'generic',
  generic: 'generic',
};

/** Kinds de anotação (não estão na união `Element`): continuam na categoria `annotation`. */
const ANOTACOES: readonly string[] = ['dimension', 'text', 'detailLine', 'detailRegion', 'tag', 'roomSeparator'];

/** Categorias que não exigem a mesma disciplina do kind (dado do projeto, importado ou sem disciplina). */
const SEM_COERENCIA: readonly GraphicsCategory[] = ['generic', 'site', 'lot', 'annotation', 'component'];

const LV = 'lv_0';
const parcial = (kind: Element['kind'], familyId?: string): Element =>
  ({ id: 'e', kind, order: 0, ...(familyId === undefined ? {} : { familyId }) }) as unknown as Element;

/** Fábrica mínima de cada kind: as mesmas dos testes vizinhos; objeto parcial só onde não há fábrica fácil. */
const ELEMENTO: Record<Element['kind'], () => Element> = {
  wall: () => ({ ...makeWall({ id: 'e', typeId: 'wt_alv14', levelId: LV, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), order: 0 }),
  door: () => parcial('door'),
  window: () => parcial('window'),
  floor: () => ({ ...makeFloor({ id: 'e', typeId: 'ft_ceram', levelId: LV, boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }), order: 0 }),
  slab: () => ({ ...makeSlab({ id: 'e', typeId: 'st_conc', levelId: LV, boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }), order: 0 }),
  ceiling: () => ({ ...makeCeiling({ id: 'e', typeId: 'ct_gesso', levelId: LV, boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }), order: 0 }),
  roof: () => ({ ...makeRoof({ id: 'e', typeId: 'rt_telha', levelId: LV, boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }] }), order: 0 }),
  stair: () => ({ ...makeStair({ id: 'e', typeId: 'stt_padrao', levelId: LV }), order: 0 }),
  ramp: () => ({ ...makeRamp({ id: 'e', typeId: 'rmt_nbr9050', levelId: LV }), order: 0 }),
  railing: () => ({
    ...makeGuardaCorpo({
      id: 'e',
      levelId: LV,
      typeId: 'gct_balaustres',
      hospedeiro: { tipo: 'manual', uso: 'livre', caminho: [{ x: 0, y: 0, dz: 0 }, { x: 1, y: 0, dz: 0 }], fechado: false, ladoDeslocamento: 'centro' },
    }),
    order: 0,
  }),
  mass: () => ({ ...makeMass({ id: 'e', levelId: LV, secoes: [] }), order: 0 }),
  room: () => ({ ...makeRoom({ id: 'e', levelId: LV, name: 'Sala', number: '1', point: { x: 1, y: 1 } }), order: 0 }),
  furniture: () => parcial('furniture'),
  component: () => parcial('component', 'fam_exemplo'),
  column: () => ({ ...makeColumn({ id: 'e', typeId: 'ct_conc_20x40', levelId: LV, at: { x: 0, y: 0 } }), order: 0 }),
  beam: () => ({ ...makeBeam({ id: 'e', typeId: 'bt_conc_20x40', levelId: LV, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }), order: 0 }),
  footing: () => ({ ...makeFooting({ id: 'e', typeId: 'ftg_conc', levelId: LV, at: { x: 0, y: 0 } }), order: 0 }),
  terrain: () => ({ ...makeTerrain({ id: 'e', levelId: LV }), order: 0 }),
  terrainRegion: () => ({ ...makeTerrainRegion({ id: 'e', levelId: LV, terrenoId: 'terreno', contorno: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] }), order: 0 }),
  lot: () => ({ ...makeLot({ id: 'e', levelId: LV, contorno: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], lados: [{ papel: 'frente', recuo: 0 }, { papel: 'lateral', recuo: 0 }, { papel: 'fundo', recuo: 0 }, { papel: 'lateral', recuo: 0 }] }), order: 0 }),
  cad: () => parcial('cad'),
  generic: () => parcial('generic'),
};

describe('registro único de categorias (adendo 3, §2)', () => {
  it('tem exatamente as categorias de GRAPHICS_CATEGORIES, sem faltas nem sobras', () => {
    expect(Object.keys(CATEGORY_REGISTRY).sort()).toEqual([...GRAPHICS_CATEGORIES].sort());
    for (const c of GRAPHICS_CATEGORIES) expect(CATEGORY_REGISTRY[c]).toBeDefined();
  });

  it('cada categoria aponta a disciplina padrão literal do ADR', () => {
    expect(Object.keys(ESPERADO_REGISTRO).sort()).toEqual([...GRAPHICS_CATEGORIES].sort());
    for (const [categoria, disciplina] of Object.entries(ESPERADO_REGISTRO) as Array<[GraphicsCategory, ElementDiscipline]>) {
      expect(CATEGORY_REGISTRY[categoria]).toEqual({ disciplina });
      expect(disciplinaDaCategoria(categoria)).toBe(disciplina);
    }
  });
});

describe('categoria de todo kind existe no registro (checklist, item 2)', () => {
  it('a tabela cobre todos os kinds da união Element, sem sobras nem faltas', () => {
    expect(Object.keys(ESPERADO_POR_KIND).sort()).toEqual([
      'beam',
      'cad',
      'ceiling',
      'column',
      'component',
      'door',
      'floor',
      'footing',
      'furniture',
      'generic',
      'lot',
      'mass',
      'railing',
      'ramp',
      'roof',
      'room',
      'slab',
      'stair',
      'terrain',
      'terrainRegion',
      'wall',
      'window',
    ]);
  });

  it.each(Object.entries(ESPERADO_POR_KIND))('%s → %s, e a categoria está no registro', (kind, esperada) => {
    const categoria = categoriaDoElemento(ELEMENTO[kind as Element['kind']]());
    expect(categoria).toBe(esperada);
    expect(GRAPHICS_CATEGORIES).toContain(categoria);
    expect(CATEGORY_REGISTRY[categoria!]).toBeDefined();
  });

  it.each(ANOTACOES)('anotação %s → annotation (que está no registro)', (kind) => {
    const categoria = categoriaDoElemento({ id: 'e', kind, order: 0 } as unknown as Element);
    expect(categoria).toBe('annotation');
    expect(CATEGORY_REGISTRY.annotation).toBeDefined();
  });
});

describe('coerência entre kind e disciplina da categoria (checklist, itens 1 e 2)', () => {
  const comCoerencia = Object.entries(ESPERADO_POR_KIND).filter(([, categoria]) => !SEM_COERENCIA.includes(categoria));

  it.each(comCoerencia)('%s: DISCIPLINE_OF_KIND = disciplina do registro da categoria', (kind, categoria) => {
    expect(DISCIPLINE_OF_KIND[kind as Element['kind']]).toBe(disciplinaDaCategoria(categoria));
  });
});

describe('disciplina declarada nas famílias (checklist, item 4)', () => {
  it('toda família de DISCIPLINAS_EXEMPLO declara disciplina válida', () => {
    expect(DISCIPLINAS_EXEMPLO.length).toBeGreaterThan(0);
    for (const familia of DISCIPLINAS_EXEMPLO) expect(isDiscipline(familia.disciplina)).toBe(true);
  });

  it('toda família de BIBLIOTECA_BASE que declara disciplina declara valor válido', () => {
    for (const familia of BIBLIOTECA_BASE) {
      if (familia.disciplina !== undefined) expect(isDiscipline(familia.disciplina)).toBe(true);
    }
  });
});

describe('componente de família de exemplo cai na categoria da sua disciplina (adendo 1 e 2)', () => {
  /** Categoria por disciplina, literal do adendo 2 (nunca lida do registro). */
  const CATEGORIA_POR_DISCIPLINA: Record<string, GraphicsCategory> = {
    hidrossanitario: 'plumbingFixture',
    eletrico: 'electricalFixture',
    hvac: 'mechanicalEquipment',
  };
  const FAMILIAS: Record<string, Familia> = Object.fromEntries(DISCIPLINAS_EXEMPLO.map((f) => [f.id, f]));
  const PROJETO_EXEMPLO = { componentFamilies: FAMILIAS };

  it.each(DISCIPLINAS_EXEMPLO.map((f) => [f.id, f.disciplina] as const))(
    'família %s (disciplina %s) → categoria da disciplina, presente no registro',
    (familyId, disciplina) => {
      const categoria = categoriaDoElemento({ kind: 'component', familyId }, PROJETO_EXEMPLO);
      expect(categoria).not.toBeNull();
      expect(categoria).toBe(CATEGORIA_POR_DISCIPLINA[disciplina!]);
      expect(disciplinaDaCategoria(categoria!)).toBe(disciplina);
    },
  );
});

/** Ordem esperada das disciplinas do configurador: as cinco embutidas na ordem de `DISCIPLINES` e `geral` no fim. */
const ESPERADO_ORDEM: readonly ElementDiscipline[] = ['arquitetura', 'estrutura', 'hidrossanitario', 'eletrico', 'hvac', 'geral'];

/** Agrupamento literal do adendo 3: categorias de cada disciplina, na ordem de `GRAPHICS_CATEGORIES`. */
const ESPERADO_GRUPOS: Array<{ disciplina: ElementDiscipline; categorias: GraphicsCategory[] }> = [
  {
    disciplina: 'arquitetura',
    categorias: ['wall', 'door', 'window', 'floor', 'roof', 'stair', 'railing', 'mass', 'room', 'ceiling', 'ramp', 'component'],
  },
  { disciplina: 'estrutura', categorias: ['slab', 'column', 'beam', 'footing'] },
  { disciplina: 'hidrossanitario', categorias: ['plumbingFixture'] },
  { disciplina: 'eletrico', categorias: ['electricalFixture'] },
  { disciplina: 'hvac', categorias: ['mechanicalEquipment'] },
  { disciplina: 'geral', categorias: ['site', 'lot', 'annotation', 'generic'] },
];

/** Tom predefinido por (disciplina de trabalho, categoria), literal do adendo 3 e da tabela §4.2. */
const ESPERADO_TONS: Array<[Discipline, GraphicsCategory, Tone]> = [
  ['estrutura', 'wall', 'halftone'],
  ['estrutura', 'column', 'normal'],
  ['eletrico', 'plumbingFixture', 'hidden'],
  ['eletrico', 'electricalFixture', 'normal'],
  // disciplina criada pelo usuário: mesma = normal, outra = meio-tom; `geral` nunca recebe tom
  ['paisagismo', 'wall', 'halftone'],
  ['paisagismo', 'site', 'normal'],
  ['paisagismo', 'component', 'halftone'],
];

describe('ordem das disciplinas do configurador (adendo 3, decisão 2)', () => {
  it('DISCIPLINE_ORDER são as embutidas na ordem de DISCIPLINES e geral no fim', () => {
    expect(DISCIPLINE_ORDER).toEqual(ESPERADO_ORDEM);
  });
});

describe('categoriasPorDisciplina (adendo 3, decisão 2)', () => {
  it('cobre todas as categorias, cada uma exatamente uma vez, sem sobras', () => {
    const grupos = categoriasPorDisciplina();
    const planas = grupos.flatMap((g) => g.categorias);
    expect(planas.length).toBe(23);
    expect(new Set(planas).size).toBe(23);
    expect([...planas].sort()).toEqual([...GRAPHICS_CATEGORIES].sort());
  });

  it('agrupa nas disciplinas de DISCIPLINE_ORDER, na ordem de GRAPHICS_CATEGORIES dentro do grupo', () => {
    expect(categoriasPorDisciplina()).toEqual(ESPERADO_GRUPOS);
  });

  it('toda disciplina do resultado está em DISCIPLINE_ORDER e cada uma aparece no máximo uma vez', () => {
    const disciplinas = categoriasPorDisciplina().map((g) => g.disciplina);
    expect(new Set(disciplinas).size).toBe(disciplinas.length);
    for (const d of disciplinas) expect(DISCIPLINE_ORDER).toContain(d);
  });

  it('toda disciplina de DISCIPLINE_ORDER com categoria aparece exatamente uma vez', () => {
    const disciplinas = categoriasPorDisciplina().map((g) => g.disciplina);
    for (const d of DISCIPLINE_ORDER) {
      const temCategoria = ESPERADO_GRUPOS.some((g) => g.disciplina === d);
      expect(disciplinas.filter((x) => x === d).length).toBe(temCategoria ? 1 : 0);
    }
  });
});

describe('tomPredefinidoDaCategoria (adendo 3, decisão 4)', () => {
  it.each(ESPERADO_TONS)('planta de %s, categoria %s → %s', (trabalho, categoria, esperado) => {
    expect(tomPredefinidoDaCategoria(trabalho, categoria)).toBe(esperado);
  });
});
