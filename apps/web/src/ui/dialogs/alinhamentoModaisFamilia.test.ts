/**
 * TESTE-GUARDA do alinhamento dos modais de tipo (docs/contratos/familias-e-ferramentas.md, regra 4, "Alinhamento"):
 * o modal da escada e o do guarda-corpo só montam campos com as peças de `familia/` (FamilyRow, FamilyCheck, FamilyPair...),
 * sem estilo inline, sem caixa de seleção solta e sem linha própria. A grade (rótulo fixo, controle no mesmo x, par
 * alinhado) vive em UM lugar: o CSS `.fam-form`/`.fam-pair`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_STAIR_TYPES, type StairRunStyle, type StairType } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { FamilyActions, FamilyCheck, FamilyPair, FamilyReadout, FamilyRow, FamilySection } from './familia/index.ts';
import { GuardaCorpoTypeDialog } from './guardaCorpoType/index.tsx';
import { StairBlondelCard } from './StairBlondelCard.tsx';
import { StairCalculatorPanel } from './StairCalculatorPanel.tsx';
import { StairTypeSections } from './StairTypeSections.tsx';

// useProject usa useSyncExternalStore (sem snapshot de servidor): no teste ele lê o projeto direto.
vi.mock('../../editor/controller.ts', async () => {
  const actual = await vi.importActual<typeof import('../../editor/controller.ts')>('../../editor/controller.ts');
  return { ...actual, useProject: () => actual.editor.store.project, useProjectVersion: () => 0 };
});

const aqui = dirname(fileURLToPath(import.meta.url));
const fonte = (arq: string): string => readFileSync(join(aqui, arq), 'utf8');
const css = readFileSync(join(aqui, '../../styles.css'), 'utf8');

/** Os dois modais e as peças deles: nada de estilo, caixa ou linha próprios. */
const ALINHADOS = [
  'StairTypeDialog.tsx',
  'StairTypeSections.tsx',
  'StairCalculatorPanel.tsx',
  'StairBlondelCard.tsx',
  'guardaCorpoType/index.tsx',
];

const PROIBIDO: Array<[RegExp, string]> = [
  [/style=\{\{/, 'style={{ ... }} (margem, largura ou cor solta: use classe do esqueleto)'],
  [/<input\b/, '<input> solto (use NumField, TextField, FamilyCheck ou, no select, FamilyRow)'],
  [/type="checkbox"/, 'caixa de seleção fora de FamilyCheck'],
  [/<Check\b/, '<Check> solto (use FamilyCheck, que põe a caixa na coluna do controle)'],
  [/<label\b/, '<label> solto (o rótulo é do FamilyRow)'],
  [/<Row\b/, 'Row da paleta de propriedades (use FamilyRow)'],
  [/className="(?:prow(?: ro)?|field-row|fam-row|fam-pair|fam-sec|fam-ctl|dsec|hint)"/, 'classe de linha ou seção própria'],
  [/<FamilyPair mix/, 'FamilyPair mix não existe mais (empilhe as linhas)'],
];

describe('contrato de alinhamento: escada e guarda-corpo usam só o esqueleto', () => {
  for (const arq of ALINHADOS) {
    it(`${arq} sem estilo inline, caixa solta nem linha própria`, () => {
      const src = fonte(arq);
      const achados = PROIBIDO.filter(([re]) => re.test(src)).map(([, m]) => m);
      expect(achados, `${arq}: ${achados.join('; ')}`).toEqual([]);
    });
  }

  it('o esqueleto não usa estilo inline (a cor de aviso é classe)', () => {
    for (const arq of ['familia/FamilyRow.tsx', 'familia/FamilySection.tsx', 'familia/FamilyTabs.tsx', 'familia/FamilyTypeDialog.tsx']) {
      expect(/style=\{\{/.test(fonte(arq)), `${arq} com style inline`).toBe(false);
    }
  });
});

describe('contrato de alinhamento: a grade do CSS', () => {
  const bloco = (sel: string): string => {
    const esc = sel.replace(/[.*+?^${}()|[\]\\>:]/g, '\\$&');
    return css.match(new RegExp(`(?:^|\\n)\\s*${esc}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  };

  it('.fam-form define a coluna de rótulo, a do 2º campo do par e a do controle numérico', () => {
    const b = bloco('.fam-form');
    expect(b).toMatch(/--fam-l:\s*\d+px/);
    expect(b).toMatch(/--fam-l2:\s*\d+px/);
    expect(b).toMatch(/--fam-c:\s*\d+px/);
    expect(b).toMatch(/--fam-rowh:\s*\d+px/);
  });

  it('toda linha do diálogo usa a mesma coluna de rótulo, inclusive o cabeçalho Família/Tipo', () => {
    expect(bloco('.fam-form .field-row')).toMatch(/grid-template-columns:\s*var\(--fam-l\)/);
    expect(bloco('.type-head')).toMatch(/grid-template-columns:\s*var\(--fam-l/);
  });

  it('o 1º campo do par cai no mesmo x das linhas simples; o 2º tem largura própria fixa', () => {
    expect(bloco('.fam-pair > .fam-row:first-child .field-row')).toMatch(/var\(--fam-l\)\s+var\(--fam-c\)/);
    expect(bloco('.fam-pair > .fam-row + .fam-row .field-row')).toMatch(/var\(--fam-l2\)\)\s+var\(--fam-c\)/);
    expect(bloco('.fam-pair')).toMatch(/calc\(var\(--fam-l\)\s*\+\s*var\(--fam-gap\)\s*\+\s*var\(--fam-c\)\)/);
  });

  it('caixa de seleção sem margem própria (a borda esquerda dela é o x do controle)', () => {
    expect(bloco(".fam-ctl input[type='checkbox']")).toMatch(/margin:\s*0/);
  });

  it('não sobrou a variante antiga com larguras soltas em pixel por diálogo', () => {
    expect(css).not.toMatch(/\.fam-pair\.mix/);
    expect(css).not.toMatch(/\.fam-sec-body\s*>\s*\.fam-row\s*>\s*\.field-row\s*\{/);
  });
});

describe('contrato de alinhamento: estrutura renderizada', () => {
  const tipo = (over: Partial<StairType> = {}): StairType => ({ ...structuredClone(DEFAULT_STAIR_TYPES[0]!), ...over });
  const noop = (): void => {};
  const secoes = (d: StairType): string =>
    renderToStaticMarkup(createElement(StairTypeSections, { draft: d, set: noop, onStyle: noop, materials: {}, issues: [], canGoProps: false, onGoProps: noop }));
  const gc = (): string => renderToStaticMarkup(createElement(GuardaCorpoTypeDialog, { typeId: Object.keys(editor.store.project.tiposGuardaCorpo ?? {})[0]! }));

  /** Início da linha (fam-row) que contém cada <input type="checkbox"> do HTML. */
  function linhasDasCaixas(html: string): string[] {
    const out: string[] = [];
    let i = html.indexOf('type="checkbox"');
    while (i >= 0) {
      const ini = html.lastIndexOf('<div class="fam-row', i);
      out.push(ini < 0 ? '(fora de fam-row)' : html.slice(ini, ini + 40));
      i = html.indexOf('type="checkbox"', i + 1);
    }
    return out;
  }

  it('FamilyCheck: rótulo vazio, depois a caixa e o texto na coluna do controle', () => {
    const h = renderToStaticMarkup(createElement(FamilyCheck, { id: 'x', checked: true, onChange: noop, children: 'Texto' }));
    expect(h).toMatch(/^<div class="fam-row fam-check"><div class="field-row"><span aria-hidden="true"><\/span><div class="fam-ctl"><label class="check"><input id="x" type="checkbox"/);
    expect(h).toContain('Texto</label>');
  });

  it('FamilyCheck desabilitado esmaece a linha', () => {
    const h = renderToStaticMarkup(createElement(FamilyCheck, { checked: false, onChange: noop, disabled: true, children: 'Texto' }));
    expect(h).toContain('class="fam-row fam-check dim"');
  });

  it('FamilyRow: rótulo e controle (fam-ctl) dentro de field-row; esmaecimento por classe, sem style', () => {
    const h = renderToStaticMarkup(createElement(FamilyRow, { label: 'Rótulo', htmlFor: 'a', dim: true, message: 'aviso', messageWarn: true, children: createElement('span', null, 'c') }));
    expect(h).toContain('class="fam-row dim"');
    expect(h).toContain('<div class="field-row"><label for="a">Rótulo</label><div class="fam-ctl"><span>c</span></div></div>');
    expect(h).toContain('class="vr-error warn"');
    expect(h).not.toContain('style=');
  });

  it('FamilyPair, FamilyActions, FamilyReadout e FamilySection renderizam as classes padrão', () => {
    expect(renderToStaticMarkup(createElement(FamilyPair, { children: 'x' }))).toBe('<div class="fam-pair">x</div>');
    expect(renderToStaticMarkup(createElement(FamilyActions, { children: 'x' }))).toBe('<div class="fam-actions">x</div>');
    expect(renderToStaticMarkup(createElement(FamilyReadout, { label: 'a', value: 'b' }))).toContain('class="fam-readout"');
    expect(renderToStaticMarkup(createElement(FamilySection, { title: 'T', children: 'x' }))).toContain('class="fam-sec"');
  });

  for (const estilo of ['monolithic', 'assembled', 'post'] as StairRunStyle[]) {
    it(`escada (${estilo}): toda caixa está numa FamilyCheck, todo campo numérico na coluna do controle, sem style`, () => {
      const h = secoes(tipo({ runStyle: estilo }));
      for (const linha of linhasDasCaixas(h)) expect(linha, 'caixa fora de FamilyCheck').toMatch(/^<div class="fam-row fam-check/);
      const nums = h.split('class="input num').length - 1;
      const noCtl = h.split('<div class="fam-ctl"><span class="numwrap"><input').length - 1;
      expect(nums).toBe(noCtl);
      expect(h).not.toContain('style=');
    });
  }

  it('escada monolítica: acabamentos em linhas empilhadas (check, material, espessura), sem par misto', () => {
    const h = secoes(tipo({ runStyle: 'monolithic', treadFinishEnabled: false }));
    const i = h.indexOf('id="stt-treadFinishEnabled"');
    const trecho = h.slice(i, h.indexOf('id="stt-riserFinishEnabled"'));
    expect(trecho).not.toContain('fam-pair');
    expect(trecho).toContain('class="fam-row dim"');
    expect(trecho.indexOf('id="stt-treadFinishMaterialId"')).toBeLessThan(trecho.indexOf('id="stt-treadFinishThickness"'));
  });

  it('calculadora e cartão de Blondel sem style nem linha da paleta de propriedades', () => {
    const calc = renderToStaticMarkup(createElement(StairCalculatorPanel, { type: tipo(), heightCm: 300, onHeight: noop }));
    const bl = renderToStaticMarkup(createElement(StairBlondelCard, { type: tipo(), heightCm: 300 }));
    for (const h of [calc, bl]) {
      expect(h).not.toContain('style=');
      expect(h).not.toContain('class="prow');
    }
    expect(calc).toContain('class="fam-readout"');
  });

  it('guarda-corpo (aba Geral): linhas e pares do esqueleto, sem style e sem caixa solta', () => {
    const h = gc().slice(gc().indexOf('class="fam-form"'));
    expect(h).toContain('class="fam-form"');
    expect(h).toContain('class="fam-pair"');
    expect(h).toContain('class="fam-split"');
    expect(h).not.toContain('style=');
    for (const linha of linhasDasCaixas(h)) expect(linha).toMatch(/^<div class="fam-row fam-check/);
    // O nome do tipo é uma linha comum do esqueleto (mesma coluna de rótulo do resto).
    expect(h).toMatch(/<div class="fam-row"><div class="field-row"><label for="gc-t-name">/);
  });
});
