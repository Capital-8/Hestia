import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTemplate, DISCIPLINE_OF_KIND, FAMILIA_ARMARIO, makePlanView, makeRoom, ProjectStore, type Element, type ElementDiscipline, type Project } from '@hestia/model';
import type { ToolEnv } from '@hestia/tools';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { visibilityOf } from './viewVisibility.ts';

/*
 * Meio-tom e oculto por disciplina na viewVisibility (decisão 0060 §4.1 e §4.2). Os valores de referência são
 * literais da tabela do ADR: planta de Estrutura põe Arquitetura em meio-tom e Hidrossanitário oculto; a planta
 * padrão (Arquitetura) não muda o desenho de hoje. Não há elemento MEP no modelo ainda, então o elemento
 * hidrossanitário é forjado no teste pela tabela de derivação, restaurada em seguida.
 */

afterEach(() => useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null, sectionId: null, viewTemp: {}, selection: [], hover: null, subElemento: null }));

const projetoBase = (): Project => structuredClone(buildTemplate('house2'));
const doTipo = (p: Project, kind: Element['kind']): Element => Object.values(p.elements).find((e) => e.kind === kind)!;

/** Elemento de teste de um kind existente, sem geometria: a visibilidade só lê `id` e `kind`. */
function elementoForjado(p: Project, id: string, kind: Element['kind']): Element {
  const e = { id, kind, levelId: 'lv_0' } as unknown as Element;
  p.elements[id] = e;
  return e;
}

/** Derivação de teste para a disciplina pedida (o modelo ainda não tem kinds de MEP); restaura a tabela sempre. */
function comDisciplinaDeTeste<T>(kind: Element['kind'], disciplina: ElementDiscipline, fn: () => T): T {
  const antes = DISCIPLINE_OF_KIND[kind];
  DISCIPLINE_OF_KIND[kind] = disciplina;
  try {
    return fn();
  } finally {
    DISCIPLINE_OF_KIND[kind] = antes;
  }
}

const vista = (planViewId: string | null) => ({ ...useUi.getState(), view: 'plan' as const, planKind: 'floor' as const, levelId: 'lv_0', areaPlanId: null, planViewId, sectionId: null, viewTemp: {} });

describe('visibilityOf: tons de disciplina da planta (decisão 0060 §4.1)', () => {
  it('planta de Estrutura: arquitetura em meio-tom, estrutura normal e hidrossanitário oculto', () => {
    const p = projetoBase();
    p.planViews = [makePlanView({ id: 'pv_est', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' })];
    const parede = doTipo(p, 'wall');
    const porta = doTipo(p, 'door');
    const coluna = elementoForjado(p, 'col_teste', 'column');
    const hidraulico = elementoForjado(p, 'hid_teste', 'generic');

    comDisciplinaDeTeste('generic', 'hidrossanitario', () => {
      const vis = visibilityOf(p, vista('pv_est'));
      // Arquitetura (parede e porta): passo 2, meio-tom.
      expect(vis.halftone.has(parede.id)).toBe(true);
      expect(vis.hidden.has(parede.id)).toBe(false);
      expect(vis.halftone.has(porta.id)).toBe(true);
      // Estrutura: passo 3, normal.
      expect(vis.halftone.has(coluna.id)).toBe(false);
      expect(vis.hidden.has(coluna.id)).toBe(false);
      // Hidrossanitário: passo 1, oculto pelo tom `hidden` do predefinido de Estrutura.
      expect(vis.hidden.has(hidraulico.id)).toBe(true);
      expect(vis.halftone.has(hidraulico.id)).toBe(false);
    });
  });

  it('planta padrão (Arquitetura): meio-tom vazio com os kinds atuais e o oculto de hoje intacto', () => {
    const p = projetoBase();
    const parede = doTipo(p, 'wall');
    const vis = visibilityOf(p, vista(null));
    expect(vis.halftone.size).toBe(0);
    expect(vis.hidden.size).toBe(0);
    expect(vis.revealed.size).toBe(0);
    expect(vis.reveal).toBe(false);

    p.levels[0]!.hidden = { elements: [parede.id] };
    const comHide = visibilityOf(p, vista(null));
    expect(comHide.hidden.has(parede.id)).toBe(true);
    expect(comHide.halftone.size).toBe(0);
  });

  it('o desvio de tom da planta vale sobre o predefinido', () => {
    const p = projetoBase();
    const parede = doTipo(p, 'wall');
    p.planViews = [makePlanView({ id: 'pv_est_normal', levelId: 'lv_0', name: 'Estrutura sem meio-tom', discipline: 'estrutura', tones: { arquitetura: 'normal' } })];
    const vis = visibilityOf(p, vista('pv_est_normal'));
    expect(vis.halftone.has(parede.id)).toBe(false);
    expect(vis.hidden.has(parede.id)).toBe(false);
  });

  it('oculto vence o meio-tom: esconder a arquitetura na planta de Estrutura tira a parede do meio-tom', () => {
    const p = projetoBase();
    const parede = doTipo(p, 'wall');
    p.planViews = [makePlanView({ id: 'pv_est_hide', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura', hidden: { elements: [parede.id] } })];
    const vis = visibilityOf(p, vista('pv_est_hide'));
    expect(vis.hidden.has(parede.id)).toBe(true);
    expect(vis.halftone.has(parede.id)).toBe(false);
  });

  it('elementos `geral` nunca recebem tom de disciplina', () => {
    const p = projetoBase();
    p.planViews = [makePlanView({ id: 'pv_est_geral', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' })];
    const generico = elementoForjado(p, 'gen_teste', 'generic');
    const vis = visibilityOf(p, vista('pv_est_geral'));
    expect(vis.halftone.has(generico.id)).toBe(false);
    expect(vis.hidden.has(generico.id)).toBe(false);
  });
});

describe('componente de família elétrica (adendo 1 do ADR 0060)', () => {
  /** Projeto com um componente de família de disciplina elétrica e uma planta de Estrutura no nível 0. */
  const projetoComTomada = (): Project => {
    const s = new ProjectStore(buildTemplate('house2'));
    const familia = structuredClone(FAMILIA_ARMARIO);
    familia.id = 'fam_tomada';
    familia.nome = 'Tomada';
    familia.disciplina = 'eletrico';
    s.exec({ type: 'upsertFamily', family: familia });
    s.exec({
      type: 'addComponent',
      component: {
        id: 'c_tomada', kind: 'component', familyId: familia.id, typeId: null, levelId: 'lv_0',
        x: 1, y: 1, z: 1.2, rotation: 0, mirrored: false, mark: 'T-01',
      },
    });
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv_est', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) });
    return s.project;
  };

  it('planta de Estrutura: elétrico oculto (tabela §4.2, linha Estrutura × coluna elétrico)', () => {
    const vis = visibilityOf(projetoComTomada(), vista('pv_est'));
    expect(vis.hidden.has('c_tomada')).toBe(true);
    expect(vis.halftone.has('c_tomada')).toBe(false);
  });

  it('planta de Arquitetura (padrão): elétrico em meio-tom (tabela §4.2, linha Arquitetura × coluna elétrico)', () => {
    const vis = visibilityOf(projetoComTomada(), vista(null));
    expect(vis.halftone.has('c_tomada')).toBe(true);
    expect(vis.hidden.has('c_tomada')).toBe(false);
  });

  it('trocar a família no mesmo projeto refaz os tons: o cache não devolve a disciplina antiga', () => {
    // Cópia mutável: o projeto do store é congelado; aqui o mapa de famílias troca sem trocar a identidade do projeto.
    const p = structuredClone(projetoComTomada());
    expect(visibilityOf(p, vista(null)).halftone.has('c_tomada')).toBe(true);
    const familia = p.componentFamilies!['fam_tomada']!;
    p.componentFamilies = { ...p.componentFamilies, fam_tomada: { ...familia, disciplina: 'arquitetura' } };
    const vis = visibilityOf(p, vista(null));
    expect(vis.halftone.has('c_tomada')).toBe(false);
    expect(vis.hidden.has('c_tomada')).toBe(false);
  });
});

describe('controller: ToolEnv e clique 2D obedecem à tabela do meio-tom', () => {
  const envDoApp = (): ToolEnv => (editor as unknown as { env: ToolEnv }).env;

  it('halftoneInView é o meio-tom da planta ativa; a seleção por clique do rótulo não pega meio-tom', () => {
    const s = new ProjectStore(buildTemplate('house2'));
    s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '1', point: { x: 2, y: 2 }, labelPosition: { x: 2, y: 2 } }) });
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv_est', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) });
    editor.load(s.project, 'teste.hestia.json');
    const parede = doTipo(editor.project, 'wall');

    // Planta padrão: nada em meio-tom e o clique no rótulo do ambiente seleciona o ambiente.
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null, sectionId: null, viewTemp: {}, selection: [] });
    expect(envDoApp().halftoneInView?.().size).toBe(0);
    clicar(2, 2);
    expect(useUi.getState().selection).toEqual(['r1']);

    // Planta de Estrutura: a parede (Arquitetura) vai para o meio-tom; o rótulo não seleciona mais.
    useUi.setState({ planViewId: 'pv_est', selection: [], hover: null });
    expect(envDoApp().halftoneInView?.().has(parede.id)).toBe(true);
    expect(envDoApp().hiddenInView?.().has(parede.id)).toBe(false);
    clicar(2, 2);
    expect(useUi.getState().selection).toEqual([]);
  });
});

const info = (x: number, y: number) => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });
function clicar(x: number, y: number): void {
  const p = info(x, y);
  editor.pointer('move', p);
  editor.pointer('down', p);
  editor.pointer('up', p);
  editor.pointer('click', p);
}

describe('guarda de texto: a regra de tom mora só em visibilityOf', () => {
  function producao(dir: string, out: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) producao(caminho, out);
      else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) out.push(caminho);
    }
    return out;
  }
  const raiz = join(__dirname, '..');
  const arquivos = producao(raiz);

  it('planTonesOf/DISCIPLINE_TONE_PRESETS só em editor/viewVisibility.ts', () => {
    const achados = arquivos
      .filter((f) => /\bplanTonesOf\s*\(|\bDISCIPLINE_TONE_PRESETS\b/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(raiz.length + 1))
      .sort();
    expect(achados).toEqual(['editor/viewVisibility.ts']);
  });
});
