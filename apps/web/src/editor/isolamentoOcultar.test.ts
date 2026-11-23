import { beforeAll, describe, expect, it } from 'vitest';
import { resolveLevel, type ResolvedLevel } from '@hestia/engine';
import {
  DEFAULT_VIEW_3D,
  DEFAULT_VIEW_GRAPHICS,
  buildTemplate,
  defaultOverride,
  defaultOverrides,
  type Discipline,
  type Element,
  type ElementDiscipline,
  type GraphicsCategory,
  type Id,
  type Project,
  type ViewGraphics,
} from '@hestia/model';
import { ModelScene, planViewOf, type ElementRange, type Scene3DOptions } from '@hestia/render';
import { visibilityOf } from './viewVisibility.ts';

/*
 * Matriz de isolamento da ocultação (decisão 0060, adendo 2 §5; ficha 4.5e).
 *
 * Para o modelo "Teste de disciplinas (completo)" (`buildTemplate('casa-disciplinas')`), cada forma de ocultar some
 * EXATAMENTE com os elementos esperados e nenhum outro, na planta e no 3D:
 *   a) Hide in View de um elemento;
 *   b) ocultar a categoria (Hide in View e substituição de gráficos na planta; `view3d.overrides` no 3D);
 *   c) tom `hidden` de disciplina na planta de disciplina (o meio-tom não oculta);
 *   d) combinações (o caso do dono: telhado oculto por elemento + categoria `column`) e reexibição;
 *   e) isolamento por disciplina.
 *
 * As categorias, disciplinas e níveis de cada elemento estão escritos À MÃO nesta tabela, com os ids literais do modelo.
 * A tabela kind→categoria do teste NÃO chama `categoriaDoElemento`: é ela que denuncia uma derivação errada em produção.
 * Os conjuntos esperados são sempre recortes literais desta tabela, nunca calculados pelo código testado.
 */

type Nivel = 'lv_0' | 'lv_1';

interface ElementoDoTeste {
  id: Id;
  kind: Element['kind'];
  level: Nivel;
  categoria: GraphicsCategory;
  disciplina: ElementDiscipline;
}

/** Os 86 elementos do modelo de teste, um por linha, com o que se espera de cada eixo. */
const ELEMENTOS: readonly ElementoDoTeste[] = [
  // Térreo — arquitetura (paredes, aberturas, piso, forro, escada, ambientes e componentes).
  { id: 'cd_w_s', kind: 'wall', level: 'lv_0', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd_w_w', kind: 'wall', level: 'lv_0', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd_w_n', kind: 'wall', level: 'lv_0', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd_w_e', kind: 'wall', level: 'lv_0', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd_w_banho', kind: 'wall', level: 'lv_0', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd_w_curva', kind: 'wall', level: 'lv_0', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd_o_porta', kind: 'door', level: 'lv_0', categoria: 'door', disciplina: 'arquitetura' },
  { id: 'cd_o_banho', kind: 'door', level: 'lv_0', categoria: 'door', disciplina: 'arquitetura' },
  { id: 'cd_j_n', kind: 'window', level: 'lv_0', categoria: 'window', disciplina: 'arquitetura' },
  { id: 'cd_j_banho', kind: 'window', level: 'lv_0', categoria: 'window', disciplina: 'arquitetura' },
  { id: 'cd_j_leste', kind: 'window', level: 'lv_0', categoria: 'window', disciplina: 'arquitetura' },
  { id: 'cd_piso_terreo', kind: 'floor', level: 'lv_0', categoria: 'floor', disciplina: 'arquitetura' },
  { id: 'cd_forro_terreo', kind: 'ceiling', level: 'lv_0', categoria: 'ceiling', disciplina: 'arquitetura' },
  { id: 'cd_escada', kind: 'stair', level: 'lv_0', categoria: 'stair', disciplina: 'arquitetura' },
  { id: 'cd_amb_banho', kind: 'room', level: 'lv_0', categoria: 'room', disciplina: 'arquitetura' },
  { id: 'cd_amb_sala', kind: 'room', level: 'lv_0', categoria: 'room', disciplina: 'arquitetura' },
  // Térreo — estrutura.
  { id: 'cd_col_so', kind: 'column', level: 'lv_0', categoria: 'column', disciplina: 'estrutura' },
  { id: 'cd_col_se', kind: 'column', level: 'lv_0', categoria: 'column', disciplina: 'estrutura' },
  { id: 'cd_col_no', kind: 'column', level: 'lv_0', categoria: 'column', disciplina: 'estrutura' },
  { id: 'cd_col_ne', kind: 'column', level: 'lv_0', categoria: 'column', disciplina: 'estrutura' },
  { id: 'cd_v_sul', kind: 'beam', level: 'lv_0', categoria: 'beam', disciplina: 'estrutura' },
  { id: 'cd_v_norte', kind: 'beam', level: 'lv_0', categoria: 'beam', disciplina: 'estrutura' },
  { id: 'cd_sap_so', kind: 'footing', level: 'lv_0', categoria: 'footing', disciplina: 'estrutura' },
  { id: 'cd_sap_se', kind: 'footing', level: 'lv_0', categoria: 'footing', disciplina: 'estrutura' },
  { id: 'cd_sap_no', kind: 'footing', level: 'lv_0', categoria: 'footing', disciplina: 'estrutura' },
  { id: 'cd_sap_ne', kind: 'footing', level: 'lv_0', categoria: 'footing', disciplina: 'estrutura' },
  // Térreo — componentes (arquitetura, hidrossanitário, elétrico e HVAC).
  { id: 'cd_c_sofa', kind: 'component', level: 'lv_0', categoria: 'component', disciplina: 'arquitetura' },
  { id: 'cd_c_vaso', kind: 'component', level: 'lv_0', categoria: 'plumbingFixture', disciplina: 'hidrossanitario' },
  { id: 'cd_c_lavatorio', kind: 'component', level: 'lv_0', categoria: 'plumbingFixture', disciplina: 'hidrossanitario' },
  { id: 'cd_c_ralo', kind: 'component', level: 'lv_0', categoria: 'plumbingFixture', disciplina: 'hidrossanitario' },
  { id: 'cd_c_tomada_o1', kind: 'component', level: 'lv_0', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd_c_tomada_o2', kind: 'component', level: 'lv_0', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd_c_tomada_l', kind: 'component', level: 'lv_0', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd_c_interruptor', kind: 'component', level: 'lv_0', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd_c_luminaria_sala', kind: 'component', level: 'lv_0', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd_c_luminaria_banho', kind: 'component', level: 'lv_0', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd_c_quadro', kind: 'component', level: 'lv_0', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd_c_difusor', kind: 'component', level: 'lv_0', categoria: 'mechanicalEquipment', disciplina: 'hvac' },
  { id: 'cd_c_split', kind: 'component', level: 'lv_0', categoria: 'mechanicalEquipment', disciplina: 'hvac' },
  // Térreo — geral e sítio.
  { id: 'cd_terreno', kind: 'terrain', level: 'lv_0', categoria: 'site', disciplina: 'geral' },
  { id: 'cd_regiao', kind: 'terrainRegion', level: 'lv_0', categoria: 'site', disciplina: 'geral' },
  { id: 'cd_lote', kind: 'lot', level: 'lv_0', categoria: 'lot', disciplina: 'geral' },
  { id: 'cd_massa', kind: 'mass', level: 'lv_0', categoria: 'mass', disciplina: 'arquitetura' },
  { id: 'cd_cad', kind: 'cad', level: 'lv_0', categoria: 'generic', disciplina: 'geral' },
  { id: 'cd_generico', kind: 'generic', level: 'lv_0', categoria: 'generic', disciplina: 'geral' },
  // Térreo — instalações importadas do IFC (adendo 3, fase 7): disciplina e categoria pela classe de origem.
  { id: 'g_ifc_pipe', kind: 'generic', level: 'lv_0', categoria: 'plumbingFixture', disciplina: 'hidrossanitario' },
  { id: 'g_ifc_duct', kind: 'generic', level: 'lv_0', categoria: 'mechanicalEquipment', disciplina: 'hvac' },
  { id: 'g_ifc_cable', kind: 'generic', level: 'lv_0', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd_furn_tapete', kind: 'furniture', level: 'lv_0', categoria: 'component', disciplina: 'arquitetura' },
  // Pavimento 2 — arquitetura.
  { id: 'cd2_w_s', kind: 'wall', level: 'lv_1', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd2_w_w', kind: 'wall', level: 'lv_1', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd2_w_n', kind: 'wall', level: 'lv_1', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd2_w_e', kind: 'wall', level: 'lv_1', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd2_w_banho', kind: 'wall', level: 'lv_1', categoria: 'wall', disciplina: 'arquitetura' },
  { id: 'cd2_o_porta', kind: 'door', level: 'lv_1', categoria: 'door', disciplina: 'arquitetura' },
  { id: 'cd2_o_banho', kind: 'door', level: 'lv_1', categoria: 'door', disciplina: 'arquitetura' },
  { id: 'cd2_j_n', kind: 'window', level: 'lv_1', categoria: 'window', disciplina: 'arquitetura' },
  { id: 'cd2_j_banho', kind: 'window', level: 'lv_1', categoria: 'window', disciplina: 'arquitetura' },
  { id: 'cd2_j_leste', kind: 'window', level: 'lv_1', categoria: 'window', disciplina: 'arquitetura' },
  { id: 'cd_piso_pav2', kind: 'floor', level: 'lv_1', categoria: 'floor', disciplina: 'arquitetura' },
  { id: 'cd_forro_pav2', kind: 'ceiling', level: 'lv_1', categoria: 'ceiling', disciplina: 'arquitetura' },
  { id: 'cd_telhado', kind: 'roof', level: 'lv_1', categoria: 'roof', disciplina: 'arquitetura' },
  { id: 'cd_rampa', kind: 'ramp', level: 'lv_1', categoria: 'ramp', disciplina: 'arquitetura' },
  { id: 'cd_guarda_corpo', kind: 'railing', level: 'lv_1', categoria: 'railing', disciplina: 'arquitetura' },
  { id: 'cd2_amb_dorm', kind: 'room', level: 'lv_1', categoria: 'room', disciplina: 'arquitetura' },
  { id: 'cd2_amb_banho', kind: 'room', level: 'lv_1', categoria: 'room', disciplina: 'arquitetura' },
  // Pavimento 2 — estrutura.
  { id: 'cd_laje_pav2', kind: 'slab', level: 'lv_1', categoria: 'slab', disciplina: 'estrutura' },
  { id: 'cd2_col_so', kind: 'column', level: 'lv_1', categoria: 'column', disciplina: 'estrutura' },
  { id: 'cd2_col_se', kind: 'column', level: 'lv_1', categoria: 'column', disciplina: 'estrutura' },
  { id: 'cd2_col_no', kind: 'column', level: 'lv_1', categoria: 'column', disciplina: 'estrutura' },
  { id: 'cd2_col_ne', kind: 'column', level: 'lv_1', categoria: 'column', disciplina: 'estrutura' },
  { id: 'cd2_v_sul', kind: 'beam', level: 'lv_1', categoria: 'beam', disciplina: 'estrutura' },
  { id: 'cd2_v_norte', kind: 'beam', level: 'lv_1', categoria: 'beam', disciplina: 'estrutura' },
  // Pavimento 2 — componentes.
  { id: 'cd2_c_cama', kind: 'component', level: 'lv_1', categoria: 'component', disciplina: 'arquitetura' },
  { id: 'cd2_c_vaso', kind: 'component', level: 'lv_1', categoria: 'plumbingFixture', disciplina: 'hidrossanitario' },
  { id: 'cd2_c_lavatorio', kind: 'component', level: 'lv_1', categoria: 'plumbingFixture', disciplina: 'hidrossanitario' },
  { id: 'cd2_c_ralo', kind: 'component', level: 'lv_1', categoria: 'plumbingFixture', disciplina: 'hidrossanitario' },
  { id: 'cd2_c_tomada_o1', kind: 'component', level: 'lv_1', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd2_c_tomada_o2', kind: 'component', level: 'lv_1', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd2_c_tomada_l', kind: 'component', level: 'lv_1', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd2_c_interruptor', kind: 'component', level: 'lv_1', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd2_c_luminaria_dorm', kind: 'component', level: 'lv_1', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd2_c_luminaria_banho', kind: 'component', level: 'lv_1', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd2_c_quadro', kind: 'component', level: 'lv_1', categoria: 'electricalFixture', disciplina: 'eletrico' },
  { id: 'cd2_c_difusor', kind: 'component', level: 'lv_1', categoria: 'mechanicalEquipment', disciplina: 'hvac' },
  { id: 'cd2_c_split', kind: 'component', level: 'lv_1', categoria: 'mechanicalEquipment', disciplina: 'hvac' },
];

const POR_ID = new Map(ELEMENTOS.map((e) => [e.id, e]));
const NIVEIS: readonly Nivel[] = ['lv_0', 'lv_1'];
const DISCIPLINAS: readonly ElementDiscipline[] = ['arquitetura', 'estrutura', 'hidrossanitario', 'eletrico', 'hvac', 'geral'];
const CATEGORIAS: readonly GraphicsCategory[] = [
  'wall', 'door', 'window', 'floor', 'slab', 'roof', 'stair', 'ramp', 'railing', 'mass',
  'room', 'site', 'lot', 'generic', 'column', 'beam', 'footing', 'ceiling',
  'component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment',
];

/** Ids da tabela que atendem ao filtro. */
const idsDe = (filtro: (e: ElementoDoTeste) => boolean): Id[] => ELEMENTOS.filter(filtro).map((e) => e.id);
const daCategoria = (c: GraphicsCategory): Id[] => idsDe((e) => e.categoria === c);
const daDisciplina = (d: ElementDiscipline): Id[] => idsDe((e) => e.disciplina === d);
const doNivel = (n: Nivel): Id[] => idsDe((e) => e.level === n);
const noNivel = (ids: readonly Id[], n: Nivel): Id[] => ids.filter((id) => POR_ID.get(id)?.level === n);
const ordenado = (xs: Iterable<Id>): Id[] => [...new Set(xs)].sort();

/*
 * Tons por disciplina da tabela §4.2 do ADR, escritos à mão. A planta padrão é a de Arquitetura (não tem desvios).
 */
type Tom = 'normal' | 'halftone' | 'hidden';
const TONS: Record<Discipline, Partial<Record<ElementDiscipline, Tom>>> = {
  arquitetura: { arquitetura: 'normal', estrutura: 'normal', hidrossanitario: 'halftone', eletrico: 'halftone', hvac: 'halftone' },
  estrutura: { arquitetura: 'halftone', estrutura: 'normal', hidrossanitario: 'hidden', eletrico: 'hidden', hvac: 'hidden' },
  hidrossanitario: { arquitetura: 'halftone', estrutura: 'halftone', hidrossanitario: 'normal', eletrico: 'hidden', hvac: 'hidden' },
  eletrico: { arquitetura: 'halftone', estrutura: 'halftone', hidrossanitario: 'hidden', eletrico: 'normal', hvac: 'hidden' },
  hvac: { arquitetura: 'halftone', estrutura: 'halftone', hidrossanitario: 'hidden', eletrico: 'hidden', hvac: 'normal' },
};
const disciplinasComTom = (planta: Discipline, tom: Tom): ElementDiscipline[] =>
  DISCIPLINAS.filter((d) => TONS[planta]?.[d] === tom);
const idsComTom = (planta: Discipline, tom: Tom, nivel: Nivel): Id[] =>
  noNivel(disciplinasComTom(planta, tom).flatMap(daDisciplina), nivel);

/** Plantas de disciplina do modelo (uma de cada disciplina em cada pavimento). */
const PLANTAS: ReadonlyArray<{ id: Id; nivel: Nivel; disciplina: Discipline }> = [
  { id: 'pv_casa_estrutura', nivel: 'lv_0', disciplina: 'estrutura' },
  { id: 'pv_casa_hidrossanitario', nivel: 'lv_0', disciplina: 'hidrossanitario' },
  { id: 'pv_casa_eletrico', nivel: 'lv_0', disciplina: 'eletrico' },
  { id: 'pv_casa_hvac', nivel: 'lv_0', disciplina: 'hvac' },
  { id: 'pv_casa2_estrutura', nivel: 'lv_1', disciplina: 'estrutura' },
  { id: 'pv_casa2_hidrossanitario', nivel: 'lv_1', disciplina: 'hidrossanitario' },
  { id: 'pv_casa2_eletrico', nivel: 'lv_1', disciplina: 'eletrico' },
  { id: 'pv_casa2_hvac', nivel: 'lv_1', disciplina: 'hvac' },
];

const BASE: Project = buildTemplate('casa-disciplinas');

type EstadoDeVista = Parameters<typeof visibilityOf>[1];

const vistaPlanta = (levelId: Id, planViewId: Id | null = null): EstadoDeVista =>
  ({ view: 'plan', planKind: 'floor', levelId, areaPlanId: null, planViewId, sectionId: null, viewTemp: {} } as unknown as EstadoDeVista);

const vista3D = (): EstadoDeVista =>
  ({ view: '3d', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null, sectionId: null, viewTemp: {} } as unknown as EstadoDeVista);

const novoProjeto = (): Project => structuredClone(BASE);
const nivelDe = (p: Project, n: Nivel) => p.levels.find((l) => l.id === n)!;

/** Ocultação que a PLANTA entrega ao desenho (Hide in View, categoria e tom), recortada para os elementos do nível. */
function ocultosNaPlanta(p: Project, nivel: Nivel, planViewId: Id | null = null): Set<Id> {
  const vis = visibilityOf(p, vistaPlanta(nivel, planViewId));
  return new Set(noNivel([...vis.hidden], nivel));
}

/** Ocultação por substituição de gráficos da categoria (`overrides[c].visible = false`), como `planViewOf` a resolve. */
function ocultosPorGraficos(p: Project, nivel: Nivel, planViewId: Id | null = null): Set<Id> {
  const vista = planViewOf(p, nivel, planViewId ?? undefined);
  return new Set(noNivel([...vista.categoryHidden], nivel));
}

function graficosComCategoria(c: GraphicsCategory, visible: boolean): ViewGraphics {
  return { ...DEFAULT_VIEW_GRAPHICS, overrides: { ...defaultOverrides(), [c]: { ...defaultOverride(), visible } } };
}

function comGraficosDaCategoria(p: Project, nivel: Nivel, c: GraphicsCategory, visible: boolean): void {
  nivelDe(p, nivel).graphics = graficosComCategoria(c, visible);
}

function comGraficosDaPlantaDeDisciplina(p: Project, planId: Id, c: GraphicsCategory, visible: boolean): void {
  p.planViews!.find((v) => v.id === planId)!.graphics = graficosComCategoria(c, visible);
}

function comCategoriaNo3D(p: Project, c: GraphicsCategory, visible: boolean): void {
  p.view3d = { ...DEFAULT_VIEW_3D, overrides: { ...defaultOverrides(), [c]: { ...defaultOverride(), visible } } };
}

const OPCOES_3D: Scene3DOptions = { edges: false, shadows: false, dark: false };
const NIVEIS_RESOLVIDOS: ResolvedLevel[] = BASE.levels.map((l) => resolveLevel(BASE, l.id));
const cena = new ModelScene({ instanciar: false });

/** Ids que a cena desenha (faixas de picking e `elementId` direto das aberturas). */
function idsNaCena(ms: ModelScene): Set<Id> {
  const out = new Set<Id>();
  ms.scene.traverse((o) => {
    const u = o.userData as { ranges?: ElementRange[]; elementId?: Id };
    for (const r of u.ranges ?? []) out.add(r.id);
    if (u.elementId !== undefined) out.add(u.elementId);
  });
  return out;
}

let IDS_DA_CENA: ReadonlySet<Id>;

/** Confere a cena: só os ids esperados saíram; todo o resto ficou como estava (inclusive o que não tem geometria). */
function conferirCena(ocultosEsperados: Iterable<Id>): void {
  const ocultos = new Set(ocultosEsperados);
  const esperado = new Set([...IDS_DA_CENA].filter((id) => !ocultos.has(id)));
  expect(ordenado(idsNaCena(cena)), 'elementos desenhados no 3D').toEqual(ordenado(esperado));
}

beforeAll(() => {
  cena.update(BASE, NIVEIS_RESOLVIDOS, OPCOES_3D);
  IDS_DA_CENA = idsNaCena(cena);
});

const CASOS_ELEMENTO = ELEMENTOS.map((e) => [e.id, e] as const);
const CASOS_CATEGORIA = CATEGORIAS.map((c) => [c] as const);

describe('tabela do teste', () => {
  it('cobre exatamente os elementos do modelo, com o kind de cada um', () => {
    expect(ordenado(ELEMENTOS.map((e) => e.id))).toEqual(ordenado(Object.keys(BASE.elements)));
    for (const e of ELEMENTOS) expect(BASE.elements[e.id]!.kind, e.id).toBe(e.kind);
  });

  it('nenhum id aparece em dois níveis nem fica sem nível', () => {
    expect(ordenado([...doNivel('lv_0'), ...doNivel('lv_1')])).toEqual(ordenado(ELEMENTOS.map((e) => e.id)));
    expect(ELEMENTOS.every((e) => NIVEIS.includes(e.level))).toBe(true);
  });

  it('a cena 3D de referência desenha os kinds de geometria usados na matriz', () => {
    // Sem esta guarda, um erro no leitor de faixas deixaria os casos do 3D passarem por vacuidade.
    for (const id of [
      'cd_w_s', 'cd_o_porta', 'cd_j_n', 'cd_piso_terreo', 'cd_forro_terreo', 'cd_escada',
      'cd_col_so', 'cd_v_sul', 'cd_sap_so', 'cd_c_vaso', 'cd_c_sofa', 'cd_furn_tapete',
      'cd_laje_pav2', 'cd_telhado', 'cd_rampa',
    ]) {
      expect(IDS_DA_CENA.has(id), id).toBe(true);
    }
  });
});

describe('a) Hide in View de um elemento: some só ele', () => {
  it.each(CASOS_ELEMENTO)('planta · %s', (id, el) => {
    const p = novoProjeto();
    nivelDe(p, el.level).hidden = { elements: [id] };
    expect(ordenado(ocultosNaPlanta(p, el.level)), `ocultos de ${el.level}`).toEqual([id]);
    const outro: Nivel = el.level === 'lv_0' ? 'lv_1' : 'lv_0';
    expect(ordenado(ocultosNaPlanta(p, outro)), `planta vizinha de ${id}`).toEqual([]);
  });

  it.each(CASOS_ELEMENTO)('3D · %s', (id) => {
    cena.update(BASE, NIVEIS_RESOLVIDOS, { ...OPCOES_3D, hidden: new Set([id]) });
    conferirCena([id]);
  });
});

describe('b) ocultar a categoria: somem só os elementos dela', () => {
  it.each(CASOS_CATEGORIA)('planta (Hide in View) · %s', (c) => {
    for (const nivel of NIVEIS) {
      const p = novoProjeto();
      nivelDe(p, nivel).hidden = { categories: [c] };
      expect(ordenado(ocultosNaPlanta(p, nivel)), `${c} em ${nivel}`).toEqual(ordenado(noNivel(daCategoria(c), nivel)));
    }
  });

  it.each(CASOS_CATEGORIA)('planta (substituição de gráficos) · %s', (c) => {
    for (const nivel of NIVEIS) {
      const p = novoProjeto();
      comGraficosDaCategoria(p, nivel, c, false);
      expect(ordenado(ocultosPorGraficos(p, nivel)), `${c} em ${nivel}`).toEqual(ordenado(noNivel(daCategoria(c), nivel)));
    }
  });

  it.each(CASOS_CATEGORIA)('3D (substituição de gráficos) · %s', (c) => {
    const p = novoProjeto();
    comCategoriaNo3D(p, c, false);
    cena.update(p, NIVEIS_RESOLVIDOS, OPCOES_3D);
    conferirCena(daCategoria(c));
  });

  it.each(CASOS_CATEGORIA)('3D (Hide in View) · %s', (c) => {
    const p = novoProjeto();
    p.view3d = { ...DEFAULT_VIEW_3D, hidden: { categories: [c] } };
    const ocultos = visibilityOf(p, vista3D()).hidden;
    expect(ordenado(ocultos), `ocultos de ${c} na vista 3D`).toEqual(ordenado(daCategoria(c)));
    cena.update(p, NIVEIS_RESOLVIDOS, { ...OPCOES_3D, hidden: ocultos });
    conferirCena(daCategoria(c));
  });

  // Os casos citados no relato do dono, explícitos para a falha apontar a categoria certa.
  it('pilar não leva parede; parede não leva pilar', () => {
    const p = novoProjeto();
    nivelDe(p, 'lv_0').hidden = { categories: ['column'] };
    const comPilarOculto = ocultosNaPlanta(p, 'lv_0');
    expect(ordenado(comPilarOculto)).toEqual(ordenado(noNivel(daCategoria('column'), 'lv_0')));
    for (const id of noNivel(daCategoria('wall'), 'lv_0')) expect(comPilarOculto.has(id), id).toBe(false);

    const q = novoProjeto();
    nivelDe(q, 'lv_0').hidden = { categories: ['wall'] };
    const comParedeOculta = ocultosNaPlanta(q, 'lv_0');
    expect(ordenado(comParedeOculta)).toEqual(ordenado(noNivel(daCategoria('wall'), 'lv_0')));
    for (const id of noNivel(daCategoria('column'), 'lv_0')) expect(comParedeOculta.has(id), id).toBe(false);
  });

  it('viga e sapata não levam laje; laje não leva viga nem sapata', () => {
    for (const c of ['beam', 'footing'] as const) {
      const p = novoProjeto();
      nivelDe(p, 'lv_0').hidden = { categories: [c] };
      const ocultos = ocultosNaPlanta(p, 'lv_0');
      expect(ocultos.has('cd_laje_pav2'), c).toBe(false);
      for (const id of daCategoria('slab')) expect(ocultos.has(id), `${c} × ${id}`).toBe(false);
    }
    const p = novoProjeto();
    nivelDe(p, 'lv_1').hidden = { categories: ['slab'] };
    const ocultos = ocultosNaPlanta(p, 'lv_1');
    expect(ocultos.has('cd_laje_pav2')).toBe(true);
    for (const id of daCategoria('beam')) expect(ocultos.has(id), id).toBe(false);
    for (const id of daCategoria('footing')) expect(ocultos.has(id), id).toBe(false);
  });

  it('forro não leva piso; rampa não leva escada', () => {
    const p = novoProjeto();
    nivelDe(p, 'lv_0').hidden = { categories: ['ceiling'] };
    const semForro = ocultosNaPlanta(p, 'lv_0');
    expect(ordenado(semForro)).toEqual(ordenado(noNivel(daCategoria('ceiling'), 'lv_0')));
    for (const id of daCategoria('floor')) expect(semForro.has(id), id).toBe(false);

    const q = novoProjeto();
    nivelDe(q, 'lv_1').hidden = { categories: ['ramp'] };
    const semRampa = ocultosNaPlanta(q, 'lv_1');
    expect(ordenado(semRampa)).toEqual(ordenado(noNivel(daCategoria('ramp'), 'lv_1')));
    for (const id of daCategoria('stair')) expect(semRampa.has(id), id).toBe(false);
  });

  it.each(['component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment'] as const)(
    'categoria de componente %s não leva componente de outra disciplina',
    (c) => {
      const p = novoProjeto();
      nivelDe(p, 'lv_0').hidden = { categories: [c] };
      const ocultos = ocultosNaPlanta(p, 'lv_0');
      expect(ordenado(ocultos)).toEqual(ordenado(noNivel(daCategoria(c), 'lv_0')));
      for (const outra of CATEGORIAS.filter((x) => x !== c)) {
        for (const id of noNivel(daCategoria(outra), 'lv_0')) expect(ocultos.has(id), `${c} × ${outra} × ${id}`).toBe(false);
      }
    },
  );
});

describe('c) tom de disciplina na planta de disciplina (só planta)', () => {
  it.each(PLANTAS.map((x) => [x.id, x] as const))('planta %s: oculto e meio-tom exatos', (id, planta) => {
    const p = novoProjeto();
    const vis = visibilityOf(p, vistaPlanta(planta.nivel, id));
    const ocultos = noNivel([...vis.hidden], planta.nivel);
    const meioTom = noNivel([...vis.halftone], planta.nivel);

    expect(ordenado(ocultos), `ocultos de ${planta.disciplina}`).toEqual(ordenado(idsComTom(planta.disciplina, 'hidden', planta.nivel)));
    expect(ordenado(meioTom), `meio-tom de ${planta.disciplina}`).toEqual(ordenado(idsComTom(planta.disciplina, 'halftone', planta.nivel)));
    // O meio-tom não oculta: nenhum id pode estar nos dois conjuntos.
    expect(ocultos.filter((x) => meioTom.includes(x))).toEqual([]);
  });

  it('planta padrão (Arquitetura): o tom não oculta nada; só o MEP fica em meio-tom', () => {
    const p = novoProjeto();
    for (const nivel of NIVEIS) {
      const vis = visibilityOf(p, vistaPlanta(nivel));
      expect(ordenado(noNivel([...vis.hidden], nivel)), `ocultos de ${nivel}`).toEqual([]);
      expect(ordenado(noNivel([...vis.halftone], nivel)), `meio-tom de ${nivel}`).toEqual(
        ordenado(noNivel(['hidrossanitario', 'eletrico', 'hvac'].flatMap((d) => daDisciplina(d as ElementDiscipline)), nivel)),
      );
    }
  });

  it('no 3D não existe tom de disciplina: nenhum elemento some sem Hide in View', () => {
    const p = novoProjeto();
    expect(visibilityOf(p, vista3D()).hidden.size).toBe(0);
    cena.update(p, NIVEIS_RESOLVIDOS, OPCOES_3D);
    expect(ordenado(idsNaCena(cena))).toEqual(ordenado(IDS_DA_CENA));
  });
});

describe('d) combinações e reexibição', () => {
  it('relato do dono: telhado por elemento + categoria column; paredes ficam e o telhado segue oculto só pela lista', () => {
    const p = novoProjeto();
    nivelDe(p, 'lv_1').hidden = { elements: ['cd_telhado'], categories: ['column'] };
    expect(p.levels.find((l) => l.id === 'lv_1')!.hidden).toEqual({ elements: ['cd_telhado'], categories: ['column'] });
    const ocultos = ocultosNaPlanta(p, 'lv_1');
    expect(ordenado(ocultos)).toEqual(ordenado(['cd_telhado', ...noNivel(daCategoria('column'), 'lv_1')]));
    for (const id of noNivel(daCategoria('wall'), 'lv_1')) expect(ocultos.has(id), id).toBe(false);

    const p3 = novoProjeto();
    comCategoriaNo3D(p3, 'column', false);
    cena.update(p3, NIVEIS_RESOLVIDOS, { ...OPCOES_3D, hidden: new Set(['cd_telhado']) });
    conferirCena(['cd_telhado', ...daCategoria('column')]);
    const desenhados = idsNaCena(cena);
    for (const id of noNivel(daCategoria('wall'), 'lv_1')) expect(desenhados.has(id), id).toBe(true);
    expect(desenhados.has('cd_telhado')).toBe(false);
  });

  it('categoria beam + elemento de outra categoria (parede): cada um oculta só o que está na sua lista', () => {
    const p = novoProjeto();
    nivelDe(p, 'lv_0').hidden = { categories: ['beam'], elements: ['cd_w_s'] };
    expect(ordenado(ocultosNaPlanta(p, 'lv_0'))).toEqual(ordenado(['cd_w_s', ...noNivel(daCategoria('beam'), 'lv_0')]));

    const p3 = novoProjeto();
    comCategoriaNo3D(p3, 'beam', false);
    cena.update(p3, NIVEIS_RESOLVIDOS, { ...OPCOES_3D, hidden: new Set(['cd_w_s']) });
    conferirCena(['cd_w_s', ...daCategoria('beam')]);
  });

  it('reexibir restaura a planta e o 3D ao estado sem ocultação', () => {
    const p = novoProjeto();
    nivelDe(p, 'lv_0').hidden = { categories: ['column'], elements: ['cd_w_s'] };
    expect(ocultosNaPlanta(p, 'lv_0').size).toBe(1 + daCategoria('column').filter((id) => POR_ID.get(id)!.level === 'lv_0').length);
    nivelDe(p, 'lv_0').hidden = undefined;
    expect(ordenado(ocultosNaPlanta(p, 'lv_0'))).toEqual([]);

    comCategoriaNo3D(p, 'column', false);
    cena.update(p, NIVEIS_RESOLVIDOS, { ...OPCOES_3D, hidden: new Set(['cd_w_s']) });
    expect(idsNaCena(cena).has('cd_w_s')).toBe(false);
    comCategoriaNo3D(p, 'column', true);
    cena.update(p, NIVEIS_RESOLVIDOS, OPCOES_3D);
    expect(ordenado(idsNaCena(cena))).toEqual(ordenado(IDS_DA_CENA));
  });

  it('categoria oculta na planta de disciplina não vaza para a planta padrão do nível', () => {
    const p = novoProjeto();
    comGraficosDaPlantaDeDisciplina(p, 'pv_casa_estrutura', 'wall', false);
    expect(ordenado(ocultosPorGraficos(p, 'lv_0', 'pv_casa_estrutura'))).toEqual(ordenado(noNivel(daCategoria('wall'), 'lv_0')));
    expect(ordenado(ocultosPorGraficos(p, 'lv_0'))).toEqual([]);
  });
});

describe('e) isolamento por disciplina', () => {
  it.each(DISCIPLINAS)('planta: ocultar por elemento todos os de %s esconde só eles', (d) => {
    const ids = daDisciplina(d);
    for (const nivel of NIVEIS) {
      const p = novoProjeto();
      nivelDe(p, nivel).hidden = { elements: ids };
      expect(ordenado(ocultosNaPlanta(p, nivel)), `${d} em ${nivel}`).toEqual(ordenado(noNivel(ids, nivel)));
    }
  });

  it.each(DISCIPLINAS)('3D: ocultar por elemento todos os de %s esconde só eles', (d) => {
    cena.update(BASE, NIVEIS_RESOLVIDOS, { ...OPCOES_3D, hidden: new Set(daDisciplina(d)) });
    conferirCena(daDisciplina(d));
  });
});
