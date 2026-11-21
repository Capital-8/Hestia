import { disciplineOfElement } from './discipline.ts';
import { t, type Lang } from './i18n.ts';
import type { DetailLevel, Element, Id, Project } from './types.ts';

/**
 * Gráficos de vista (decisão 0015): pesos de linha por escala, estilo por categoria, estilo visual, visibilidade e
 * exibição parcial de estrutura. Tudo opcional no projeto: sem o campo vale o padrão deste módulo (sem migração).
 */

/** Categorias com estilo gráfico próprio (Revit: Object Styles; ArchiCAD: regras de substituição). */
export type GraphicsCategory =
  | 'wall'
  | 'door'
  | 'window'
  | 'floor'
  | 'slab'
  | 'roof'
  | 'stair'
  | 'railing'
  | 'mass'
  | 'site'
  | 'lot'
  | 'room'
  | 'annotation'
  | 'generic'
  | 'column'
  | 'beam'
  | 'footing'
  | 'ceiling'
  | 'ramp'
  | 'component'
  | 'plumbingFixture'
  | 'electricalFixture'
  | 'mechanicalEquipment';
export const GRAPHICS_CATEGORIES: readonly GraphicsCategory[] = ['wall', 'door', 'window', 'floor', 'slab', 'roof', 'stair', 'railing', 'mass', 'site', 'lot', 'room', 'annotation', 'generic', 'column', 'beam', 'footing', 'ceiling', 'ramp', 'component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment'];
/** Nome da categoria nas mensagens de validação, no idioma pedido. */
export function graphicsCategoryLabels(lang: Lang = 'pt'): Record<GraphicsCategory, string> {
  return {
    wall: t(lang, 'md_cat_wall'),
    door: t(lang, 'md_cat_door'),
    window: t(lang, 'md_cat_window'),
    floor: t(lang, 'md_cat_floor'),
    slab: t(lang, 'md_cat_slab'),
    roof: t(lang, 'md_cat_roof'),
    stair: t(lang, 'md_cat_stair'),
    railing: t(lang, 'md_cat_railing'),
    site: t(lang, 'md_cat_site'),
    lot: t(lang, 'md_cat_lot'),
    mass: t(lang, 'md_cat_mass'),
    room: t(lang, 'md_cat_room'),
    annotation: t(lang, 'md_cat_annotation'),
    generic: t(lang, 'md_cat_generic'),
    column: t(lang, 'md_cat_column'),
    beam: t(lang, 'md_cat_beam'),
    footing: t(lang, 'md_cat_footing'),
    ceiling: t(lang, 'md_cat_ceiling'),
    ramp: t(lang, 'md_cat_ramp'),
    component: t(lang, 'md_cat_component'),
    plumbingFixture: t(lang, 'md_cat_plumbing_fixture'),
    electricalFixture: t(lang, 'md_cat_electrical_fixture'),
    mechanicalEquipment: t(lang, 'md_cat_mechanical_equipment'),
  };
}

/** Nome da categoria nas mensagens de validação em PT (compatibilidade). */
export const GRAPHICS_CATEGORY_LABELS: Record<GraphicsCategory, string> = graphicsCategoryLabels('pt');

/**
 * Ocultação permanente de uma vista (Revit: Hide in View). Guarda elementos e categorias ocultos só naquela vista;
 * o temporário e o modo Reveal ficam no estado de interface, não no projeto.
 */
export interface ViewHidden {
  elements?: Id[];
  categories?: GraphicsCategory[];
}

/** Problemas de um `ViewHidden` (comandos e validação), no idioma pedido. */
export function viewHiddenIssues(h: ViewHidden | undefined, lang: Lang = 'pt'): string[] {
  if (h === undefined) return [];
  const out: string[] = [];
  if (h.elements !== undefined && (!Array.isArray(h.elements) || h.elements.some((id) => typeof id !== 'string' || id === ''))) {
    out.push(t(lang, 'md_gfx_hidden_elements'));
  }
  if (h.categories !== undefined && (!Array.isArray(h.categories) || h.categories.some((c) => !GRAPHICS_CATEGORIES.includes(c)))) {
    out.push(t(lang, 'md_gfx_hidden_categories'));
  }
  return out;
}

/** Estilo visual (Revit: Visual Styles). Planta aceita wireframe, hiddenLine e shaded; o 3D aceita todos. */
export type VisualStyle = 'wireframe' | 'hiddenLine' | 'shaded' | 'consistentColors' | 'realistic';
export const PLAN_VISUAL_STYLES: readonly VisualStyle[] = ['wireframe', 'hiddenLine', 'shaded'];
export const VISUAL_STYLES: readonly VisualStyle[] = [...PLAN_VISUAL_STYLES, 'consistentColors', 'realistic'];

/** Exibição parcial de estrutura (ArchiCAD: Partial Structure Display). */
export type PartialStructure = 'entire' | 'noFinishes' | 'coreOnly';
export const PARTIAL_STRUCTURES: readonly PartialStructure[] = ['entire', 'noFinishes', 'coreOnly'];

/**
 * Patch parcial para os comandos de gráficos: cada campo é opcional, em qualquer profundidade. O comando mescla o patch
 * no valor efetivo atual (getters abaixo) e grava o resultado completo.
 */
export type DeepPartial<T> = T extends ReadonlyArray<unknown> ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** Estilo de linha por categoria: índices de peso de 1 a 16 (Revit), um para o corte e um para a projeção. */
export interface CategoryLineStyle {
  cutWeight: number;
  projectionWeight: number;
}

/** Substituição por categoria em uma vista (Revit: Visibility/Graphics Overrides). */
export interface CategoryOverride {
  visible: boolean;
  /** 0 = opaco, 1 = invisível (só 3D e preenchimentos). */
  transparency: number;
  /** Meio-tom: mistura as cores com o papel (planta) ou clareia (3D). */
  halftone: boolean;
  /** Substitui o peso (1–16) ou a cor (#rrggbb) só nesta vista; ausente = vale o do projeto. */
  cutWeight?: number;
  projectionWeight?: number;
  color?: string;
}

export interface ProjectGraphics {
  /**
   * Tabela de pesos de linha (Revit: Line Weights): 16 linhas (peso 1..16), 3 colunas em mm de papel para as escalas
   * 1:50, 1:100 e 1:200. Escala mais fechada que 1:50 usa a coluna de 1:50; entre faixas vale a coluna da escala igual
   * ou mais larga (ver `lineWeightMm`).
   */
  lineWeights: ReadonlyArray<readonly [number, number, number]>;
  categories: Record<GraphicsCategory, CategoryLineStyle>;
  /** Escalas (denominador) até onde cada nível de detalhe vale: fino até `fineMax`, médio até `mediumMax`, depois grosso. */
  detailByScale: { fineMax: number; mediumMax: number };
}

/** Gráficos de uma planta (um por nível). */
export interface ViewGraphics {
  /** Denominador da escala (100 = 1:100). */
  scale: number;
  /** 'byScale' = pelo `detailByScale` do projeto. */
  detail: DetailLevel | 'byScale';
  style: VisualStyle;
  partialStructure: PartialStructure;
  overrides: Record<GraphicsCategory, CategoryOverride>;
  /**
   * Linhas finas só na tela (padrão true): a vista desenha todos os traços com 1 px, sem os pesos por categoria e escala.
   * A plotagem (prancha, PDF e DXF) nunca usa este modo. Ausente = ligado (sem migração; o usuário desliga na vista).
   */
  thinLines?: boolean;
}

/** Gráficos do modelo 3D (o app tem uma vista 3D). */
export interface View3DSettings {
  style: VisualStyle;
  partialStructure: PartialStructure;
  overrides: Record<GraphicsCategory, CategoryOverride>;
  shadows: boolean;
  /** Arestas e silhuetas. */
  edges: boolean;
  /** Direção do sol: azimute (graus, 0 = leste, anti-horário) e elevação (graus acima do horizonte). */
  sunAzimuth: number;
  sunElevation: number;
  /** Cor de fundo (#rrggbb); null = pelo tema. */
  background: string | null;
  /** Abre as folhas no 3D (porta de giro a 90°, janela de correr/giro entreaberta). Ausente = fechada. */
  openOpenings?: boolean;
  /** Mostra as linhas de nível (nome e cota) no 3D. Ausente = ligado. */
  showLevels?: boolean;
  /** Elementos e categorias ocultos permanentemente nesta vista 3D (Hide in View). */
  hidden?: ViewHidden;
}

/** Tabela do template padrão do Revit (mm de papel, 1:50 | 1:100 | 1:200). Fonte: docs/visualizacao/C-relatorio-pesquisa.md (c) [SECUNDÁRIO]. */
export const DEFAULT_LINE_WEIGHTS: ReadonlyArray<readonly [number, number, number]> = [
  [0.18, 0.1, 0.1],
  [0.25, 0.18, 0.1],
  [0.35, 0.25, 0.18],
  [0.5, 0.35, 0.25],
  [0.7, 0.5, 0.35],
  [1.0, 0.7, 0.5],
  [1.4, 1.0, 0.7],
  [2.0, 1.4, 1.0],
  [2.8, 2.0, 1.4],
  [4.0, 2.8, 2.0],
  [5.0, 4.0, 2.8],
  [6.0, 5.0, 4.0],
  [7.0, 6.0, 5.0],
  [8.0, 7.0, 6.0],
  [9.0, 8.0, 7.0],
  [9.0, 9.0, 8.0],
];

/**
 * Pesos padrão por categoria, na escolha do Hestia (NBR 6492 A.1: corte com hachura = larga; projeção, janela/porta e
 * escada simplificadas = larga/estreita; escolha dependente da escala, ver 0015 §2). Calibrados para que os traços da
 * planta fiquem perto dos de antes (px fixos) num zoom de ~45 px/m, 1:100: laje, telhado e escada de corte subiram/desceram
 * de peso para casar a faixa de contorno (1,5 px), o espigão (1,6 px) e o espelho (1,4 px).
 */
export const DEFAULT_CATEGORY_STYLES: Record<GraphicsCategory, CategoryLineStyle> = {
  wall: { cutWeight: 5, projectionWeight: 2 },
  door: { cutWeight: 3, projectionWeight: 2 },
  window: { cutWeight: 3, projectionWeight: 2 },
  floor: { cutWeight: 3, projectionWeight: 1 },
  slab: { cutWeight: 4, projectionWeight: 1 },
  roof: { cutWeight: 4, projectionWeight: 2 },
  stair: { cutWeight: 4, projectionWeight: 2 },
  railing: { cutWeight: 3, projectionWeight: 1 },
  site: { cutWeight: 3, projectionWeight: 1 },
  lot: { cutWeight: 1, projectionWeight: 3 },
  mass: { cutWeight: 2, projectionWeight: 1 },
  room: { cutWeight: 1, projectionWeight: 1 },
  annotation: { cutWeight: 1, projectionWeight: 1 },
  generic: { cutWeight: 2, projectionWeight: 1 },
  // Categorias por elemento (adendo 2 do ADR 0060): cada uma copia o estilo da categoria de onde saiu, para arquivo
  // antigo (sem as chaves novas em `overrides`) desenhar exatamente como antes.
  column: { cutWeight: 5, projectionWeight: 2 },
  beam: { cutWeight: 4, projectionWeight: 1 },
  footing: { cutWeight: 4, projectionWeight: 1 },
  ceiling: { cutWeight: 3, projectionWeight: 1 },
  ramp: { cutWeight: 4, projectionWeight: 2 },
  component: { cutWeight: 2, projectionWeight: 1 },
  plumbingFixture: { cutWeight: 2, projectionWeight: 1 },
  electricalFixture: { cutWeight: 2, projectionWeight: 1 },
  mechanicalEquipment: { cutWeight: 2, projectionWeight: 1 },
};

export const DEFAULT_PROJECT_GRAPHICS: ProjectGraphics = {
  lineWeights: DEFAULT_LINE_WEIGHTS,
  categories: DEFAULT_CATEGORY_STYLES,
  detailByScale: { fineMax: 50, mediumMax: 200 },
};

export const defaultOverride = (): CategoryOverride => ({ visible: true, transparency: 0, halftone: false });
export const defaultOverrides = (): Record<GraphicsCategory, CategoryOverride> => ({
  wall: defaultOverride(),
  door: defaultOverride(),
  window: defaultOverride(),
  floor: defaultOverride(),
  slab: defaultOverride(),
  roof: defaultOverride(),
  stair: defaultOverride(),
  railing: defaultOverride(),
  site: defaultOverride(),
  lot: defaultOverride(),
  mass: defaultOverride(),
  room: defaultOverride(),
  annotation: defaultOverride(),
  generic: defaultOverride(),
  column: defaultOverride(),
  beam: defaultOverride(),
  footing: defaultOverride(),
  ceiling: defaultOverride(),
  ramp: defaultOverride(),
  component: defaultOverride(),
  plumbingFixture: defaultOverride(),
  electricalFixture: defaultOverride(),
  mechanicalEquipment: defaultOverride(),
});

export const DEFAULT_VIEW_GRAPHICS: ViewGraphics = {
  scale: 100,
  detail: 'byScale',
  style: 'hiddenLine',
  partialStructure: 'entire',
  overrides: defaultOverrides(),
  thinLines: true,
};

/**
 * Padrão da vista 3D. O sol padrão é a posição que o 3D tinha antes da decisão 0015: luz em `c + r·(0,7; −0,5; 1,1)`
 * (c = centro do modelo, r = max(8, diagonal)). Essa direção é azimute −35,54° = 324,46° e elevação 51,97°; o padrão
 * usa esses valores (com 2 casas), e a diferença para a posição antiga fica abaixo de 0,01 m num modelo de 8 m.
 */
export const DEFAULT_VIEW_3D: View3DSettings = {
  style: 'realistic',
  partialStructure: 'entire',
  overrides: defaultOverrides(),
  shadows: true,
  edges: true,
  sunAzimuth: 324.46,
  sunElevation: 51.97,
  background: null,
  openOpenings: false,
};

/** Largura da linha em mm de papel: peso (1–16, fora disso é limitado) na escala 1:`scale`. */
export function lineWeightMm(table: ProjectGraphics['lineWeights'], weight: number, scale: number): number {
  const row = table[Math.min(Math.max(Math.round(weight), 1), table.length) - 1] ?? table[0]!;
  return scale <= 50 ? row[0] : scale <= 100 ? row[1] : row[2];
}

/** Nível de detalhe efetivo da vista (Revit: Detail Level by view scale). */
export function detailOf(g: Pick<ViewGraphics, 'detail' | 'scale'>, pg: ProjectGraphics = DEFAULT_PROJECT_GRAPHICS): DetailLevel {
  if (g.detail !== 'byScale') return g.detail;
  return g.scale <= pg.detailByScale.fineMax ? 'fine' : g.scale <= pg.detailByScale.mediumMax ? 'medium' : 'coarse';
}

/** Largura em pixels de tela de uma linha de `mm` de papel numa vista de `zoom` px/m na escala 1:`scale` (mínimo 1 px). */
export function paperMmToPx(mm: number, zoom: number, scale: number): number {
  return Math.max(1, (mm * zoom * scale) / 1000);
}

const mergeOverrides = (saved: Partial<Record<GraphicsCategory, Partial<CategoryOverride>>> | undefined): Record<GraphicsCategory, CategoryOverride> => {
  const out = defaultOverrides();
  for (const c of GRAPHICS_CATEGORIES) out[c] = { ...out[c], ...(saved?.[c] ?? {}) };
  return out;
};

/** Gráficos do projeto com os padrões aplicados (qualquer subconjunto salvo vale). */
export function graphicsOf(p: Pick<Project, 'graphics'>): ProjectGraphics {
  const g = p.graphics;
  const categories = { ...DEFAULT_CATEGORY_STYLES };
  for (const c of GRAPHICS_CATEGORIES) categories[c] = { ...categories[c], ...(g?.categories?.[c] ?? {}) };
  return {
    // Tabela salva vazia não cai no padrão em silêncio: a validação a aponta.
    lineWeights: g?.lineWeights ?? DEFAULT_LINE_WEIGHTS,
    categories,
    detailByScale: { ...DEFAULT_PROJECT_GRAPHICS.detailByScale, ...(g?.detailByScale ?? {}) },
  };
}

/** Entrada mínima do projeto que o resolvedor de plantas precisa (`planViews` ausente = nenhuma planta adicional). */
type PlanSource = Pick<Project, 'levels'> & Partial<Pick<Project, 'planViews'>>;

/**
 * Categoria gráfica de um elemento do modelo (o que "Ocultar categoria" atinge). Fica no modelo para a tela, a prancha e
 * o DXF usarem a mesma regra; `null` = o elemento não pertence a nenhuma categoria da lista.
 *
 * Elementos de estrutura têm categoria própria (adendo 2 do ADR 0060): pilar, viga, sapata, forro e rampa deixam de
 * compartilhar a categoria da parede/laje/piso/escada, para que ocultar um não oculte o outro. Componentes ganham uma
 * categoria POR DISCIPLINA da família (adendo 1): arquitetura e estrutura = `component`, hidrossanitário =
 * `plumbingFixture`, elétrico = `electricalFixture`, HVAC = `mechanicalEquipment`. Sem o projeto, a disciplina usa só a
 * biblioteca base (família do projeto não é encontrada), como em `disciplineOfElement`.
 */
export function categoriaDoElemento(e: { kind: string; familyId?: Id }, p?: Pick<Project, 'componentFamilies'>): GraphicsCategory | null {
  switch (e.kind) {
    case 'wall': return 'wall';
    case 'door': return 'door';
    case 'window': return 'window';
    case 'floor': return 'floor';
    case 'slab': return 'slab';
    case 'beam': return 'beam';
    case 'footing': return 'footing';
    case 'ceiling': return 'ceiling';
    case 'column': return 'column';
    case 'roof': return 'roof';
    case 'stair': return 'stair';
    case 'ramp': return 'ramp';
    case 'railing': return 'railing';
    case 'mass': return 'mass';
    case 'room': return 'room';
    case 'terrain':
    case 'terrainRegion': return 'site';
    case 'lot': return 'lot';
    case 'cad':
    case 'generic': return 'generic';
    case 'furniture': return 'component';
    case 'component': {
      const disciplina = disciplineOfElement(e as unknown as Element, p ?? {});
      switch (disciplina) {
        case 'hidrossanitario': return 'plumbingFixture';
        case 'eletrico': return 'electricalFixture';
        case 'hvac': return 'mechanicalEquipment';
        default: return 'component';
      }
    }
    case 'dimension':
    case 'text':
    case 'detailLine':
    case 'detailRegion':
    case 'tag':
    case 'roomSeparator': return 'annotation';
    default: return null;
  }
}

/**
 * Ids de ELEMENTOS ocultos por uma ocultação permanente (Hide in View): os listados e os de cada categoria oculta. Sem o
 * estado temporário nem as anotações da vista (que dependem da tela). Usado pela prancha e pelo DXF da planta de disciplina.
 */
export function hiddenElementIdsOf(p: Pick<Project, 'elements' | 'componentFamilies'>, h: ViewHidden | undefined): Id[] {
  const cats = new Set(h?.categories ?? []);
  const porCategoria = cats.size === 0 ? [] : Object.values(p.elements).filter((e) => {
    const c = categoriaDoElemento(e, p);
    return c !== null && cats.has(c);
  }).map((e) => e.id);
  return [...(h?.elements ?? []), ...porCategoria];
}

/**
 * Planta adicional (`Project.planViews`) pedida, ou undefined. Id ausente, desconhecido ou de OUTRO nível não resolve:
 * quem chama cai na planta padrão do nível (decisão 0060 §2; nunca lança).
 */
export function planViewFor(p: Pick<Project, 'planViews'>, levelId: Id, planId: Id | undefined) {
  if (planId === undefined) return undefined;
  const v = p.planViews?.find((x) => x.id === planId);
  return v && v.levelId === levelId ? v : undefined;
}

/**
 * Gráficos de uma planta de piso com os padrões aplicados (decisão 0060 §2). Sem `planId`, ou com `planId` que não
 * resolve neste nível, é a planta padrão do nível (`Level.graphics`; nível inexistente: o padrão do Hestia).
 */
export function planGraphicsOf(p: PlanSource, levelId: Id, planId?: Id): ViewGraphics {
  const v = planViewFor(p, levelId, planId);
  const g = v ? v.graphics : p.levels.find((l) => l.id === levelId)?.graphics;
  return { ...DEFAULT_VIEW_GRAPHICS, ...(g ?? {}), overrides: mergeOverrides(g?.overrides) };
}

/**
 * A planta tem gráficos GRAVADOS (`Level.graphics` na padrão, `PlanView.graphics` na adicional)? Sem eles o detalhe da
 * planta é o do projeto (`settings.detail`), como antes da decisão 0015 (ver `planStyleOf`).
 */
export function planGraphicsSaved(p: PlanSource, levelId: Id, planId?: Id): boolean {
  const v = planViewFor(p, levelId, planId);
  return (v ? v.graphics : p.levels.find((l) => l.id === levelId)?.graphics) !== undefined;
}

/**
 * Ocultação permanente (Hide in View) de uma planta de piso: `Level.hidden` na planta padrão, `PlanView.hidden` na
 * adicional. Nunca undefined; a mesma regra de `permanentHiddenOf` (planta sem ocultação = `{}`).
 */
export function planHiddenOf(p: PlanSource, levelId: Id, planId?: Id): ViewHidden {
  const v = planViewFor(p, levelId, planId);
  return (v ? v.hidden : p.levels.find((l) => l.id === levelId)?.hidden) ?? {};
}

/** Ocultação permanente da planta de cobertura do nível (`Level.roofHidden`; vista separada da planta de piso). */
export function roofHiddenOf(p: Pick<Project, 'levels'>, levelId: Id): ViewHidden {
  return p.levels.find((l) => l.id === levelId)?.roofHidden ?? {};
}

/**
 * Gráficos da planta padrão de um nível com os padrões aplicados. Nível inexistente: o padrão.
 * Wrapper transitório de `planGraphicsOf` (decisão 0060 §2): sai quando o último chamador migrar (etapa 2.3).
 */
export function levelGraphicsOf(p: Pick<Project, 'levels'>, levelId: Id): ViewGraphics {
  return planGraphicsOf(p, levelId);
}

/** Gráficos do corte/elevação com os padrões aplicados (não há nível natural: a vista cruza níveis). */
export function sectionGraphicsOf(p: Pick<Project, 'sectionGraphics'>): ViewGraphics {
  const g = p.sectionGraphics;
  return { ...DEFAULT_VIEW_GRAPHICS, ...(g ?? {}), overrides: mergeOverrides(g?.overrides) };
}

/** Gráficos do 3D com os padrões aplicados. */
export function view3dOf(p: Pick<Project, 'view3d'>): View3DSettings {
  const g = p.view3d;
  return { ...DEFAULT_VIEW_3D, ...(g ?? {}), overrides: mergeOverrides(g?.overrides) };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const DETAIL_OPTIONS: readonly string[] = ['byScale', 'coarse', 'medium', 'fine'];
const isWeight = (x: unknown): boolean => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 16;
const isShare = (x: unknown): boolean => typeof x === 'number' && x >= 0 && x <= 1;
const isHex = (x: unknown): boolean => typeof x === 'string' && HEX_COLOR.test(x);

function projectIssues(g: ProjectGraphics, lang: Lang): string[] {
  const out: string[] = [];
  const table: unknown = g.lineWeights;
  if (!Array.isArray(table) || table.length !== 16) out.push(t(lang, 'md_gfx_table_rows'));
  else
    table.forEach((row: unknown, i: number) => {
      const n = i + 1;
      if (!Array.isArray(row) || row.length !== 3) out.push(t(lang, 'md_gfx_weight_columns', { n }));
      else if (row.some((mm: unknown) => !(typeof mm === 'number' && Number.isFinite(mm) && mm > 0)))
        out.push(t(lang, 'md_gfx_weight_thickness', { n }));
    });
  for (const c of GRAPHICS_CATEGORIES) {
    const s = g.categories?.[c];
    const n = graphicsCategoryLabels(lang)[c];
    const rule = t(lang, 'md_gfx_weight_rule');
    if (!isWeight(s?.cutWeight)) out.push(t(lang, 'md_gfx_cut_weight', { name: n, rule }));
    if (!isWeight(s?.projectionWeight)) out.push(t(lang, 'md_gfx_projection_weight', { name: n, rule }));
  }
  const { fineMax, mediumMax } = g.detailByScale;
  if (!Number.isFinite(fineMax) || !Number.isFinite(mediumMax)) out.push(t(lang, 'md_gfx_detail_finite'));
  else if (!(fineMax > 0) || fineMax > mediumMax) out.push(t(lang, 'md_gfx_detail_limits'));
  return out;
}

function overrideIssues(o: Record<GraphicsCategory, CategoryOverride>, lang: Lang): string[] {
  const out: string[] = [];
  const labels = graphicsCategoryLabels(lang);
  const rule = t(lang, 'md_gfx_weight_rule');
  for (const c of GRAPHICS_CATEGORIES) {
    const v: Partial<CategoryOverride> = o?.[c] ?? {};
    const n = labels[c];
    if (typeof v.visible !== 'boolean') out.push(t(lang, 'md_gfx_visible', { name: n }));
    if (!isShare(v.transparency)) out.push(t(lang, 'md_gfx_transparency', { name: n }));
    if (typeof v.halftone !== 'boolean') out.push(t(lang, 'md_gfx_halftone', { name: n }));
    if (v.cutWeight !== undefined && !isWeight(v.cutWeight)) out.push(t(lang, 'md_gfx_cut_weight', { name: n, rule }));
    if (v.projectionWeight !== undefined && !isWeight(v.projectionWeight)) out.push(t(lang, 'md_gfx_projection_weight', { name: n, rule }));
    if (v.color !== undefined && !isHex(v.color)) out.push(t(lang, 'md_gfx_color', { name: n }));
  }
  return out;
}

function viewIssues(g: ViewGraphics, lang: Lang): string[] {
  const out: string[] = [];
  if (!Number.isInteger(g.scale) || g.scale < 1 || g.scale > 5000) out.push(t(lang, 'md_gfx_scale'));
  if (!DETAIL_OPTIONS.includes(g.detail)) out.push(t(lang, 'md_gfx_detail_option'));
  if (!PLAN_VISUAL_STYLES.includes(g.style)) out.push(t(lang, 'md_gfx_plan_style'));
  if (!PARTIAL_STRUCTURES.includes(g.partialStructure)) out.push(t(lang, 'md_gfx_partial'));
  if (g.thinLines !== undefined && typeof g.thinLines !== 'boolean') out.push(t(lang, 'md_gfx_thin_lines'));
  return [...out, ...overrideIssues(g.overrides, lang)];
}

function view3dIssues(g: View3DSettings, lang: Lang): string[] {
  const out: string[] = [];
  if (!VISUAL_STYLES.includes(g.style)) out.push(t(lang, 'md_gfx_3d_style'));
  if (!PARTIAL_STRUCTURES.includes(g.partialStructure)) out.push(t(lang, 'md_gfx_partial'));
  out.push(...overrideIssues(g.overrides, lang));
  if (typeof g.shadows !== 'boolean') out.push(t(lang, 'md_gfx_shadows'));
  if (typeof g.edges !== 'boolean') out.push(t(lang, 'md_gfx_edges'));
  if (!Number.isFinite(g.sunAzimuth)) out.push(t(lang, 'md_gfx_sun_azimuth'));
  if (!(Number.isFinite(g.sunElevation) && g.sunElevation >= 0 && g.sunElevation <= 90)) out.push(t(lang, 'md_gfx_sun_elevation'));
  if (g.background !== null && !isHex(g.background)) out.push(t(lang, 'md_gfx_background'));
  if (g.openOpenings !== undefined && typeof g.openOpenings !== 'boolean') out.push(t(lang, 'md_gfx_open_openings'));
  if (g.showLevels !== undefined && typeof g.showLevels !== 'boolean') out.push(t(lang, 'md_gfx_show_levels'));
  out.push(...viewHiddenIssues(g.hidden, lang));
  return out;
}

/**
 * Problemas de um gráfico já com os padrões aplicados (use os getters). Sem prefixo de nível: quem chama acrescenta o contexto.
 * Projeto e 3D são reconhecidos pelos campos `lineWeights` e `sunElevation`; o resto é a planta de um nível.
 */
export function graphicsIssues(g: ProjectGraphics | ViewGraphics | View3DSettings, lang: Lang = 'pt'): string[] {
  if ('lineWeights' in g) return projectIssues(g, lang);
  if ('sunElevation' in g) return view3dIssues(g, lang);
  return viewIssues(g, lang);
}

function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = (r: Record<string, unknown>): string[] => Object.keys(r).filter((k) => r[k] !== undefined);
  const ka = keys(ra);
  return ka.length === keys(rb).length && ka.every((k) => sameData(ra[k], rb[k]));
}

/** Verdadeiro quando a planta de um nível (já com os padrões) é igual ao padrão do Hestia. */
export function isDefaultLevelGraphics(g: ViewGraphics): boolean {
  return sameData(g, DEFAULT_VIEW_GRAPHICS);
}
