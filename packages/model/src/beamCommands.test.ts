import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { beamPlanLength, beamTypesOf, DEFAULT_BEAM_TYPES, isBeam, makeBeam, transformBeam } from './beam.ts';
import type { Beam, BeamType } from './estrTypes.ts';

const store = (): ProjectStore => new ProjectStore(createEmptyProject());
const bm = (s: ProjectStore, id: string): Beam => s.project.elements[id] as Beam;
const novo = (id = 'b1', extra: Partial<Beam> = {}): Parameters<typeof makeBeam>[0] => ({ id, typeId: 'vig_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, ...extra });
const tipoAco: BeamType = { id: 'vig_ipe200', name: 'IPE 200', code: 'VA-1', description: '', perfil: { forma: 'I', b: 0.1, h: 0.2, tf: 0.0085, tw: 0.0056 }, materialId: 'mat_aco', cost: 0 };

describe('tipos de viga por leitura (A.3)', () => {
  it('projeto novo lê a viga 15 × 40 de concreto sem gravar o mapa', () => {
    const p = createEmptyProject();
    expect('beamTypes' in p).toBe(false);
    expect(beamTypesOf(p)).toEqual(DEFAULT_BEAM_TYPES);
    expect(beamTypesOf(p).vig_15x40).toMatchObject({ perfil: { forma: 'retangular', b: 0.15, h: 0.4 }, materialId: 'mat_concreto' });
  });

  it('upsert grava o conjunto completo e desfaz; delete recusa tipo em uso', () => {
    const s = store();
    s.exec({ type: 'upsertBeamType', beamType: tipoAco });
    expect(Object.keys(s.project.beamTypes!).sort()).toEqual(['vig_15x40', 'vig_ipe200']);
    s.exec({ type: 'addBeam', beam: makeBeam(novo('b1', { typeId: 'vig_ipe200' })) });
    expect(() => s.exec({ type: 'deleteBeamType', id: 'vig_ipe200' })).toThrow();
    s.exec({ type: 'deleteElements', ids: ['b1'] });
    s.exec({ type: 'deleteBeamType', id: 'vig_ipe200' });
    expect(beamTypesOf(s.project).vig_ipe200).toBeUndefined();
    s.undo();
    expect(beamTypesOf(s.project).vig_ipe200).toBeDefined();
  });

  it('upsert recusa perfil inválido, material inexistente e nome vazio', () => {
    const s = store();
    expect(() => s.exec({ type: 'upsertBeamType', beamType: { ...tipoAco, perfil: { forma: 'I', b: 0.1, h: 0.2, tf: 0.1, tw: 0.005 } } })).toThrow();
    expect(() => s.exec({ type: 'upsertBeamType', beamType: { ...tipoAco, materialId: 'mat_inexistente' } })).toThrow();
    expect(() => s.exec({ type: 'upsertBeamType', beamType: { ...tipoAco, name: ' ' } })).toThrow();
    expect('beamTypes' in s.project).toBe(false);
  });
});

describe('addBeam, updateBeam e setBeamType com desfazer/refazer', () => {
  it('adiciona, desfaz e refaz; o comprimento em planta é 5 (E5)', () => {
    const s = store();
    s.exec({ type: 'addBeam', beam: makeBeam(novo()) });
    expect(isBeam(s.project.elements.b1)).toBe(true);
    expect(bm(s, 'b1')).toMatchObject({ kind: 'beam', alinhamento: 'topo', extremidadeA: 'rigida', extremidadeB: 'rigida', zOffsetA: 0, order: 1 });
    expect(beamPlanLength(bm(s, 'b1'))).toBe(5);
    s.undo();
    expect(s.project.elements.b1).toBeUndefined();
    s.redo();
    expect(bm(s, 'b1').b).toEqual({ x: 5, y: 0 });
  });

  it('atualiza e desfaz; trocar o tipo desfaz e refaz', () => {
    const s = store();
    s.exec({ type: 'upsertBeamType', beamType: tipoAco });
    s.exec({ type: 'addBeam', beam: makeBeam(novo()) });
    s.exec({ type: 'updateBeam', id: 'b1', patch: { zOffsetB: 0.5, alinhamento: 'centro', extremidadeA: 'articulada', rotation: 0.1 } });
    expect(bm(s, 'b1')).toMatchObject({ zOffsetA: 0, zOffsetB: 0.5, alinhamento: 'centro', extremidadeA: 'articulada', rotation: 0.1 });
    s.exec({ type: 'setBeamType', ids: ['b1'], typeId: 'vig_ipe200' });
    expect(bm(s, 'b1').typeId).toBe('vig_ipe200');
    s.undo();
    s.undo();
    expect(bm(s, 'b1')).toMatchObject({ typeId: 'vig_15x40', zOffsetB: 0, alinhamento: 'topo' });
    s.redo();
    s.redo();
    expect(bm(s, 'b1').typeId).toBe('vig_ipe200');
  });

  it('recusa tipo, nível inexistente, eixo menor que 1 mm, valor não finito e opções inválidas', () => {
    const s = store();
    const add = (b: Partial<Beam>): (() => void) => () => s.exec({ type: 'addBeam', beam: makeBeam(novo('x', b)) });
    expect(add({ typeId: 'nao' })).toThrow();
    expect(add({ levelId: 'nao' })).toThrow();
    expect(add({ b: { x: 0.0005, y: 0 } })).toThrow();
    expect(add({ b: { x: 0, y: 0 } })).toThrow();
    expect(add({ zOffsetA: Number.NaN })).toThrow();
    expect(add({ a: { x: Infinity, y: 0 } })).toThrow();
    expect(add({ alinhamento: 'meio' as never })).toThrow();
    expect(add({ extremidadeB: 'solta' as never })).toThrow();
    expect(() => s.exec({ type: 'updateBeam', id: 'nao', patch: {} })).toThrow();
    expect(() => s.exec({ type: 'setBeamType', ids: [], typeId: 'nao' })).toThrow();
    s.exec({ type: 'addBeam', beam: makeBeam(novo()) });
    expect(() => s.exec({ type: 'updateBeam', id: 'b1', patch: { b: { x: 0, y: 0 } } })).toThrow();
    expect(bm(s, 'b1').b).toEqual({ x: 5, y: 0 });
  });
});

describe('transform da viga (mover, girar 90° e espelhar)', () => {
  it('mover e girar 90° em torno da origem levam o eixo; desfazer volta', () => {
    const s = store();
    s.exec({ type: 'addBeam', beam: makeBeam(novo()) });
    s.exec({ type: 'transform', ids: ['b1'], transform: { kind: 'translate', d: { x: 1, y: 1 } } });
    expect(bm(s, 'b1')).toMatchObject({ a: { x: 1, y: 1 }, b: { x: 6, y: 1 } });
    s.exec({ type: 'transform', ids: ['b1'], transform: { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    expect(bm(s, 'b1').a.x).toBeCloseTo(-1, 12);
    expect(bm(s, 'b1').a.y).toBeCloseTo(1, 12);
    expect(bm(s, 'b1').b.x).toBeCloseTo(-1, 12);
    expect(bm(s, 'b1').b.y).toBeCloseTo(6, 12);
    expect(beamPlanLength(bm(s, 'b1'))).toBeCloseTo(5, 12);
    s.undo();
    s.undo();
    expect(bm(s, 'b1')).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 5, y: 0 } });
  });

  it('espelhar inverte o eixo e o sentido do giro; as cotas e o alinhamento ficam', () => {
    const b = makeBeam(novo('b1', { a: { x: 0, y: 1 }, b: { x: 4, y: 3 }, zOffsetA: 0.1, zOffsetB: 0.4, rotation: 0.2 })) as Beam;
    const m = transformBeam(b, { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 1, y: 0 } });
    expect(m).toMatchObject({ a: { x: 0, y: -1 }, b: { x: 4, y: -3 }, zOffsetA: 0.1, zOffsetB: 0.4, rotation: -0.2, alinhamento: 'topo' });
  });

  it('cópia cria a nova viga e mantém a original', () => {
    const s = store();
    s.exec({ type: 'addBeam', beam: makeBeam(novo()) });
    s.exec({ type: 'transform', ids: ['b1'], transform: { kind: 'translate', d: { x: 0, y: 3 } }, copy: { idMap: { b1: 'b2' } } });
    expect(bm(s, 'b1').a).toEqual({ x: 0, y: 0 });
    expect(bm(s, 'b2')).toMatchObject({ a: { x: 0, y: 3 }, b: { x: 5, y: 3 }, id: 'b2' });
    expect(bm(s, 'b2').order).toBeGreaterThan(bm(s, 'b1').order);
  });
});
