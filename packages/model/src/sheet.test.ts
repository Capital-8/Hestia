import { describe, expect, it } from 'vitest';
import { LABEL_DEFAULT_MM, ProjectStore, createEmptyProject, emptyTitleBlock, projectSheets, sheetDimsMm, sheetInnerBox, sheetIssue, sheetOf, viewportAnchor, viewportBox, viewportClipped, viewportFrameVisible, viewportIssue, viewportLabel, viewportOffset, type Sheet, type SheetViewport } from './index.ts';

const LV0 = 'lv_0';
const titleBlock = emptyTitleBlock();
const sheet = (id: string, over: Partial<Sheet> = {}): Sheet => ({
  id,
  number: 'A-101',
  name: 'Planta baixa',
  size: 'A3',
  orientation: 'landscape',
  margin: 10,
  titleBlock,
  viewports: [],
  ...over,
});
const vp = (id: string, over: Partial<SheetViewport> = {}): SheetViewport => ({
  id,
  view: { kind: 'plan', levelId: LV0 },
  at: { x: 20, y: 20 },
  size: { w: 150, h: 100 },
  scale: 100,
  ...over,
});

describe('folha e área de desenho', () => {
  it('A3 deitada tem 420 × 297 mm e a área de desenho desconta a margem', () => {
    expect(sheetDimsMm({ size: 'A3', orientation: 'landscape' })).toEqual({ w: 420, h: 297 });
    expect(sheetDimsMm({ size: 'A3', orientation: 'portrait' })).toEqual({ w: 297, h: 420 });
    expect(sheetInnerBox({ size: 'A3', orientation: 'landscape', margin: 10 })).toEqual({ x0: 10, y0: 10, x1: 410, y1: 287 });
  });

  it('recusa margem que consome a folha e tamanho desconhecido', () => {
    expect(sheetIssue(sheet('s', { margin: 150 }))).toMatch(/margem/);
    expect(sheetIssue(sheet('s', { margin: -1 }))).toMatch(/margem/);
    expect(sheetIssue(sheet('s', { size: 'A5' as never }))).toMatch(/Tamanho/);
    expect(sheetIssue(sheet('s'))).toBeNull();
  });

  it('vista fora da folha é recusada; escala zero também', () => {
    expect(viewportIssue(sheet('s'), vp('v'))).toBeNull();
    expect(viewportIssue(sheet('s'), vp('v', { at: { x: 5, y: 20 } }))).toMatch(/sai da folha/);
    expect(viewportIssue(sheet('s'), vp('v', { at: { x: 300, y: 20 } }))).toMatch(/sai da folha/);
    expect(viewportIssue(sheet('s'), vp('v', { scale: 0 }))).toMatch(/escala/);
    expect(viewportIssue(sheet('s'), vp('v', { size: { w: 0, h: 10 } }))).toMatch(/largura/);
  });
});

describe('comandos de prancha', () => {
  it('cria prancha, adiciona vista e desfaz na ordem certa', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addSheet', sheet: sheet('sh1') });
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v1') });
    expect(sheetOf(s.project, 'sh1')!.viewports).toHaveLength(1);
    s.exec({ type: 'updateViewport', sheetId: 'sh1', id: 'v1', patch: { scale: 50 } });
    expect(sheetOf(s.project, 'sh1')!.viewports[0]!.scale).toBe(50);
    s.undo();
    expect(sheetOf(s.project, 'sh1')!.viewports[0]!.scale).toBe(100);
    s.undo();
    expect(sheetOf(s.project, 'sh1')!.viewports).toHaveLength(0);
    s.undo();
    expect(s.project.sheets ?? []).toHaveLength(0);
  });

  it('atualiza e remove prancha; renomear não mexe nas vistas', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addSheet', sheet: sheet('sh1', { viewports: [vp('v1')] }) });
    s.exec({ type: 'updateSheet', id: 'sh1', patch: { name: 'Corte AA' } });
    expect(sheetOf(s.project, 'sh1')).toMatchObject({ name: 'Corte AA', viewports: [expect.objectContaining({ id: 'v1' })] });
    s.exec({ type: 'removeSheet', id: 'sh1' });
    expect(sheetOf(s.project, 'sh1')).toBeUndefined();
    s.undo();
    expect(sheetOf(s.project, 'sh1')!.name).toBe('Corte AA');
  });

  it('recusa vista fora da folha, nível inexistente e escala zero sem alterar o projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addSheet', sheet: sheet('sh1') });
    expect(() => s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v1', { at: { x: 0, y: 0 } }) })).toThrow(/sai da folha/);
    expect(() => s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v1', { view: { kind: 'plan', levelId: 'nope' } }) })).toThrow(/Nível inexistente/);
    expect(() => s.exec({ type: 'updateViewport', sheetId: 'sh1', id: 'x', patch: {} })).toThrow(/inexistente/);
    expect(() => s.exec({ type: 'updateSheet', id: 'sh1', patch: { size: 'A4', orientation: 'landscape' } })).not.toThrow();
    expect(sheetOf(s.project, 'sh1')!.viewports).toHaveLength(0);
  });

  it('mudar a folha para uma menor é recusado quando uma vista sai dela', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addSheet', sheet: sheet('sh1', { viewports: [vp('v1', { at: { x: 200, y: 20 }, size: { w: 150, h: 100 } })] }) });
    expect(() => s.exec({ type: 'updateSheet', id: 'sh1', patch: { size: 'A4', orientation: 'landscape' } })).toThrow(/sai da folha/);
    expect(sheetOf(s.project, 'sh1')!.size).toBe('A3');
  });
});

describe('persistência', () => {
  it('a prancha vai no .hestia.json e volta igual (arquivo sem pranchas segue sem elas)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addSheet', sheet: sheet('sh1', { viewports: [vp('v1', { scale: 50 })] }) });
    const back = JSON.parse(JSON.stringify(s.project));
    expect(sheetOf(back, 'sh1')).toEqual(sheetOf(s.project, 'sh1'));
    expect(sheetOf(JSON.parse(JSON.stringify(createEmptyProject())), 'sh1')).toBeUndefined();
  });
});

describe('editor de layout: deslocamento, recorte e legenda', () => {
  it('campos do editor são opcionais: vista antiga vale centrada, recortada e com legenda', () => {
    const v = vp('v1');
    expect(viewportOffset(v)).toEqual({ x: 0, y: 0 });
    expect(viewportClipped(v)).toBe(true);
    expect(viewportFrameVisible(v)).toBe(true);
    expect(viewportLabel(v)).toEqual({ show: true, sizeMm: LABEL_DEFAULT_MM, scaleBar: false, rule: true });
    expect(viewportBox(v)).toEqual({ x: 20, y: 20, w: 150, h: 100 });
  });

  it('recusa deslocamento não finito e legenda de tamanho zero (pt-BR)', () => {
    expect(viewportIssue(sheet('s'), vp('v', { offset: { x: Number.NaN, y: 0 } }))).toMatch(/deslocamento/);
    expect(viewportIssue(sheet('s'), vp('v', { label: { sizeMm: 0 } }))).toMatch(/legenda/);
    expect(viewportIssue(sheet('s'), vp('v', { offset: { x: 10, y: -5 }, clip: false, frame: false }))).toBeNull();
  });

  it('grava deslocamento, recorte, moldura, legenda e trava com um passo de desfazer', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addSheet', sheet: sheet('sh1', { viewports: [vp('v1')] }) });
    s.exec({
      type: 'updateViewport',
      sheetId: 'sh1',
      id: 'v1',
      patch: { offset: { x: 12, y: -4 }, clip: false, frame: false, label: { show: false, scaleBar: true }, locked: true },
    });
    const v = sheetOf(s.project, 'sh1')!.viewports[0]!;
    expect(v.offset).toEqual({ x: 12, y: -4 });
    expect(v.clip).toBe(false);
    expect(v.label).toEqual({ show: false, scaleBar: true });
    expect(v.locked).toBe(true);
    s.undo();
    expect(sheetOf(s.project, 'sh1')!.viewports[0]!.offset).toBeUndefined();
  });

  it('ordem das pranchas: aplica a lista e mantém as não citadas no fim; recusa repetida ou inexistente', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addSheet', sheet: sheet('sh1', { number: 'A-101' }) });
    s.exec({ type: 'addSheet', sheet: sheet('sh2', { number: 'A-102' }) });
    s.exec({ type: 'addSheet', sheet: sheet('sh3', { number: 'A-103' }) });
    s.exec({ type: 'setSheetOrder', ids: ['sh3', 'sh1'] });
    expect(projectSheets(s.project).map((x) => x.id)).toEqual(['sh3', 'sh1', 'sh2']);
    s.undo();
    expect(projectSheets(s.project).map((x) => x.id)).toEqual(['sh1', 'sh2', 'sh3']);
    expect(() => s.exec({ type: 'setSheetOrder', ids: ['sh1', 'sh1'] })).toThrow(/repetida/);
    expect(() => s.exec({ type: 'setSheetOrder', ids: ['nada'] })).toThrow(/inexistente/);
  });

  it('revisões e disciplina da prancha vão no arquivo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({
      type: 'addSheet',
      sheet: sheet('sh1', {
        discipline: 'Arquitetura',
        revisions: [{ tag: '0', date: '2026-10-30', description: 'Emissão inicial' }],
      }),
    });
    const back = JSON.parse(JSON.stringify(s.project));
    expect(sheetOf(back, 'sh1')!.revisions).toEqual([{ tag: '0', date: '2026-10-30', description: 'Emissão inicial' }]);
    expect(sheetOf(back, 'sh1')!.discipline).toBe('Arquitetura');
  });
});

describe('âncora do conteúdo (redimensionar sem mover o desenho)', () => {
  it('sem âncora vale o centro da caixa + offset; com âncora, ela manda', () => {
    const v = vp('v1');
    expect(viewportAnchor(v)).toEqual({ x: 95, y: 70 });
    expect(viewportAnchor({ ...v, offset: { x: 5, y: -3 } })).toEqual({ x: 100, y: 67 });
    expect(viewportAnchor({ ...v, anchor: { x: 1, y: 2 } })).toEqual({ x: 1, y: 2 });
    expect(viewportAnchor({ ...v, anchor: { x: 1, y: 2 }, offset: { x: 50, y: 50 } })).toEqual({ x: 1, y: 2 });
  });

  it('recusa âncora não finita e aceita âncora fora da caixa', () => {
    expect(viewportIssue(sheet('s'), vp('v', { anchor: { x: Number.NaN, y: 0 } }))).toMatch(/âncora/);
    expect(viewportIssue(sheet('s'), vp('v', { anchor: { x: -50, y: 500 } }))).toBeNull();
  });
});
