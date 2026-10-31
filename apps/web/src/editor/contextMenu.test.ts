import { describe, expect, it } from 'vitest';
import { buildContextMenu, type ContextMenuCtx, type MenuEntry } from './contextMenu.ts';

const base: ContextMenuCtx = {
  view: 'plan',
  tool: 'select',
  selectionKinds: [],
  hasSelection: false,
  singleType: false,
  recent: [],
  last: null,
  canSelectPrevious: false,
  propsOpen: true,
  browserOpen: false,
  lang: 'pt',
  reveal: false,
  singleCategory: null,
  hasHidden: false,
  hasClip: false,
  canCopy: false,
};

/** Ids de primeiro nível, sem os separadores, para comparar a ordem. */
const ids = (m: MenuEntry[]): string[] => m.map((e) => e.id);
const find = (m: MenuEntry[], id: string): MenuEntry => {
  const e = m.find((x) => x.id === id);
  if (!e) throw new Error(`sem entrada ${id}`);
  return e;
};

describe('planta sem seleção (modo Modificar)', () => {
  it('ordem do Revit: copiar/colar, repetir, recentes, selecionar anterior, zoom, pan, navegador e propriedades', () => {
    const m = buildContextMenu({ ...base, last: { id: 'wall', label: 'Parede' }, recent: [{ id: 'wall', label: 'Parede' }], canSelectPrevious: true });
    expect(ids(m)).toEqual(['copySelection', 'pasteAligned', 'pasteAlignedLevels', 'repeat', 'recentes', 'selectPrevious', 'locate', 'zoomRegion', 'zoomOut2x', 'zoomFit', 'panPrev', 'panNext', 'browser', 'properties']);
  });

  it('repetir mostra o último comando e o atalho Espaço', () => {
    const e = find(buildContextMenu({ ...base, last: { id: 'wall', label: 'Parede' } }), 'repeat');
    expect(e.label).toBe('Repetir [Parede]');
    expect(e.shortcut).toBe('Espaço');
    expect(e.disabled).toBeFalsy();
  });

  it('sem último comando, repetir fica desabilitado com dica', () => {
    const e = find(buildContextMenu(base), 'repeat');
    expect(e.disabled).toBe(true);
    expect(e.hint).toBe('Nenhum comando para repetir');
  });

  it('comandos recentes viram submenu com ids recent:<ferramenta>', () => {
    const e = find(buildContextMenu({ ...base, recent: [{ id: 'door', label: 'Porta' }, { id: 'wall', label: 'Parede' }] }), 'recentes');
    expect(e.children?.map((c) => c.id)).toEqual(['recent:door', 'recent:wall']);
    expect(e.disabled).toBeFalsy();
  });

  it('sem recentes, o submenu fica desabilitado', () => {
    const e = find(buildContextMenu(base), 'recentes');
    expect(e.disabled).toBe(true);
  });

  it('selecionar anterior só habilitado com seleção anterior', () => {
    expect(find(buildContextMenu(base), 'selectPrevious').disabled).toBe(true);
    expect(find(buildContextMenu({ ...base, canSelectPrevious: true }), 'selectPrevious').disabled).toBeFalsy();
  });

  it('Navegador e Propriedades aparecem marcados conforme a tela', () => {
    const m = buildContextMenu({ ...base, browserOpen: true, propsOpen: false });
    expect(find(m, 'browser').checked).toBe(true);
    expect(find(m, 'properties').checked).toBe(false);
  });

  it('Ampliar região, Pan/Zoom anterior e próximo ainda não existem (esmaecidos)', () => {
    const m = buildContextMenu(base);
    for (const id of ['zoomRegion', 'panPrev', 'panNext']) {
      const e = find(m, id);
      expect(e.soon).toBe(true);
      expect(e.disabled).toBe(true);
      expect(e.hint).toBe('ainda não disponível');
    }
    expect(find(m, 'zoomOut2x').disabled).toBeFalsy();
    expect(find(m, 'zoomFit').disabled).toBeFalsy();
  });
});

describe('planta com elemento selecionado', () => {
  const sel = { ...base, hasSelection: true, selectionKinds: ['wall'], singleType: true, last: { id: 'door', label: 'Porta' } };

  it('ordem do Revit com seleção', () => {
    const m = buildContextMenu(sel);
    expect(ids(m)).toEqual(['copySelection', 'pasteAligned', 'pasteAlignedLevels', 'repeat', 'recentes', 'hide', 'isolate', 'override', 'createSimilar', 'selectAll', 'delete', 'locate', 'zoomRegion', 'zoomOut2x', 'zoomFit', 'panPrev', 'panNext', 'browser', 'properties']);
  });

  it('Ocultar na vista é submenu com Elementos, Categoria e Por filtro (só o filtro é futuro)', () => {
    const e = find(buildContextMenu(sel), 'hide');
    expect(e.children?.map((c) => c.label)).toEqual(['Elementos', 'Categoria', 'Por filtro']);
    expect(e.children?.find((c) => c.id === 'hideElements')?.shortcut).toBe('EH');
    expect(e.children?.find((c) => c.id === 'hideFilter')?.soon).toBe(true);
  });

  it('em Reveal, Ocultar vira Reexibir e aparece Reexibir tudo quando há ocultos', () => {
    const m = buildContextMenu({ ...sel, reveal: true, hasHidden: true });
    expect(m.find((x) => x.id === 'hide')).toBeUndefined();
    const e = find(m, 'unhide');
    expect(e.children?.map((c) => c.label)).toEqual(['Elementos', 'Categoria']);
    expect(find(m, 'unhideAll').label).toBe('Reexibir tudo nesta vista');
  });

  it('Criar semelhante habilitado com um só tipo de elemento de ferramenta', () => {
    expect(find(buildContextMenu(sel), 'createSimilar').disabled).toBeFalsy();
  });

  it('Criar semelhante desabilitado com tipos misturados', () => {
    const e = find(buildContextMenu({ ...sel, singleType: false, selectionKinds: ['wall', 'door'] }), 'createSimilar');
    expect(e.disabled).toBe(true);
    expect(e.hint).toBe('Selecione elementos de um só tipo');
  });

  it('escada e ambiente: Criar semelhante aparece esmaecido', () => {
    const e = find(buildContextMenu({ ...sel, selectionKinds: ['stair'] }), 'createSimilar');
    expect(e.soon).toBe(true);
    expect(e.disabled).toBe(true);
  });

  it('Selecionar todas as instâncias: Visíveis na vista habilitado, No projeto inteiro esmaecido', () => {
    const e = find(buildContextMenu(sel), 'selectAll');
    expect(e.children?.find((c) => c.id === 'selectAllView')?.disabled).toBeFalsy();
    expect(e.children?.find((c) => c.id === 'selectAllProject')?.soon).toBe(true);
  });

  it('Excluir habilitado; Editar família só para porta e janela', () => {
    expect(find(buildContextMenu(sel), 'delete').disabled).toBeFalsy();
    expect(buildContextMenu(sel).some((e) => e.id === 'editFamily')).toBe(false);
    const porta = buildContextMenu({ ...sel, selectionKinds: ['door'] });
    expect(find(porta, 'editFamily').soon).toBe(true);
  });

  it('Substituir gráficos na vista é esmaecido', () => {
    expect(find(buildContextMenu(sel), 'override').soon).toBe(true);
  });
});

describe('ferramenta de criação ativa', () => {
  const ctx = { ...base, tool: 'wall', recent: [{ id: 'wall', label: 'Parede' }] };

  it('Cancelar, recentes, opções de captura, zoom e propriedades', () => {
    const m = buildContextMenu(ctx);
    expect(ids(m)).toEqual(['cancel', 'recentes', 'snapOverrides', 'zoomRegion', 'zoomOut2x', 'zoomFit', 'panPrev', 'panNext', 'browser', 'properties']);
    expect(find(m, 'cancel').disabled).toBeFalsy();
    expect(find(m, 'snapOverrides').soon).toBe(true);
  });

  it('não traz Repetir nem Selecionar anterior', () => {
    const m = buildContextMenu({ ...ctx, last: { id: 'wall', label: 'Parede' }, canSelectPrevious: true });
    expect(ids(m)).not.toContain('repeat');
    expect(ids(m)).not.toContain('selectPrevious');
  });
});

describe('vista 3D', () => {
  it('sem seleção: sem Localizar vistas de referência e com Rodas de navegação', () => {
    const m = buildContextMenu({ ...base, view: '3d' });
    expect(ids(m)).not.toContain('locate');
    expect(find(m, 'steering').soon).toBe(true);
    expect(find(m, 'steering').disabled).toBe(true);
  });

  it('com seleção: mesma ordem da planta mais Rodas de navegação, sem Localizar', () => {
    const m = buildContextMenu({ ...base, view: '3d', hasSelection: true, selectionKinds: ['floor'], singleType: true });
    expect(ids(m)).not.toContain('locate');
    expect(ids(m)).toContain('steering');
    expect(ids(m)).toContain('createSimilar');
  });

  it('durante ferramenta de criação também traz Rodas de navegação', () => {
    expect(ids(buildContextMenu({ ...base, view: '3d', tool: 'wall' }))).toContain('steering');
  });
});

describe('corte', () => {
  it('segue a planta (inclui Localizar vistas de referência)', () => {
    expect(ids(buildContextMenu({ ...base, view: 'section' }))).toContain('locate');
  });
});

describe('copiar e colar no menu', () => {
  const sel = { ...base, hasSelection: true, selectionKinds: ['wall'], singleType: true, canCopy: true };

  it('Copiar, Colar e Alinhado vêm no topo, nesta ordem, antes do separador', () => {
    const m = buildContextMenu(sel);
    expect(ids(m).slice(0, 3)).toEqual(['copySelection', 'pasteAligned', 'pasteAlignedLevels']);
    expect(find(m, 'copySelection').separatorBefore).toBeFalsy();
    expect(find(m, 'repeat').separatorBefore).toBe(true);
  });

  it('Colar e Alinhado ficam desabilitados sem nada copiado, com o motivo', () => {
    const m = buildContextMenu(sel);
    for (const id of ['pasteAligned', 'pasteAlignedLevels']) {
      const e = find(m, id);
      expect(e.disabled).toBe(true);
      expect(e.hint).toBe('Nada copiado. Use Copiar ou Ctrl+C');
    }
    const comBuffer = buildContextMenu({ ...sel, hasClip: true });
    expect(find(comBuffer, 'pasteAligned').disabled).toBeFalsy();
    expect(find(comBuffer, 'pasteAlignedLevels').disabled).toBeFalsy();
    expect(find(comBuffer, 'pasteAligned').shortcut).toBe('Ctrl+V');
  });

  it('Copiar segue a mesma regra da faixa: só habilita com algo copiável', () => {
    expect(find(buildContextMenu(sel), 'copySelection').disabled).toBeFalsy();
    const nadaCopiável = buildContextMenu({ ...sel, canCopy: false });
    expect(find(nadaCopiável, 'copySelection').disabled).toBe(true);
    expect(find(nadaCopiável, 'copySelection').hint).toBe('Copiar só vale para paredes, pisos, lajes, telhados, escadas, rampas, ambientes e aberturas hospedadas');
  });

  it('sem seleção, Copiar fica desabilitado com "Nada selecionado" e Colar continua liberado com buffer', () => {
    const m = buildContextMenu({ ...base, hasClip: true });
    expect(find(m, 'copySelection').disabled).toBe(true);
    expect(find(m, 'copySelection').hint).toBe('Nada selecionado');
    expect(find(m, 'pasteAlignedLevels').disabled).toBeFalsy();
  });

  it('no 3D e no corte, Colar seguindo o cursor fica desabilitado; Alinhado continua liberado', () => {
    for (const view of ['3d', 'section'] as const) {
      const m = buildContextMenu({ ...sel, view, hasClip: true });
      expect(find(m, 'pasteAligned').disabled, view).toBe(true);
      expect(find(m, 'pasteAligned').hint, view).toBe('Colar seguindo o cursor só vale em planta');
      expect(find(m, 'pasteAlignedLevels').disabled, view).toBeFalsy();
    }
  });

  it('textos em inglês', () => {
    const m = buildContextMenu({ ...sel, lang: 'en', hasClip: true });
    expect(find(m, 'copySelection').label).toBe('Copy');
    expect(find(m, 'pasteAligned').label).toBe('Paste');
    expect(find(m, 'pasteAlignedLevels').label).toBe('Aligned to Selected Levels…');
  });
});

describe('idioma inglês', () => {
  it('textos em EN, como o Revit', () => {
    const m = buildContextMenu({ ...base, lang: 'en', last: { id: 'wall', label: 'Wall' }, hasSelection: true, selectionKinds: ['wall'], singleType: true, recent: [{ id: 'wall', label: 'Wall' }] });
    expect(find(m, 'repeat').label).toBe('Repeat [Wall]');
    expect(find(m, 'repeat').shortcut).toBe('Space');
    expect(find(m, 'createSimilar').label).toBe('Create Similar');
    expect(find(m, 'hide').label).toBe('Hide in View');
    expect(find(m, 'selectAll').children?.[0]?.label).toBe('Visible in View');
    expect(find(m, 'delete').label).toBe('Delete');
    expect(find(m, 'zoomOut2x').label).toBe('Zoom Out (2x)');
  });
});

describe('separadores', () => {
  it('o primeiro item de cada grupo (menos o primeiro grupo) tem separatorBefore', () => {
    const m = buildContextMenu({ ...base, last: { id: 'wall', label: 'Parede' } });
    expect(m[0]?.separatorBefore).toBeFalsy();
    // Grupos: [copiar, colar, alinhado] | [repeat, recentes] | [selectPrevious, locate] | [zoomRegion…] | [browser, properties]
    expect(m.filter((e) => e.separatorBefore).map((e) => e.id)).toEqual(['repeat', 'selectPrevious', 'zoomRegion', 'browser']);
  });
});
