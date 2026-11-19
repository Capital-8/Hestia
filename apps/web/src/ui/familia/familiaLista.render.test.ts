import { listaDePecas, resumirLista } from '@hestia/engine';
import { FAMILIA_ARMARIO } from '@hestia/model';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { FamiliaLista } from './FamiliaLista.tsx';
import { FamiliaListaCorte } from './FamiliaListaCorte.tsx';
import { FamiliaListaCusto } from './FamiliaListaCusto.tsx';
import { FamiliaListaEtiquetas } from './FamiliaListaEtiquetas.tsx';
import { FamiliaListaTabela } from './FamiliaListaTabela.tsx';
import { pecasEfetivas } from './familiaLista.ts';
import { resolucaoCorrente, useFamilia } from './familiaStore.ts';

beforeEach(() => {
  useFamilia.getState().novaFamilia(structuredClone(FAMILIA_ARMARIO));
  useFamilia.getState().set({ dialogo: null, cavilhas: false });
});

function dados() {
  const resolucao = resolucaoCorrente();
  const efetivas = pecasEfetivas(resolucao.pecas, false);
  const linhas = listaDePecas(efetivas);
  return { resolucao, efetivas, linhas, resumo: resumirLista(linhas) };
}

describe('diálogo Lista de peças', () => {
  it('o armário A80 tem 11 peças em 8 linhas', () => {
    const { linhas, resumo } = dados();
    expect(resumo.totalPecas).toBe(11);
    expect(linhas).toHaveLength(8);
  });

  it('renderiza as quatro abas e a barra de opções', () => {
    const html = renderToStaticMarkup(createElement(FamiliaLista));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('800 × 720 × 560 mm');
    expect(html).toContain('Lista');
    expect(html).toContain('Plano de corte');
    expect(html).toContain('Custo');
    expect(html).toContain('Etiquetas');
    expect(html).toContain('Cavilhas automáticas');
    expect(html).toContain('Copiar CSV');
    expect(html).toContain('Baixar CSV');
    expect(html).toContain('Baixar DXF');
  });

  it('cada aba renderiza o conteúdo esperado', () => {
    const { linhas, resumo, resolucao } = dados();
    const catalogo = useFamilia.getState().catalogo;

    const tabela = renderToStaticMarkup(createElement(FamiliaListaTabela, {
      linhas, resumo, ferragens: resolucao.ferragens, catalogo,
    }));
    expect(tabela).toContain('Lateral esquerda');
    expect(tabela).toContain('Dobradiça');

    const corte = renderToStaticMarkup(createElement(FamiliaListaCorte, { linhas, catalogo }));
    expect(corte).toContain('Aproveitamento');
    expect(corte).toContain('<svg');

    const custo = renderToStaticMarkup(createElement(FamiliaListaCusto, {
      resumo, catalogo, ferragens: resolucao.ferragens,
    }));
    expect(custo).toContain('Perda de chapa (%)');
    expect(custo).toContain('Total');

    const etiquetas = renderToStaticMarkup(createElement(FamiliaListaEtiquetas, { linhas }));
    expect(etiquetas).toContain('fam-lista-etiqueta');
  });

  it('com cavilhas a contagem de furos sobe', () => {
    const { efetivas } = dados();
    const comCavilhas = pecasEfetivas(resolucaoCorrente().pecas, true);
    const antes = resumirLista(listaDePecas(efetivas)).usinagens.furos;
    const depois = resumirLista(listaDePecas(comCavilhas)).usinagens.furos;
    expect(depois).toBeGreaterThan(antes);
  });
});
