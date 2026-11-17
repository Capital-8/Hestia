import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore, validateProject } from './index.ts';

const sobreposicoes = (s: ProjectStore): number => validateProject(s.project).filter((i) => i.code === 'wall-overlap').length;

/** Duas paredes colineares iguais no térreo, com a faixa de cota de cada uma dada. */
function dupla(a: object, b: object): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const tipo = Object.keys(s.project.wallTypes)[0]!;
  const nivel = s.project.levels[0]!.id;
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: tipo, levelId: nivel, a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, ...a }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: tipo, levelId: nivel, a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, ...b }) });
  return s;
}

describe('sobreposição de paredes colineares (C14) considera a faixa de cota', () => {
  it('paredes iguais na mesma faixa: aviso (como sempre)', () => {
    expect(sobreposicoes(dupla({}, {}))).toBe(1);
  });
  it('paredes empilhadas (0 a 1,5 e 1,5 a 3): sem aviso', () => {
    expect(sobreposicoes(dupla({ height: 1.5 }, { baseOffset: 1.5, height: 1.5 }))).toBe(0);
  });
  it('faixas que se cruzam (0 a 2 e 1,5 a 3,5): aviso', () => {
    expect(sobreposicoes(dupla({ height: 2 }, { baseOffset: 1.5, height: 2 }))).toBe(1);
  });
});
