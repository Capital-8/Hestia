import { afterEach, describe, expect, it } from 'vitest';
import { makeGuardaCorpo, makeStair, type GuardaCorpo, type Id, type Project } from '@hestia/model';
import { makeEnv } from './testEnv.ts';
import { pickRailingAt, railingPolylines, setRailingPlanShapes } from './railingPick.ts';
import { idsOfType, selectedTypeId } from './selectionFilters.ts';

afterEach(() => setRailingPlanShapes(() => []));

/** Adiciona um guarda-corpo manual (0,0)-(4,0) no nível lv_0 e devolve o id. */
function comManual(store: { project: Project; exec: (c: never) => void }, id = 'gc_pick'): Id {
  const typeId = Object.keys(store.project.tiposGuardaCorpo)[0]!;
  const g = makeGuardaCorpo({
    id,
    levelId: 'lv_0',
    typeId,
    hospedeiro: { tipo: 'manual', uso: 'livre', caminho: [{ x: 0, y: 0, dz: 0 }, { x: 4, y: 0, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' },
  });
  store.exec({ type: 'addGuardaCorpo', guardaCorpo: g } as never);
  return id;
}

describe('seleção de guarda-corpo na planta (Fase 6c: visibilidade e seleção)', () => {
  it('acha o caminho manual pelo clique na linha e ignora o que está longe', () => {
    const { store } = makeEnv();
    const id = comManual(store);
    expect(pickRailingAt(store.project, 'lv_0', { x: 2, y: 0.001 }, 0.01)).toBe(id);
    expect(pickRailingAt(store.project, 'lv_0', { x: 2, y: 1 }, 0.01)).toBeNull();
  });

  it('oculto na vista não é alvo; outro nível também não', () => {
    const { store } = makeEnv();
    const id = comManual(store);
    expect(pickRailingAt(store.project, 'lv_0', { x: 2, y: 0 }, 0.01, new Set([id]))).toBeNull();
    expect(pickRailingAt(store.project, 'lv_outro', { x: 2, y: 0 }, 0.01)).toBeNull();
  });

  it('caminho fechado ganha o segmento de volta ao primeiro vértice', () => {
    const { store } = makeEnv();
    const id = comManual(store);
    const g = store.project.elements[id] as GuardaCorpo;
    const fechado = { ...g, hospedeiro: { tipo: 'manual' as const, uso: 'livre' as const, caminho: [{ x: 0, y: 0, dz: 0 }, { x: 4, y: 0, dz: 0 }, { x: 4, y: 3, dz: 0 }], fechado: true, ladoDeslocamento: 'esquerdo' as const } } as GuardaCorpo;
    expect(railingPolylines(store.project, fechado)[0]).toHaveLength(4);
  });

  it('o mesmo tipo neste pavimento inclui guarda-corpos, e a seleção por tipo os reconhece', () => {
    const { store } = makeEnv();
    const id = comManual(store);
    const typeId = (store.project.elements[id] as GuardaCorpo).typeId;
    expect(idsOfType(store.project, 'lv_0', typeId)).toContain(id);
    expect(idsOfType(store.project, 'lv_outro', typeId)).not.toContain(id);
    expect(selectedTypeId(store.project, [id])).toEqual({ typeId });
  });

  it('guarda-corpo hospedado só se acha quando a fonte de polilinhas (fases 3 e 4) existe', () => {
    const { store } = makeEnv();
    const typeId = Object.keys(store.project.stairTypes)[0]!;
    const stair = makeStair({ id: 'st_pick', typeId, levelId: 'lv_0', topLevelId: null, baseOffset: 0, topOffset: 0, height: 2.8 });
    store.exec({ type: 'addStair', stair } as never);
    const gid = 'gc_host';
    store.exec({
      type: 'addGuardaCorpo',
      guardaCorpo: makeGuardaCorpo({
        id: gid,
        levelId: 'lv_0',
        typeId: Object.keys(store.project.tiposGuardaCorpo)[0]!,
        hospedeiro: { tipo: 'escada', escadaId: 'st_pick', lados: { esquerdo: { lance: true, patamar: true }, direito: { lance: true, patamar: true } }, posicaoBase: 'degrau' },
      }),
    } as never);
    expect(pickRailingAt(store.project, 'lv_0', { x: 1, y: 1 }, 0.01)).toBeNull();
    setRailingPlanShapes((_p, g) => (g.id === gid ? [[{ x: 0, y: 1 }, { x: 2, y: 1 }]] : []));
    expect(pickRailingAt(store.project, 'lv_0', { x: 1, y: 1 }, 0.01)).toBe(gid);
  });
});
