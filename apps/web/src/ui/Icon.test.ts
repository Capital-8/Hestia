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
    expect(html).toContain('fill="#62b8f5"');
    expect(html).toContain('url(#ic-esfera-volume)');
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

describe('ícone de pena (Conjuntos de penas)', () => {
  it('está registrado com viewBox 32 e o desenho da pena', () => {
    const html = renderToStaticMarkup(createElement(Icon, { name: 'pen' }));
    expect(html).toContain('viewBox="0 0 32 32"');
    expect(html).toContain('class="ic-s1"');
    expect(html).toContain('class="ic-ln"');
    expect(html).toContain('class="ic-ac"');
  });

  it('a ação Conjuntos de penas usa o ícone de pena e aparece na aba Gerenciar', () => {
    expect(ACTIONS.penSets).toBeDefined();
    expect(ACTIONS.penSets.icon).toBe('pen');
    expect(txt(ACTIONS.penSets.label, 'pt')).toBe('Conjuntos de penas');
    const gerenciar = TABS.find((tb) => tb.id === 'gerenciar');
    const itens = leaves(gerenciar!.panels.flatMap((p) => p.items));
    const penSets = itens.find((it) => it.kind === 'action' && it.action === 'penSets');
    expect(penSets).toBeDefined();
  });
});

