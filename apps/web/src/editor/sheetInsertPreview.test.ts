import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, sheetOf } from '@hestia/model';
import { addSheetAction } from './sheetActions.ts';
import { INSERT_SCALES, initialInsertScale, parseCustomScale, previewInsert } from './sheetInsertPreview.ts';

const PLAN = { kind: 'plan', levelId: 'lv_0' } as const;
function setup(length: number) {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: length, y: 0 }, height: 3 }) });
  const id = addSheetAction(s);
  return { s, sheet: sheetOf(s.project, id)! };
}

describe('janela Inserir vista: escala personalizada', () => {
  it('aceita 1:75, 1/75, 75 e vírgula decimal arredondada', () => {
    expect(parseCustomScale('1:75')).toBe(75);
    expect(parseCustomScale(' 1 / 75 ')).toBe(75);
    expect(parseCustomScale('75')).toBe(75);
    expect(parseCustomScale('37,6')).toBe(38);
  });
  it('recusa vazio, texto, zero, negativo e fora da faixa', () => {
    for (const bad of ['', 'abc', '0', '-5', '1:0', '9999', '1:', '1:2:3']) expect(parseCustomScale(bad)).toBeNull();
  });
  it('as escalas oferecidas vão de 1:20 a 1:500 em ordem crescente', () => {
    expect(INSERT_SCALES[0]).toBe(20);
    expect(INSERT_SCALES.at(-1)).toBe(500);
    expect([...INSERT_SCALES].sort((a, b) => a - b)).toEqual([...INSERT_SCALES]);
  });
});

describe('janela Inserir vista: prévia', () => {
  it('tamanho cresce com a escala mais próxima (1:50 = 2x o de 1:100) e avisa quando não cabe', () => {
    const { s, sheet } = setup(30);
    const a = previewInsert(s.project, sheet, PLAN, 100);
    const b = previewInsert(s.project, sheet, PLAN, 50);
    expect(b.size.w).toBeGreaterThan(a.size.w);
    expect(a.fitsSheet).toBe(true);
    const big = previewInsert(s.project, sheet, PLAN, 20);
    expect(big.fitsSheet).toBe(false);
    expect(big.overflow.w).toBeGreaterThan(0);
    expect(big.at).toBeNull();
  });
  it('sem ponto, escolhe lugar livre dentro da folha; com ponto, centra e limita à área', () => {
    const { s, sheet } = setup(4);
    const free = previewInsert(s.project, sheet, PLAN, 100);
    expect(free.at).not.toBeNull();
    const c = previewInsert(s.project, sheet, PLAN, 100, { x: -500, y: -500 });
    expect(c.at!.x).toBeGreaterThanOrEqual(10);
    expect(c.at!.y).toBeGreaterThanOrEqual(10);
  });
  it('escala inicial: natural quando cabe; reduz quando a natural não cabe', () => {
    const small = setup(4);
    expect(initialInsertScale(small.s.project, small.sheet, PLAN)).toBe(100);
    const huge = setup(60);
    const sc = initialInsertScale(huge.s.project, huge.sheet, PLAN);
    expect(sc).toBeGreaterThan(100);
    expect(previewInsert(huge.s.project, huge.sheet, PLAN, sc).fitsSheet).toBe(true);
  });
  it('determinístico', () => {
    const { s, sheet } = setup(12);
    expect(previewInsert(s.project, sheet, PLAN, 50)).toEqual(previewInsert(s.project, sheet, PLAN, 50));
  });
});

describe('janela Inserir vistas: inserção por modo', () => {
  it('centrada no ponto solto, na escala escolhida, com um único undo', async () => {
    const { insertViewsWithMode } = await import('./sheetInsertPreview.ts');
    const { s } = setup(4);
    const id = addSheetAction(s);
    const ids = insertViewsWithMode(s, id, [PLAN], 50, { x: 150, y: 100 });
    const vp = sheetOf(s.project, id)!.viewports.find((v) => v.id === ids[0])!;
    expect(vp.scale).toBe(50);
    expect(vp.at.x + vp.size.w / 2).toBeCloseTo(150, 3);
    expect(vp.at.y + vp.size.h / 2).toBeCloseTo(100, 3);
    s.undo();
    expect(sheetOf(s.project, id)!.viewports).toHaveLength(0);
  });
  it('escala que não cabe é recusada sem gravar nada', async () => {
    const { insertViewsWithMode } = await import('./sheetInsertPreview.ts');
    const { s } = setup(60);
    const id = addSheetAction(s);
    expect(() => insertViewsWithMode(s, id, [PLAN], 20, { x: 150, y: 100 })).toThrow();
    expect(() => insertViewsWithMode(s, id, [PLAN], 20)).toThrow();
    expect(sheetOf(s.project, id)!.viewports).toHaveLength(0);
  });
  it('lote sem ponto: modo natural cai na maior que cabe e as caixas não se sobrepõem', async () => {
    const { insertViewsWithMode } = await import('./sheetInsertPreview.ts');
    const { s } = setup(8);
    const id = addSheetAction(s);
    const ids = insertViewsWithMode(s, id, [PLAN, { kind: 'areaTable' }], 'natural');
    expect(ids).toHaveLength(2);
  });
});
