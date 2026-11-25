import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from './Icon.tsx';
import { ICONES_MEP } from './iconesMep.ts';
import { PAINEIS_GERENCIAR } from './familia/familiaAbaPaineisVista.ts';
import { ACTIONS } from './ribbon/actions.ts';
import { TABS } from './ribbon/tabs.ts';
import { TABS_SOON } from './ribbon/tabsSoon.ts';
import type { RibbonItem, RibbonPanel } from './ribbon/model.ts';

const folhas = (items: RibbonItem[]): RibbonItem[] =>
  items.flatMap((it) => (it.kind === 'stack' ? folhas(it.items) : it.kind === 'split' ? [...folhas([it.main]), ...folhas(it.menu)] : [it]));

const iconeDe = (it: RibbonItem): string | undefined => (it.kind === 'action' ? ACTIONS[it.action].icon : it.kind === 'stack' || it.kind === 'split' ? undefined : it.icon);

const todosOsPaineis = (): RibbonPanel[] => [...TABS, ...TABS_SOON].flatMap((tb) => tb.panels);

const painelPorId = (id: string): RibbonPanel => todosOsPaineis().find((pn) => pn.id === id)!;

const itensDoPainel = (id: string): RibbonItem[] => folhas(painelPorId(id).items);

describe('ícones MEP (ICONES_MEP ligado a Icon.tsx)', () => {
  it('(a) toda chave de ICONES_MEP está registrada e gera um SVG não vazio', () => {
    const nomes = Object.keys(ICONES_MEP);
    expect(nomes.length).toBeGreaterThan(0);
    for (const nome of nomes) {
      const html = renderToStaticMarkup(createElement(Icon, { name: nome }));
      // class="ic" só sai quando a chave está em R; sem ela o Icon cai no traço genérico de P, que é vazio aqui.
      expect(html, nome).toContain('class="ic"');
      expect(html, nome).toMatch(/<(path|circle|ellipse|rect|text|g)\b/);
    }
  });

  it('(b) nenhum desenho mep* é repetido com outra chave mep*', () => {
    const desenhos = Object.values(ICONES_MEP);
    expect(new Set(desenhos).size).toBe(desenhos.length);
  });

  it('(c) os botões MEP usam chaves mep* registradas; só as combinações deliberadas se repetem', () => {
    const tubo = itensDoPainel('sis-hidraulica').find((it) => it.kind === 'tool' && it.tool === 'tubo');
    const aparelho = itensDoPainel('sis-hidraulica').find((it) => it.kind === 'soon');
    const bandeja = itensDoPainel('sis-eletrico').find((it) => it.kind === 'soon');
    const tuboFlexivel = itensDoPainel('sis-hvac').find((it) => it.kind === 'soon');
    const equipamento = itensDoPainel('sis-mecanico').find((it) => it.kind === 'soon');
    expect(tubo, 'botão Tubo').toBeDefined();
    expect(aparelho && bandeja && tuboFlexivel && equipamento, 'quatro itens em breve').toBeTruthy();

    const botoes: Record<string, string | undefined> = {
      tubo: tubo && iconeDe(tubo),
      tubosConexoes: ACTIONS.familiasHidro.icon,
      verificarRede: ACTIONS.verificarRede.icon,
      catalogoTubos: ACTIONS.catalogoMep.icon,
      eletrodutos: ACTIONS.familiasEletrico.icon,
      dutos: ACTIONS.familiasHvac.icon,
      perfis: ACTIONS.familiasEstrutura.icon,
      aparelho: aparelho && iconeDe(aparelho),
      bandeja: bandeja && iconeDe(bandeja),
      tuboFlexivel: tuboFlexivel && iconeDe(tuboFlexivel),
      equipamento: equipamento && iconeDe(equipamento),
    };
    for (const [botao, icone] of Object.entries(botoes)) {
      expect(icone, botao).toMatch(/^mep/);
      expect(ICONES_MEP[icone ?? ''], botao).toBeDefined();
    }

    // Combinações deliberadas: a mesma ação ou o mesmo botão em outro lugar da faixa.
    const parafuso = folhas(painelPorId('aco-elementos').items).find((it) => it.kind === 'action' && it.action === 'familiasEstrutura');
    expect(parafuso && iconeDe(parafuso), 'Parafuso e chapa = Perfis e chapas').toBe(botoes.perfis);
    const atalhoTubulacao = folhas(painelPorId('ins-tubulacao').items).find((it) => it.kind === 'action' && it.action === 'familiasHidro');
    expect(atalhoTubulacao && iconeDe(atalhoTubulacao), 'atalho Inserir > Tubulação = Tubos e conexões').toBe(botoes.tubosConexoes);
    const catalogoEditor = PAINEIS_GERENCIAR.flatMap((pn) => pn.botoes).find((b) => b.rotulo === 'fa_b_catalogo_mep');
    expect(catalogoEditor?.icone, 'Catálogo MEP do editor = Catálogo de tubos').toBe(botoes.catalogoTubos);

    // Os demais botões (um por linha, sem contar as combinações acima) não compartilham ícone.
    const distintos = new Set([
      botoes.tubo,
      botoes.tubosConexoes,
      botoes.verificarRede,
      botoes.catalogoTubos,
      botoes.eletrodutos,
      botoes.dutos,
      botoes.perfis,
      botoes.aparelho,
      botoes.bandeja,
      botoes.tuboFlexivel,
      botoes.equipamento,
    ]);
    expect(distintos.size).toBe(11);
  });

  it('(d) ninguém usa component como ícone do Tubo', () => {
    const botoesTubo = todosOsPaineis()
      .flatMap((pn) => folhas(pn.items))
      .filter((it) => it.kind === 'tool' && it.tool === 'tubo');
    expect(botoesTubo.length).toBeGreaterThan(0);
    for (const it of botoesTubo) {
      expect(iconeDe(it)).not.toBe('component');
      expect(iconeDe(it)).toMatch(/^mep/);
    }
  });
});
