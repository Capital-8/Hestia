import { describe, expect, it } from 'vitest';
import {
  applyCommand as aplicar,
  createEmptyProject,
  FAMILIA_FORMATO,
  FAMILIA_VERSAO,
  viewSourceIssue,
  type Component,
  type Familia,
  type Project,
  type SheetViewport,
} from '@hestia/model';
import { buildSheetDrawList, viewportPartsCached } from './build.ts';
import { familyDetailContentMm } from './familyDetail.ts';

/*
 * Detalhe de família na prancha (ficha D6b): caixa 1000 x 600 x 800 do teste de D4, planta a 1:20 com duas cotas e uma
 * tabela de dimensões. A conta do papel é mm de papel = origem + metros x 1000 / escala (1 m a 1:20 = 50 mm).
 */

function familiaCaixa(): Familia {
  return {
    formato: FAMILIA_FORMATO, versao: FAMILIA_VERSAO, id: 'caixa', nome: 'Caixa', categoria: 'marcenaria', unidade: 'mm', hospedagem: 'nivel', origem: 'canto',
    parametros: [
      { id: 'L', nome: 'Largura', tipo: 'comprimento', escopo: 'instancia', padrao: 1000, min: 300, max: 2000 },
      { id: 'A', nome: 'Altura', tipo: 'comprimento', escopo: 'instancia', padrao: 800 },
      { id: 'P', nome: 'Profundidade', tipo: 'comprimento', escopo: 'instancia', padrao: 600 },
    ],
    planos: [
      { id: 'x0', nome: 'Esquerda', eixo: 'x', posicao: '0' },
      { id: 'x1', nome: 'Direita', eixo: 'x', posicao: 'L' },
      { id: 'y0', nome: 'Frente', eixo: 'y', posicao: '0' },
      { id: 'y1', nome: 'Fundo', eixo: 'y', posicao: 'P' },
    ],
    pecas: [{ id: 'bloco', nome: 'Bloco', papel: 'lateral', eixo: 'z', origem: ['0', '0', '0'], tamanho: ['L', 'P'], espessura: 'A', material: 'm' }],
    aninhados: [], ferragens: [], ligacoes: [], simbolos: [],
    detalhes: [{
      id: 'pl', nome: 'Planta', vista: 'planta', escala: 20,
      cotas: [
        { id: 'cL', de: { tipo: 'plano', id: 'x0' }, ate: { tipo: 'plano', id: 'x1' }, parametro: 'L', deslocamento: '-100' },
        { id: 'cP', de: { tipo: 'plano', id: 'y0' }, ate: { tipo: 'plano', id: 'y1' }, parametro: 'P' },
      ],
    }],
    tabelas: [{ id: 'dim', nome: 'Dimensões', porTipo: false, colunas: [{ titulo: 'Largura', valor: 'L', unidade: 'mm' }, { titulo: 'Altura', valor: 'A', unidade: 'mm' }] }],
    tipos: [],
  };
}

function projeto(values?: Component['values']): Project {
  const p = createEmptyProject('t');
  aplicar(p, { type: 'upsertFamily', family: familiaCaixa() });
  p.elements.c1 = { id: 'c1', kind: 'component', familyId: 'caixa', typeId: null, levelId: p.levels[0]!.id, order: 1, x: 0, y: 0, z: 0, rotation: 0, mirrored: false, mark: 'c1', ...(values ? { values } : {}) };
  return p;
}

const vp = (componentId = 'c1', detailId = 'pl', scale = 20): SheetViewport => ({
  id: 'v1', view: { kind: 'familyDetail', componentId, detailId }, at: { x: 20, y: 20 }, size: { w: 200, h: 150 }, scale,
});

describe('viewport de detalhe de família (D6b)', () => {
  it('desenha o contorno da caixa, as cotas e a tabela de dimensões', () => {
    const { parts } = viewportPartsCached(projeto(), vp(), 'pt');
    // contorno (1) + 2 cotas x (linha + 2 extensões) = 7 caminhos, mais as linhas da tabela.
    const fechados = parts.paths.filter((q) => q.closed);
    expect(fechados).toHaveLength(1);
    const xs = fechados[0]!.pts.map((q) => q.x);
    const ys = fechados[0]!.pts.map((q) => q.y);
    // 1000 x 600 mm a 1:20 = 50 x 30 mm de papel.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(50, 6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(30, 6);
    expect(parts.paths.filter((q) => !q.closed).length).toBeGreaterThanOrEqual(6);
    const textos = parts.texts.map((t) => t.text);
    expect(textos).toEqual(expect.arrayContaining(['1000', '600', 'Largura (mm)', 'Altura (mm)', '800']));
    // O desenho fica centrado na âncora da caixa (x do centro = 20 + 200/2).
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(120, 6);
  });

  it('muda com os valores da instância (L = 1200)', () => {
    const { parts } = viewportPartsCached(projeto({ L: 1200 }), vp(), 'pt');
    expect(parts.texts.map((t) => t.text)).toEqual(expect.arrayContaining(['1200']));
    const fechado = parts.paths.find((q) => q.closed)!;
    const xs = fechado.pts.map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(60, 6);
  });

  it('o tamanho do conteúdo cresce ao reduzir o denominador da escala', () => {
    const a = familyDetailContentMm(projeto(), { kind: 'familyDetail', componentId: 'c1', detailId: 'pl' }, 20)!;
    const b = familyDetailContentMm(projeto(), { kind: 'familyDetail', componentId: 'c1', detailId: 'pl' }, 10)!;
    expect(b.w).toBeGreaterThan(a.w);
    expect(familyDetailContentMm(projeto(), { kind: 'familyDetail', componentId: 'zz', detailId: 'pl' }, 20)).toBeNull();
  });

  it('instância ou detalhe inexistente: aviso, sem lançar', () => {
    for (const v of [vp('nao_existe'), vp('c1', 'nao_existe')]) {
      const { parts } = viewportPartsCached(projeto(), v, 'pt');
      expect(parts.paths).toHaveLength(0);
      expect(parts.texts.map((t) => t.text)).toEqual(['Detalhe inexistente']);
    }
  });

  it('a fonte é validada e a lista de desenho da prancha inclui o viewport', () => {
    const p = projeto();
    expect(viewSourceIssue(p, { kind: 'familyDetail', componentId: 'c1', detailId: 'pl' })).toBeNull();
    expect(viewSourceIssue(p, { kind: 'familyDetail', componentId: 'c1', detailId: 'x' })).not.toBeNull();
    expect(viewSourceIssue(p, { kind: 'familyDetail', componentId: 'nada', detailId: 'pl' })).not.toBeNull();
    const sheet = { id: 'sh1', number: 'A-1', name: 'P', size: 'A3' as const, orientation: 'landscape' as const, margin: 10, titleBlock: { project: '', client: '', author: '', date: '', revision: '0' }, viewports: [vp()] };
    p.sheets = [sheet];
    const lista = buildSheetDrawList(p, 'sh1', 'pt')!;
    expect(lista.groups[0]!.paths.length).toBeGreaterThan(0);
  });
});
