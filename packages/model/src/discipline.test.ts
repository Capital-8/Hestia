import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DISCIPLINE,
  DISCIPLINES,
  DISCIPLINE_OF_KIND,
  DISCIPLINE_TONE_PRESETS,
  FAMILIA_ARMARIO,
  ProjectStore,
  createEmptyProject,
  disciplineOfElement,
  makePlanView,
  planOf,
  planTonesOf,
  planViewIssues,
  type Element,
  type Familia,
} from './index.ts';

/** Classificação escrita À MÃO a partir do ADR 0060 §1.2 (linha a linha; nunca lida do código testado). */
const ESPERADO_POR_KIND: Record<Element['kind'], 'arquitetura' | 'estrutura' | 'hidrossanitario' | 'eletrico' | 'hvac' | 'geral'> = {
  wall: 'arquitetura',
  door: 'arquitetura',
  window: 'arquitetura',
  floor: 'arquitetura',
  ceiling: 'arquitetura',
  roof: 'arquitetura',
  stair: 'arquitetura',
  ramp: 'arquitetura',
  railing: 'arquitetura',
  mass: 'arquitetura',
  room: 'arquitetura',
  furniture: 'arquitetura',
  component: 'arquitetura',
  column: 'estrutura',
  beam: 'estrutura',
  footing: 'estrutura',
  slab: 'estrutura',
  terrain: 'geral',
  terrainRegion: 'geral',
  lot: 'geral',
  cad: 'geral',
  generic: 'geral',
};

/** Elemento mínimo só com o `kind`: a tabela lê apenas o kind (a exceção de `component`, que lê a família, está abaixo). */
const porKind = (kind: Element['kind']): Element => ({ id: 'e1', kind, order: 0 }) as unknown as Element;

describe('disciplinas e a lista fechada (ADR §1.2)', () => {
  it('DISCIPLINES e DISCIPLINE de topo são os cinco valores do ADR, literais', () => {
    expect(DISCIPLINES).toEqual(['arquitetura', 'estrutura', 'hidrossanitario', 'eletrico', 'hvac']);
    expect(DEFAULT_DISCIPLINE).toBe('arquitetura');
  });

  it('DISCIPLINE_OF_KIND classifica exatamente os kinds da tabela do ADR', () => {
    expect(DISCIPLINE_OF_KIND).toEqual(ESPERADO_POR_KIND);
  });

  it('cobre todos os kinds da união Element, sem sobras nem faltas', () => {
    expect(Object.keys(DISCIPLINE_OF_KIND).sort()).toEqual(Object.keys(ESPERADO_POR_KIND).sort());
  });

  it.each(Object.entries(ESPERADO_POR_KIND))('disciplineOfElement(%s) → %s', (kind, esperada) => {
    expect(disciplineOfElement(porKind(kind as Element['kind']), createEmptyProject())).toBe(esperada);
  });
});

describe('disciplina do componente vem da família (adendo 1 do ADR 0060)', () => {
  /** Família válida (cópia do armário de exemplo) com id e, opcionalmente, `disciplina` gravada. */
  const familia = (id: string, disciplina?: string): Familia => {
    const f = structuredClone(FAMILIA_ARMARIO);
    f.id = id;
    if (disciplina !== undefined) (f as { disciplina?: string }).disciplina = disciplina;
    return f;
  };
  const componente = (familyId: string): Element =>
    ({ id: 'c1', kind: 'component', familyId, typeId: null, levelId: 'lv_0', order: 0, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: '' }) as unknown as Element;
  const projetoCom = (...familias: Familia[]) => {
    const p = createEmptyProject();
    if (familias.length > 0) p.componentFamilies = Object.fromEntries(familias.map((f) => [f.id, f]));
    return p;
  };

  it('família sem o campo: continua arquitetura', () => {
    const p = projetoCom(familia('fam_sem'));
    expect(disciplineOfElement(componente('fam_sem'), p)).toBe('arquitetura');
  });

  it.each(DISCIPLINES)('família com disciplina %s', (disciplina) => {
    const p = projetoCom(familia('fam_d', disciplina));
    expect(disciplineOfElement(componente('fam_d'), p)).toBe(disciplina);
  });

  it('família ausente (componente órfão) é arquitetura', () => {
    expect(disciplineOfElement(componente('fam_nao_existe'), projetoCom())).toBe('arquitetura');
  });

  it('sem a família no projeto, procura na biblioteca base; sem o campo lá, arquitetura', () => {
    const p = projetoCom();
    expect(disciplineOfElement(componente(FAMILIA_ARMARIO.id), p)).toBe('arquitetura');
  });

  it('valor malformado na família não lança: cai em arquitetura', () => {
    const p = projetoCom(familia('fam_ruim', 'piscina'));
    expect(disciplineOfElement(componente('fam_ruim'), p)).toBe('arquitetura');
  });
});

describe('predefinidos de tom (tabela ADR §4.2, linha a linha)', () => {
  it('planta de Arquitetura (inclui a padrão)', () => {
    expect(DISCIPLINE_TONE_PRESETS.arquitetura).toEqual({
      arquitetura: 'normal',
      estrutura: 'normal',
      hidrossanitario: 'halftone',
      eletrico: 'halftone',
      hvac: 'halftone',
    });
  });

  it('planta de Estrutura', () => {
    expect(DISCIPLINE_TONE_PRESETS.estrutura).toEqual({
      arquitetura: 'halftone',
      estrutura: 'normal',
      hidrossanitario: 'hidden',
      eletrico: 'hidden',
      hvac: 'hidden',
    });
  });

  it('planta de Hidrossanitário', () => {
    expect(DISCIPLINE_TONE_PRESETS.hidrossanitario).toEqual({
      arquitetura: 'halftone',
      estrutura: 'halftone',
      hidrossanitario: 'normal',
      eletrico: 'hidden',
      hvac: 'hidden',
    });
  });

  it('planta de Elétrico', () => {
    expect(DISCIPLINE_TONE_PRESETS.eletrico).toEqual({
      arquitetura: 'halftone',
      estrutura: 'halftone',
      hidrossanitario: 'hidden',
      eletrico: 'normal',
      hvac: 'hidden',
    });
  });

  it('planta de HVAC', () => {
    expect(DISCIPLINE_TONE_PRESETS.hvac).toEqual({
      arquitetura: 'halftone',
      estrutura: 'halftone',
      hidrossanitario: 'hidden',
      eletrico: 'hidden',
      hvac: 'normal',
    });
  });

  it('a tabela tem exatamente as cinco linhas, uma coluna por disciplina', () => {
    expect(Object.keys(DISCIPLINE_TONE_PRESETS).sort()).toEqual([...DISCIPLINES].sort());
    for (const linha of Object.values(DISCIPLINE_TONE_PRESETS)) expect(Object.keys(linha).sort()).toEqual([...DISCIPLINES].sort());
  });
});

describe('planTonesOf: predefinido + desvios de PlanView.tones', () => {
  it('sem planta (padrão) usa o predefinido de Arquitetura', () => {
    expect(planTonesOf()).toEqual({
      arquitetura: 'normal',
      estrutura: 'normal',
      hidrossanitario: 'halftone',
      eletrico: 'halftone',
      hvac: 'halftone',
    });
  });

  it('o desvio vale sobre o predefinido, só nas disciplinas desviadas', () => {
    const view = makePlanView({ levelId: 'lv_0', name: 'Estrutura — fôrmas', discipline: 'estrutura', tones: { arquitetura: 'normal', eletrico: 'halftone' } });
    expect(planTonesOf(view)).toEqual({
      arquitetura: 'normal',
      estrutura: 'normal',
      hidrossanitario: 'hidden',
      eletrico: 'halftone',
      hvac: 'hidden',
    });
  });

  it('disciplina sem desvio usa a própria linha da tabela (literal §4.2)', () => {
    const view = makePlanView({ levelId: 'lv_0', name: 'Hidráulica', discipline: 'hidrossanitario' });
    expect(planTonesOf(view)).toEqual({
      arquitetura: 'halftone',
      estrutura: 'halftone',
      hidrossanitario: 'normal',
      eletrico: 'hidden',
      hvac: 'hidden',
    });
  });

  it('entradas malformadas (disciplina ou tom inválidos, valor ausente) são ignoradas na leitura', () => {
    const view = makePlanView({ levelId: 'lv_0', name: 'Elétrico', discipline: 'eletrico' });
    view.tones = { piscina: 'normal', arquitetura: undefined, estrutura: 'forte' } as never;
    expect(planTonesOf(view)).toEqual({
      arquitetura: 'halftone',
      estrutura: 'halftone',
      hidrossanitario: 'hidden',
      eletrico: 'normal',
      hvac: 'hidden',
    });
  });

  it('a planta padrão (sem PlanView) é Arquitetura e não grava nada', () => {
    const s = new ProjectStore(createEmptyProject());
    const antes = JSON.stringify(s.project);
    const r = planOf(s.project, 'lv_0');
    expect(r.isDefault).toBe(true);
    expect(r.discipline).toBe('arquitetura');
    expect(r.tones).toEqual({});
    expect(planTonesOf(r)).toEqual({
      arquitetura: 'normal',
      estrutura: 'normal',
      hidrossanitario: 'halftone',
      eletrico: 'halftone',
      hvac: 'halftone',
    });
    expect(JSON.stringify(s.project)).toBe(antes);
    expect(s.project.planViews).toBeUndefined();
  });
});

describe('validação de PlanView.tones (planViewIssues, onde PlanView já é validada)', () => {
  const p = createEmptyProject();
  const plan = (tones: unknown) => makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura', tones: tones as never });

  it('tom fora de hidden/halftone/normal é erro', () => {
    expect(planViewIssues(p, plan({ estrutura: 'forte' }))).toContain('Tom inválido para estrutura: "forte".');
  });

  it('chave que não é disciplina é erro', () => {
    expect(planViewIssues(p, plan({ piscina: 'normal' }))).toContain('Tom para disciplina inválida: "piscina".');
  });

  it('tons que não são objeto disciplina → tom é erro', () => {
    expect(planViewIssues(p, plan('halftone'))).toContain('Os tons da planta precisam ser um objeto disciplina → tom.');
  });

  it('tons válidos não geram erro de tom', () => {
    const issues = planViewIssues(p, plan({ arquitetura: 'halftone', hvac: 'hidden' }));
    expect(issues.filter((m) => m.includes('Tom'))).toEqual([]);
    expect(issues).toEqual([]);
  });
});
