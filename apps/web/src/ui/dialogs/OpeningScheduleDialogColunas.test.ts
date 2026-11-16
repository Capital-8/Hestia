import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject, makeWall } = await import('@hestia/model');
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  store.exec({
    type: 'addOpening',
    opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, heightOverride: 1.84, mark: '' },
  });
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

import { createEmptyProject, defaultUnits, makeWall, ProjectStore, type Opening } from '@hestia/model';
import { buildOpeningSchedule, OPENING_EXTRA_KEYS } from '@hestia/engine';
import { dictOf } from '../../editor/i18n.ts';
import { OpeningScheduleDialog, OpeningScheduleTable, openingCols } from './OpeningScheduleDialog.tsx';

/** Tabela (só o <table>) do HTML do diálogo: os textos fora dela (filtro, legenda das colunas opcionais) não contam. */
const tabelaDe = (html: string): string => html.slice(html.indexOf('<table'), html.indexOf('</table>') + '</table>'.length);

describe('diálogo de portas e janelas: altura própria e colunas opcionais', () => {
  const html = renderToStaticMarkup(createElement(OpeningScheduleDialog));
  const tabela = tabelaDe(html);

  it('a instância com altura própria aparece em linha à parte, com o desvio no tipo e a área efetiva (1,47 m²)', () => {
    expect(tabela).toContain('Porta 80 x 210 (altura própria 1,84 m)');
    expect(tabela).toContain('1,47');
    expect(tabela).not.toContain('1,68'); // a área do tipo, sem o override, não aparece
  });

  it('as colunas opcionais estão desligadas por padrão: nenhum cabeçalho delas na tabela', () => {
    for (const rotulo of ['Resistência ao fogo', 'Rw (dB)', 'U (W/m²K)', 'Descrição', 'Fabricante', 'Custo unitário', 'Custo total', 'Fator solar']) {
      expect(tabela, rotulo).not.toContain(rotulo);
    }
    expect(tabela).toContain('Ferragens');
  });

  it('a legenda das colunas opcionais traz uma caixa por coluna, desmarcadas', () => {
    expect(html).toContain('Colunas opcionais');
    expect(html.split('type="checkbox"')).toHaveLength(OPENING_EXTRA_KEYS.length + 1);
    expect(html).not.toContain('checked=""');
  });
});

describe('colunas do quadro conforme as opcionais ligadas', () => {
  it('sem nenhuma ligada, são as 21 colunas de antes; ligadas, saem depois delas, na ordem da tabela', () => {
    expect(openingCols(new Set())).toHaveLength(21);
    const ligadas = openingCols(new Set(['unitCost', 'fireRating']));
    expect(ligadas).toHaveLength(23);
    expect(ligadas.slice(-2).map((c) => c.key)).toEqual(['fireRating', 'unitCost']);
  });
});

describe('tabela com colunas opcionais: valores formatados com as unidades do projeto', () => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 8, y: 0 } }) });
  const base = createEmptyProject().openingTypes.ot_j120!;
  s.exec({
    type: 'upsertOpeningType',
    openingType: { ...base, id: 'ot_full', fireRating: 'EI 30', acousticRw: 32, uValue: 1.4, description: 'Janela de teste', manufacturer: 'Acme', cost: 850.5, solarFactor: 0.35 },
  });
  const opening = (id: string, offset: number): Opening => ({ id, kind: 'window', typeId: 'ot_full', hostId: 'w', offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' });
  s.exec({ type: 'addOpening', opening: opening('j1', 2) });
  s.exec({ type: 'addOpening', opening: opening('j2', 6) });
  const rows = buildOpeningSchedule(s.project).rows;
  const html = renderToStaticMarkup(
    createElement(OpeningScheduleTable, {
      rows,
      cols: openingCols(new Set(['acousticRw', 'uValue', 'unitCost', 'totalCost', 'solarFactor'])),
      units: defaultUnits(),
      sort: null,
      onSort: () => undefined,
      t: dictOf('pt'),
    }),
  );

  it('cabeçalhos das ligadas com a unidade do projeto (R$ no custo) e nenhum cabeçalho das desligadas', () => {
    expect(html).toContain('Rw (dB)');
    expect(html).toContain('U (W/m²K)');
    expect(html).toContain('Custo unitário (R$)');
    expect(html).toContain('Custo total (R$)');
    expect(html).not.toContain('Resistência ao fogo');
    expect(html).not.toContain('Fabricante');
  });

  it('valores: Rw 32, U 1,40, custo unitário 850,50, custo total 1701,00 (2 janelas) e fator solar 0,35', () => {
    expect(html).toContain('>32<');
    expect(html).toContain('>1,40<');
    expect(html).toContain('>850,50<');
    expect(html).toContain('>1701,00<');
    expect(html).toContain('>0,35<');
  });
});
