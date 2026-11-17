import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, isLot, ProjectStore, type Lot } from '@hestia/model';
import { LotTool } from '@hestia/tools';
import { editor } from '../../editor/controller.ts';
import { useUi } from '../../editor/state.ts';
import { aplicarRumos, formRumosL1 } from '../dialogs/loteRumosForm.ts';
import { fecharLoteRumos, loteRumosAberto } from '../dialogs/loteRumosAberto.ts';
import { fecharLoteSchedule, loteScheduleAberta } from '../dialogs/loteScheduleAberta.ts';
import { ACTIONS, ctxNow, type RibbonCtx } from './actions.ts';
import { txt, type RibbonItem, type RibbonPanel } from './model.ts';
import { TABS } from './tabs.ts';

const folhas = (items: RibbonItem[]): RibbonItem[] =>
  items.flatMap((it) => (it.kind === 'stack' ? folhas(it.items) : it.kind === 'split' ? [it.main, ...folhas(it.menu)] : [it]));
const painel = (tab: string, id: string): RibbonPanel => TABS.find((t) => t.id === tab)!.panels.find((p) => p.id === id)!;
const soon = (items: RibbonItem[]): string[] => folhas(items).flatMap((it) => (it.kind === 'soon' ? [txt(it.label, 'pt')] : []));
const acoes = (items: RibbonItem[]): string[] => folhas(items).flatMap((it) => (it.kind === 'action' ? [it.action] : []));
const lotes = (): Lot[] => Object.values(editor.project.elements).filter(isLot);
const L1 = [[0, 0], [12, 0], [12, 30], [0, 30]] as const;

function setup(): void {
  const s = new ProjectStore(createEmptyProject());
  editor.load(s.project, 'teste.hestia.json');
  useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, selection: [], tool: 'select', dialog: null, dialogArg: null });
  fecharLoteRumos();
}

describe('faixa: Linhas de propriedade ativo (ficha P3)', () => {
  beforeEach(setup);
  afterEach(() => {
    fecharLoteRumos();
    fecharLoteSchedule();
  });

  it('o painel Lote tem a ferramenta lot com menu (Desenhar e Por tabela…) e Índices do lote ativo (ficha P4); só Envelope legal segue soon', () => {
    const pn = painel('massa', 'mas-lote');
    const dividido = pn.items.find((it) => it.kind === 'split')!;
    expect(dividido.kind === 'split' && dividido.main).toMatchObject({ kind: 'tool', tool: 'lot' });
    expect(acoes(pn.items)).toEqual(['loteDesenhar', 'lotePorTabela', 'indicesLote']);
    expect(soon(pn.items)).toEqual(['Envelope legal']);
    expect(soon(pn.items)).not.toContain('Linhas de propriedade');
  });

  it('Desenhar liga a ferramenta lot e o botão fica pressionado', () => {
    ACTIONS.loteDesenhar.run();
    expect(useUi.getState().tool).toBe('lot');
    expect(editor.activeTool).toBeInstanceOf(LotTool);
    const c = { tool: useUi.getState().tool, p: editor.project } as RibbonCtx;
    expect(ACTIONS.loteDesenhar.pressed?.(c)).toBe(true);
  });

  it('Índices do lote é ativo e abre a tabela (ficha P4)', () => {
    expect(loteScheduleAberta()).toBe(false);
    expect(ACTIONS.indicesLote.disabled?.(ctxNow()) ?? false).toBe(false);
    ACTIONS.indicesLote.run();
    expect(loteScheduleAberta()).toBe(true);
    fecharLoteSchedule();
  });

  it('Por tabela… abre o diálogo', () => {
    expect(loteRumosAberto()).toBe(false);
    ACTIONS.lotePorTabela.run();
    expect(loteRumosAberto()).toBe(true);
  });

  it('L1 pela ferramenta e pelo diálogo dão o mesmo polígono (1e-9) e o mesmo papel dos lados; um desfazer cada', () => {
    ACTIONS.loteDesenhar.run();
    const t = editor.activeTool as LotTool;
    for (const [x, y] of L1) {
      t.move({ raw: { x, y }, shift: false, ctrl: false, alt: false });
      t.click({ raw: { x, y }, shift: false, ctrl: false, alt: false });
    }
    t.confirm();
    expect(lotes()).toHaveLength(1);
    const pelaFerramenta = lotes()[0]!;
    const r = aplicarRumos(editor.store, formRumosL1(), 'lv_0', 'Lote 2', 'Criar lote por tabela');
    expect('id' in r).toBe(true);
    expect(lotes()).toHaveLength(2);
    const pelaTabela = lotes().find((l) => l.id !== pelaFerramenta.id)!;
    expect(pelaTabela.contorno).toHaveLength(pelaFerramenta.contorno.length);
    pelaFerramenta.contorno.forEach((q, i) => {
      expect(pelaTabela.contorno[i]!.x).toBeCloseTo(q.x, 9);
      expect(pelaTabela.contorno[i]!.y).toBeCloseTo(q.y, 9);
    });
    expect(pelaTabela.lados).toEqual(pelaFerramenta.lados);
    expect(pelaTabela.lados[0]).toEqual({ papel: 'frente', recuo: 0 });
    editor.undo();
    expect(lotes()).toHaveLength(1);
    editor.undo();
    expect(lotes()).toHaveLength(0);
  });
});
