import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { DEFAULT_OPTIONS } from '../../editor/state.ts';
import { wallModeOf, type WallMode } from '../wallModes.ts';
import { contextTab } from './context.ts';
import { txt, type RibbonItem } from './model.ts';

type Botao = Extract<RibbonItem, { kind: 'option' }>;

/** Botões de modo do painel "Desenhar" da ferramenta Parede (as pilhas da faixa, achatadas). */
const botoes = (): Botao[] => {
  const tab = contextTab('wall', [], createEmptyProject('vazio'))!.tab;
  const painel = tab.panels.find((p) => p.id === 'desenhar')!;
  return painel.items.flatMap((it) => (it.kind === 'stack' ? it.items : [it])).filter((it): it is Botao => it.kind === 'option');
};

describe('faixa: modos da ferramenta Parede', () => {
  it('oferece os oito modos, em pilhas de três no painel Desenhar', () => {
    const tab = contextTab('wall', [], createEmptyProject('vazio'))!.tab;
    const painel = tab.panels.find((p) => p.id === 'desenhar')!;
    expect(painel.items.every((it) => it.kind === 'stack')).toBe(true);
    expect(painel.items.map((it) => (it.kind === 'stack' ? it.items.length : 0))).toEqual([3, 3, 2]);
    expect(botoes().map((b) => txt(b.label, 'pt'))).toEqual([
      'Linha', 'Arco (3 pontos)', 'Retângulo', 'Polígono inscrito', 'Polígono circunscrito', 'Círculo', 'Elipse', 'Spline',
    ]);
  });

  it('cada botão, ao ser clicado (patch sobre as opções), fica pressionado sozinho', () => {
    const modos: WallMode[] = ['line', 'arc', 'rect', 'polygonIn', 'polygonOut', 'circle', 'ellipse', 'spline'];
    botoes().forEach((b, i) => {
      const depois = { ...DEFAULT_OPTIONS, ...b.patch };
      expect(wallModeOf(depois)).toBe(modos[i]);
      const pressionados = botoes().filter((x) => x.test(depois));
      expect(pressionados).toHaveLength(1);
      expect(txt(pressionados[0]!.label, 'pt')).toBe(txt(b.label, 'pt'));
    });
  });
});
