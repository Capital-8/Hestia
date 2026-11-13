import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { columnTypesOf, DEFAULT_COLUMN_TYPES, isColumn, makeColumn, transformColumn } from './column.ts';
import type { Column, ColumnType } from './estrTypes.ts';
import { makeWall } from './wall.ts';

const store = (): ProjectStore => new ProjectStore(createEmptyProject());
const col = (s: ProjectStore, id: string): Column => s.project.elements[id] as Column;
const novo = (id = 'c1', extra: Partial<Column> = {}): Parameters<typeof makeColumn>[0] => ({ id, typeId: 'pil_est_25x25', levelId: 'lv_0', pos: { x: 1, y: 2 }, ...extra });
const tipoArq: ColumnType = { ...DEFAULT_COLUMN_TYPES.pil_arq_20x20!, id: 'pil_arq_custom', camadas: [{ function: 'finish1', materialId: 'mat_reboco', thickness: 0.02, wraps: false }] };

describe('tipos de pilar por leitura (A.3)', () => {
  it('projeto novo não grava o mapa e lê os dois padrões', () => {
    const p = createEmptyProject();
    expect('columnTypes' in p).toBe(false);
    expect(Object.keys(columnTypesOf(p)).sort()).toEqual(['pil_arq_20x20', 'pil_est_25x25']);
    expect(columnTypesOf(p).pil_est_25x25).toMatchObject({ disciplina: 'estrutural', perfil: { forma: 'retangular', b: 0.25, h: 0.25 }, materialId: 'mat_concreto' });
    expect(columnTypesOf(p).pil_arq_20x20).toMatchObject({ disciplina: 'arquitetonico', perfil: { forma: 'retangular', b: 0.2, h: 0.2 } });
  });

  it('a primeira escrita grava o conjunto completo; apagar um padrão não o traz de volta', () => {
    const s = store();
    s.exec({ type: 'upsertColumnType', columnType: tipoArq });
    expect(Object.keys(s.project.columnTypes!).sort()).toEqual(['pil_arq_20x20', 'pil_arq_custom', 'pil_est_25x25']);
    s.exec({ type: 'deleteColumnType', id: 'pil_arq_20x20' });
    expect(columnTypesOf(s.project).pil_arq_20x20).toBeUndefined();
    s.undo();
    expect(columnTypesOf(s.project).pil_arq_20x20).toBeDefined();
    s.undo();
    expect('columnTypes' in s.project).toBe(false);
  });
});

describe('addColumn, updateColumn e desfazer/refazer', () => {
  it('adiciona com ordem, desfaz e refaz', () => {
    const s = store();
    s.exec({ type: 'addColumn', column: makeColumn(novo()) });
    expect(isColumn(s.project.elements.c1)).toBe(true);
    expect(col(s, 'c1')).toMatchObject({ kind: 'column', disciplina: 'estrutural', rotation: 0, topLevelId: null, height: 3, order: 1 });
    s.undo();
    expect(s.project.elements.c1).toBeUndefined();
    s.redo();
    expect(col(s, 'c1').pos).toEqual({ x: 1, y: 2 });
  });

  it('atualiza campos, mantém id, tipo do elemento e ordem; desfaz e refaz', () => {
    const s = store();
    s.exec({ type: 'addColumn', column: makeColumn(novo()) });
    s.exec({ type: 'updateColumn', id: 'c1', patch: { rotation: 0.5, baseOffset: -0.2, mark: 'P1' } });
    expect(col(s, 'c1')).toMatchObject({ rotation: 0.5, baseOffset: -0.2, mark: 'P1', order: 1 });
    s.undo();
    expect(col(s, 'c1')).toMatchObject({ rotation: 0, mark: '' });
    s.redo();
    expect(col(s, 'c1').mark).toBe('P1');
  });

  it('recusa: tipo, nível, nível de topo ou parede inexistentes; disciplina diferente; altura ≤ 0; valor não finito', () => {
    const s = store();
    const add = (c: Partial<Column>): (() => void) => () => s.exec({ type: 'addColumn', column: makeColumn(novo('x', c)) });
    expect(add({ typeId: 'nao' })).toThrow();
    expect(add({ levelId: 'nao' })).toThrow();
    expect(add({ topLevelId: 'nao' })).toThrow();
    expect(add({ disciplina: 'arquitetonico' })).toThrow();
    expect(add({ height: 0 })).toThrow();
    expect(add({ height: null })).toThrow();
    expect(add({ pos: { x: Number.NaN, y: 0 } })).toThrow();
    expect(add({ rotation: Infinity })).toThrow();
    expect(add({ hostWallId: 'w' })).toThrow();
    expect(Object.keys(s.project.elements)).toHaveLength(0);
    expect(() => s.exec({ type: 'updateColumn', id: 'nao', patch: {} })).toThrow();
  });

  it('pilar com nível de topo aceita altura nula; arquitetônico hospeda numa parede existente', () => {
    const s = store();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: Object.keys(s.project.wallTypes)[0]!, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
    s.exec({ type: 'addColumn', column: makeColumn(novo('c1', { topLevelId: 'lv_0', height: null })) });
    s.exec({ type: 'addColumn', column: makeColumn(novo('a1', { typeId: 'pil_arq_20x20', disciplina: 'arquitetonico', hostWallId: 'w' })) });
    expect(col(s, 'a1').hostWallId).toBe('w');
    expect(() => s.exec({ type: 'addColumn', column: makeColumn(novo('a2', { typeId: 'pil_arq_20x20', disciplina: 'arquitetonico', hostWallId: 'c1' })) })).toThrow();
  });

  it('não guarda referência ao objeto do chamador (a posição passada continua editável)', () => {
    const s = store();
    const entrada = makeColumn(novo());
    s.exec({ type: 'addColumn', column: entrada });
    expect(Object.isFrozen(entrada.pos)).toBe(false);
  });
});

describe('setColumnType e tipos de pilar', () => {
  it('troca o tipo e a disciplina juntos; ao virar estrutural, solta a parede hospedeira', () => {
    const s = store();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: Object.keys(s.project.wallTypes)[0]!, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
    s.exec({ type: 'addColumn', column: makeColumn(novo('a1', { typeId: 'pil_arq_20x20', disciplina: 'arquitetonico', hostWallId: 'w' })) });
    s.exec({ type: 'setColumnType', ids: ['a1'], typeId: 'pil_est_25x25' });
    expect(col(s, 'a1')).toMatchObject({ typeId: 'pil_est_25x25', disciplina: 'estrutural' });
    expect(col(s, 'a1').hostWallId).toBeUndefined();
    s.undo();
    expect(col(s, 'a1')).toMatchObject({ typeId: 'pil_arq_20x20', disciplina: 'arquitetonico', hostWallId: 'w' });
    expect(() => s.exec({ type: 'setColumnType', ids: ['a1'], typeId: 'nao' })).toThrow();
  });

  it('upsert valida perfil, camadas (só arquitetônico) e material; tipo em uso não troca de disciplina; delete recusa tipo em uso', () => {
    const s = store();
    const t = (x: Partial<ColumnType>): ColumnType => ({ ...tipoArq, ...x });
    expect(() => s.exec({ type: 'upsertColumnType', columnType: t({ perfil: { forma: 'circular', d: 0 } }) })).toThrow();
    expect(() => s.exec({ type: 'upsertColumnType', columnType: t({ materialId: 'mat_inexistente' }) })).toThrow();
    expect(() => s.exec({ type: 'upsertColumnType', columnType: t({ disciplina: 'estrutural' }) })).toThrow();
    expect(() => s.exec({ type: 'upsertColumnType', columnType: t({ camadas: [{ function: 'finish1', materialId: 'mat_reboco', thickness: 0, wraps: false }] }) })).toThrow();
    s.exec({ type: 'upsertColumnType', columnType: tipoArq });
    s.exec({ type: 'addColumn', column: makeColumn(novo('a1', { typeId: 'pil_arq_custom', disciplina: 'arquitetonico' })) });
    expect(() => s.exec({ type: 'upsertColumnType', columnType: t({ disciplina: 'estrutural', camadas: undefined }) })).toThrow();
    expect(() => s.exec({ type: 'deleteColumnType', id: 'pil_arq_custom' })).toThrow();
    s.exec({ type: 'deleteElements', ids: ['a1'] });
    s.exec({ type: 'deleteColumnType', id: 'pil_arq_custom' });
    expect(columnTypesOf(s.project).pil_arq_custom).toBeUndefined();
  });
});

describe('transform do pilar (mover, girar 90° e espelhar)', () => {
  it('mover soma o deslocamento; girar 90° em torno da origem leva (1,2) a (−2,1) e soma π/2', () => {
    const s = store();
    s.exec({ type: 'addColumn', column: makeColumn(novo()) });
    s.exec({ type: 'transform', ids: ['c1'], transform: { kind: 'translate', d: { x: 3, y: -1 } } });
    expect(col(s, 'c1').pos).toEqual({ x: 4, y: 1 });
    s.exec({ type: 'transform', ids: ['c1'], transform: { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    expect(col(s, 'c1').pos.x).toBeCloseTo(-1, 12);
    expect(col(s, 'c1').pos.y).toBeCloseTo(4, 12);
    expect(col(s, 'c1').rotation).toBeCloseTo(Math.PI / 2, 12);
    s.undo();
    s.undo();
    expect(col(s, 'c1')).toMatchObject({ pos: { x: 1, y: 2 }, rotation: 0 });
  });

  it('espelhar no eixo x leva (1,2) a (1,−2) e a rotação a −rotação; espelhar duas vezes devolve o original', () => {
    const c = makeColumn(novo('c1', { rotation: 0.3 })) as Column;
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    const m = transformColumn(c, { kind: 'mirror', a, b });
    expect(m.pos).toEqual({ x: 1, y: -2 });
    expect(m.rotation).toBeCloseTo(-0.3, 12);
    const v = transformColumn(m, { kind: 'mirror', a, b });
    expect(v.pos.y).toBeCloseTo(2, 12);
    expect(v.rotation).toBeCloseTo(0.3, 12);
  });

  it('cópia cria o novo pilar com id do mapa e mantém o original; pilar hospedado segue a parede movida', () => {
    const s = store();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: Object.keys(s.project.wallTypes)[0]!, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
    s.exec({ type: 'addColumn', column: makeColumn(novo('a1', { typeId: 'pil_arq_20x20', disciplina: 'arquitetonico', hostWallId: 'w', pos: { x: 2, y: 0 } })) });
    s.exec({ type: 'transform', ids: ['w'], transform: { kind: 'translate', d: { x: 0, y: 4 } } });
    expect(col(s, 'a1').pos).toEqual({ x: 2, y: 4 });
    s.exec({ type: 'transform', ids: ['w', 'a1'], transform: { kind: 'translate', d: { x: 10, y: 0 } }, copy: { idMap: { w: 'w2', a1: 'a2' } } });
    expect(col(s, 'a2')).toMatchObject({ pos: { x: 12, y: 4 }, hostWallId: 'w2' });
    expect(col(s, 'a1')).toMatchObject({ pos: { x: 2, y: 4 }, hostWallId: 'w' });
  });
});
