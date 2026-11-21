import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CATEGORY_STYLES,
  FAMILIA_ARMARIO,
  GRAPHICS_CATEGORIES,
  categoriaDoElemento,
  createEmptyProject,
  defaultOverrides,
  graphicsCategoryLabels,
  graphicsOf,
  hiddenElementIdsOf,
  makePlanView,
  migrateProject,
  planGraphicsOf,
  sectionGraphicsOf,
  validateProject,
  view3dOf,
  viewHiddenIssues,
  type CategoryOverride,
  type Element,
  type Familia,
  type GraphicsCategory,
  type Project,
  type ProjectGraphics,
  type View3DSettings,
  type ViewGraphics,
} from './index.ts';

/** Tabela escrita À MÃO a partir do adendo 2 do ADR 0060 (uma linha por kind; nunca lida do código testado). */
const ESPERADO_POR_KIND: Record<Element['kind'], GraphicsCategory | null> = {
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

const SEM_OVERRIDE = { visible: true, transparency: 0, halftone: false };
/** Elemento mínimo só com o kind (a tabela lê o kind; `component` lê a família, testada abaixo). */
const porKind = (kind: string): Element => ({ id: 'e1', kind, order: 0 }) as unknown as Element;

describe('categoria de cada kind (adendo 2 do ADR 0060)', () => {
  it('cobre todos os kinds da união Element, sem sobras nem faltas', () => {
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

  it.each(Object.entries(ESPERADO_POR_KIND))('categoriaDoElemento(%s) → %s', (kind, esperada) => {
    expect(categoriaDoElemento(porKind(kind))).toBe(esperada);
  });

  it.each(ANOTACOES)('anotação %s → annotation', (kind) => {
    expect(categoriaDoElemento(porKind(kind))).toBe('annotation');
  });

  it('kind desconhecido não pertence a categoria nenhuma', () => {
    expect(categoriaDoElemento(porKind('piscina'))).toBeNull();
  });
});

describe('categoria do componente vem da disciplina da família (adendo 1 do ADR 0060)', () => {
  const familia = (id: string, disciplina?: string): Familia => {
    const f = structuredClone(FAMILIA_ARMARIO);
    f.id = id;
    if (disciplina !== undefined) f.disciplina = disciplina as Familia['disciplina'];
    return f;
  };
  const componente = { kind: 'component', familyId: 'fam_d' };
  const projetoCom = (...familias: Familia[]): Project => {
    const p = createEmptyProject();
    p.componentFamilies = Object.fromEntries(familias.map((f) => [f.id, f]));
    return p;
  };

  it.each([
    ['arquitetura', 'component'],
    ['estrutura', 'component'],
    ['hidrossanitario', 'plumbingFixture'],
    ['eletrico', 'electricalFixture'],
    ['hvac', 'mechanicalEquipment'],
  ])('família de %s → %s', (disciplina, esperada) => {
    expect(categoriaDoElemento(componente, projetoCom(familia('fam_d', disciplina)))).toBe(esperada);
  });

  it('família sem o campo continua componente de arquitetura', () => {
    expect(categoriaDoElemento(componente, projetoCom(familia('fam_d')))).toBe('component');
  });

  it('família ausente (componente órfão) é componente de arquitetura', () => {
    expect(categoriaDoElemento(componente, projetoCom())).toBe('component');
  });

  it('sem o projeto, a biblioteca base ainda resolve a disciplina da família', () => {
    expect(categoriaDoElemento({ kind: 'component', familyId: FAMILIA_ARMARIO.id })).toBe('component');
  });
});

describe('estilos e ocultação padrão das categorias novas', () => {
  it('a lista fechada tem as quatorze antigas e as nove novas', () => {
    expect(GRAPHICS_CATEGORIES).toEqual([
      'wall',
      'door',
      'window',
      'floor',
      'slab',
      'roof',
      'stair',
      'railing',
      'mass',
      'site',
      'lot',
      'room',
      'annotation',
      'generic',
      'column',
      'beam',
      'footing',
      'ceiling',
      'ramp',
      'component',
      'plumbingFixture',
      'electricalFixture',
      'mechanicalEquipment',
    ]);
  });

  it('o estilo padrão é o da categoria de origem, literal', () => {
    expect(DEFAULT_CATEGORY_STYLES.column).toEqual({ cutWeight: 5, projectionWeight: 2 });
    expect(DEFAULT_CATEGORY_STYLES.beam).toEqual({ cutWeight: 4, projectionWeight: 1 });
    expect(DEFAULT_CATEGORY_STYLES.footing).toEqual({ cutWeight: 4, projectionWeight: 1 });
    expect(DEFAULT_CATEGORY_STYLES.ceiling).toEqual({ cutWeight: 3, projectionWeight: 1 });
    expect(DEFAULT_CATEGORY_STYLES.ramp).toEqual({ cutWeight: 4, projectionWeight: 2 });
    expect(DEFAULT_CATEGORY_STYLES.component).toEqual({ cutWeight: 2, projectionWeight: 1 });
    expect(DEFAULT_CATEGORY_STYLES.plumbingFixture).toEqual({ cutWeight: 2, projectionWeight: 1 });
    expect(DEFAULT_CATEGORY_STYLES.electricalFixture).toEqual({ cutWeight: 2, projectionWeight: 1 });
    expect(DEFAULT_CATEGORY_STYLES.mechanicalEquipment).toEqual({ cutWeight: 2, projectionWeight: 1 });
  });

  it('as categorias novas nascem visíveis e sem substituição', () => {
    const o = defaultOverrides();
    for (const c of ['column', 'beam', 'footing', 'ceiling', 'ramp', 'component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment'] as const) {
      expect(o[c]).toEqual(SEM_OVERRIDE);
    }
  });

  it('os rótulos das nove estão no dicionário PT, literal', () => {
    const l = graphicsCategoryLabels('pt');
    expect(l.column).toBe('pilar');
    expect(l.beam).toBe('viga');
    expect(l.footing).toBe('sapata');
    expect(l.ceiling).toBe('forro');
    expect(l.ramp).toBe('rampa');
    expect(l.component).toBe('componente');
    expect(l.plumbingFixture).toBe('aparelho hidrossanitário');
    expect(l.electricalFixture).toBe('dispositivo elétrico');
    expect(l.mechanicalEquipment).toBe('equipamento de HVAC');
  });
});

describe('hiddenElementIdsOf isola cada categoria nova', () => {
  const el = (id: string, kind: string): Element => ({ id, kind, order: 0 }) as unknown as Element;
  const p = createEmptyProject();
  p.elements = {
    wall1: el('wall1', 'wall'),
    col1: el('col1', 'column'),
    beam1: el('beam1', 'beam'),
    ftg1: el('ftg1', 'footing'),
    slab1: el('slab1', 'slab'),
    ceil1: el('ceil1', 'ceiling'),
    floor1: el('floor1', 'floor'),
    ramp1: el('ramp1', 'ramp'),
    stair1: el('stair1', 'stair'),
  };

  it.each([
    ['column', ['col1']],
    ['wall', ['wall1']],
    ['beam', ['beam1']],
    ['footing', ['ftg1']],
    ['slab', ['slab1']],
    ['ceiling', ['ceil1']],
    ['floor', ['floor1']],
    ['ramp', ['ramp1']],
    ['stair', ['stair1']],
  ] as const)('ocultar %s devolve só os seus elementos', (categoria, esperados) => {
    expect(hiddenElementIdsOf(p, { categories: [categoria] }).sort()).toEqual([...esperados].sort());
  });

  it('elementos listados explicitamente entram junto com os da categoria', () => {
    expect(hiddenElementIdsOf(p, { elements: ['wall1'], categories: ['column'] }).sort()).toEqual(['col1', 'wall1']);
  });
});

describe('projeto antigo sem as chaves novas abre com os padrões (planta, planta de disciplina, corte e 3D)', () => {
  const overridesAntigos = { wall: { visible: false, transparency: 0, halftone: false } };
  const viewAntiga = (): ViewGraphics =>
    ({ scale: 50, detail: 'byScale', style: 'hiddenLine', partialStructure: 'entire', overrides: overridesAntigos }) as unknown as ViewGraphics;
  const view3dAntiga = (): View3DSettings =>
    ({
      style: 'realistic',
      partialStructure: 'entire',
      overrides: overridesAntigos,
      shadows: true,
      edges: true,
      sunAzimuth: 324.46,
      sunElevation: 51.97,
      background: null,
    }) as unknown as View3DSettings;

  const antigo = (): Project => {
    const p = createEmptyProject();
    p.levels[0] = { ...p.levels[0]!, graphics: viewAntiga() };
    p.planViews = [makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura', graphics: viewAntiga() })];
    p.sectionGraphics = viewAntiga();
    p.view3d = view3dAntiga();
    p.graphics = { categories: { wall: { cutWeight: 7 } } } as unknown as ProjectGraphics;
    return p;
  };

  it('a mescla com os padrões cobre as quatro vistas e os gráficos do projeto', () => {
    const p = antigo();
    for (const c of ['column', 'beam', 'footing', 'ceiling', 'ramp', 'component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment'] as const) {
      expect(planGraphicsOf(p, 'lv_0').overrides[c]).toEqual(SEM_OVERRIDE);
      expect(planGraphicsOf(p, 'lv_0', 'pv1').overrides[c]).toEqual(SEM_OVERRIDE);
      expect(sectionGraphicsOf(p).overrides[c]).toEqual(SEM_OVERRIDE);
      expect(view3dOf(p).overrides[c]).toEqual(SEM_OVERRIDE);
    }
    expect(graphicsOf(p).categories.column).toEqual({ cutWeight: 5, projectionWeight: 2 });
    expect(graphicsOf(p).categories.ceiling).toEqual({ cutWeight: 3, projectionWeight: 1 });
    expect(graphicsOf(p).categories.wall).toEqual({ cutWeight: 7, projectionWeight: 2 });
  });

  it('a validação aceita o arquivo e as categorias novas, e continua recusando categoria desconhecida', () => {
    const p = antigo();
    expect(validateProject(p).filter((i) => i.code === 'graphics-invalid')).toEqual([]);
    expect(viewHiddenIssues({ categories: ['column', 'beam', 'footing', 'ceiling', 'ramp', 'component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment'] })).toEqual([]);
    expect(viewHiddenIssues({ categories: ['piscina' as GraphicsCategory] })).toEqual(['As categorias ocultas devem ser categorias gráficas válidas.']);
  });

  it('ida e volta idêntica sem as chaves novas', () => {
    const p = antigo();
    const texto = JSON.stringify(p);
    const volta = migrateProject(JSON.parse(texto));
    expect(JSON.stringify(volta)).toBe(texto);
    expect(volta.levels[0]!.graphics?.overrides.column).toBeUndefined();
  });

  it('ida e volta idêntica com as chaves novas gravadas', () => {
    const p = createEmptyProject();
    const comNovas = { ...viewAntiga(), overrides: { ...overridesAntigos, column: { visible: false, transparency: 0.5, halftone: true } } } as unknown as ViewGraphics;
    p.levels[0] = { ...p.levels[0]!, graphics: comNovas };
    p.view3d = { ...view3dAntiga(), overrides: comNovas.overrides } as View3DSettings;
    const texto = JSON.stringify(p);
    const volta = migrateProject(JSON.parse(texto));
    expect(JSON.stringify(volta)).toBe(texto);
    expect(planGraphicsOf(volta, 'lv_0').overrides.column).toEqual({ visible: false, transparency: 0.5, halftone: true } satisfies CategoryOverride);
    expect(planGraphicsOf(volta, 'lv_0').overrides.wall).toEqual({ visible: false, transparency: 0, halftone: false });
  });
});
