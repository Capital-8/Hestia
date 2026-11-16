import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Wall } from '@hestia/model';
import { acompanharInclinacao, definirTransicaoDaCadeia } from './wallTiltActions.ts';

const loja = (): ProjectStore => {
  const p = createEmptyProject('c');
  const s = new ProjectStore(p);
  const w = (id: string, a: number, b: number, tilt: number) => s.exec({ type: 'addWall', wall: makeWall({ id, typeId: p.defaults.wallTypeId, levelId: 'lv_0', a: { x: a, y: 0 }, b: { x: b, y: 0 }, tilt }) });
  w('A', 0, 4, -20); w('B', 8, 4, 15); w('C', 8, 12, -10);
  return s;
};
const tilt = (s: ProjectStore, id: string) => (s.project.elements[id] as Wall).tilt ?? 0;

describe('ações da cadeia (etapa R)', () => {
  it('Acompanhar inclinação: A=-20 vale para a cadeia, com a do meio invertida (b→a) em +20; um desfazer', () => {
    const s = loja();
    expect(acompanharInclinacao(s, ['A'])).toBeNull();
    expect([tilt(s, 'A'), tilt(s, 'B'), tilt(s, 'C')]).toEqual([-20, 20, -20]);
    s.undo();
    expect([tilt(s, 'A'), tilt(s, 'B'), tilt(s, 'C')]).toEqual([-20, 15, -10]);
  });
  it('Cunha: marca as duas junções num desfazer e volta a degrau', () => {
    const s = loja();
    expect(definirTransicaoDaCadeia(s, ['A'], true)).toBeNull();
    expect((s.project.elements.A as Wall).joinEnd.transicao).toBe('cunha');
    s.undo();
    expect((s.project.elements.A as Wall).joinEnd.transicao).toBeUndefined();
    definirTransicaoDaCadeia(s, ['A'], true);
    definirTransicaoDaCadeia(s, ['A'], false);
    expect((s.project.elements.A as Wall).joinEnd.transicao).toBeUndefined();
  });
  it('parede isolada: Cunha devolve aviso e nada muda', () => {
    const p = createEmptyProject('c');
    const s = new ProjectStore(p);
    s.exec({ type: 'addWall', wall: makeWall({ id: 'Z', typeId: p.defaults.wallTypeId, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }) });
    expect(definirTransicaoDaCadeia(s, ['Z'], true)).toEqual(expect.any(String));
  });
});
