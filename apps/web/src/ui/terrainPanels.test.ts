import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loteL1, projetoLote, projetoTerreno } from '@hestia/engine';
import { createEmptyProject, isLot, isTerrain, isTerrainRegion, type Project, type Terrain } from '@hestia/model';

/** Os painéis leem o projeto pelo controlador; no teste de render, um projeto em memória basta (sem DOM). */
const estado = vi.hoisted(() => ({ project: null as unknown }));
vi.mock('../editor/controller.ts', () => ({
  useProject: () => estado.project,
  editor: { get project() { return estado.project; }, store: { subscribe: () => () => undefined, exec: () => undefined, transaction: () => undefined }, setTool: () => undefined, activeTool: {} },
}));

const { TerrainProperties, TerrainLeituras } = await import('./TerrainProperties.tsx');
const { TerrainRegionProperties, RegiaoLeituras, temPlano, corPadraoDaRegiao } = await import('./TerrainRegionProperties.tsx');
const { LotProperties } = await import('./LotProperties.tsx');

const renderiza = (p: Project, el: ReturnType<typeof createElement>): string => {
  estado.project = p;
  return renderToStaticMarkup(el);
};

describe('TerrainProperties', () => {
  const p = projetoTerreno('T5');
  const tn = Object.values(p.elements).find(isTerrain)!;

  it('mostra os campos de A.3: nome, nível, intervalo, mestra, base, mostrar existente, material e cor', () => {
    const html = renderiza(p, createElement(TerrainProperties, { terrains: [tn] }));
    for (const id of ['p-tn-nome', 'p-tn-nivel', 'p-tn-intervalo', 'p-tn-mestra', 'p-tn-base', 'p-tn-existente', 'p-tn-material', 'p-tn-cor']) expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain('value="T5"');
    expect(html).toContain('Intervalo das curvas');
    expect(html).toContain('Espessura da base');
  });

  it('mostra as leituras (vértices e o resto "—" sem kernel) e os botões Editar terreno e Importar…', () => {
    const html = renderiza(p, createElement(TerrainProperties, { terrains: [tn] }));
    expect(html).toContain('Vértices');
    expect(html).toContain('Área em planta');
    expect(html).toContain('Volume de corte');
    expect(html).toContain('Volume de aterro');
    expect(html).toContain('—');
    expect(html).toContain('Editar terreno');
    expect(html).toContain('Importar…');
  });

  it('as leituras formatam a cota por cotaExibida (z + altitude da cota zero) e volumes e áreas pela unidade do projeto', () => {
    const q = createEmptyProject();
    q.localizacao = { origemE: 0, origemN: 0, cotaZero: 740, norteVerdadeiro: 0 };
    const html = renderiza(q, createElement(TerrainLeituras, { p: q, leituras: { vertices: 4, areaPlanta: 400, zMin: 8, zMax: 10, volumeCorte: 12.5, volumeAterro: 0 } }));
    expect(html).toContain('748,00 m');
    expect(html).toContain('750,00 m');
    expect(html).toContain('400,00 m²');
    expect(html).toContain('12,500 m³');
  });

  it('seleção de vários terrenos mostra uma leitura por terreno e valores variados', () => {
    const outro: Terrain = { ...tn, id: 'tn_b', name: 'Outro', intervaloCurvas: 2 };
    const html = renderiza(p, createElement(TerrainProperties, { terrains: [tn, outro] }));
    expect(html).toContain('Leituras: T5');
    expect(html).toContain('Leituras: Outro');
    expect(html).toContain('placeholder="variados"');
  });
});

describe('TerrainRegionProperties', () => {
  const p = projetoTerreno('T5');
  const r = Object.values(p.elements).find(isTerrainRegion)!;

  it('plataforma: mostra o plano (cota exibida), taludes e leituras', () => {
    const html = renderiza(p, createElement(TerrainRegionProperties, { regions: [r] }));
    for (const id of ['p-rg-nome', 'p-rg-papel', 'p-rg-cota', 'p-rg-incl', 'p-rg-dir', 'p-rg-tcorte', 'p-rg-taterro', 'p-rg-perm', 'p-rg-material', 'p-rg-cor']) expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain('Área da superfície');
    expect(html).toContain('Volume de corte');
  });

  it('subdivisão esconde os campos de plano', () => {
    const sub = { ...r, papel: 'subdivisao' as const };
    expect(temPlano(sub)).toBe(false);
    expect(temPlano(r)).toBe(true);
    const html = renderiza(p, createElement(TerrainRegionProperties, { regions: [sub] }));
    expect(html).not.toContain('id="p-rg-cota"');
    expect(html).not.toContain('id="p-rg-incl"');
    expect(html).not.toContain('id="p-rg-dir"');
    expect(html).toContain('id="p-rg-tcorte"');
  });

  it('a cota do plano é a exibida (z + altitude da cota zero)', () => {
    const q: Project = { ...projetoTerreno('T5'), localizacao: { origemE: 0, origemN: 0, cotaZero: 100, norteVerdadeiro: 0 } };
    const html = renderiza(q, createElement(TerrainRegionProperties, { regions: [r] }));
    expect(html).toMatch(/id="p-rg-cota"[^>]*value="108(,|\.)?0*"/);
  });

  it('leituras da região e cor padrão por papel', () => {
    const html = renderiza(p, createElement(RegiaoLeituras, { leituras: { areaPlanta: 100, areaSuperficie: 101, volumeCorte: 5, volumeAterro: 0 } }));
    expect(html).toContain('100,00 m²');
    expect(html).toContain('5,000 m³');
    expect(corPadraoDaRegiao('subdivisao')).not.toBe(corPadraoDaRegiao('plataforma'));
  });
});

describe('LotProperties', () => {
  const p = projetoLote();
  const l = Object.values(p.elements).find(isLot)!;

  it('mostra nome, edificável, limites, leituras e a tabela de lados', () => {
    const html = renderiza(p, createElement(LotProperties, { lots: [l] }));
    for (const id of ['p-lt-nome', 'p-lt-edif', 'p-lt-cor', 'p-lt-taxa', 'p-lt-coef', 'p-lt-perm', 'p-lt-gab']) expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain('360,00 m²');
    expect(html).toContain('84,00 m');
    expect(html).toContain('198,00 m²');
    expect(html).toContain('1: 12,00 m · 90,0°');
    expect(html).toContain('2: 30,00 m · 0,0°');
    expect(html.match(/<select aria-label="Papel do lado/g)).toHaveLength(4);
    expect(html).toContain('Frente');
    expect(html).toContain('Fundo');
  });

  it('mostra os limites informados em percentual e sem limite como vazio', () => {
    const com = { ...l, limites: { taxaOcupacaoMax: 0.5, coefAproveitamentoMax: 2, gabaritoMax: 12 } };
    const html = renderiza(p, createElement(LotProperties, { lots: [com] }));
    expect(html).toMatch(/id="p-lt-taxa"[^>]*value="50,00"/);
    expect(html).toMatch(/id="p-lt-coef"[^>]*value="2,00"/);
    expect(html).toMatch(/id="p-lt-perm"[^>]*value=""/);
    expect(html).toContain('sem limite');
  });

  it('o recuo de cada lado aparece como campo de comprimento', () => {
    const html = renderiza(p, createElement(LotProperties, { lots: [{ ...l, lados: loteL1().lados }] }));
    expect(html).toContain('value="5"');
    expect(html).toContain('value="1,5"');
  });
});
