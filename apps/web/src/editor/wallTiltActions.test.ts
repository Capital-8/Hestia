import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore, type Wall } from '@hestia/model';
import { grauDeRad, inclinarParedes, radDeGrau, TILT_MAX_RAD } from './wallTiltActions.ts';

/** Projeto com duas paredes paralelas no nível térreo (ids w1 e w2), sem inclinação. */
const comDuasParedes = (): ProjectStore => {
  const p = createEmptyProject('vazio');
  const store = new ProjectStore(p);
  const typeId = p.defaults.wallTypeId;
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId, levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 4, y: 3 } }) });
  return store;
};

const tiltOf = (store: ProjectStore, id: string): number | undefined => (store.project.elements[id] as Wall).tilt;

describe('inclinarParedes (comando compartilhado pelo campo, pelo diálogo Inclinar e pela aba)', () => {
  it('o valor do campo de ângulo (radianos) vira a inclinação em graus gravada: 15° grava 15', () => {
    const store = comDuasParedes();
    const erro = inclinarParedes(store, ['w1', 'w2'], grauDeRad(radDeGrau(15)));
    expect(erro).toBeNull();
    expect(tiltOf(store, 'w1')).toBe(15);
    expect(tiltOf(store, 'w2')).toBe(15);
  });

  it('seleção múltipla: aplica a todas e um único desfazer desfaz o conjunto', () => {
    const store = comDuasParedes();
    inclinarParedes(store, ['w1', 'w2'], -20);
    store.undo();
    expect(tiltOf(store, 'w1')).toBeUndefined();
    expect(tiltOf(store, 'w2')).toBeUndefined();
  });

  it('ignora o que não é parede; a seleção sem parede devolve o aviso e não grava nada', () => {
    const store = comDuasParedes();
    expect(inclinarParedes(store, ['w1', 'nao_existe'], 10)).toBeNull();
    expect(tiltOf(store, 'w1')).toBe(10);
    const vazio = comDuasParedes();
    const motivo = inclinarParedes(vazio, ['nao_existe'], 10);
    expect(typeof motivo).toBe('string');
    expect(tiltOf(vazio, 'w1')).toBeUndefined();
  });

  it('recusa do modelo (acima de 60°) volta o motivo traduzido e nenhuma parede muda', () => {
    const store = comDuasParedes();
    const motivo = inclinarParedes(store, ['w1', 'w2'], 61);
    expect(motivo).toContain('60');
    expect(tiltOf(store, 'w1')).toBeUndefined();
    expect(tiltOf(store, 'w2')).toBeUndefined();
  });

  it('tilt 0 remove a inclinação (volta vertical)', () => {
    const store = comDuasParedes();
    inclinarParedes(store, ['w1'], 12);
    expect(inclinarParedes(store, ['w1'], 0)).toBeNull();
    expect(tiltOf(store, 'w1')).toBeUndefined();
  });

  it('o limite do campo é o do modelo: ±60°', () => {
    expect(grauDeRad(TILT_MAX_RAD)).toBe(60);
  });
});
