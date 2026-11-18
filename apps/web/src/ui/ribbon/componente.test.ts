import { describe, expect, it } from 'vitest';
import { ACTIONS, type RibbonCtx } from './actions.ts';
import { txt } from './model.ts';
import { TABS } from './tabs.ts';
import { useUi } from '../../editor/state.ts';
import { editor } from '../../editor/controller.ts';
import { toolDisabledOnSheet } from './sheetTools.ts';
import { buildAssetFromModel, initialMaterialEdits } from '../../editor/furniture/importModel.ts';
import { boxModel } from '../../editor/furniture/testFixtures.ts';

const arq = TABS.find((tb) => tb.id === 'arquitetura')!;
const itens = arq.panels.find((p) => p.id === 'construir')!.items;

describe('botão Componente da aba Arquitetura', () => {
  it('é a ação placeComponent (não `soon`), com rótulo Componente', () => {
    const it = itens.find((i) => i.kind === 'action' && i.action === 'placeComponent');
    expect(it).toBeDefined();
    expect(itens.some((i) => i.kind === 'soon' && txt(i.label, 'pt') === 'Componente')).toBe(false);
    expect(txt(ACTIONS.placeComponent.label, 'pt')).toBe('Componente');
    expect(ACTIONS.placeComponent.icon).toBe('component');
    expect(txt(ACTIONS.placeComponent.hint!, 'pt')).toContain('arquivos .skp');
  });

  it('desativado com motivo em prancha e corte; ativo em planta e 3D', () => {
    const d = (view: string) => ACTIONS.placeComponent.disabled!({ view } as unknown as RibbonCtx);
    expect(d('plan')).toBe(false);
    expect(d('3d')).toBe(false);
    expect(txt(d('sheet') as never, 'pt')).toContain('planta e 3D');
    expect(d('section')).not.toBe(false);
    expect(toolDisabledOnSheet('sheet', 'furniture')).toBe(true);
  });

  it('sem blocos abre o diálogo Importar móvel com aviso; com 1 bloco ativa a ferramenta', () => {
    editor.newProject('blank');
    useUi.setState({ dialog: null, dialogArg: null, status: undefined });
    ACTIONS.placeComponent.run();
    expect(useUi.getState().dialog).toBe('importFurniture');
    expect(useUi.getState().status).toEqual({ key: 'fur_component_empty' });
    useUi.setState({ dialog: null, dialogArg: null });
    const m = boxModel();
    const asset = buildAssetFromModel(m, { name: 'Caixa', factor: 1, materials: initialMaterialEdits(m) });
    editor.store.exec({ type: 'addFurnitureAsset', asset });
    ACTIONS.placeComponent.run();
    expect(useUi.getState().tool).toBe('furniture');
  });
});
