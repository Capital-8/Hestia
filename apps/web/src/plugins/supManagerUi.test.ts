/**
 * Gerenciador (fase J), camada de interface sem navegador: renderização no servidor dos componentes que não dependem do
 * Worker nem do IndexedDB (permissões, log, dados), rótulos ARIA, busca de comandos e atalho.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SupplementData } from '../ui/dialogs/SupplementData.tsx';
import { SupplementGrants } from '../ui/dialogs/SupplementGrants.tsx';
import { SupplementLog } from '../ui/dialogs/SupplementLog.tsx';
import { allCommands } from '../ui/ribbon/commandSearch.ts';
import { PluginLog } from './pluginLog.ts';
import { isManagerShortcut } from './supShortcut.ts';

describe('permissões (conceder e revogar depois)', () => {
  const html = renderToStaticMarkup(
    createElement(SupplementGrants, { requested: ['model.read', 'model.write', 'plugindata.rw'], granted: ['model.read'], onApply: async () => null }),
  );
  it('tem grupo rotulado, uma caixa por permissão com rótulo associado e mostra o que falta', () => {
    expect(html).toContain('role="group"');
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html.match(/<label for=/g)).toHaveLength(3);
    expect(html).toContain('model.write, plugindata.rw');
    expect(html).toContain('exige: model.read');
  });
  it('só habilita Aplicar quando há mudança', () => {
    expect(html).toMatch(/<button class="btn primary" disabled="">Aplicar permissões<\/button>/);
  });
});

describe('log por suplemento', () => {
  it('mostra o log em região "log" focável, com filtro, copiar e limpar', () => {
    const log = new PluginLog(() => Date.UTC(2026, 10, 14, 12, 0, 0));
    log.append('dev.a.b', 'error', 'falhou: boom');
    const html = renderToStaticMarkup(createElement(SupplementLog, { log, pluginId: 'dev.a.b' }));
    expect(html).toContain('role="log"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('[error] falhou: boom');
    expect(html).toContain('Copiar');
    expect(html).toContain('Limpar');
    expect(html).toContain('1 de 1');
  });
  it('sem entradas, Copiar e Limpar ficam desabilitados', () => {
    const html = renderToStaticMarkup(createElement(SupplementLog, { log: new PluginLog(), pluginId: 'x.y' }));
    expect(html).toContain('Sem registros.');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});

describe('espaço de dados', () => {
  it('avisa somente leitura quando o dataSchema do projeto é maior', () => {
    const info = { totalBytes: 9, limitBytes: 1048576, readOnly: true, entries: [{ key: 'nome', bytes: 8, preview: '"ação"' }] };
    const html = renderToStaticMarkup(createElement(SupplementData, { read: () => info, schema: 2 }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Somente leitura');
    expect(html).toContain('9 bytes');
    expect(html).toContain('scope="col"');
  });
  it('vazio mostra a explicação', () => {
    const html = renderToStaticMarkup(createElement(SupplementData, { read: () => ({ totalBytes: 0, limitBytes: 1048576, readOnly: false, entries: [] }), schema: 1 }));
    expect(html).toContain('não guardou dados');
    expect(html).not.toContain('role="alert"');
  });
});

describe('busca de comandos e atalho', () => {
  it('"Gerenciar suplementos" aparece na busca de comandos, nos dois idiomas, uma única vez', () => {
    expect(allCommands('pt').filter((c) => c.id === 'act:pluginManager').map((c) => c.label)).toEqual(['Gerenciar suplementos']);
    expect(allCommands('en').filter((c) => c.id === 'act:pluginManager').map((c) => c.label)).toEqual(['Manage Add-Ins']);
  });
  it('Alt+Shift+P abre; variações e repetição automática não', () => {
    const base = { code: 'KeyP', altKey: true, shiftKey: true, ctrlKey: false, metaKey: false };
    expect(isManagerShortcut(base)).toBe(true);
    expect(isManagerShortcut({ ...base, ctrlKey: true })).toBe(false);
    expect(isManagerShortcut({ ...base, shiftKey: false })).toBe(false);
    expect(isManagerShortcut({ ...base, code: 'KeyO' })).toBe(false);
    expect(isManagerShortcut({ ...base, repeat: true })).toBe(false);
  });
});
