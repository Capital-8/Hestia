import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { abrirLoteRumos, escolherPontoNaPlanta, estadoLoteRumos, fecharLoteRumos, loteRumosAberto, voltarDaEscolha } from './loteRumosAberto.ts';
import { LoteRumosDialog } from './LoteRumosDialog.tsx';

afterEach(() => fecharLoteRumos());

describe('abertura do diálogo Por tabela… (mini-store)', () => {
  it('abre, esconde enquanto se escolhe o ponto, volta e fecha', () => {
    expect(estadoLoteRumos()).toBe('fechado');
    abrirLoteRumos();
    expect(estadoLoteRumos()).toBe('aberto');
    expect(loteRumosAberto()).toBe(true);
    escolherPontoNaPlanta();
    expect(estadoLoteRumos()).toBe('escolhendo');
    expect(loteRumosAberto()).toBe(true);
    voltarDaEscolha();
    expect(estadoLoteRumos()).toBe('aberto');
    fecharLoteRumos();
    expect(loteRumosAberto()).toBe(false);
  });

  it('voltarDaEscolha não reabre um diálogo fechado', () => {
    voltarDaEscolha();
    expect(estadoLoteRumos()).toBe('fechado');
  });
});

describe('Diálogo Por tabela…', () => {
  it('fechado não renderiza nada', () => {
    expect(renderToStaticMarkup(createElement(LoteRumosDialog))).toBe('');
  });

  it('aberto mostra o ponto inicial, a tabela de 4 linhas, o erro de fechamento, a caixa e o botão Criar lote desligado (distâncias zero)', () => {
    abrirLoteRumos();
    const html = renderToStaticMarkup(createElement(LoteRumosDialog));
    expect(html).toContain('Linhas de propriedade por tabela');
    expect(html).toContain('Ponto inicial');
    expect(html).toContain('Escolher na planta');
    for (const id of ['rumo-az-0', 'rumo-d-0', 'rumo-az-3', 'rumo-d-3', 'rumo-fechar']) expect(html, id).toContain(`id="${id}"`);
    expect(html).toContain('Erro de fechamento');
    expect(html).toContain('Fechar no primeiro ponto');
    expect(html).toMatch(/<button class="btn primary" disabled="">Criar lote<\/button>/);
  });

  it('escondido (escolhendo o ponto) não renderiza nada, mas continua aberto', () => {
    abrirLoteRumos();
    escolherPontoNaPlanta();
    expect(renderToStaticMarkup(createElement(LoteRumosDialog))).toBe('');
    expect(loteRumosAberto()).toBe(true);
  });
});
