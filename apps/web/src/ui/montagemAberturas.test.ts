import { describe, expect, it } from 'vitest';
import type { ResolvedLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeLevel, makeWall, memoSemEsquadrias, type Id, type Opening, type Project } from '@hestia/model';
import type { Scene3DOptions } from '@hestia/render';
import { Montagem3dProgressiva, edicaoSoDeEsquadrias, type CenaMontagem } from './montagem3dProgressiva.ts';

const OPT: Scene3DOptions = { edges: false, shadows: false, dark: false };
const janela = (id: string, hostId: string, offset: number): Opening => ({ id, kind: 'window', typeId: 'ot_j120', hostId, offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' });

function projeto(): Project {
  const s = new ProjectStore(createEmptyProject('t'));
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'P2', elevation: 3 }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w0', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_1', a: { x: 0, y: 0 }, b: { x: 5, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: janela('j0', 'w1', 2) });
  return s.project;
}

const edita = (p: Project, cmd: Parameters<ProjectStore['exec']>[0]): Project => {
  const s = new ProjectStore(p);
  s.exec(cmd);
  return s.project;
};

describe('edicaoSoDeEsquadrias', () => {
  it('reconhece janela apagada, movida e criada, com o nível e a parede hospedeira', () => {
    const p = projeto();
    expect(edicaoSoDeEsquadrias(p, edita(p, { type: 'deleteElements', ids: ['j0'] }))).toEqual({ nivel: 'lv_1', paredes: ['w1'] });
    expect(edicaoSoDeEsquadrias(p, edita(p, { type: 'updateElements', ids: ['j0'], patch: { offset: 3 } }))).toEqual({ nivel: 'lv_1', paredes: ['w1'] });
    expect(edicaoSoDeEsquadrias(p, edita(p, { type: 'addOpening', opening: janela('j9', 'w1', 4) }))).toEqual({ nivel: 'lv_1', paredes: ['w1'] });
  });

  it('recusa qualquer edição que não seja só de esquadrias', () => {
    const p = projeto();
    expect(edicaoSoDeEsquadrias(p, edita(p, { type: 'updateElements', ids: ['w1'], patch: { heightOffset: 0.1 } }))).toBeNull();
    expect(edicaoSoDeEsquadrias(p, edita(p, { type: 'deleteElements', ids: ['w1'] }))).toBeNull();
    expect(edicaoSoDeEsquadrias(p, { ...p, wallTypes: { ...p.wallTypes } })).toBeNull();
    expect(edicaoSoDeEsquadrias(p, p)).toBeNull();
  });
});

describe('Montagem3dProgressiva: edição de esquadria', () => {
  function monta(aceita: boolean): { m: Montagem3dProgressiva; rapidas: Array<{ nivel: Id; paredes: readonly Id[] }>; updates: number[]; resolvidos: Id[] } {
    const rapidas: Array<{ nivel: Id; paredes: readonly Id[] }> = [];
    const updates: number[] = [];
    const resolvidos: Id[] = [];
    const nivel = (id: Id): ResolvedLevel => ({ levelId: id, walls: {}, clusters: [] });
    const cena: CenaMontagem = {
      update: (_p, niveis) => void updates.push(niveis.length),
      atualizarAberturas: (_p, _a, id, paredes) => {
        rapidas.push({ nivel: id, paredes });
        return aceita;
      },
    };
    const m = new Montagem3dProgressiva({
      cena,
      fonte: { resolver: (id) => (resolvidos.push(id), nivel(id)), pronto: (id) => nivel(id) },
      aoAtualizar: () => {},
      aoConcluir: () => {},
      agendar: (t) => t(),
    });
    return { m, rapidas, updates, resolvidos };
  }

  it('usa o caminho rápido: re-resolve só o nível editado e não monta a cena de novo', () => {
    const p = projeto();
    const { m, rapidas, updates, resolvidos } = monta(true);
    m.iniciar(p, OPT, 'lv_1');
    expect(m.montados).toBe(p.levels.length);
    const antes = updates.length;
    resolvidos.length = 0;
    m.atualizar(edita(p, { type: 'deleteElements', ids: ['j0'] }), OPT, 'lv_1');
    expect(rapidas).toEqual([{ nivel: 'lv_1', paredes: ['w1'] }]);
    expect(resolvidos).toEqual(['lv_1']);
    expect(updates.length).toBe(antes);
  });

  it('cena que recusa cai no caminho comum (revalida o nível e os vizinhos)', () => {
    const p = projeto();
    const { m, rapidas, updates } = monta(false);
    m.iniciar(p, OPT, 'lv_1');
    const antes = updates.length;
    m.atualizar(edita(p, { type: 'deleteElements', ids: ['j0'] }), OPT, 'lv_1');
    expect(rapidas.length).toBe(1);
    expect(updates.length).toBeGreaterThan(antes);
  });
});

describe('memoSemEsquadrias', () => {
  it('guarda o resultado enquanto só esquadrias mudam e recalcula quando outro elemento muda', () => {
    const p = projeto();
    let n = 0;
    const calcula = (): number => ++n;
    expect(memoSemEsquadrias('t', p, calcula)).toBe(1);
    expect(memoSemEsquadrias('t', edita(p, { type: 'deleteElements', ids: ['j0'] }), calcula)).toBe(1);
    expect(memoSemEsquadrias('t', edita(p, { type: 'updateElements', ids: ['w1'], patch: { heightOffset: 0.1 } }), calcula)).toBe(2);
  });
});
