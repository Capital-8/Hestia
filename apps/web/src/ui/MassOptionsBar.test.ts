import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MassTool, type ToolOptions } from '@hestia/tools';
import { editor } from '../editor/controller.ts';
import { abrirSecoesDaMassa, ligarMassa } from '../editor/massaLigacao.ts';
import { useUi } from '../editor/state.ts';
import { ajustarOpcoesMassa, MassOptionsFields, opcoesDaMassa } from './MassOptionsBar.tsx';
import { TABS } from './ribbon/tabs.ts';
import type { RibbonItem } from './ribbon/model.ts';

/** Faz o que o loft faz ao criar a massa (o parâmetro não herda o estreitamento de tipo do teste). */
const dispara = (t: MassTool, id: string): void => t.aoCriar?.(id);

const opcoesIniciais = useUi.getState().options;
afterEach(() => {
  useUi.setState({ options: opcoesIniciais, dialog: null, dialogArg: null });
  editor.setTool('select');
});

const botoesDeModo = (): Array<Extract<RibbonItem, { kind: 'option' }>> =>
  TABS.filter((tb) => tb.id === 'massa')
    .flatMap((tb) => tb.panels.flatMap((p) => p.items))
    .filter((it): it is Extract<RibbonItem, { kind: 'option' }> => it.kind === 'option');

/** O clique de um botão de modo da faixa (parts.tsx): espalha o patch sobre as opções atuais. */
const clicar = (b: Extract<RibbonItem, { kind: 'option' }>): void => useUi.setState((s) => ({ options: { ...s.options, ...b.patch } }));

describe('barra de opções da massa: ajustes preservados', () => {
  it('sem escolha anterior valem os padrões da ficha T1a (extrusão, círculo, 9 m, 6 lados)', () => {
    expect(opcoesDaMassa({})).toEqual({ modo: 'extrusao', perfil: 'circulo', altura: 9, lados: 6 });
  });

  it('trocar de modo pela barra mantém perfil, altura e lados', () => {
    ajustarOpcoesMassa({ perfil: 'poligono' });
    ajustarOpcoesMassa({ altura: 21 });
    ajustarOpcoesMassa({ lados: 8 });
    const depois = ajustarOpcoesMassa({ modo: 'loft' });
    expect(depois).toEqual({ modo: 'loft', perfil: 'poligono', altura: 21, lados: 8 });
    expect(useUi.getState().options.mass).toEqual(depois);
  });

  it('os quatro botões de modo da faixa trocam só o modo e preservam o que a barra escolheu', () => {
    const botoes = botoesDeModo();
    expect(botoes).toHaveLength(4);
    ajustarOpcoesMassa({ perfil: 'elipse', altura: 15, lados: 12 });
    for (const [i, modo] of (['mistura', 'loft', 'bulbo', 'extrusao'] as const).entries()) {
      const b = botoes[['extrusao', 'mistura', 'loft', 'bulbo'].indexOf(modo)]!;
      clicar(b);
      expect(useUi.getState().options.mass, `${i}:${modo}`).toEqual({ modo, perfil: 'elipse', altura: 15, lados: 12 });
      expect(b.test(useUi.getState().options as ToolOptions)).toBe(true);
    }
  });

  it('o primeiro clique de um botão de modo, sem escolha anterior, usa os padrões', () => {
    useUi.setState({ options: { ...opcoesIniciais, mass: undefined } });
    clicar(botoesDeModo()[2]!);
    expect(useUi.getState().options.mass).toEqual({ modo: 'loft', perfil: 'circulo', altura: 9, lados: 6 });
  });

  it('o ajuste da barra chega à ferramenta ativa (que só lia as opções ao ligar)', () => {
    editor.setTool('mass');
    const tool = editor.activeTool;
    expect(tool).toBeInstanceOf(MassTool);
    if (!(tool instanceof MassTool)) return;
    ajustarOpcoesMassa({ modo: 'mistura', perfil: 'poligono', altura: 30, lados: 5 });
    expect([tool.modo, tool.perfil, tool.altura, tool.lados]).toEqual(['mistura', 'poligono', 30, 5]);
  });

  it('mostra modo, perfil e altura; os lados só com perfil polígono (e o bulbo trava o perfil)', () => {
    const html = (o: Partial<ReturnType<typeof opcoesDaMassa>>): string => renderToStaticMarkup(createElement(MassOptionsFields, { o: { ...opcoesDaMassa({}), ...o }, onChange: () => undefined }));
    let out = html({ modo: 'extrusao', perfil: 'circulo' });
    for (const id of ['opt-mass-modo', 'opt-mass-perfil', 'opt-mass-altura']) expect(out, id).toContain(`id="${id}"`);
    expect(out).not.toContain('id="opt-mass-lados"');
    out = html({ perfil: 'poligono', lados: 12 });
    expect(out).toContain('id="opt-mass-lados"');
    expect(out).toContain('value="12"');
    out = html({ modo: 'bulbo', perfil: 'poligono' });
    expect(out).not.toContain('id="opt-mass-lados"');
    expect(out).toMatch(/id="opt-mass-perfil"[^>]*disabled/);
  });
});

describe('aoCriar do loft abre o diálogo "Seções da massa"', () => {
  it('abrirSecoesDaMassa grava o diálogo e a massa alvo', () => {
    abrirSecoesDaMassa('ms_abc');
    expect(useUi.getState().dialog).toBe('massSecoes');
    expect(useUi.getState().dialogArg).toBe('ms_abc');
  });

  it('ligarMassa liga o callback na ferramenta de massa e devolve a mesma ferramenta', () => {
    editor.setTool('mass');
    const tool = editor.activeTool;
    expect(tool).toBeInstanceOf(MassTool);
    if (!(tool instanceof MassTool)) return;
    tool.aoCriar = null;
    expect(ligarMassa(tool)).toBe(tool);
    dispara(tool, 'ms_loft1');
    expect(useUi.getState()).toMatchObject({ dialog: 'massSecoes', dialogArg: 'ms_loft1' });
  });

  it('o controlador liga o callback ao ativar a ferramenta (sem ninguém chamar ligarMassa)', () => {
    editor.setTool('select');
    editor.setTool('mass');
    const tool = editor.activeTool;
    expect(tool instanceof MassTool && tool.aoCriar !== null).toBe(true);
    if (tool instanceof MassTool) dispara(tool, 'ms_loft2');
    expect(useUi.getState().dialogArg).toBe('ms_loft2');
  });
});
