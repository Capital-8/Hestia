import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, type Component, type Project } from '@hestia/model';
import { armarArrasto3d, idsDoArrasto, selecaoAoArmar, textoStatusArrasto } from './arrastoComponente3d.ts';

function componente(id: string, extras: Partial<Component> = {}): Component {
  return {
    id,
    kind: 'component',
    familyId: 'f',
    typeId: null,
    levelId: 'lv_0',
    order: 1,
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    mirrored: false,
    mark: id,
    ...extras,
  };
}

function projetoComGrupo(): Project {
  const p = createEmptyProject();
  p.elements.a = componente('a', { groupId: 'g1' });
  p.elements.b = componente('b', { groupId: 'g1' });
  p.elements.c = componente('c', { groupId: 'g1' });
  p.elements.solto = componente('solto');
  p.componentGroups = { g1: { id: 'g1', nome: 'Conjunto', levelId: 'lv_0', membros: ['a', 'b', 'c'] } };
  return p;
}

describe('arrastoComponente3d', () => {
  it('idsDoArrasto devolve o grupo inteiro, com o clicado primeiro, ou só o componente solto', () => {
    const p = projetoComGrupo();
    expect(idsDoArrasto(p, 'b')).toEqual(['b', 'a', 'c']);
    expect(idsDoArrasto(p, 'solto')).toEqual(['solto']);
  });

  it('selecaoAoArmar mantém a seleção quando o componente já está nela e seleciona o grupo quando não está', () => {
    expect(selecaoAoArmar(['a'], 'a', ['a', 'b', 'c'])).toEqual(['a']);
    expect(selecaoAoArmar(['x'], 'a', ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('textoStatusArrasto mostra a parede, o vizinho pela marca (ou id) e a colisão', () => {
    const p = projetoComGrupo();
    expect(textoStatusArrasto(p, { parede: 0, colisoes: [] })).toBe('Encaixado na parede');
    expect(textoStatusArrasto(p, { vizinho: 'a', colisoes: [] })).toBe('Colado em a');
    expect(textoStatusArrasto(p, { colisoes: ['b'] })).toBe('Colide com b');
    expect(textoStatusArrasto(p, { colisoes: [] })).toBe('');
  });

  it('não arma o arrasto sobre um elemento que não é componente', () => {
    const p = createEmptyProject();
    p.elements.w1 = { ...makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 2, y: 0 } }), order: 1 };
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    expect(armarArrasto3d({ projeto: p, id: 'w1', camera, ndc: { x: 0, y: 0 }, selecao: [] })).toBeNull();
  });
});
