import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateManifestAny, type PluginManifestV2 } from '@hestia/plugin-api';
import { useUi } from '../editor/state.ts';
import { allCommands, searchCommands } from '../ui/ribbon/commandSearch.ts';
import { txt, type RibbonItem } from '../ui/ribbon/model.ts';
import { pluginRibbonPanels, withPluginPanels } from '../ui/ribbon/pluginRibbon.ts';
import { TABS } from '../ui/ribbon/tabs.ts';
import { valoresIniciais } from './pluginUi.tsx';
import { pluginRegistry, runPluginCommand, setPluginActionExecutor } from './registry.ts';

const manifest = (id = 'dev.exemplo.grade'): PluginManifestV2 => {
  const r = validateManifestAny({
    manifestVersion: 2, id, name: 'Grade de pilares', version: '0.3.1', hestiaApi: '1.0', runtime: 'script', entry: 'main.js',
    capabilities: ['model.read', 'model.write', 'ui.commands', 'ui.ribbon', 'ui.dialogs'],
    contributes: {
      dialogs: [{ id: 'params', title: 'Grade', fields: [{ key: 'nx', label: 'Colunas', type: 'number', default: 4 }, { key: 'ok', label: 'Ok', type: 'bool' }], actions: [{ id: 'gerar', label: 'Gerar', run: { type: 'handler', ref: 'gerar' } }] }],
      commands: [{ id: 'abrir', title: { pt: 'Grade de pilares...', en: 'Pillar grid...' }, run: { type: 'dialog', ref: 'params' } }, { id: 'gerar', title: 'Gerar agora', run: { type: 'handler', ref: 'gerar' } }],
      ribbon: { panels: [{ id: 'p1', title: 'Estrutura', items: [{ command: 'abrir', size: 'large', icon: 'column' }, { command: 'gerar', size: 'small' }] }] },
    },
  });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.manifest;
};

const leaf = (items: RibbonItem[]): RibbonItem[] => items.flatMap((i) => (i.kind === 'stack' ? leaf(i.items) : [i]));

afterEach(() => {
  for (const id of pluginRegistry.pluginIds()) pluginRegistry.unregister(id);
  setPluginActionExecutor(null);
  useUi.setState({ dialog: null, dialogArg: null });
});

describe('aba Suplementos', () => {
  it('sem suplementos, a aba fixa continua só com "Ferramentas externas"', () => {
    expect(pluginRibbonPanels()).toEqual([]);
    const tab = TABS.find((t) => t.id === 'suplementos')!;
    expect(tab.panels.map((p) => p.id)).toEqual(['sup-externas']);
    expect(leaf(tab.panels.flatMap((p) => p.items))[0]).toMatchObject({ kind: 'action', action: 'externalTools' });
    expect(withPluginPanels(tab, [])).toBe(tab);
  });

  it('painéis do manifesto entram DEPOIS dos fixos, sempre na aba Suplementos', () => {
    pluginRegistry.register(manifest(), ['ui.commands', 'ui.ribbon']);
    const extra = pluginRibbonPanels();
    expect(extra).toHaveLength(1);
    expect(extra[0]!.id).toBe('plug:dev.exemplo.grade:p1');
    const tab = withPluginPanels(TABS.find((t) => t.id === 'suplementos')!, extra);
    expect(tab.panels.map((p) => p.id)).toEqual(['sup-externas', 'plug:dev.exemplo.grade:p1']);
    expect(extra[0]!.items[0]).toMatchObject({ kind: 'plugin', command: 'dev.exemplo.grade:abrir', size: 'large', icon: 'column' });
    const primeiro = extra[0]!.items[0];
    expect(primeiro && primeiro.kind === 'plugin' ? txt(primeiro.label, 'en') : null).toBe('Pillar grid...');
    // Nenhuma outra aba foi tocada.
    expect(TABS.filter((t) => t.id !== 'suplementos').every((t) => t.panels.every((p) => !p.id.startsWith('plug:')))).toBe(true);
  });

  it('sem a permissão ui.ribbon concedida, nenhum botão aparece', () => {
    pluginRegistry.register(manifest(), ['ui.commands']);
    expect(pluginRibbonPanels()).toEqual([]);
  });

  it('desativar o suplemento retira os botões', () => {
    pluginRegistry.register(manifest(), ['ui.commands', 'ui.ribbon']);
    pluginRegistry.unregister('dev.exemplo.grade');
    expect(pluginRibbonPanels()).toEqual([]);
  });
});

describe('comandos de suplemento', () => {
  it('aparecem na busca de comandos com a aba e o suplemento de origem', () => {
    pluginRegistry.register(manifest(), ['ui.commands']);
    const c = allCommands('en').find((x) => x.id === 'plug:dev.exemplo.grade:abrir');
    expect(c).toMatchObject({ label: 'Pillar grid...', where: 'Add-Ins › Grade de pilares' });
    const hits = searchCommands('pillar', 'en', {} as never);
    expect(hits.map((h) => h.id)).toContain('plug:dev.exemplo.grade:abrir');
  });

  it('sem ui.commands concedida, não aparecem', () => {
    pluginRegistry.register(manifest(), []);
    expect(allCommands('pt').some((c) => c.id.startsWith('plug:'))).toBe(false);
  });

  it('comando do tipo diálogo abre o diálogo do suplemento (dialogArg qualificado)', () => {
    pluginRegistry.register(manifest(), ['ui.commands', 'ui.dialogs']);
    runPluginCommand('dev.exemplo.grade:abrir');
    expect(useUi.getState().dialog).toBe('pluginDialog');
    expect(useUi.getState().dialogArg).toBe('dev.exemplo.grade:params');
    expect(pluginRegistry.dialog('dev.exemplo.grade:params')?.fields).toHaveLength(2);
  });

  it('handler vai ao executor ligado; sem executor só avisa; erro do executor não propaga', () => {
    pluginRegistry.register(manifest(), ['ui.commands']);
    runPluginCommand('dev.exemplo.grade:gerar');
    expect(String(useUi.getState().status)).toMatch(/Suplemento/);
    const ex = vi.fn();
    setPluginActionExecutor(ex);
    runPluginCommand('dev.exemplo.grade:gerar');
    expect(ex).toHaveBeenCalledWith({ pluginId: 'dev.exemplo.grade', action: { type: 'handler', ref: 'gerar' } });
    setPluginActionExecutor(() => { throw new Error('quebrou'); });
    expect(() => runPluginCommand('dev.exemplo.grade:gerar')).not.toThrow();
    expect(String(useUi.getState().status)).toContain('quebrou');
  });

  it('comando inexistente é ignorado', () => {
    expect(() => runPluginCommand('x.y:nada')).not.toThrow();
    expect(useUi.getState().dialog).toBeNull();
  });
});

describe('diálogo declarativo', () => {
  it('valores iniciais vêm do default do manifesto ou do vazio do tipo', () => {
    const f = manifest().contributes.dialogs![0]!.fields;
    expect(valoresIniciais(f)).toEqual({ nx: 4, ok: false });
  });
});
