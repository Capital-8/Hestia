import { describe, expect, it } from 'vitest';
import { TOOL_LABEL } from '@hestia/tools';
import { createEmptyProject, type Project } from '@hestia/model';
import { useUi } from '../../editor/state.ts';
import { ACTIONS, type RibbonCtx } from './actions.ts';
import { allCommands } from './commandSearch.ts';
import { contextTab, pasteLevelsTab, perimeterTab } from './context.ts';
import { txt, type RibbonItem, type RibbonPanel, type Txt } from './model.ts';
import { P_CLIPBOARD } from './panelsShared.ts';
import { TABS, TAB_ORDER } from './tabs.ts';
import type { PastePreviewState } from '../../editor/pasteLevels/types.ts';

const leaves = (items: RibbonItem[]): RibbonItem[] =>
  items.flatMap((it) => (it.kind === 'stack' ? leaves(it.items) : it.kind === 'split' ? [it.main, ...leaves(it.menu)] : [it]));
const allPanels = (): RibbonPanel[] => TABS.flatMap((tb) => tb.panels);

describe('faixa guiada por dados', () => {
  it('abas na ordem do Revit 2024, Modificar por último', () => {
    expect(TAB_ORDER).toEqual(['arquitetura', 'estrutura', 'aco', 'premoldado', 'sistemas', 'inserir', 'anotar', 'analisar', 'massa', 'colaborar', 'vista', 'gerenciar', 'suplementos', 'modificar']);
    expect(TABS.map((tb) => txt(tb.label, 'pt'))).toEqual(['Arquitetura', 'Estrutura', 'Aço', 'Pré-moldado', 'Sistemas', 'Inserir', 'Anotar', 'Analisar', 'Massa e terreno', 'Colaborar', 'Vista', 'Gerenciar', 'Suplementos', 'Modificar']);
  });

  it('título contextual composto também traduz (não cai em inglês)', () => {
    expect(txt({ pt: 'Modificar | Paredes', en: 'Modify | Walls' }, 'es')).toBe('Modificar | Muros');
    expect(txt({ pt: 'Modificar | Colocar Parede', en: 'Modify | Place Wall' }, 'de')).toBe('Ändern | Platzieren Wand');
    expect(txt({ pt: 'Modificar | Editar perímetro do telhado', en: 'Modify | Edit Roof Perimeter' }, 'fr')).toBe('Modifier | Modifier le périmètre du toit');
  });

  it('toda ferramenta e ação citada existe', () => {
    for (const it of leaves(allPanels().flatMap((p) => p.items))) {
      if (it.kind === 'tool') expect(TOOL_LABEL[it.tool], it.tool).toBeTruthy();
      if (it.kind === 'action') expect(ACTIONS[it.action], it.action).toBeDefined();
    }
  });

  it('pilha tem no máximo 3 botões pequenos e só folhas', () => {
    for (const p of allPanels()) {
      for (const it of p.items) {
        if (it.kind !== 'stack') continue;
        expect(it.items.length, p.id).toBeLessThanOrEqual(3);
        for (const s of it.items) expect(['tool', 'action', 'soon', 'option']).toContain(s.kind);
      }
    }
  });

  it('ids de painel são únicos dentro de cada aba', () => {
    for (const tb of TABS) {
      const ids = tb.panels.map((p) => p.id);
      expect(new Set(ids).size, tb.id).toBe(ids.length);
    }
  });

  it('toda ferramenta do registro aparece na faixa (nenhuma ficou sem acesso)', () => {
    const naFaixa = new Set(leaves(allPanels().flatMap((p) => p.items)).flatMap((it) => (it.kind === 'tool' ? [it.tool] : [])));
    const ctx = ['wall', 'roofarrow', 'slope', 'attachroof', 'detachroof', 'rehost', 'roomsep'] as const;
    // Pendente: o modo de perímetro não tem botão de criação na faixa (abre por `perimeterActions.begin`).
    // Colar também não é ferramenta da faixa: é o modo transitório do botão Colar/Ctrl+V.
    // A ferramenta de suplemento ('plugin') é aberta pelos botões que o próprio suplemento contribui (aba Suplementos).
    const pendente = ['perimeter', 'paste', 'plugin'] as const;
    for (const id of Object.keys(TOOL_LABEL)) {
      if ((ctx as readonly string[]).includes(id) || (pendente as readonly string[]).includes(id)) continue;
      expect(naFaixa.has(id as never), id).toBe(true);
    }
  });
});

describe('unidades do projeto na faixa', () => {
  it('ACTIONS.units abre o diálogo de unidades', () => {
    expect(ACTIONS.units).toBeDefined();
    useUi.setState({ dialog: null, dialogArg: null });
    ACTIONS.units.run();
    expect(useUi.getState().dialog).toBe('units');
  });

  it('a aba Gerenciar tem a ação "units" e não tem mais o item "soon"', () => {
    const gerenciar = TABS.find((tb) => tb.id === 'gerenciar');
    const itens = leaves(gerenciar!.panels.flatMap((p) => p.items));
    expect(itens.some((it) => it.kind === 'action' && it.action === 'units')).toBe(true);
    const soonUnidades = itens.filter((it) => it.kind === 'soon' && txt(it.label, 'pt') === 'Unidades do projeto');
    expect(soonUnidades).toHaveLength(0);
  });

  it('a busca de comandos encontra "Unidades do projeto"', () => {
    const nomes = allCommands('pt').map((c) => c.label);
    expect(nomes).toContain('Unidades do projeto');
  });
});

describe('aba contextual', () => {
  const p = createEmptyProject('vazio');
  it('ferramenta de criação abre "Modificar | Colocar X"', () => {
    const c = contextTab('wall', [], p);
    expect(c?.key).toBe('tool:wall');
    expect(txt(c!.tab.label, 'pt')).toBe('Modificar | Colocar Parede');
    expect(txt(c!.tab.label, 'en')).toBe('Modify | Place Wall');
    expect(c!.tab.panels.map((x) => x.id)).toContain('desenhar');
  });
  it('ferramenta de edição e nada selecionado não abrem aba', () => {
    expect(contextTab('move', [], p)).toBeNull();
    expect(contextTab('select', [], p)).toBeNull();
  });
  it('prévia do colar alinhado abre "Modificar | Colar alinhado"', () => {
    const preview: PastePreviewState = { levelIds: ['n1', 'n2'], count: 4, originView: 'plan', originLevelId: 'n1', originSectionId: null, link: false };
    const tab = pasteLevelsTab(preview);
    expect(tab.key).toBe('paste:levels:n1+n2');
    expect(txt(tab.tab.label, 'pt')).toBe('Modificar | Colar alinhado');
    expect(txt(tab.tab.label, 'en')).toBe('Modify | Paste Aligned');
    expect(tab.tab.panels.map((x) => x.id)).toEqual(['selecionar', 'propriedades']);
  });
});

describe('disposição dos painéis na faixa', () => {
  const comLados = (sides: RibbonCtx['sides']): RibbonCtx => ({ sides } as RibbonCtx);

  it('ações de lado e de restaurar estão no menu Interface do usuário', () => {
    const acoes = leaves(allPanels().flatMap((pn) => pn.items)).flatMap((it) => (it.kind === 'action' ? [it.action] : []));
    expect(acoes).toEqual(expect.arrayContaining(['propsSide', 'browserSide', 'resetDock']));
  });

  it('"pressionado" só quando o painel está à direita', () => {
    const sides = { props: 'right' as const, browser: 'left' as const };
    expect(ACTIONS.propsSide.pressed?.(comLados(sides))).toBe(true);
    expect(ACTIONS.browserSide.pressed?.(comLados(sides))).toBe(false);
  });
});

describe('perímetro na faixa', () => {
  const p = createEmptyProject('vazio');
  const comRoof = { ...p, elements: { r1: { id: 'r1', kind: 'roof' } } } as unknown as Project;
  it('modo de criar: "Modificar | Criar perímetro do telhado" com o slot do perímetro no fim', () => {
    const tab = perimeterTab('roof');
    expect(tab.key).toBe('perimeter:roof');
    expect(txt(tab.label, 'pt')).toBe('Modificar | Criar perímetro do telhado');
    expect(tab.slots.map((s) => (s.kind === 'panel' ? s.panel.id : s.kind))).toEqual(['selecionar', 'propriedades', 'modificar', 'medir', 'perimetro']);
  });
  it('modo de editar: título "Editar perímetro do …" e chave própria do elemento', () => {
    const tab = perimeterTab('floor', 'f1');
    expect(tab.key).toBe('perimeter:floor:f1');
    expect(txt(tab.label, 'pt')).toBe('Modificar | Editar perímetro do piso');
    expect(txt(tab.label, 'en')).toBe('Modify | Edit Floor Perimeter');
  });
  it('telhado, piso, laje e forro selecionados ganham o painel "Editar perímetro"', () => {
    const c = contextTab('select', ['r1'], comRoof);
    expect(c?.tab.panels.flatMap((x) => x.items.map((it) => (it.kind === 'action' ? it.action : '')))).toContain('editPerimeter');
  });
  it('"Editar perímetro" fica desabilitado sem elemento editável, com o motivo', () => {
    expect(ACTIONS.editPerimeter.disabled?.({ p, selection: [] } as unknown as RibbonCtx)).toBeTruthy();
    expect(ACTIONS.editPerimeter.disabled?.({ p: comRoof, selection: ['r1'] } as unknown as RibbonCtx)).toBe(false);
  });
});

describe('copiar, recortar, colar e criar semelhante na faixa', () => {
  const p = createEmptyProject('vazio');
  /** Parede mínima: só o que Copiar/Recortar/Criar semelhante olham (id, tipo de elemento e tipo). */
  const comParede = { ...p, elements: { w1: { id: 'w1', kind: 'wall', typeId: 'wt_alv14' } } } as unknown as Project;
  const comJanela = { ...p, elements: { j1: { id: 'j1', kind: 'window', typeId: 'jan_120' } } } as unknown as Project;
  const ctx = (o: { p?: Project; selection?: string[]; view?: string }): RibbonCtx => ({ p, selection: [], ...o } as unknown as RibbonCtx);

  it('Criar semelhante anuncia o atalho configurável e Copiar/Recortar/Colar anunciam as teclas fixas', () => {
    expect(ACTIONS.createSimilar.shortcut).toBe('createSimilar');
    expect(ACTIONS.copySelection.keys).toBe('Ctrl+C');
    expect(ACTIONS.cutSelection.keys).toBe('Ctrl+X');
    expect(ACTIONS.pasteAligned.keys).toBe('Ctrl+V');
  });

  it('as cinco ações de transferência estão na faixa', () => {
    const acoes = leaves(allPanels().flatMap((pn) => pn.items)).flatMap((it) => (it.kind === 'action' ? [it.action] : []));
    expect(acoes).toEqual(expect.arrayContaining(['copySelection', 'cutSelection', 'pasteAligned', 'pasteAlignedLevels', 'createSimilar']));
  });

  it('Copiar fica desabilitado sem seleção e liberado com uma parede', () => {
    expect(ACTIONS.copySelection.disabled?.(ctx({}))).toBeTruthy();
    expect(ACTIONS.copySelection.disabled?.(ctx({ p: comParede, selection: ['w1'] }))).toBe(false);
  });

  it('Copiar fica desabilitado para uma janela sozinha (sem a parede hospedeira)', () => {
    expect(ACTIONS.copySelection.disabled?.(ctx({ p: comJanela, selection: ['j1'] }))).toBeTruthy();
  });

  it('Recortar fica desabilitado sem seleção, liberado com parede e barrado com id inexistente', () => {
    expect(ACTIONS.cutSelection.disabled?.(ctx({}))).toBeTruthy();
    expect(ACTIONS.cutSelection.disabled?.(ctx({ p: comParede, selection: ['w1'] }))).toBe(false);
    // Aberturas hospedadas entram em `copyableIds` sem estarem na seleção: a comparação é id a id, não por tamanho.
    expect(ACTIONS.cutSelection.disabled?.(ctx({ p: comParede, selection: ['w1', 'nao_existe'] }))).toBeTruthy();
  });

  it('Colar avisa que nada foi copiado (buffer vazio neste arquivo) e que não vale para pranchas', () => {
    const semBuffer = ACTIONS.pasteAligned.disabled?.(ctx({ view: 'plan' }));
    expect(semBuffer).toBeTruthy();
    expect(txt(semBuffer as Txt, 'pt')).toContain('Nada copiado');
    const prancha = ACTIONS.pasteAligned.disabled?.(ctx({ view: 'sheet' }));
    expect(prancha).toBeTruthy();
    expect(txt(prancha as Txt, 'pt')).toContain('pranchas');
  });

  it('Alinhado aos níveis selecionados: sem buffer avisa em planta, 3D e corte; na prancha, não vale', () => {
    for (const view of ['plan', '3d', 'section']) {
      const semBuffer = ACTIONS.pasteAlignedLevels.disabled?.(ctx({ view }));
      expect(txt(semBuffer as Txt, 'pt'), view).toContain('Nada copiado');
    }
    const prancha = ACTIONS.pasteAlignedLevels.disabled?.(ctx({ view: 'sheet' }));
    expect(txt(prancha as Txt, 'pt')).toContain('pranchas');
  });

  it('a seta do Colar abre "Alinhado aos níveis selecionados" com os textos exatos do Revit', () => {
    const colar = P_CLIPBOARD.items.find((it) => it.kind === 'split');
    expect(colar?.kind).toBe('split');
    if (colar?.kind !== 'split') return;
    expect(colar.main).toMatchObject({ kind: 'action', action: 'pasteAligned' });
    expect(colar.menu).toHaveLength(1);
    const item = colar.menu[0];
    expect(item).toMatchObject({ kind: 'action', action: 'pasteAlignedLevels' });
    if (item?.kind !== 'action') return;
    expect(txt(ACTIONS[item.action].label, 'pt')).toBe('Alinhado aos níveis selecionados');
    expect(txt(ACTIONS[item.action].label, 'en')).toBe('Aligned to Selected Levels');
    expect(ACTIONS[item.action].icon).toBe('paste');
  });

  it('Criar semelhante fica desabilitado sem seleção e liberado com uma parede', () => {
    expect(ACTIONS.createSimilar.disabled?.(ctx({}))).toBeTruthy();
    expect(ACTIONS.createSimilar.disabled?.(ctx({ p: comParede, selection: ['w1'] }))).toBe(false);
  });

  it('a busca de comandos encontra Copiar, Recortar, Colar e Criar semelhante', () => {
    const nomes = allCommands('pt').map((c) => c.label);
    expect(nomes).toEqual(expect.arrayContaining(['Copiar', 'Recortar', 'Colar', 'Criar semelhante']));
  });
});
