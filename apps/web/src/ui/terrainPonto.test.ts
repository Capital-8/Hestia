import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject, type Project, type Terrain } from '@hestia/model';

const estado = vi.hoisted(() => ({ project: null as unknown }));
vi.mock('../editor/controller.ts', () => ({
  useProject: () => estado.project,
  editor: { get project() { return estado.project; }, store: { subscribe: () => () => undefined, exec: () => undefined, transaction: () => undefined }, setTool: () => undefined, activeTool: {} },
}));

const { PontoSelecionado } = await import('./TerrainPontoProperties.tsx');

const TN = { id: 'tn_a' } as unknown as Terrain;
const ferramenta = (ref: { tipo: 'ponto'; i: number } | { tipo: 'curva'; i: number; j: number } | { tipo: 'quebra'; i: number; j: number }, x: number, y: number, z: number, terrenoId = 'tn_a') => ({
  terrenoId,
  pontoSelecionado: { ref, x, y, z },
  definirPontoSelecionado: () => true,
});
const renderiza = (p: Project, tool: ReturnType<typeof ferramenta> | null): string => {
  estado.project = p;
  return renderToStaticMarkup(createElement(PontoSelecionado, { terreno: TN, tool }));
};

describe('Propriedades: grupo "Ponto selecionado"', () => {
  it('sem ferramenta, sem ponto escolhido ou de outro terreno: nada', () => {
    const p = createEmptyProject();
    expect(renderiza(p, null)).toBe('');
    expect(renderiza(p, { ...ferramenta({ tipo: 'ponto', i: 0 }, 1, 2, 3), pontoSelecionado: null } as never)).toBe('');
    expect(renderiza(p, ferramenta({ tipo: 'ponto', i: 0 }, 1, 2, 3, 'tn_outro'))).toBe('');
  });

  it('ponto solto: X, Y e Cota editáveis, sem a nota da curva e sem E/N (sem localização)', () => {
    const html = renderiza(createEmptyProject(), ferramenta({ tipo: 'ponto', i: 0 }, 12.5, -3, 2));
    expect(html).toContain('Ponto selecionado');
    expect(html).toContain('Ponto topográfico');
    for (const id of ['p-tn-pt-x', 'p-tn-pt-y', 'p-tn-pt-cota']) expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain('value="12,5"');
    expect(html).toContain('value="-3"');
    expect(html).toContain('value="2"');
    expect(html).not.toContain('A cota vale para a curva toda');
    expect(html).not.toContain('p-tn-pt-e');
  });

  it('vértice de curva: rótulo claro de que a cota vale para a curva toda', () => {
    const html = renderiza(createEmptyProject(), ferramenta({ tipo: 'curva', i: 0, j: 1 }, 30, 20, 5));
    expect(html).toContain('Vértice de curva de nível');
    expect(html).toContain('A cota vale para a curva toda.');
  });

  it('vértice de quebra: X, Y e Z', () => {
    const html = renderiza(createEmptyProject(), ferramenta({ tipo: 'quebra', i: 0, j: 0 }, 40, 40, 7));
    expect(html).toContain('Vértice de linha de quebra');
    expect(html).toContain('id="p-tn-pt-cota"');
    expect(html).not.toContain('A cota vale para a curva toda');
  });

  it('com Localização: Cota exibida soma a cota zero e E/N reais aparecem SÓ LEITURA (norte verdadeiro 0)', () => {
    const p = createEmptyProject();
    p.localizacao = { origemE: 500000, origemN: 7000000, cotaZero: 740, norteVerdadeiro: 0 };
    const html = renderiza(p, ferramenta({ tipo: 'ponto', i: 0 }, 12.5, -3, 2));
    expect(html).toContain('value="742"');
    expect(html).toContain('Leste (E) real');
    expect(html).toContain('value="500012,5"');
    expect(html).toContain('value="6999997"');
    const e = html.slice(html.indexOf('id="p-tn-pt-e"'));
    expect(e.slice(0, e.indexOf('>'))).toContain('readOnly');
    const n = html.slice(html.indexOf('id="p-tn-pt-n"'));
    expect(n.slice(0, n.indexOf('>'))).toContain('readOnly');
    // X e Y continuam editáveis.
    const x = html.slice(html.indexOf('id="p-tn-pt-x"'));
    expect(x.slice(0, x.indexOf('>'))).not.toContain('readOnly');
  });

  it('unidades do projeto: projeto em centímetros mostra X, Y e Cota em cm', () => {
    const p = createEmptyProject();
    p.settings = { ...p.settings, units: { length: { unit: 'cm', decimals: 1 } } };
    const html = renderiza(p, ferramenta({ tipo: 'ponto', i: 0 }, 12.5, -3, 2));
    expect(html).toContain('value="1250"');
    expect(html).toContain('value="-300"');
    expect(html).toContain('value="200"');
    expect(html.match(/<span class="unit">cm<\/span>/g)).toHaveLength(3);
  });
});
