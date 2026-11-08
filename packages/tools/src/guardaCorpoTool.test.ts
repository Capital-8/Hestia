import { describe, expect, it } from 'vitest';
import { isGuardaCorpo, makeStair, type GuardaCorpo, type Project } from '@hestia/model';
import { clickAt, makeEnv, tool } from './testEnv.ts';
import { mensagensDeGuardaCorpo } from './guardaCorpoTool.ts';
import { criarGuardaCorpoDeEscada } from './stairCommands.ts';
import { criarGuardaCorpoDeRampa } from './rampCommands.ts';
import { gripsDoGuardaCorpo, patchMoverVerticeGC } from './guardaCorpoGrips.ts';

const railings = (p: Project): GuardaCorpo[] => Object.values(p.elements).filter(isGuardaCorpo);

/** Escada mínima no nível 0, para testar a criação com hospedeiro (o croqui não importa aqui). */
function comEscada(store: { project: Project; exec: (c: never) => void }): string {
  const typeId = Object.keys(store.project.stairTypes)[0]!;
  const stair = makeStair({ id: 'st_teste', typeId, levelId: 'lv_0', topLevelId: null, baseOffset: 0, topOffset: 0, height: 2.8 });
  store.exec({ type: 'addStair', stair } as never);
  return 'st_teste';
}

describe('ferramenta Guarda-corpo: caminho manual (decisão 0055, Fase 6a)', () => {
  it('Enter conclui um caminho aberto com um único comando e um passo de desfazer', () => {
    const { store, env } = makeEnv();
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 2, 3);
    t.confirm();
    const [g] = railings(store.project);
    expect(g).toBeDefined();
    expect(g!.hospedeiro).toMatchObject({ tipo: 'manual', fechado: false, uso: 'livre' });
    expect(g!.hospedeiro.tipo === 'manual' && g!.hospedeiro.caminho.map((v) => [v.x, v.y])).toEqual([[0, 0], [2, 0], [2, 3]]);
    store.undo();
    expect(railings(store.project)).toHaveLength(0);
  });

  it('C fecha o laço com três pontos ou mais', () => {
    const { store, env } = makeEnv();
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    clickAt(t, 4, 4);
    expect(t.type!('c')).toBe(true);
    const [g] = railings(store.project);
    expect(g!.hospedeiro.tipo === 'manual' && g!.hospedeiro.fechado).toBe(true);
  });

  it('um ponto só não conclui e não grava nada', () => {
    const { store, env } = makeEnv();
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    t.confirm();
    expect(railings(store.project)).toHaveLength(0);
  });

  it('o movimento do cursor só monta a prévia, sem gravar', () => {
    const { store, env } = makeEnv();
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    t.move({ raw: { x: 3, y: 3 }, shift: false, ctrl: false, alt: false });
    expect(t.preview().length).toBeGreaterThan(0);
    expect(railings(store.project)).toHaveLength(0);
  });

  it('usa o tipo escolhido na barra da ferramenta', () => {
    const { store, env, options } = makeEnv();
    const tipos = Object.keys(store.project.tiposGuardaCorpo);
    options.railingTypeId = tipos[tipos.length - 1];
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    t.confirm();
    const [g] = railings(store.project);
    expect(g!.typeId).toBe(options.railingTypeId);
  });
});

describe('criação a partir de escada e rampa (Fase 6a)', () => {
  it('cria com os dois lados ligados nos lances e patamares e recusa um segundo na mesma escada', () => {
    const { store, env } = makeEnv();
    const id = comEscada(store as never);
    const msgs = mensagensDeGuardaCorpo('pt');
    const r = criarGuardaCorpoDeEscada(env, id, msgs);
    expect('id' in r).toBe(true);
    const [g] = railings(store.project);
    expect(g!.hospedeiro).toMatchObject({ tipo: 'escada', escadaId: id, posicaoBase: 'degrau' });
    expect(g!.hospedeiro.tipo === 'escada' && g!.hospedeiro.lados.esquerdo).toEqual({ lance: true, patamar: true });
    expect(g!.hospedeiro.tipo === 'escada' && g!.hospedeiro.lados.direito).toEqual({ lance: true, patamar: true });
    expect(criarGuardaCorpoDeEscada(env, id, msgs)).toEqual({ error: msgs.exists });
  });

  it('recusa quando o id não é escada e quando a rampa não existe', () => {
    const { env } = makeEnv();
    const msgs = mensagensDeGuardaCorpo('pt');
    expect(criarGuardaCorpoDeEscada(env, 'nao_existe', msgs)).toEqual({ error: msgs.noHost });
    expect(criarGuardaCorpoDeRampa(env, 'nao_existe', msgs)).toEqual({ error: msgs.noHost });
  });
});

describe('alças de vértice do caminho manual (Fase 6a)', () => {
  it('lista os vértices e move um sem mexer nos outros nem no desnível', () => {
    const { store, env } = makeEnv();
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 2, 3);
    t.confirm();
    const [g] = railings(store.project);
    expect(gripsDoGuardaCorpo(g!).map((v) => v.indice)).toEqual([0, 1, 2]);
    const patch = patchMoverVerticeGC(g!, 1, { x: 5, y: 0 });
    expect(patch).not.toBeNull();
    const h = patch!.hospedeiro;
    expect(h?.tipo === 'manual' && h.caminho.map((v) => [v.x, v.y, v.dz])).toEqual([[0, 0, 0], [5, 0, 0], [2, 3, 0]]);
  });

  it('devolve nulo para hospedeiro que não é manual ou índice fora do caminho', () => {
    const { store, env } = makeEnv();
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 0);
    t.confirm();
    const [g] = railings(store.project);
    expect(patchMoverVerticeGC(g!, 9, { x: 0, y: 0 })).toBeNull();
    expect(gripsDoGuardaCorpo({ ...g!, hospedeiro: { tipo: 'escada', escadaId: 'x', lados: { esquerdo: { lance: true, patamar: true }, direito: { lance: true, patamar: true } }, posicaoBase: 'degrau' } })).toEqual([]);
  });
});
