import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_OPENING_TYPES, OPENING_SHAPE_KINDS, createEmptyProject, openingFamilyOf, type OpeningType } from '@hestia/model';
import { clienteFuroContornoFalso, definirClienteFuroContorno } from '@hestia/engine';
import { TypePreview, TypeThumb, temForma } from './TypePreview.tsx';
import { openingOptions } from './typeOptions.ts';
import { SHAPE_LABEL } from './openingShapeLabels.ts';
import { filterTypeChoices, groupTypeChoices, shapesPresent } from './typeSelectorModel.ts';
import { t } from '../editor/i18n.ts';

/**
 * Lista de tipos do painel de propriedades com os tipos com forma (docs/estudo-esquadrias/40): os 8 tipos novos (P-86 a P-88,
 * J-60 a J-64) entram na família certa, com a forma como atributo filtrável e a miniatura desenhando a forma; os tipos
 * retangulares continuam com o desenho esquemático de antes.
 */
const projeto = createEmptyProject();
const NOVOS: Array<[string, string, string]> = [
  // id, código, família esperada (a mesma do mapa de famílias do motor para o tipo)
  ['ot_parcop_90x210', 'P-86', 'door_swing'],
  ['ot_parcoab_90x210', 'P-87', 'door_swing'],
  ['ot_pogival_90x210', 'P-88', 'door_swing'],
  ['ot_jarcop_120x150', 'J-60', 'window_fixed'],
  ['ot_jarcoab_120x150', 'J-61', 'window_hinged'],
  ['ot_jogival_80x150', 'J-62', 'window_fixed'],
  ['ot_joculo_80x80', 'J-63', 'window_fixed'],
  ['ot_jempena_100x100', 'J-64', 'window_fixed'],
];

beforeEach(() => definirClienteFuroContorno(clienteFuroContornoFalso()));
afterEach(() => definirClienteFuroContorno(null));

describe('lista de tipos: os 8 tipos com forma', () => {
  const portas = openingOptions(projeto, 'door', 'pt');
  const janelas = openingOptions(projeto, 'window', 'pt');
  const todas = [...portas, ...janelas];

  it('os 162 tipos do catálogo estão na lista (portas e janelas)', () => {
    expect(DEFAULT_OPENING_TYPES.length).toBe(162);
    expect(portas.length + janelas.length).toBe(162);
  });

  it.each(NOVOS)('%s (%s) entra na família %s, com a forma e o nome da forma como atributos', (id, codigo, familia) => {
    const op = todas.find((o) => o.id === id);
    expect(op, id).toBeDefined();
    expect(op!.code).toBe(codigo);
    const tipo = projeto.openingTypes[id]!;
    const esperada = openingFamilyOf(tipo, 'pt')!;
    expect(esperada.id).toBe(familia);
    expect(op!.family).toBe(esperada.name);
    expect(op!.family).not.toBe(t('pt', 'prc_fam_other'));
    expect(op!.shape).toBe(tipo.shape!.kind);
    expect(op!.shapeLabel).toBe(t('pt', SHAPE_LABEL[tipo.shape!.kind]));
  });

  it('os tipos retangulares ficam com shape "rect" e a mesma família de antes', () => {
    const rect = todas.filter((o) => !NOVOS.some(([id]) => id === o.id));
    expect(rect.length).toBe(154);
    for (const o of rect) {
      expect(o.shape).toBe('rect');
      expect(o.family).toBe(openingFamilyOf(projeto.openingTypes[o.id]!, 'pt')?.name ?? t('pt', 'prc_fam_other'));
    }
  });

  it('o filtro "Forma do vão" mostra só as formas presentes e restringe a lista', () => {
    expect(shapesPresent(portas, OPENING_SHAPE_KINDS)).toEqual(['rect', 'round', 'segmental', 'pointed']);
    expect(shapesPresent(janelas, OPENING_SHAPE_KINDS)).toEqual(['rect', 'round', 'segmental', 'pointed', 'circle', 'gable']);
    expect(filterTypeChoices(janelas, '', 'circle').map((o) => o.code)).toEqual(['J-63']);
    expect(filterTypeChoices(janelas, '', 'round').map((o) => o.code)).toEqual(['J-60']);
    expect(filterTypeChoices(portas, '', 'pointed').map((o) => o.code)).toEqual(['P-88']);
    expect(filterTypeChoices(portas, '', 'rect').length).toBe(portas.length - 3);
  });

  it('a busca por texto acha pela forma (qualquer idioma ativo) e o agrupamento por família continua', () => {
    expect(filterTypeChoices(janelas, 'empena').map((o) => o.code)).toContain('J-64');
    const g = groupTypeChoices(filterTypeChoices(portas, 'arco'));
    expect(g.map((x) => x.family)).toEqual(['Porta de giro']);
    expect(g[0]!.items.map((o) => o.code)).toEqual(['P-86', 'P-87', 'P-88']);
    const en = openingOptions(projeto, 'window', 'en');
    expect(filterTypeChoices(en, 'gable').map((o) => o.code)).toContain('J-64');
  });
});

describe('miniatura do tipo na lista', () => {
  const html = (tipo: OpeningType, thumb = true): string =>
    renderToStaticMarkup(createElement(thumb ? TypeThumb : TypePreview, { subject: { kind: tipo.kind, type: tipo } }));

  it('tipo com forma: elevação do modelo do motor (peças e contorno), sem o título solto', () => {
    for (const [id] of NOVOS) {
      const tipo = projeto.openingTypes[id]!;
      expect(temForma(tipo)).toBe(true);
      const h = html(tipo);
      expect(h, id).toContain('rv-shaped');
      expect((h.match(/data-op="/g) ?? []).length, id).toBeGreaterThan(8);
      expect(h).not.toContain('<title>');
    }
  });

  it('a miniatura acompanha a forma: o mesmo tipo sem forma, com arco e com círculo desenham diferente', () => {
    const base = projeto.openingTypes.ot_j120!;
    const arco = { ...base, shape: { kind: 'round' as const, width: base.width, height: base.height } };
    const circulo = { ...base, shape: { kind: 'circle' as const, width: base.width, height: base.height } };
    expect(new Set([html(base), html(arco), html(circulo)]).size).toBe(3);
    expect(html(base)).not.toContain('rv-shaped');
  });

  it('tipo retangular (sem forma ou rect): o desenho esquemático de antes, idêntico', () => {
    const base = projeto.openingTypes.ot_pgiro90!;
    expect(temForma(base)).toBe(false);
    expect(html(base)).not.toContain('rv-shaped');
    const rect: OpeningType = { ...base, shape: { kind: 'rect', width: base.width, height: base.height } };
    expect(temForma(rect)).toBe(false);
    expect(html(rect)).toBe(html(base));
    expect(html(base, false)).not.toContain('rv-shaped');
  });
});
