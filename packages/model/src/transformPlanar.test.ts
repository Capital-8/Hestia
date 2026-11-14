import { describe, expect, it } from 'vitest';
import type { Transform } from '@hestia/geom';
import { makeFloor } from './floor.ts';
import { makeSlab } from './slab.ts';
import { semOrigemMassa, transformFloor, transformSlab } from './transformPlanar.ts';
import type { Floor, OrigemMassa, Slab } from './types.ts';

const quadrado: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

const origem = { massaId: 'm1', nivelId: 'lv_a' };

/** Piso gerado pela massa: traz `origemMassa`. */
const pisoGerado = (): Floor => ({ ...makeFloor({ id: 'f1', typeId: 'ft_x', levelId: 'lv_a', boundary: quadrado }), origemMassa: origem, order: 0 });
/** Laje gerada pela massa: traz `origemMassa`. */
const lajeGerada = (): Slab => ({ ...makeSlab({ id: 's1', typeId: 'ls_x', levelId: 'lv_a', boundary: quadrado }), origemMassa: origem, order: 0 });

const transformacoes: Array<[string, Transform]> = [
  ['mover', { kind: 'translate', d: { x: 2, y: 1 } }],
  ['girar', { kind: 'rotate', about: { x: 0, y: 0 }, angle: Math.PI / 2 }],
  ['espelhar', { kind: 'mirror', a: { x: 0, y: 0 }, b: { x: 0, y: 1 } }],
];

describe('transformações planares: origemMassa (ficha D2, emenda E16 item 3)', () => {
  it.each(transformacoes)('piso gerado: %s sem cópia mantém origemMassa', (_nome, t) => {
    expect(transformFloor(pisoGerado(), t).origemMassa).toEqual(origem);
    expect(transformFloor(pisoGerado(), t, false).origemMassa).toEqual(origem);
  });

  it.each(transformacoes)('laje gerada: %s sem cópia mantém origemMassa', (_nome, t) => {
    expect(transformSlab(lajeGerada(), t).origemMassa).toEqual(origem);
    expect(transformSlab(lajeGerada(), t, false).origemMassa).toEqual(origem);
  });

  it.each(transformacoes)('piso gerado: %s em cópia não carrega origemMassa, e o resto do piso vem igual', (_nome, t) => {
    const copia = transformFloor(pisoGerado(), t, true);
    expect('origemMassa' in copia).toBe(false);
    expect(copia.levelId).toBe('lv_a');
    expect(copia.boundary).toHaveLength(4);
  });

  it.each(transformacoes)('laje gerada: %s em cópia não carrega origemMassa', (_nome, t) => {
    const copia = transformSlab(lajeGerada(), t, true);
    expect('origemMassa' in copia).toBe(false);
    expect(copia.levelId).toBe('lv_a');
  });

  it('piso ou laje sem origemMassa continua igual em cópia (sem campo novo)', () => {
    const comum: Floor = { ...makeFloor({ id: 'c', typeId: 'ft_x', levelId: 'lv_a', boundary: quadrado }), order: 0 };
    expect('origemMassa' in transformFloor(comum, { kind: 'translate', d: { x: 1, y: 0 } }, true)).toBe(false);
  });

  it('semOrigemMassa devolve o próprio objeto quando não há o campo e tira o campo quando há', () => {
    const comum: { id: string; origemMassa?: OrigemMassa } = { id: 'x' };
    expect(semOrigemMassa(comum)).toBe(comum);
    const com = { id: 'y', origemMassa: origem };
    expect(semOrigemMassa(com)).toEqual({ id: 'y' });
    expect('origemMassa' in semOrigemMassa(com)).toBe(false);
  });
});
