import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from './Icon.tsx';
import { ICONES_MASSA_TERRENO } from './iconesMassaTerreno.ts';
import { ACTIONS } from './ribbon/actions.ts';
import { TABS } from './ribbon/tabs.ts';
import type { RibbonItem } from './ribbon/model.ts';

const folhas = (items: RibbonItem[]): RibbonItem[] =>
  items.flatMap((it) => (it.kind === 'stack' ? folhas(it.items) : it.kind === 'split' ? [...folhas([it.main]), ...folhas(it.menu)] : [it]));

const iconeDe = (it: RibbonItem): string | undefined => (it.kind === 'action' ? ACTIONS[it.action].icon : it.kind === 'stack' || it.kind === 'split' ? undefined : it.icon);

const itensDaAba = (id: string): RibbonItem[] => folhas(TABS.find((tb) => tb.id === id)!.panels.flatMap((pn) => pn.items));

describe('ícones da aba Massa e terreno', () => {
  it('são 34 glifos, todos em viewBox 32 e com sólidos sombreados ou traço do estilo da faixa', () => {
    const nomes = Object.keys(ICONES_MASSA_TERRENO);
    expect(nomes).toHaveLength(34);
    for (const nome of nomes) {
      const html = renderToStaticMarkup(createElement(Icon, { name: nome }));
      expect(html, nome).toContain('viewBox="0 0 32 32"');
      expect(html, nome).toContain('class="ic"');
      expect(html, nome).toMatch(/class="ic-(s1|s2|s3|bl|gl|ln|ln2|ac|fa)/);
    }
  });

  it('todo botão da aba aponta para um ícone dela e nenhum ícone se repete na aba', () => {
    const usados = itensDaAba('massa').map(iconeDe);
    for (const nome of usados) expect(ICONES_MASSA_TERRENO[nome ?? ''], String(nome)).toBeDefined();
    expect(new Set(usados).size).toBe(usados.length);
  });

  it('nenhuma outra aba reaproveita um ícone de massa ou terreno', () => {
    const proprios = new Set(Object.keys(ICONES_MASSA_TERRENO));
    // A mesma ação ou ferramenta pode aparecer em outra aba (ex.: Importar levantamento em Inserir) e leva o mesmo ícone.
    const idDe = (it: RibbonItem): string => (it.kind === 'action' ? `a:${it.action}` : it.kind === 'tool' ? `t:${it.tool}` : '');
    const daAba = new Set(itensDaAba('massa').map(idDe).filter((x) => x !== ''));
    for (const tb of TABS.filter((x) => x.id !== 'massa')) {
      for (const it of folhas(tb.panels.flatMap((pn) => pn.items))) {
        if (daAba.has(idDe(it))) continue;
        expect(proprios.has(iconeDe(it) ?? ''), `${tb.id}:${iconeDe(it)}`).toBe(false);
      }
    }
  });

  it('nenhum ícone de terreno ou massa copia o desenho de outro ícone do conjunto', () => {
    const desenhos = Object.values(ICONES_MASSA_TERRENO);
    expect(new Set(desenhos).size).toBe(desenhos.length);
  });
});
