import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from './Icon.tsx';
import { ACTIONS } from './ribbon/actions.ts';
import { TABS } from './ribbon/tabs.ts';
import { txt, type RibbonItem } from './ribbon/model.ts';

const leaves = (items: RibbonItem[]): RibbonItem[] =>
  items.flatMap((it) => (it.kind === 'stack' ? leaves(it.items) : it.kind === 'split' ? [it.main, ...leaves(it.menu)] : [it]));

describe('ícone de esfera quadriculada (Materiais)', () => {
  it('está registrado com viewBox 32 e as duas cores do xadrez', () => {
    const html = renderToStaticMarkup(createElement(Icon, { name: 'materialSphere' }));
    expect(html).toContain('viewBox="0 0 32 32"');
    expect(html).toContain('class="ic"');
    expect(html).toContain('ic-bl');
    expect(html).toContain('ic-s3');
    expect(html).toContain('class="ic-ln"');
    expect(html).not.toContain('viewBox="0 0 24 24"');
  });

  it('o item Materiais da aba Gerenciar usa o ícone de esfera', () => {
    const gerenciar = TABS.find((tb) => tb.id === 'gerenciar');
    const itens = leaves(gerenciar!.panels.flatMap((p) => p.items));
    const materiais = itens.find((it) => it.kind === 'action' && it.action === 'materials');
    expect(materiais).toBeDefined();
    expect(txt(ACTIONS.materials.label, 'pt')).toBe('Materiais');
    expect(ACTIONS.materials.icon).toBe('materialSphere');
  });
});
