import { afterEach, describe, expect, it } from 'vitest';
import { buildTemplate, makeGuardaCorpo, type Project } from '@hestia/model';
import { useUi } from './state.ts';
import { categoryIdsOf, visibilityOf } from './viewVisibility.ts';

afterEach(() => useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, sectionId: null, viewTemp: {}, selection: [] }));

/** Projeto-modelo com um guarda-corpo manual no primeiro pavimento; devolve o projeto, o nível e o id do guarda-corpo. */
function comGuardaCorpo(): { p: Project; levelId: string; gid: string; wallId: string } {
  const p = structuredClone(buildTemplate('house2'));
  const level = p.levels[0]!;
  const typeId = Object.keys(p.tiposGuardaCorpo)[0]!;
  const gid = 'gc_vis';
  p.elements[gid] = {
    ...makeGuardaCorpo({
      id: gid,
      levelId: level.id,
      typeId,
      hospedeiro: { tipo: 'manual', uso: 'livre', caminho: [{ x: 0, y: 0, dz: 0 }, { x: 3, y: 0, dz: 0 }], fechado: false, ladoDeslocamento: 'esquerdo' },
    }),
    order: 999,
  };
  const wallId = Object.values(p.elements).find((e) => e.kind === 'wall')!.id;
  return { p, levelId: level.id, gid, wallId };
}

describe('visibilidade do guarda-corpo: categoria e elemento (Fase 6c)', () => {
  it('a categoria railing reúne os guarda-corpos e não as paredes', () => {
    const { p, gid, wallId } = comGuardaCorpo();
    expect(categoryIdsOf(p, ['railing'])).toEqual([gid]);
    expect(categoryIdsOf(p, ['railing'])).not.toContain(wallId);
  });

  it('ocultar a categoria railing na vista esconde os guarda-corpos e deixa as paredes', () => {
    const { p, levelId, gid, wallId } = comGuardaCorpo();
    p.levels[0]!.hidden = { categories: ['railing'] };
    useUi.setState({ view: 'plan', planKind: 'floor', levelId, viewTemp: {} });
    const v = visibilityOf(p, useUi.getState());
    expect(v.hidden.has(gid)).toBe(true);
    expect(v.hidden.has(wallId)).toBe(false);
  });

  it('ocultar um guarda-corpo por elemento esconde só ele', () => {
    const { p, levelId, gid, wallId } = comGuardaCorpo();
    p.levels[0]!.hidden = { elements: [gid] };
    useUi.setState({ view: 'plan', planKind: 'floor', levelId, viewTemp: {} });
    const v = visibilityOf(p, useUi.getState());
    expect(v.hidden.has(gid)).toBe(true);
    expect(v.hidden.has(wallId)).toBe(false);
  });

  it('isolar um guarda-corpo deixa só ele visível', () => {
    const { p, levelId, gid, wallId } = comGuardaCorpo();
    useUi.setState({ view: 'plan', planKind: 'floor', levelId, viewTemp: { [`plan:${levelId}`]: { isolated: { elements: [gid] } } } });
    const v = visibilityOf(p, useUi.getState());
    expect(v.hidden.has(gid)).toBe(false);
    expect(v.hidden.has(wallId)).toBe(true);
  });

  it('isolar a categoria railing deixa visíveis todos os guarda-corpos e some com o resto', () => {
    const { p, levelId, gid, wallId } = comGuardaCorpo();
    useUi.setState({ view: 'plan', planKind: 'floor', levelId, viewTemp: { [`plan:${levelId}`]: { isolated: { categories: ['railing'] } } } });
    const v = visibilityOf(p, useUi.getState());
    expect(v.hidden.has(gid)).toBe(false);
    expect(v.hidden.has(wallId)).toBe(true);
  });

  it('o revelar mostra os guarda-corpos ocultos pela categoria, com borda', () => {
    const { p, levelId, gid } = comGuardaCorpo();
    p.levels[0]!.hidden = { categories: ['railing'] };
    useUi.setState({ view: 'plan', planKind: 'floor', levelId, viewTemp: { [`plan:${levelId}`]: { reveal: true } } });
    const v = visibilityOf(p, useUi.getState());
    expect(v.hidden.has(gid)).toBe(false);
    expect(v.revealed.has(gid)).toBe(true);
  });
});
