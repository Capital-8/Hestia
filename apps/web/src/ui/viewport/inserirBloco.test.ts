import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, isComponent, makeWall, ProjectStore } from '@hestia/model';
import { useUi } from '../../editor/state.ts';
import {
  cancelarInsercaoBloco,
  confirmarInsercaoBloco,
  girarInsercaoBloco,
  iniciarInsercaoBloco,
  moverInsercaoBloco,
  useInsercaoBloco,
} from './inserirBloco.ts';

function setupComParede() {
  const base = createEmptyProject();
  const store = new ProjectStore(base);
  const levelId = store.project.levels[0]!.id;
  store.exec({
    type: 'addWall',
    wall: makeWall({
      id: 'w1',
      typeId: Object.keys(store.project.wallTypes)[0]!,
      levelId,
      a: { x: 0, y: 2 },
      b: { x: 4, y: 2 },
    }),
  });
  useUi.setState({ levelId, selection: [], view: '3d' });
  return store;
}

describe('inserirBloco (inserção ao vivo da biblioteca)', () => {
  beforeEach(() => {
    cancelarInsercaoBloco();
  });

  it('inicia da biblioteca sem gravar ainda no store, move com snap de parede e confirma em 1 transação', () => {
    const store = setupComParede();
    expect(iniciarInsercaoBloco('fam_comoda', 'arrasto', store)).toBe(true);
    expect(store.project.componentFamilies?.fam_comoda).toBeUndefined();

    // Move próximo à face sul da parede (y = 2.0) com câmera no lado sul (y = -1)
    const mov = moverInsercaoBloco(
      { x: 2, y: 1.55 },
      { semEncaixe: false, cameraPos: { x: 2, y: -1 } },
    )!;
    expect(mov.paredeSnap).toBeDefined();

    const id = confirmarInsercaoBloco(false, store);
    expect(id).not.toBeNull();
    expect(useInsercaoBloco.getState().ativo).toBeNull();
    expect(store.project.componentFamilies?.fam_comoda).toBeDefined();
    expect(store.project.componentFamilies?.fam_gaveta).toBeDefined();
    expect(isComponent(store.project.elements[id!])).toBe(true);
    expect(useUi.getState().selection).toEqual([id]);
  });

  it('gira 90° em espaço livre e mantém cópia ativa quando manterAtivo=true', () => {
    const store = setupComParede();
    iniciarInsercaoBloco('fam_comoda', 'clique', store);
    moverInsercaoBloco({ x: 1, y: 0 }, { semEncaixe: true });
    girarInsercaoBloco(Math.PI / 2);
    expect(useInsercaoBloco.getState().ativo?.rascunho.rotation).toBeCloseTo(Math.PI / 2, 6);

    const id1 = confirmarInsercaoBloco(true, store);
    expect(id1).not.toBeNull();
    const ativo = useInsercaoBloco.getState().ativo;
    expect(ativo).not.toBeNull();
    expect(ativo!.outros.some((c) => c.id === id1)).toBe(true);

    cancelarInsercaoBloco();
    expect(useInsercaoBloco.getState().ativo).toBeNull();
  });
});
