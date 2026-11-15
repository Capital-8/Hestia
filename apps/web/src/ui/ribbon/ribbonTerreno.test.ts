import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, ProjectStore } from '@hestia/model';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { editor } from '../../editor/controller.ts';
import { fecharImportTerreno, importTerrenoAberto } from '../../editor/terrenoImport.ts';
import { useUi } from '../../editor/state.ts';
import { fecharLocalizacao, localizacaoAberta } from '../dialogs/localizacaoAberta.ts';
import { ACTIONS } from './actions.ts';
import { txt, type RibbonItem, type RibbonPanel } from './model.ts';
import { TABS } from './tabs.ts';

const folhas = (items: RibbonItem[]): RibbonItem[] =>
  items.flatMap((it) => (it.kind === 'stack' ? folhas(it.items) : it.kind === 'split' ? [it.main, ...folhas(it.menu)] : [it]));
const painel = (tab: string, id: string): RibbonPanel => TABS.find((t) => t.id === tab)!.panels.find((p) => p.id === id)!;
const nomes = (items: RibbonItem[], lang: 'pt' | 'en' = 'pt'): string[] => folhas(items).flatMap((it) => (it.kind === 'soon' ? [txt(it.label, lang)] : []));

/** Projeto de um nível com um terreno (fixture T5: terreno e uma plataforma), carregado no editor, em planta. */
function setup(): void {
  const s = new ProjectStore(createEmptyProject());
  adicionarFixtureTerreno(s, 'T5');
  editor.load(s.project, 'teste.hestia.json');
  useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, selection: [], tool: 'select', terrenoEdicao: null, dialog: null, dialogArg: null });
  fecharImportTerreno();
  fecharLocalizacao();
}

describe('faixa: botões da fase 3 do terreno', () => {
  beforeEach(setup);

  it('painel Terreno: Topografia (com menu), Editar terreno e só o Componente de terreno continua soon (Subdivisão, Plataforma e Região nivelada: ficha T3)', () => {
    const pn = painel('massa', 'mas-terreno');
    const topografia = pn.items.find((it) => it.kind === 'split')!;
    expect(topografia.kind === 'split' && topografia.main).toMatchObject({ kind: 'tool', tool: 'terrain' });
    const menu = topografia.kind === 'split' ? topografia.menu : [];
    expect(menu.map((m) => (m.kind === 'action' ? m.action : m.kind))).toEqual(['terrenoPontos', 'terrenoCurvas', 'importTerreno']);
    expect(folhas(pn.items).some((it) => it.kind === 'action' && it.action === 'editTerreno')).toBe(true);
    expect(nomes(pn.items)).toEqual(['Componente de terreno']);
  });

  it('painel Lote: tudo soon por enquanto (fase 5)', () => {
    const pn = painel('massa', 'mas-lote');
    expect(folhas(pn.items).every((it) => it.kind === 'soon')).toBe(true);
    expect(nomes(pn.items)).toEqual(['Linhas de propriedade', 'Índices do lote', 'Envelope legal']);
  });

  it('painel Análise: Corte e aterro soon (fase 4); Rótulo de curva e Cota de ponto ativos', () => {
    const pn = painel('massa', 'mas-analise');
    expect(nomes(pn.items)).toEqual(['Corte e aterro']);
    const ferramentas = folhas(pn.items).flatMap((it) => (it.kind === 'tool' ? [it.tool] : []));
    expect(ferramentas).toEqual(['terrainLabel', 'terrainSpot']);
  });

  it('os painéis da massa não foram tocados', () => {
    expect(painel('massa', 'mas-massa').items).toHaveLength(3);
    expect(folhas(painel('massa', 'mas-massa').items).every((it) => it.kind === 'soon')).toBe(true);
    expect(nomes(painel('massa', 'mas-por-massa').items).length + folhas(painel('massa', 'mas-por-massa').items).length).toBeGreaterThan(0);
  });

  it('Gerenciar › Gerenciar projeto tem o botão Localização', () => {
    const pn = painel('gerenciar', 'gerenciar-projeto');
    expect(folhas(pn.items).some((it) => it.kind === 'action' && it.action === 'localizacao')).toBe(true);
  });

  it('o painel Importar da aba Inserir tem Importar levantamento', () => {
    expect(folhas(painel('inserir', 'ins-importar').items).some((it) => it.kind === 'action' && it.action === 'importTerreno')).toBe(true);
  });

  it('Colocar pontos liga a Topografia no modo pontos; Desenhar curvas, no modo curvas', () => {
    ACTIONS.terrenoCurvas.run();
    expect(useUi.getState().tool).toBe('terrain');
    expect(editor.activeTool.id).toBe('terrain');
    expect((editor.activeTool as unknown as { modoAtual: string }).modoAtual).toBe('curvas');
    ACTIONS.terrenoPontos.run();
    expect((editor.activeTool as unknown as { modoAtual: string }).modoAtual).toBe('pontos');
  });

  it('Importar levantamento abre o diálogo de importação do terreno', () => {
    expect(importTerrenoAberto()).toBe(false);
    ACTIONS.importTerreno.run();
    expect(importTerrenoAberto()).toBe(true);
  });

  it('Editar terreno entra no modo de edição do terreno do nível (ou do selecionado)', () => {
    ACTIONS.editTerreno.run();
    expect(useUi.getState().tool).toBe('terrainEdit');
    expect(useUi.getState().terrenoEdicao).toEqual({ terrenoId: 'tn_t5' });
    expect(useUi.getState().selection).toEqual(['tn_t5']);
  });

  it('Localização abre o diálogo de localização', () => {
    expect(localizacaoAberta()).toBe(false);
    ACTIONS.localizacao.run();
    expect(localizacaoAberta()).toBe(true);
  });

  it('Rótulo de curva e Cota de ponto são ferramentas da faixa: terrainLabel e terrainSpot ligam', () => {
    editor.setTool('terrainLabel');
    expect(useUi.getState().tool).toBe('terrainLabel');
    editor.setTool('terrainSpot');
    expect(useUi.getState().tool).toBe('terrainSpot');
  });
});
