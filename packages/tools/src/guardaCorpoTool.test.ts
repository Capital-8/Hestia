import { describe, expect, it } from 'vitest';
import { isGuardaCorpo, makeStair, type GuardaCorpo, type Project } from '@hestia/model';
import { clickAt, makeEnv, tool } from './testEnv.ts';
import { mensagensDeGuardaCorpo } from './guardaCorpoTool.ts';
import { criarGuardaCorpoDeEscada } from './stairCommands.ts';
import { criarGuardaCorpoDeRampa } from './rampCommands.ts';
import { gripsDoGuardaCorpo, patchMoverVerticeGC } from './guardaCorpoGrips.ts';
import { gripHoldAt } from './selectGrips.ts';
import { guardaCorposDoHospedeiro, removerGuardaCorpoDeHospedeiro, temGuardaCorpoDeHospedeiro } from './guardaCorpoTool.ts';
import { P, drawWall } from './testEnv.ts';

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

describe('alça de vértice no canvas (arrastar com captura)', () => {
  function cenaManual() {
    const ctx = makeEnv();
    const t = tool('railing', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    clickAt(t, 4, 3);
    t.confirm();
    const [g] = railings(ctx.store.project);
    ctx.env.setSelection([g!.id]);
    return { ...ctx, id: g!.id };
  }
  const caminho = (p: Project, id: string): number[][] => {
    const h = (p.elements[id] as GuardaCorpo).hospedeiro;
    return h.tipo === 'manual' ? h.caminho.map((v) => [v.x, v.y, v.dz]) : [];
  };

  it('arrastar o vértice usa o ponto capturado e grava um único passo de desfazer', () => {
    const { store, env, id } = cenaManual();
    const hold = gripHoldAt(env, { x: 4, y: 0 });
    expect(hold).not.toBeNull();
    let extra: unknown;
    const prev = hold!.drag(P(6, 1), (e) => ((extra = e), { x: 6, y: 1.5 }));
    expect(prev.length).toBe(2);
    // O snap recebe os OUTROS vértices como pontos de captura (não o próprio).
    expect((extra as { extraPoints: Array<{ x: number; y: number }> }).extraPoints).toEqual([{ x: 0, y: 0 }, { x: 4, y: 3 }]);
    hold!.release(P(6, 1), () => {});
    expect(caminho(store.project, id)).toEqual([[0, 0, 0], [6, 1.5, 0], [4, 3, 0]]);
    store.undo();
    expect(caminho(store.project, id)).toEqual([[0, 0, 0], [4, 0, 0], [4, 3, 0]]);
  });

  it('soltar sem mover não grava; a alça só existe no guarda-corpo manual selecionado', () => {
    const { store, env, id } = cenaManual();
    const antes = store.project;
    const hold = gripHoldAt(env, { x: 4, y: 0 })!;
    hold.drag(P(4, 0), () => ({ x: 4, y: 0 }));
    hold.release(P(4, 0), () => {});
    expect(store.project).toBe(antes);
    env.setSelection([]);
    expect(gripHoldAt(env, { x: 4, y: 0 })).toBeNull();
    expect(id).toBeTruthy();
  });
});

describe('liga/desliga o guarda-corpo da escada e da rampa', () => {
  it('ligar cria um só, desligar remove, e dá para ligar de novo (um passo de desfazer cada)', () => {
    const { store, env } = makeEnv();
    const host = comEscada(store as never);
    const msgs = mensagensDeGuardaCorpo('pt');
    expect(temGuardaCorpoDeHospedeiro(store.project, host)).toBe(false);
    expect('id' in criarGuardaCorpoDeEscada(env, host, msgs)).toBe(true);
    expect(temGuardaCorpoDeHospedeiro(store.project, host)).toBe(true);
    expect('error' in criarGuardaCorpoDeEscada(env, host, msgs)).toBe(true); // já ligado
    expect(guardaCorposDoHospedeiro(store.project, host)).toHaveLength(1);
    store.transaction('desligar', () => void removerGuardaCorpoDeHospedeiro(env, host));
    expect(temGuardaCorpoDeHospedeiro(store.project, host)).toBe(false);
    expect(railings(store.project)).toHaveLength(0);
    store.undo();
    expect(temGuardaCorpoDeHospedeiro(store.project, host)).toBe(true);
    store.undo();
    expect(temGuardaCorpoDeHospedeiro(store.project, host)).toBe(false);
  });

  it('desligar numa escada sem guarda-corpo não faz nada e não mexe nos de outro hospedeiro', () => {
    const { store, env } = makeEnv();
    const host = comEscada(store as never);
    expect(removerGuardaCorpoDeHospedeiro(env, host)).toBe(0);
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    t.confirm();
    criarGuardaCorpoDeEscada(env, host, mensagensDeGuardaCorpo('pt'));
    expect(removerGuardaCorpoDeHospedeiro(env, host)).toBe(1);
    expect(railings(store.project)).toHaveLength(1); // o manual segue
  });
});

/** Mesmo núcleo de desenho da parede: Orto, Polar, snaps e comprimento digitado (contrato de ferramentas). */
describe('ferramenta Guarda-corpo: núcleo comum de desenho (igual à parede)', () => {
  const caminho = (p: Project): number[][] => {
    const g = railings(p)[0]!;
    return g.hospedeiro.tipo === 'manual' ? g.hospedeiro.caminho.map((v) => [Math.round(v.x * 1000) / 1000, Math.round(v.y * 1000) / 1000]) : [];
  };

  it('Orto força o segmento na horizontal ou vertical a partir do ponto anterior', () => {
    const { store, env, options } = makeEnv();
    options.orthoLock = true;
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    clickAt(t, 3.04, 0.4);
    t.confirm();
    expect(caminho(store.project)).toEqual([[0, 0], [3.04, 0]]);
  });

  it('Polar projeta no múltiplo do incremento (45 graus)', () => {
    const { store, env, options } = makeEnv();
    options.angleMode = { ortho: false, polar: true, polarIncrementDeg: 45 } as never;
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    clickAt(t, 3, 3.1);
    t.confirm();
    const [, b] = caminho(store.project);
    expect(Math.abs(b![0]! - b![1]!)).toBeLessThan(0.01);
  });

  it('captura na extremidade de uma parede existente', () => {
    const { store, env } = makeEnv();
    drawWall(env, [5, 5], [9, 5]);
    const t = tool('railing', env);
    clickAt(t, 5.01, 5.01);
    clickAt(t, 5.01, 8);
    t.confirm();
    expect(caminho(store.project)[0]).toEqual([5, 5]);
  });

  it('captura a perpendicular a uma parede a partir do ponto anterior', () => {
    const { store, env } = makeEnv();
    drawWall(env, [0, 0], [10, 0]);
    const t = tool('railing', env);
    clickAt(t, 4, 3);
    clickAt(t, 4.02, 0.02);
    t.confirm();
    const c = caminho(store.project);
    expect(c[1]![0]).toBeCloseTo(4, 2);
    expect(c[1]![1]).toBeCloseTo(0, 2);
  });

  it('comprimento digitado acrescenta o ponto na direção do cursor e encadeia', () => {
    const { store, env } = makeEnv();
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    t.move(P(1, 0.01));
    expect(t.type!('2.5')).toBe(true);
    t.move(P(2.5, 1));
    expect(t.type!('1')).toBe(true);
    t.confirm();
    const c = caminho(store.project);
    expect(c[0]).toEqual([0, 0]);
    expect(c[1]![0]).toBeCloseTo(2.5, 2);
    expect(c.length).toBe(3);
  });

  it('valor digitado inválido não acrescenta ponto', () => {
    const { env } = makeEnv();
    const t = tool('railing', env);
    clickAt(t, 0, 0);
    expect(t.type!('abc')).toBe(false);
    expect(t.type!('-1')).toBe(false);
  });

  it('expõe a cota dinâmica do trecho e o pedido de comprimento, como a parede', () => {
    const { env } = makeEnv();
    const t = tool('railing', env) as unknown as { tempDims(): unknown[]; inputPrompt(): string | null };
    expect(t.inputPrompt()).toBeNull();
    clickAt(t as never, 0, 0);
    (t as never as { move(p: unknown): void }).move(P(2, 0));
    expect(t.tempDims()).toHaveLength(1);
    expect(t.inputPrompt()).not.toBeNull();
  });
});
