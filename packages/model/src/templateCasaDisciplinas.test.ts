import { describe, expect, it } from 'vitest';
import {
  GRAPHICS_CATEGORIES,
  TEMPLATES,
  buildTemplate,
  categoriaDoElemento,
  disciplineOfElement,
  elementLevelId,
  levelDimensions,
  migrateProject,
  planAnnotationsOf,
  planViewById,
  planViewsOf,
  planTonesOf,
  serializeProject,
  templates,
  validateProject,
  type Discipline,
  type Element,
  type ElementDiscipline,
  type GraphicsCategory,
  type Project,
} from './index.ts';
import type { Lang } from './i18n.ts';

const projeto = (lang: Lang = 'pt'): Project => buildTemplate('casa-disciplinas', lang);

const NOMES: Record<Lang, string> = {
  pt: 'Teste de disciplinas (completo)',
  en: 'Discipline Test (Full)',
  es: 'Prueba de disciplinas (completa)',
  de: 'Disziplinen-Test (vollständig)',
  fr: 'Test des disciplines (complet)',
  it: 'Test delle discipline (completo)',
  pl: 'Test dyscyplin (kompletny)',
};

/** Lista LITERAL dos kinds da união `Element` criados por comando no modelo (não lida do código testado). */
const KINDS_CRIADOS: Element['kind'][] = [
  'wall',
  'door',
  'window',
  'floor',
  'slab',
  'ceiling',
  'roof',
  'stair',
  'ramp',
  'railing',
  'mass',
  'room',
  'furniture',
  'component',
  'column',
  'beam',
  'footing',
  'terrain',
  'terrainRegion',
  'lot',
  'cad',
  'generic',
];

/** Kinds deliberadamente não criados por comando (nenhum: o modelo cobre todos). */
const KINDS_NAO_CRIADOS: Element['kind'][] = [];

/** Lista LITERAL das categorias de `GRAPHICS_CATEGORIES` cobertas pelo modelo. */
const CATEGORIAS_ESPERADAS: GraphicsCategory[] = [
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
];

const porDisciplina = (p: Project): Map<ElementDiscipline, number> => {
  const out = new Map<ElementDiscipline, number>();
  for (const e of Object.values(p.elements)) {
    const d = disciplineOfElement(e, p);
    out.set(d, (out.get(d) ?? 0) + 1);
  }
  return out;
};

const vazio = { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] };

describe('modelo inicial "Teste de disciplinas (completo)"', () => {
  it('está registrado em TEMPLATES nos sete idiomas, com área de 96 m²', () => {
    const pt = TEMPLATES.find((x) => x.id === 'casa-disciplinas');
    expect(pt).toMatchObject({ name: 'Teste de disciplinas (completo)', area: '96 m²' });
    expect(pt?.description.length).toBeGreaterThan(0);
    for (const lang of Object.keys(NOMES) as Lang[]) {
      const item = templates(lang).find((x) => x.id === 'casa-disciplinas');
      expect(item?.name, lang).toBe(NOMES[lang]);
      expect(item?.description.length, lang).toBeGreaterThan(0);
    }
  });

  it('não gera nenhum problema de validação', () => {
    expect(validateProject(projeto())).toEqual([]);
  });

  it('serializa e reabre idêntico', () => {
    const texto = serializeProject(projeto());
    const lido = migrateProject(JSON.parse(texto));
    expect(serializeProject(lido)).toBe(texto);
  });

  it('tem ao menos um elemento de CADA kind criável por comando', () => {
    const p = projeto();
    const presentes = new Set(Object.values(p.elements).map((e) => e.kind));
    expect(KINDS_CRIADOS.filter((k) => !KINDS_NAO_CRIADOS.includes(k)).filter((k) => !presentes.has(k))).toEqual([]);
    expect([...presentes].sort()).toEqual([...KINDS_CRIADOS].sort());
  });

  it('tem ao menos um elemento de CADA categoria de GRAPHICS_CATEGORIES', () => {
    const p = projeto();
    const presentes = new Set<GraphicsCategory>();
    for (const e of Object.values(p.elements)) {
      const c = categoriaDoElemento(e, p);
      if (c) presentes.add(c);
    }
    // A categoria "annotation" não é kind de Element: vem das cotas e textos de teste.
    presentes.add('annotation');
    expect([...presentes].sort()).toEqual([...CATEGORIAS_ESPERADAS].sort());
    expect([...GRAPHICS_CATEGORIES].sort()).toEqual([...CATEGORIAS_ESPERADAS].sort());
  });

  it('tem os dois pavimentos e uma planta de cada disciplina em CADA um, com nomes padrão únicos', () => {
    const p = projeto();
    expect(p.levels.map((l) => l.id)).toEqual(['lv_0', 'lv_1']);
    const vistas = planViewsOf(p);
    expect(vistas.map((v) => v.id)).toEqual([
      'pv_casa_estrutura',
      'pv_casa_hidrossanitario',
      'pv_casa_eletrico',
      'pv_casa_hvac',
      'pv_casa2_estrutura',
      'pv_casa2_hidrossanitario',
      'pv_casa2_eletrico',
      'pv_casa2_hvac',
    ]);
    expect(vistas.map((v) => v.levelId)).toEqual(['lv_0', 'lv_0', 'lv_0', 'lv_0', 'lv_1', 'lv_1', 'lv_1', 'lv_1']);
    expect(vistas.map((v) => v.discipline)).toEqual([
      'estrutura',
      'hidrossanitario',
      'eletrico',
      'hvac',
      'estrutura',
      'hidrossanitario',
      'eletrico',
      'hvac',
    ]);
    expect(vistas.map((v) => v.name)).toEqual([
      'Térreo - Estrutura',
      'Térreo - Hidrossanitário',
      'Térreo - Elétrico',
      'Térreo - HVAC',
      'Pavimento 2 - Estrutura',
      'Pavimento 2 - Hidrossanitário',
      'Pavimento 2 - Elétrico',
      'Pavimento 2 - HVAC',
    ]);
    expect(new Set(vistas.map((v) => v.name)).size).toBe(8);
  });

  it('os nomes das plantas são traduzidos nos sete idiomas', () => {
    const en = projeto('en');
    expect(planViewsOf(en).map((v) => v.name)).toEqual([
      'Ground Floor - Structure',
      'Ground Floor - Plumbing',
      'Ground Floor - Electrical',
      'Ground Floor - HVAC',
      'Level 2 - Structure',
      'Level 2 - Plumbing',
      'Level 2 - Electrical',
      'Level 2 - HVAC',
    ]);
  });

  it('tem componentes de cada disciplina e dois componentes de arquitetura', () => {
    const p = projeto();
    const contagem = porDisciplina(p);
    for (const d of ['arquitetura', 'estrutura', 'hidrossanitario', 'eletrico', 'hvac'] as const) {
      expect(contagem.get(d) ?? 0, d).toBeGreaterThan(0);
    }
    const arquitetura = Object.values(p.elements).filter((e) => e.kind === 'component' && disciplineOfElement(e, p) === 'arquitetura');
    expect(arquitetura.map((e) => e.id).sort()).toEqual(['cd2_c_cama', 'cd_c_sofa']);
    for (const levelId of ['lv_0', 'lv_1']) {
      const disciplinas = new Set<Discipline | 'geral'>();
      for (const e of Object.values(p.elements)) if (elementLevelId(e) === levelId) disciplinas.add(disciplineOfElement(e, p));
      for (const d of ['arquitetura', 'estrutura', 'hidrossanitario', 'eletrico', 'hvac'] as const) {
        expect(disciplinas.has(d), `${levelId} ${d}`).toBe(true);
      }
    }
  });

  it('as plantas de disciplina não gravam tons: valem os predefinidos da tabela §4.2', () => {
    const p = projeto();
    for (const v of planViewsOf(p)) {
      expect(v.tones, v.id).toBeUndefined();
    }
    const estrutura = planViewById(p, 'pv_casa_estrutura')!;
    expect(planTonesOf(estrutura)).toEqual({
      arquitetura: 'halftone',
      estrutura: 'normal',
      hidrossanitario: 'hidden',
      eletrico: 'hidden',
      hvac: 'hidden',
    });
  });

  it('cada anotação está na planta certa e não vaza para as outras', () => {
    const p = projeto();
    const estrutura = planViewById(p, 'pv_casa_estrutura')!;
    const eletrico = planViewById(p, 'pv_casa_eletrico')!;
    const hvac = planViewById(p, 'pv_casa_hvac')!;
    expect(estrutura.annotations?.dimensions.map((d) => d.id)).toEqual(['cd_dim_estrutura']);
    expect(estrutura.annotations?.texts.map((t) => t.id)).toEqual(['cd_txt_estrutura']);
    expect(eletrico.annotations?.dimensions.map((d) => d.id)).toEqual(['cd_dim_eletrico']);
    expect(eletrico.annotations?.texts).toEqual([]);
    expect(levelDimensions(p, 'lv_0').map((d) => d.id)).toEqual(['cd_dim_padrao']);
    expect(planAnnotationsOf(hvac)).toEqual(vazio);
    expect(levelDimensions(p, 'lv_0').map((d) => d.id)).not.toContain('cd_dim_estrutura');
    expect(estrutura.annotations?.dimensions.map((d) => d.id)).not.toContain('cd_dim_padrao');
  });

  it('a prancha de teste tem os dois viewports das plantas de Estrutura e Elétrico do térreo', () => {
    const p = projeto();
    const prancha = (p.sheets ?? []).find((s) => s.id === 'cd_prancha')!;
    expect(prancha.number).toBe('A-201');
    expect(prancha.viewports.map((v) => v.id)).toEqual(['cd_vp_estrutura', 'cd_vp_eletrico']);
    expect(prancha.viewports.map((v) => v.view)).toEqual([
      { kind: 'plan', levelId: 'lv_0', planId: 'pv_casa_estrutura' },
      { kind: 'plan', levelId: 'lv_0', planId: 'pv_casa_eletrico' },
    ]);
    expect(prancha.viewports.map((v) => v.scale)).toEqual([50, 50]);
  });
});

/*
 * F7b (adendo 3, fase 7): o modelo de teste ganhou três genéricos de instalações importados do IFC, cuja disciplina e
 * categoria vêm da classe de origem (`sourceClass`). Os ids, classes, nomes e disciplinas esperados são LITERAIS.
 */
describe('genéricos de instalações IFC no modelo de teste', () => {
  type Generico = Extract<Element, { kind: 'generic' }>;
  const p = projeto();
  const porId = (id: string): Generico => p.elements[id] as Generico;
  const genericos = Object.values(p.elements).filter((e): e is Generico => e.kind === 'generic');
  /** Os três genéricos de instalações (hidrossanitário, HVAC e elétrico); o proxy `cd_generico` continua `geral`. */
  const deInstalacao = genericos.filter((e) => ['hidrossanitario', 'hvac', 'eletrico'].includes(disciplineOfElement(e, p)));

  it('contém exatamente 3 genéricos de instalações, um por disciplina', () => {
    expect(genericos.map((e) => e.id).sort()).toEqual(['cd_generico', 'g_ifc_cable', 'g_ifc_duct', 'g_ifc_pipe']);
    expect(deInstalacao.map((e) => e.id).sort()).toEqual(['g_ifc_cable', 'g_ifc_duct', 'g_ifc_pipe']);
    expect(disciplineOfElement(porId('g_ifc_pipe'), p)).toBe('hidrossanitario');
    expect(disciplineOfElement(porId('g_ifc_duct'), p)).toBe('hvac');
    expect(disciplineOfElement(porId('g_ifc_cable'), p)).toBe('eletrico');
    expect(disciplineOfElement(porId('cd_generico'), p)).toBe('geral');
  });

  it('a categoria de cada um vem da classe de origem', () => {
    expect(categoriaDoElemento(porId('g_ifc_pipe'), p)).toBe('plumbingFixture');
    expect(categoriaDoElemento(porId('g_ifc_duct'), p)).toBe('mechanicalEquipment');
    expect(categoriaDoElemento(porId('g_ifc_cable'), p)).toBe('electricalFixture');
    expect(categoriaDoElemento(porId('cd_generico'), p)).toBe('generic');
  });

  it('cada um tem id, nome e classe literais e contorno em planta com ao menos 3 pontos', () => {
    const ESPERADO: Array<[string, string, string]> = [
      ['g_ifc_pipe', 'IFCPIPESEGMENT', 'Tubo de água (IFC)'],
      ['g_ifc_duct', 'IFCDUCTSEGMENT', 'Duto de ar (IFC)'],
      ['g_ifc_cable', 'IFCCABLESEGMENT', 'Cabo elétrico (IFC)'],
    ];
    for (const [id, classe, nome] of ESPERADO) {
      const e = porId(id);
      expect(e.id, id).toBe(id);
      expect(e.name, id).toBe(nome);
      expect(e.sourceClass, id).toBe(classe);
      expect(e.levelId, id).toBe('lv_0');
      expect(e.outline?.length ?? 0, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('o modelo continua sem nenhum problema de validação', () => {
    expect(validateProject(p)).toEqual([]);
  });
});
