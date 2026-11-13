import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeBeam, makeColumn, makeFooting, makeWall, type Beam, type Column, type Footing } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { BeamProperties } from './BeamProperties.tsx';
import { ColumnProperties } from './ColumnProperties.tsx';
import { definirLeituraEstr } from './estrLeitura.ts';
import { FootingProperties } from './FootingProperties.tsx';
import { selectionLabel } from './GenericProps.tsx';

// useProject usa useSyncExternalStore (sem snapshot de servidor): no teste ele lê o projeto direto.
vi.mock('../editor/controller.ts', async () => {
  const actual = await vi.importActual<typeof import('../editor/controller.ts')>('../editor/controller.ts');
  return { ...actual, useProject: () => actual.editor.store.project, useProjectVersion: () => 0 };
});

afterEach(() => definirLeituraEstr());

const exec = (c: Parameters<typeof editor.store.exec>[0]): void => editor.store.exec(c);
const el = <T>(id: string): T => editor.store.project.elements[id] as T;

exec({ type: 'addWall', wall: makeWall({ id: 'w_e1', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, typeId: Object.keys(editor.store.project.wallTypes)[0]! }) });
exec({ type: 'addColumn', column: makeColumn({ id: 'c_est', typeId: 'pil_est_25x25', levelId: 'lv_0', pos: { x: 1, y: 1 }, disciplina: 'estrutural', topLevelId: 'lv_1' }) });
exec({ type: 'addColumn', column: makeColumn({ id: 'c_arq', typeId: 'pil_arq_20x20', levelId: 'lv_0', pos: { x: 2, y: 1 }, disciplina: 'arquitetonico', hostWallId: 'w_e1' }) });
exec({ type: 'addBeam', beam: makeBeam({ id: 'b_1', typeId: 'vig_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 4 } }) });
exec({ type: 'addFooting', footing: makeFooting({ id: 'f_iso', typeId: 'sap_80x80x30', levelId: 'lv_0', pos: { x: 1, y: 1 } }) });
exec({ type: 'addFooting', footing: makeFooting({ id: 'f_cor', typeId: 'bal_40x30', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });

const coluna = (id: string): string => renderToStaticMarkup(createElement(ColumnProperties, { columns: [el<Column>(id)] }));
const viga = (): string => renderToStaticMarkup(createElement(BeamProperties, { beams: [el<Beam>('b_1')] }));
const fundacao = (id: string): string => renderToStaticMarkup(createElement(FootingProperties, { footings: [el<Footing>(id)] }));

describe('painel do pilar', () => {
  it('abre com o TypeSelector e o Editar tipo antes dos campos (regra 2)', () => {
    const html = coluna('c_est');
    const edita = html.indexOf('id="prop-columntype-edit"');
    expect(html).toContain('id="prop-columntype"');
    expect(edita).toBeGreaterThan(-1);
    expect(edita).toBeLessThan(html.indexOf('id="col-base"'));
    expect(html).toContain('Estrutural 25 × 25');
  });

  it('estrutural: nível base, deslocamento, topo por nível (com deslocamento), rotação, marca; sem parede hospedeira', () => {
    const html = coluna('c_est');
    for (const id of ['col-base', 'col-top', 'col-topoff', 'col-rot', 'col-mark', 'col-comments']) expect(html, id).toContain(`id="${id}"`);
    expect(html).not.toContain('id="col-height"');
    expect(html).not.toContain('id="col-host"');
    expect(html).toContain('id="prop-level"');
  });

  it('arquitetônico com topo por altura: mostra a altura e a parede hospedeira com a parede escolhida', () => {
    const html = coluna('c_arq');
    expect(html).toContain('id="col-height"');
    expect(html).not.toContain('id="col-topoff"');
    expect(html).toMatch(/id="col-host"[^>]*>.*<option value="w_e1" selected/);
  });

  it('volume, forma e peso aparecem como linhas somente leitura e valem "—" sem o kernel', () => {
    const html = coluna('c_est');
    for (const rotulo of ['Volume', 'Área de forma', 'Peso']) expect(html).toContain(rotulo);
    expect(html.match(/<span>—<\/span>/g)).toHaveLength(3);
  });

  it('com a leitura injetada (kernel ligado) mostra os valores, formatados', () => {
    definirLeituraEstr((id) => (id === 'c_est' ? { volume: 0.1875, areaForma: 3, peso: 468.75 } : null));
    const html = coluna('c_est');
    expect(html.match(/<span>—<\/span>/g)).toBeNull();
    expect(html).toContain('468,8 kg');
  });

  it('seleção mista de tipos: seletor em "variado" e Editar tipo desativado', () => {
    const html = renderToStaticMarkup(createElement(ColumnProperties, { columns: [el<Column>('c_est'), el<Column>('c_arq')] }));
    expect(html).toMatch(/id="prop-columntype-edit"[^>]*disabled/);
  });

  it('o rótulo do cabeçalho conta pilares, vigas e fundações', () => {
    expect(selectionLabel({ walls: 0, ops: 0, floors: 0, slabs: 0, ceilings: 0, roofs: 0, stairs: 0, ramps: 0, rooms: 0, generics: 0, columns: 2, grade: null, view: null })).toBe('2 pilares');
    expect(selectionLabel({ walls: 0, ops: 0, floors: 0, slabs: 0, ceilings: 0, roofs: 0, stairs: 0, ramps: 0, rooms: 0, generics: 0, beams: 1, grade: null, view: null })).toBe('1 viga');
    expect(selectionLabel({ walls: 0, ops: 0, floors: 0, slabs: 0, ceilings: 0, roofs: 0, stairs: 0, ramps: 0, rooms: 0, generics: 0, footings: 3, grade: null, view: null })).toBe('3 fundações');
  });
});

describe('painel da viga', () => {
  it('abre com o TypeSelector e o Editar tipo e traz cotas das pontas, alinhamento, giro e extremidades', () => {
    const html = viga();
    expect(html.indexOf('id="prop-beamtype-edit"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="prop-beamtype-edit"')).toBeLessThan(html.indexOf('id="beam-za"'));
    for (const id of ['beam-za', 'beam-zb', 'beam-align', 'beam-rot', 'beam-ea', 'beam-eb', 'beam-mark', 'beam-comments']) expect(html, id).toContain(`id="${id}"`);
    expect(html).toMatch(/id="beam-align"[^>]*><option value="topo" selected/);
  });

  it('comprimento é somente leitura (eixo de 3-4-5 = 5 m) e as quantidades do kernel valem "—"', () => {
    const html = viga();
    expect(html).toContain('Comprimento');
    expect(html).toContain('<span>5,00 m</span>');
    expect(html.match(/<span>—<\/span>/g)).toHaveLength(3);
  });
});

describe('painel da fundação', () => {
  it('abre com o TypeSelector e o Editar tipo antes da cota do topo', () => {
    const html = fundacao('f_iso');
    expect(html.indexOf('id="prop-footingtype-edit"')).toBeGreaterThan(-1);
    expect(html.indexOf('id="prop-footingtype-edit"')).toBeLessThan(html.indexOf('id="fun-top"'));
  });

  it('isolada tem rotação e não tem parede hospedeira; corrida o contrário', () => {
    const iso = fundacao('f_iso');
    expect(iso).toContain('id="fun-rot"');
    expect(iso).not.toContain('id="fun-host"');
    const cor = fundacao('f_cor');
    expect(cor).not.toContain('id="fun-rot"');
    expect(cor).toContain('id="fun-host"');
  });

  it('o seletor só oferece os tipos do mesmo modo (isolada não oferece baldrame)', () => {
    const html = renderToStaticMarkup(createElement(FootingProperties, { footings: [el<Footing>('f_iso')] }));
    expect(html).toContain('Sapata isolada 80 × 80 × 30');
    expect(html).not.toContain('Baldrame 40 × 30');
  });
});
