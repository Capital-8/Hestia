import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject, isTerrainRegion, ProjectStore } from '@hestia/model';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { TerrainRegionTool } from '@hestia/tools';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { RegiaoOpcoes } from '../TerrainOptionsBar.tsx';
import { ACTIONS, type RibbonCtx } from './actions.ts';
import { txt, type RibbonItem, type RibbonPanel } from './model.ts';
import { TABS } from './tabs.ts';

const folhas = (items: RibbonItem[]): RibbonItem[] =>
  items.flatMap((it) => (it.kind === 'stack' ? folhas(it.items) : it.kind === 'split' ? [it.main, ...folhas(it.menu)] : [it]));
const painel = (tab: string, id: string): RibbonPanel => TABS.find((t) => t.id === tab)!.panels.find((p) => p.id === id)!;
const soon = (items: RibbonItem[]): string[] => folhas(items).flatMap((it) => (it.kind === 'soon' ? [txt(it.label, 'pt')] : []));
const acoes = (items: RibbonItem[]): string[] => folhas(items).flatMap((it) => (it.kind === 'action' ? [it.action] : []));
const ferramenta = (): TerrainRegionTool => {
  const t = editor.activeTool;
  if (!(t instanceof TerrainRegionTool)) throw new Error('a ferramenta ativa não é a Região de terreno');
  return t;
};
const ctxAtual = (): RibbonCtx => ({ tool: useUi.getState().tool, p: editor.project }) as RibbonCtx;

/** Projeto com o terreno T5 (e a plataforma dele), carregado no editor, em planta. */
function setup(comTerreno = true): void {
  const s = new ProjectStore(createEmptyProject());
  if (comTerreno) adicionarFixtureTerreno(s, 'T5');
  editor.load(s.project, 'teste.hestia.json');
  useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, selection: [], tool: 'select', terrenoEdicao: null, dialog: null, dialogArg: null });
}

describe('faixa: Subdivisão, Plataforma e Região nivelada ativos (ficha T3)', () => {
  beforeEach(() => setup());

  it('o painel Terreno não tem mais Subdivisão, Plataforma nem Região nivelada como "em breve"; só o Componente de terreno', () => {
    const pn = painel('massa', 'mas-terreno');
    expect(soon(pn.items)).toEqual(['Componente de terreno']);
    expect(acoes(pn.items)).toEqual(expect.arrayContaining(['regiaoSubdivisao', 'regiaoPlataforma', 'regiaoPlataformaElemento', 'regiaoNivelada']));
    expect(folhas(pn.items).some((it) => it.kind === 'tool' && it.tool === 'terrainRegion')).toBe(true);
  });

  it('Subdivisão, Plataforma e Região nivelada ligam a ferramenta terrainRegion na predefinição certa', () => {
    ACTIONS.regiaoSubdivisao.run();
    expect(useUi.getState().tool).toBe('terrainRegion');
    expect(ferramenta().predefinicao).toBe('subdivisao');
    expect(ferramenta().permeavel).toBe(true);
    ACTIONS.regiaoPlataforma.run();
    expect(ferramenta().predefinicao).toBe('plataforma');
    expect(ferramenta().porElemento).toBe(false);
    expect([ferramenta().taludeCorte, ferramenta().taludeAterro, ferramenta().permeavel]).toEqual([0, 0, false]);
    ACTIONS.regiaoNivelada.run();
    expect(ferramenta().predefinicao).toBe('nivelada');
    expect([ferramenta().taludeCorte, ferramenta().taludeAterro]).toEqual([1.5, 2]);
  });

  it('Plataforma por elemento liga a plataforma com a opção "Por elemento"', () => {
    ACTIONS.regiaoPlataformaElemento.run();
    expect(ferramenta().predefinicao).toBe('plataforma');
    expect(ferramenta().porElemento).toBe(true);
  });

  it('os botões ficam pressionados só na predefinição ativa', () => {
    ACTIONS.regiaoNivelada.run();
    const c = ctxAtual();
    expect(ACTIONS.regiaoNivelada.pressed?.(c)).toBe(true);
    expect(ACTIONS.regiaoPlataforma.pressed?.(c)).toBe(false);
    expect(ACTIONS.regiaoSubdivisao.pressed?.(c)).toBe(false);
    expect(ACTIONS.regiaoPlataformaElemento.pressed?.(c)).toBe(false);
    ACTIONS.regiaoPlataformaElemento.run();
    expect(ACTIONS.regiaoPlataformaElemento.pressed?.(ctxAtual())).toBe(true);
    expect(ACTIONS.regiaoPlataforma.pressed?.(ctxAtual())).toBe(false);
  });

  it('sem terreno no projeto os botões ficam desativados com o motivo; com terreno, ativos', () => {
    for (const a of ['regiaoSubdivisao', 'regiaoPlataforma', 'regiaoPlataformaElemento', 'regiaoNivelada'] as const) {
      expect(ACTIONS[a].disabled?.(ctxAtual()), a).toBe(false);
    }
    setup(false);
    for (const a of ['regiaoSubdivisao', 'regiaoPlataforma', 'regiaoPlataformaElemento', 'regiaoNivelada'] as const) {
      expect(ACTIONS[a].disabled?.(ctxAtual()), a).toBeTruthy();
    }
  });

  it('a ferramenta da faixa cria a região sobre o terreno (clicando os vértices e Enter): um desfazer remove', () => {
    ACTIONS.regiaoNivelada.run();
    const t = ferramenta();
    t.definirCotaDoCampo(7);
    for (const [x, y] of [[2, 2], [8, 2], [8, 8], [2, 8]] as const) {
      t.move({ raw: { x, y }, shift: false, ctrl: false, alt: false });
      t.click({ raw: { x, y }, shift: false, ctrl: false, alt: false });
    }
    t.confirm();
    const novas = Object.values(editor.project.elements).filter(isTerrainRegion).filter((r) => r.papel === 'nivelada');
    expect(novas).toHaveLength(1);
    expect(novas[0]!.cota).toBe(7);
    expect(novas[0]!.terrenoId).toBe('tn_t5');
  });
});

describe('barra de opções da Região de terreno', () => {
  beforeEach(() => setup());

  it('plataforma: papel, Por elemento, cota, inclinação, direção, taludes e permeável', () => {
    ACTIONS.regiaoPlataforma.run();
    const m = renderToStaticMarkup(createElement(RegiaoOpcoes, { tool: ferramenta(), onChange: () => undefined }));
    for (const id of ['opt-rg-papel', 'opt-rg-elemento', 'opt-rg-cota', 'opt-rg-incl', 'opt-rg-dir', 'opt-rg-tcorte', 'opt-rg-taterro', 'opt-rg-perm']) expect(m, id).toContain(`id="${id}"`);
  });

  it('subdivisão: só o papel e a permeabilidade (sem plano nem taludes)', () => {
    ACTIONS.regiaoSubdivisao.run();
    const m = renderToStaticMarkup(createElement(RegiaoOpcoes, { tool: ferramenta(), onChange: () => undefined }));
    expect(m).toContain('id="opt-rg-papel"');
    expect(m).toContain('id="opt-rg-perm"');
    for (const id of ['opt-rg-elemento', 'opt-rg-cota', 'opt-rg-incl', 'opt-rg-dir', 'opt-rg-tcorte', 'opt-rg-taterro']) expect(m, id).not.toContain(`id="${id}"`);
  });

  it('região nivelada: sem a opção Por elemento, com plano e taludes', () => {
    ACTIONS.regiaoNivelada.run();
    const m = renderToStaticMarkup(createElement(RegiaoOpcoes, { tool: ferramenta(), onChange: () => undefined }));
    expect(m).not.toContain('id="opt-rg-elemento"');
    expect(m).toContain('id="opt-rg-tcorte"');
  });
});
