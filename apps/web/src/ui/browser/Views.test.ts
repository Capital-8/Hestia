import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, makePlanView, makeView3DPoint, planViewById, planViewsOf, ProjectStore, type SheetView3DCamera } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { responderConfirmacao } from '../../editor/confirmacaoPrompt.ts';
import { useI18n } from '../../editor/i18n.ts';
import { useUi } from '../../editor/state.ts';
import { finalizarRenomeDaPlanta, menuDaPlantaDeDisciplina, menuDoNivel, NivelDePlantas, plantaDeDisciplinaAtiva, plantaPadraoAtiva } from './PlantasDeDisciplina.tsx';
import { View3DPointNode } from './Views.tsx';

const CAM: SheetView3DCamera = { azimuth: -0.7, elevation: 0.45, distance: 18, target: { x: 2, y: 3, z: 1.5 }, ortho: false };

describe('navegador: nó de ponto de vista 3D', () => {
  it('mostra o nome, a chave do nó, o ícone cubo e o arraste para a prancha', () => {
    const ponto = makeView3DPoint(CAM, 'Fachada norte');
    const html = renderToStaticMarkup(createElement(View3DPointNode, { point: ponto, pranchas: 2 }));
    expect(html).toContain(`data-node="v3d:${ponto.id}"`);
    expect(html).toContain('Fachada norte');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('Duplo clique leva o 3D a este ponto');
    // O ícone `cube` vira o svg da árvore.
    expect(html).toContain('<svg class="ic"');
  });
});

/**
 * Plantas de disciplina no navegador (decisão 0060, etapa 4.1): cada nível lista a padrão e as adicionais, agrupadas
 * pela disciplina quando há mais de uma; os menus criam, duplicam, renomeiam e excluem pelas ações de `planViewActions`.
 * Sem plantas adicionais, o nó do nível é exatamente o de antes. Valores de referência LITERAIS.
 */
function iniciar(comPlantas = true): void {
  useI18n.setState({ lang: 'pt' });
  const s = new ProjectStore(createEmptyProject());
  if (comPlantas) {
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv_a', levelId: 'lv_0', name: 'Fôrmas', discipline: 'estrutura' }) });
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv_b', levelId: 'lv_0', name: 'Armação', discipline: 'estrutura' }) });
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv_c', levelId: 'lv_0', name: 'Tomadas', discipline: 'eletrico' }) });
  }
  editor.load(s.project, 'teste.hestia.json');
  useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null });
}

/** HTML do nó de um nível, com as plantas adicionais que o projeto tem. */
function nivel(): string {
  const level = editor.project.levels[0]!;
  const plans = (editor.project.planViews ?? []).filter((p) => p.levelId === level.id);
  return renderToStaticMarkup(createElement(NivelDePlantas, { level, plans }));
}

describe('navegador: plantas de disciplina sob o nível', () => {
  beforeEach(() => iniciar(false));

  it('sem plantas de disciplina, o nó do nível é o de sempre, sem grupo nem "Planta padrão"', () => {
    const html = nivel();
    expect(html).toContain('data-node="plan:lv_0"');
    expect(html).toContain('Térreo');
    expect(html).toContain('draggable="true"');
    expect(html).not.toContain('data-node="g:nivel:lv_0"');
    expect(html).not.toContain('Planta padrão');
  });

  it('com plantas, lista a padrão e agrupa as adicionais pela disciplina (rótulo e ícone)', () => {
    iniciar();
    const html = nivel();
    expect(html).toContain('data-node="g:nivel:lv_0"');
    expect(html).toContain('data-node="plan:lv_0"');
    expect(html).toContain('Planta padrão');
    expect(html).toContain('data-node="g:disc:lv_0:estrutura"');
    expect(html).toContain('data-node="g:disc:lv_0:eletrico"');
    expect(html).toContain('>Estrutura<');
    expect(html).toContain('>Elétrico<');
    expect(html).toContain('data-node="pv:pv_a"');
    expect(html).toContain('data-node="pv:pv_b"');
    expect(html).toContain('data-node="pv:pv_c"');
    // Fôrmas e Armação (estrutura) antes de Tomadas (elétrico).
    expect(html.indexOf('Fôrmas')).toBeLessThan(html.indexOf('Armação'));
    expect(html.indexOf('Armação')).toBeLessThan(html.indexOf('Tomadas'));
  });

  it('uma única planta adicional aparece direto sob o nível, sem grupo de disciplina', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv_so', levelId: 'lv_0', name: 'Hidráulica', discipline: 'hidrossanitario' }) });
    editor.load(s.project, 'teste.hestia.json');
    const html = nivel();
    expect(html).toContain('data-node="pv:pv_so"');
    expect(html).not.toContain('data-node="g:disc:');
  });

  it('o destaque acompanha a planta ativa (padrão e disciplina, nunca cobertura/área/outro nível)', () => {
    iniciar(true);
    const plan = planViewById(editor.project, 'pv_a')!;
    const em = (planViewId: string | null, planKind = 'floor', levelId = 'lv_0', view = 'plan') => ({ view, planKind, levelId, planViewId });
    expect(plantaPadraoAtiva(em(null), 'lv_0')).toBe(true);
    expect(plantaPadraoAtiva(em('pv_a'), 'lv_0')).toBe(false);
    expect(plantaPadraoAtiva(em(null, 'roof'), 'lv_0')).toBe(false);
    expect(plantaPadraoAtiva(em(null, 'floor', 'lv_1'), 'lv_0')).toBe(false);
    expect(plantaDeDisciplinaAtiva(em('pv_a'), plan)).toBe(true);
    expect(plantaDeDisciplinaAtiva(em(null), plan)).toBe(false);
    expect(plantaDeDisciplinaAtiva(em('pv_a', 'area'), plan)).toBe(false);
    expect(plantaDeDisciplinaAtiva(em('pv_a', 'floor', 'lv_1'), plan)).toBe(false);
    // Na renderização, a padrão (vista inicial) sai em negrito e a de disciplina não.
    const html = nivel();
    expect(html).toMatch(/data-node="plan:lv_0"[^>]*class="bnode bold"/);
    expect(html).not.toMatch(/data-node="pv:pv_a"[^>]*class="bnode bold"/);
  });
});

describe('navegador: menus das plantas de disciplina', () => {
  beforeEach(() => iniciar());

  it('"Nova planta de disciplina" tem o submenu das cinco disciplinas e cria e abre a planta', () => {
    const menu = menuDoNivel('lv_0', 'pt');
    expect(menu.map((i) => i.label)).toEqual(['Abrir', 'Nova planta de disciplina', 'Níveis…', 'Configurar disciplinas']);
    const submenu = menu[1]!.submenu!;
    expect(submenu.map((i) => i.label)).toEqual(['Arquitetura', 'Estrutura', 'Hidrossanitário', 'Elétrico', 'HVAC']);
    submenu[1]!.run!();
    const criada = planViewsOf(editor.project).find((v) => v.name === 'Térreo - Estrutura')!;
    expect(planViewById(editor.project, criada.id)).toMatchObject({ levelId: 'lv_0', discipline: 'estrutura' });
    expect(useUi.getState().planViewId).toBe(criada.id);
    expect(useUi.getState().levelId).toBe('lv_0');
  });

  it('duplicar (com e sem anotações), renomear e excluir com a confirmação do app', async () => {
    let pediuRenome = false;
    const menu = menuDaPlantaDeDisciplina(planViewById(editor.project, 'pv_a')!, 'pt', () => { pediuRenome = true; });
    expect(menu.map((i) => i.label)).toEqual(['Abrir', 'Duplicar', 'Duplicar com anotações', 'Renomear', 'Excluir', 'Configurar disciplinas']);

    menu[0]!.run!();
    expect(useUi.getState().planViewId).toBe('pv_a');

    const antes = planViewsOf(editor.project).length;
    menu[1]!.run!();
    expect(planViewsOf(editor.project)).toHaveLength(antes + 1);
    expect(useUi.getState().planViewId).not.toBe('pv_a');
    menu[2]!.run!();
    expect(planViewsOf(editor.project)).toHaveLength(antes + 2);

    menu[3]!.run!();
    expect(pediuRenome).toBe(true);
    // Renomear para um nome já usado no nível recebe o sufixo numérico.
    expect(finalizarRenomeDaPlanta('pv_a', 'Armação')).toBe('Armação (2)');

    menu[4]!.run!();
    expect(useUi.getState().dialog).toBe('confirmacao');
    responderConfirmacao(true);
    await Promise.resolve();
    expect(planViewById(editor.project, 'pv_a')).toBeUndefined();
  });

  it('cancelar a confirmação de excluir não tira a planta', async () => {
    const menu = menuDaPlantaDeDisciplina(planViewById(editor.project, 'pv_b')!, 'pt', () => undefined);
    menu[4]!.run!();
    expect(useUi.getState().dialog).toBe('confirmacao');
    responderConfirmacao(false);
    await Promise.resolve();
    expect(planViewById(editor.project, 'pv_b')).toBeDefined();
  });
});
