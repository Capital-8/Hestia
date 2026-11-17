import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SketchIssueCode, SketchResult, SketchTarget } from '@hestia/geom';
import { PERIMETER_SHAPES, PerimeterRibbonPanels, perimeterContextTab, perimeterShapesFor, type PerimeterRibbonProps } from './PerimeterRibbonPanels.tsx';
import { PerimeterOptionsBar, type PerimeterOptions } from './PerimeterOptionsBar.tsx';
import { PerimeterProps, type PerimeterEdgeInfo } from './PerimeterProps.tsx';
import { edgeStatus, finishTitle, issueLines, issueText, sketchStatus } from './PerimeterStatus.ts';

const TARGETS: SketchTarget[] = ['roof', 'floor', 'slab', 'ceiling'];
const noop = (): void => undefined;
const ok: SketchResult = { loops: [], issues: [], ok: true };
const aberto: SketchResult = { loops: [], issues: [{ code: 'open', message: 'aberto', segIds: ['s1'] }], ok: false };

const ribbon = (target: SketchTarget, result: SketchResult | null = null): string => {
  const props: PerimeterRibbonProps = { target, result, lineKind: 'boundary', shape: 'line', onLineKind: noop, onShape: noop, onFinish: noop, onCancel: noop, onUnite: noop };
  return renderToStaticMarkup(createElement(PerimeterRibbonPanels, props));
};

/** Tag `<button>` que contém o rótulo informado (aria-label). */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const botao = (markup: string, label: string): string => markup.match(new RegExp(`<button[^>]*aria-label="${escapeRe(label)}"[^>]*>`))?.[0] ?? '';

describe('painéis Modo e Desenhar', () => {
  it('tem o botão "Unir formas" em todos os alvos', () => {
    for (const alvo of ['roof', 'floor', 'slab', 'ceiling', 'mass'] as const) expect(botao(ribbon(alvo), 'Unir formas')).toContain('id="pm-unite"');
  });

  it('renderiza Modo, Desenhar, linha de limite e a galeria com as formas do alvo', () => {
    const m = ribbon('floor');
    expect(m).toContain('aria-label="Modo"');
    expect(m).toContain('aria-label="Desenhar"');
    expect(m).toContain('aria-label="Linha de limite"');
    expect(m).toContain('aria-label="Formas de desenho"');
    expect(m).toContain('class="pm-galbox"');
    for (const s of perimeterShapesFor('floor')) expect(m).toContain(`aria-label="${s.label}"`);
    expect(PERIMETER_SHAPES.map((s) => s.id)).toHaveLength(13);
  });

  it('"Por ambiente" só aparece no forro', () => {
    expect(ribbon('ceiling')).toContain('aria-label="Por ambiente (contorno do ambiente fechado)"');
    for (const t of ['roof', 'floor', 'slab'] as const) expect(ribbon(t)).not.toContain('Por ambiente');
  });

  it('seta de inclinação só aparece no telhado', () => {
    expect(ribbon('roof')).toContain('aria-label="Seta de inclinação"');
    for (const t of ['floor', 'slab', 'ceiling'] as const) expect(ribbon(t)).not.toContain('Seta de inclinação');
  });

  it('nenhum botão de furo, em nenhum alvo nem na galeria', () => {
    for (const t of TARGETS) expect(ribbon(t)).not.toMatch(/furo|hole/i);
    for (const s of PERIMETER_SHAPES) expect(`${s.id} ${s.label}`).not.toMatch(/furo|hole/i);
  });

  it('Concluir só habilita com contorno fechado; Cancelar fica sempre ativo', () => {
    expect(botao(ribbon('roof', null), 'Concluir')).toContain('disabled');
    expect(botao(ribbon('roof', aberto), 'Concluir')).toContain('disabled');
    expect(botao(ribbon('roof', ok), 'Concluir')).not.toContain('disabled');
    expect(botao(ribbon('roof', null), 'Cancelar')).not.toContain('disabled');
  });

  it('a galeria marca o estado selecionado e as formas novas', () => {
    const m = ribbon('floor');
    expect(botao(m, 'Linha (contorno por pontos)')).toContain('aria-pressed="true"');
    expect(botao(m, 'Retângulo')).not.toContain('class="pm-gi new');
    expect(botao(m, 'Círculo')).toContain('new');
  });
});

describe('aba contextual do perímetro', () => {
  it('nomeia a aba pelo alvo e reaproveita Selecionar, Propriedades, Modificar e Medir', () => {
    expect(perimeterContextTab('roof').label.pt).toBe('Modificar | Criar perímetro do telhado');
    expect(perimeterContextTab('floor').label.pt).toBe('Modificar | Criar perímetro do piso');
    expect(perimeterContextTab('slab').label.pt).toBe('Modificar | Criar perímetro da laje');
    expect(perimeterContextTab('ceiling').label.pt).toBe('Modificar | Criar perímetro do forro');
    const tab = perimeterContextTab('roof');
    const titulos = tab.slots.map((s) => (s.kind === 'panel' ? s.panel.id : s.kind));
    expect(titulos).toEqual(['selecionar', 'propriedades', 'modificar', 'medir', 'perimetro']);
    expect(tab.key).toBe('perimeter:roof');
  });
});

describe('barra de opções', () => {
  const opts: PerimeterOptions = { overhang: 0.5, slopePct: 30, extendToCore: false, heightOffset: 0 };
  const barra = (target: SketchTarget): string => renderToStaticMarkup(createElement(PerimeterOptionsBar, { target, options: opts, onChange: noop }));

  it('telhado: balanço e inclinação padrão, sem deslocamento de nível', () => {
    const m = barra('roof');
    expect(m).toContain('Balanço');
    expect(m).toContain('Inclinação padrão das arestas');
    expect(m).not.toContain('Deslocamento do nível');
  });

  it('piso, laje e forro: deslocamento do nível e sem balanço nem inclinação', () => {
    for (const t of ['floor', 'slab', 'ceiling'] as const) {
      const m = barra(t);
      expect(m).toContain('Deslocamento do nível');
      expect(m).not.toContain('Balanço');
      expect(m).not.toContain('Inclinação padrão');
      expect(m).toContain('Estender até o núcleo da parede');
    }
  });
});

describe('grupo Perímetro nas propriedades', () => {
  const aresta: PerimeterEdgeInfo = { index: 1, count: 4, lengthM: 10.5, definesSlope: true, slopePct: 30, overhangM: 0.5 };
  const grupo = (target: SketchTarget, edge: PerimeterEdgeInfo | null): string =>
    renderToStaticMarkup(createElement(PerimeterProps, { target, edge, onDefinesSlope: noop, onSlopePct: noop, onOverhang: noop }));

  it('telhado: aresta, comprimento, inclinação em % e ângulo, balanço', () => {
    const m = grupo('roof', aresta);
    expect(m).toContain('Perímetro do telhado');
    expect(m).toContain('2 de 4');
    expect(m).toContain('10,50 m');
    expect(m).toContain('Define inclinação');
    expect(m).toContain('Inclinação (ângulo)');
    expect(m).toContain('Balanço da aresta');
    expect(m).toContain('16,6992');
  });

  it('piso: só aresta e comprimento', () => {
    const m = grupo('floor', { index: 0, count: 4, lengthM: 3 });
    expect(m).toContain('Perímetro do piso');
    expect(m).not.toContain('Define inclinação');
    expect(m).not.toContain('Balanço da aresta');
  });

  it('sem aresta selecionada mostra travessão', () => {
    expect(grupo('roof', null)).toContain('—');
  });
});

describe('barra de status e problemas (pt-BR)', () => {
  const codigos: SketchIssueCode[] = ['open', 'too-few', 'zero-length', 'self-cross', 'overlap', 'loops-cross', 'loops-touch', 'hole-outside', 'hole-in-hole', 'multi-outer', 'empty'];

  it('cada código de problema tem texto', () => {
    for (const c of codigos) expect(issueText(c).length).toBeGreaterThan(5);
  });

  it('lista de problemas traz o texto de cada item', () => {
    const lista = issueLines({ loops: [], issues: [{ code: 'loops-cross', message: 'x', segIds: [] }], ok: false });
    expect(lista[0]?.text).toBe(issueText('loops-cross'));
  });

  it('mensagens de estado: sem resultado, fechado e com problema', () => {
    expect(sketchStatus('roof', null)).toContain('clique nos vértices');
    expect(sketchStatus('roof', ok)).toBe('Contorno fechado: Concluir grava o telhado.');
    expect(sketchStatus('floor', aberto)).toBe(issueText('open'));
    expect(finishTitle('roof', aberto)).toMatch(/^Concluir indisponível/);
    expect(finishTitle('ceiling', ok)).toBe('Concluir perímetro (grava o forro)');
  });

  it('mensagem de aresta no telhado e no piso', () => {
    expect(edgeStatus({ index: 0, lengthM: 4, definesSlope: true, slopePct: 30 })).toBe('Aresta 1: define inclinação (30,0%).');
    expect(edgeStatus({ index: 1, lengthM: 4, definesSlope: false })).toBe('Aresta 2: não define inclinação.');
    expect(edgeStatus({ index: 2, lengthM: 3.5 })).toBe('Aresta 3: 3,50 m.');
  });
});
