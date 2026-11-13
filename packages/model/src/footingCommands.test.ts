import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import type { Footing, FootingType } from './estrTypes.ts';
import { DEFAULT_FOOTING_TYPES, footingTypesOf, isFooting, makeFooting, transformFooting } from './footing.ts';
import { makeWall } from './wall.ts';

const store = (): ProjectStore => new ProjectStore(createEmptyProject());
const ft = (s: ProjectStore, id: string): Footing => s.project.elements[id] as Footing;
const iso = (id = 'f1', extra: Partial<Footing> = {}): Parameters<typeof makeFooting>[0] => ({ id, typeId: 'sap_80x80x30', levelId: 'lv_0', pos: { x: 1, y: 2 }, ...extra });
const corr = (id = 'f2', extra: Partial<Footing> = {}): Parameters<typeof makeFooting>[0] => ({ id, typeId: 'bal_40x30', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, ...extra });
const estaca: FootingType = { id: 'est_d30', name: 'Estaca Ø30', code: 'E-30', description: '', modo: 'isolada', forma: 'estaca', base: { forma: 'circular', d: 0.3 }, alturaBase: 8, materialId: 'mat_concreto', cost: 0 };

describe('tipos de fundação por leitura (A.3)', () => {
  it('projeto novo lê a sapata isolada com pescoço (E7) e o baldrame (E8) sem gravar o mapa', () => {
    const p = createEmptyProject();
    expect('footingTypes' in p).toBe(false);
    expect(footingTypesOf(p)).toEqual(DEFAULT_FOOTING_TYPES);
    expect(footingTypesOf(p).sap_80x80x30).toMatchObject({ modo: 'isolada', base: { forma: 'retangular', b: 0.8, h: 0.8 }, alturaBase: 0.3, pescoco: { forma: 'retangular', b: 0.25, h: 0.25 }, alturaPescoco: 0.5 });
    expect(footingTypesOf(p).bal_40x30).toMatchObject({ modo: 'corrida', base: { forma: 'retangular', b: 0.4, h: 0.3 } });
  });

  it('upsert aceita estaca com tubo circular, grava o conjunto completo e desfaz', () => {
    const s = store();
    s.exec({ type: 'upsertFootingType', footingType: { ...estaca, base: { forma: 'tuboCircular', d: 0.4, t: 0.05 } } });
    expect(Object.keys(s.project.footingTypes!).sort()).toEqual(['bal_40x30', 'est_d30', 'sap_80x80x30']);
    s.undo();
    expect('footingTypes' in s.project).toBe(false);
  });

  it('upsert recusa as combinações inválidas de modo, forma, base e pescoço', () => {
    const s = store();
    const bad = (x: Partial<FootingType>): void => expect(() => s.exec({ type: 'upsertFootingType', footingType: { ...estaca, ...x } })).toThrow();
    bad({ modo: 'corrida' });
    bad({ forma: 'tubulao' as never });
    bad({ base: { forma: 'retangular', b: 0.3, h: 0.3 } });
    bad({ forma: 'sapata', modo: 'corrida', base: { forma: 'circular', d: 0.3 } });
    bad({ forma: 'sapata', base: { forma: 'tuboCircular', d: 0.3, t: 0.03 } });
    bad({ alturaBase: 0 });
    bad({ pescoco: { forma: 'circular', d: 0.2 }, alturaPescoco: 0.3 });
    bad({ forma: 'sapata', base: { forma: 'retangular', b: 1, h: 1 }, pescoco: { forma: 'circular', d: 0.2 } });
    bad({ forma: 'sapata', base: { forma: 'retangular', b: 1, h: 1 }, pescoco: { forma: 'I', b: 0.2, h: 0.2, tf: 0.01, tw: 0.01 }, alturaPescoco: 0.3 });
    bad({ base: { forma: 'circular', d: -1 } });
    bad({ materialId: 'mat_inexistente' });
    expect('footingTypes' in s.project).toBe(false);
  });

  it('tipo em uso não muda de modo nem é apagado', () => {
    const s = store();
    s.exec({ type: 'addFooting', footing: makeFooting(iso()) });
    expect(() => s.exec({ type: 'upsertFootingType', footingType: { ...DEFAULT_FOOTING_TYPES.sap_80x80x30!, modo: 'corrida', pescoco: undefined, alturaPescoco: undefined } })).toThrow();
    expect(() => s.exec({ type: 'deleteFootingType', id: 'sap_80x80x30' })).toThrow();
  });
});

describe('addFooting, updateFooting e setFootingType com desfazer/refazer', () => {
  it('adiciona isolada e corrida; desfaz e refaz', () => {
    const s = store();
    s.exec({ type: 'addFooting', footing: makeFooting(iso()) });
    s.exec({ type: 'addFooting', footing: makeFooting(corr()) });
    expect(isFooting(s.project.elements.f1)).toBe(true);
    expect(ft(s, 'f1')).toMatchObject({ kind: 'footing', pos: { x: 1, y: 2 }, topOffset: 0, rotation: 0, order: 1 });
    expect(ft(s, 'f2')).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 6, y: 0 } });
    s.undo();
    expect(s.project.elements.f2).toBeUndefined();
    s.redo();
    expect(ft(s, 'f2').b).toEqual({ x: 6, y: 0 });
  });

  it('atualiza o topo e hospeda a corrida numa parede; desfaz e refaz', () => {
    const s = store();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: Object.keys(s.project.wallTypes)[0]!, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
    s.exec({ type: 'addFooting', footing: makeFooting(corr('f2', { hostWallId: 'w', topOffset: -0.1 })) });
    s.exec({ type: 'updateFooting', id: 'f2', patch: { topOffset: -0.3 } });
    expect(ft(s, 'f2')).toMatchObject({ topOffset: -0.3, hostWallId: 'w' });
    s.undo();
    expect(ft(s, 'f2').topOffset).toBe(-0.1);
    s.redo();
    expect(ft(s, 'f2').topOffset).toBe(-0.3);
  });

  it('setFootingType troca o tipo entre fundações do mesmo modo e recusa troca de modo', () => {
    const s = store();
    s.exec({ type: 'upsertFootingType', footingType: estaca });
    s.exec({ type: 'addFooting', footing: makeFooting(iso()) });
    s.exec({ type: 'setFootingType', ids: ['f1'], typeId: 'est_d30' });
    expect(ft(s, 'f1').typeId).toBe('est_d30');
    expect(() => s.exec({ type: 'setFootingType', ids: ['f1'], typeId: 'bal_40x30' })).toThrow();
    expect(() => s.exec({ type: 'setFootingType', ids: ['f1'], typeId: 'nao' })).toThrow();
    s.undo();
    expect(ft(s, 'f1').typeId).toBe('sap_80x80x30');
  });

  it('recusa: tipo, nível ou parede inexistentes; isolada sem posição ou com eixo; corrida sem eixo, curta ou com posição; valores não finitos', () => {
    const s = store();
    const add = (f: Parameters<typeof makeFooting>[0]): (() => void) => () => s.exec({ type: 'addFooting', footing: makeFooting(f) });
    expect(add(iso('x', { typeId: 'nao' }))).toThrow();
    expect(add(iso('x', { levelId: 'nao' }))).toThrow();
    expect(add(iso('x', { hostWallId: 'nao' }))).toThrow();
    expect(add({ id: 'x', typeId: 'sap_80x80x30', levelId: 'lv_0' })).toThrow();
    expect(add(iso('x', { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }))).toThrow();
    expect(add({ id: 'x', typeId: 'bal_40x30', levelId: 'lv_0' })).toThrow();
    expect(add(corr('x', { b: { x: 0.0005, y: 0 } }))).toThrow();
    expect(add(corr('x', { pos: { x: 0, y: 0 } }))).toThrow();
    expect(add(iso('x', { topOffset: Number.NaN }))).toThrow();
    expect(add(iso('x', { pos: { x: Infinity, y: 0 } }))).toThrow();
    expect(() => s.exec({ type: 'updateFooting', id: 'nao', patch: {} })).toThrow();
    expect(Object.keys(s.project.elements)).toHaveLength(0);
  });
});

describe('transform da fundação (mover, girar 90° e espelhar)', () => {
  it('isolada: mover, girar 90° e espelhar levam posição e rotação; desfazer volta', () => {
    const s = store();
    s.exec({ type: 'addFooting', footing: makeFooting(iso()) });
    s.exec({ type: 'transform', ids: ['f1'], transform: { kind: 'translate', d: { x: 2, y: 0 } } });
    expect(ft(s, 'f1').pos).toEqual({ x: 3, y: 2 });
    s.exec({ type: 'transform', ids: ['f1'], transform: { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    expect(ft(s, 'f1').pos!.x).toBeCloseTo(-2, 12);
    expect(ft(s, 'f1').pos!.y).toBeCloseTo(3, 12);
    expect(ft(s, 'f1').rotation).toBeCloseTo(Math.PI / 2, 12);
    s.undo();
    s.undo();
    expect(ft(s, 'f1')).toMatchObject({ pos: { x: 1, y: 2 }, rotation: 0 });
    const m = transformFooting(ft(s, 'f1'), { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    expect(m.pos).toEqual({ x: 1, y: -2 });
  });

  it('corrida: o eixo acompanha; a corrida hospedada segue a parede e a cópia remapeia a parede', () => {
    const s = store();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: Object.keys(s.project.wallTypes)[0]!, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
    s.exec({ type: 'addFooting', footing: makeFooting(corr('f2', { hostWallId: 'w' })) });
    s.exec({ type: 'transform', ids: ['w'], transform: { kind: 'translate', d: { x: 0, y: 2 } } });
    expect(ft(s, 'f2')).toMatchObject({ a: { x: 0, y: 2 }, b: { x: 6, y: 2 } });
    s.exec({ type: 'transform', ids: ['w', 'f2'], transform: { kind: 'translate', d: { x: 0, y: 5 } }, copy: { idMap: { w: 'w2', f2: 'f3' } } });
    expect(ft(s, 'f3')).toMatchObject({ a: { x: 0, y: 7 }, hostWallId: 'w2' });
    expect(ft(s, 'f2')).toMatchObject({ a: { x: 0, y: 2 }, hostWallId: 'w' });
  });
});
