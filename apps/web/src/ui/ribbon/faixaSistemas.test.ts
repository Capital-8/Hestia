import { describe, expect, it } from 'vitest';
import { TABS } from './tabs.ts';
import type { RibbonItem, RibbonPanel } from './model.ts';

/*
 * Ficha J3: a aba Sistemas deixa de ser placeholder para tubulação: Tubo, Verificar rede, a Biblioteca de tubos e o catálogo ficam
 * em Sistemas > Hidráulica e tubulação; elétrico e HVAC abrem a Biblioteca no grupo certo; Aço e Estrutura abrem a de perfis.
 */

const folhas = (items: readonly RibbonItem[]): RibbonItem[] => items.flatMap((i) => (i.kind === 'stack' ? folhas(i.items) : [i]));
const painel = (aba: string, id: string): RibbonPanel => {
  const p = TABS.find((x) => x.id === aba)?.panels.find((x) => x.id === id);
  if (!p) throw new Error(`painel ausente: ${aba}/${id}`);
  return p;
};
const acoes = (p: RibbonPanel): string[] => folhas(p.items).map((i) => (i.kind === 'action' ? i.action : i.kind === 'tool' ? `tool:${i.tool}` : '')).filter(Boolean);

describe('faixa por sistema', () => {
  it('Sistemas > Hidráulica e tubulação: Tubo, Biblioteca de tubos, Verificar rede e Catálogo', () => {
    expect(acoes(painel('sistemas', 'sis-hidraulica'))).toEqual(['tool:tubo', 'familiasHidro', 'verificarRede', 'catalogoMep']);
  });
  it('Sistemas > Elétrico e HVAC abrem a Biblioteca no grupo', () => {
    expect(acoes(painel('sistemas', 'sis-eletrico'))).toContain('familiasEletrico');
    expect(acoes(painel('sistemas', 'sis-hvac'))).toContain('familiasHvac');
  });
  it('Aço e Estrutura abrem perfis e chapas', () => {
    expect(acoes(painel('aco', 'aco-conexoes'))).toContain('familiasEstrutura');
    expect(acoes(painel('estrutura', 'est-modelo'))).toContain('familiasEstrutura');
  });
  it('Inserir deixa só o atalho da Biblioteca de tubos (Tubo e Verificar rede foram para Sistemas)', () => {
    expect(acoes(painel('inserir', 'ins-tubulacao'))).toEqual(['familiasHidro']);
  });
});
