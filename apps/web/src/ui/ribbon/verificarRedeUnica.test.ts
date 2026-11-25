import { describe, expect, it } from 'vitest';
import { TABS } from './tabs.ts';
import type { RibbonItem, RibbonPanel, RibbonTab } from './model.ts';

/*
 * Ficha C8b, defeito (H): "Verificar rede" aparecia duas vezes na aba Sistemas (grupos Hidráulica e Elétrico), com o mesmo ícone e a
 * mesma ação. Fica só o botão de Hidráulica e tubulação, com o rótulo; o grupo Elétrico segue com Eletroduto, Biblioteca, Circuitos
 * e Quantitativos. A regra vale para toda aba: no máximo um botão de Verificar rede por aba.
 */

const folhas = (items: readonly RibbonItem[]): RibbonItem[] => items.flatMap((i) => (i.kind === 'stack' ? folhas(i.items) : [i]));
const acoesDo = (p: RibbonPanel): string[] => folhas(p.items).map((i) => (i.kind === 'action' ? i.action : '')).filter(Boolean);
const aba = (id: string): RibbonTab => {
  const t = TABS.find((x) => x.id === id);
  if (!t) throw new Error(`aba ausente: ${id}`);
  return t;
};

describe('Verificar rede: um botão por aba (ficha C8b, defeito H)', () => {
  it('Sistemas tem exatamente um botão de Verificar rede', () => {
    const n = aba('sistemas').panels.flatMap((p) => acoesDo(p)).filter((a) => a === 'verificarRede').length;
    expect(n).toBe(1);
  });

  it('o botão fica no grupo Hidráulica e tubulação, com o rótulo "Verificar rede"', () => {
    const hidro = aba('sistemas').panels.find((p) => p.id === 'sis-hidraulica');
    expect(hidro && acoesDo(hidro)).toContain('verificarRede');
    const item = folhas(hidro?.items ?? []).find((i) => i.kind === 'action' && i.action === 'verificarRede');
    expect(item && item.kind === 'action' ? item.label : null).toEqual(expect.objectContaining({ pt: 'Verificar rede' }));
  });

  it('o grupo Elétrico não repete a verificação e mantém os seus botões', () => {
    const el = aba('sistemas').panels.find((p) => p.id === 'sis-eletrico');
    expect(el).toBeDefined();
    const acoes = acoesDo(el!);
    expect(acoes).not.toContain('verificarRede');
    expect(acoes).toEqual(expect.arrayContaining(['familiasEletrico', 'circuitos', 'quantitativosEletricos']));
  });

  it('nenhuma aba da faixa tem dois botões de Verificar rede', () => {
    const porAba = TABS.map((t) => ({ id: t.id, n: t.panels.flatMap((p) => acoesDo(p)).filter((a) => a === 'verificarRede').length }));
    expect(porAba.filter((x) => x.n > 1)).toEqual([]);
  });
});
