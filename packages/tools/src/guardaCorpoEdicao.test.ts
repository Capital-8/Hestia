/**
 * Guarda-corpo em TODAS as ferramentas de modificação (ADR 0055 §25). Um teste por ferramenta, com guarda-corpo manual
 * e hospedado, mais desfazer/refazer. Hospedado em escada: acompanha o hospedeiro; sozinho, a ferramenta recusa.
 */
import { describe, expect, it } from 'vitest';
import {
  isGuardaCorpo,
  isStair,
  makeGuardaCorpo,
  makeStair,
  makeWall,
  type GuardaCorpo,
  type HospedeiroManual,
  type Id,
  type Project,
} from '@hestia/model';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';
import { clipboardFrom, copyableIds, pasteAlignedCommand } from './clipboard.ts';
import { selectedMovables } from './edit.ts';
import { dividirCaminho, aparaCaminho, deslocarCaminho } from './guardaCorpoEdicao.ts';
import { alignFeaturesAt } from './alignFeatures.ts';
import { solveAlign } from './alignSolve.ts';
import { criarGuardaCorpoDeEscada } from './stairCommands.ts';
import { mensagensDeGuardaCorpo } from './guardaCorpoTool.ts';
import { setRailingPlanShapes } from './railingPick.ts';

type Ctx = ReturnType<typeof makeEnv>;

const railings = (p: Project): GuardaCorpo[] => Object.values(p.elements).filter(isGuardaCorpo);
const manual = (id: Id, pts: Array<[number, number]>, extra: Partial<HospedeiroManual> = {}): Omit<GuardaCorpo, 'order'> =>
  makeGuardaCorpo({
    id,
    levelId: 'lv_0',
    typeId: 'gct_balaustres',
    hospedeiro: { tipo: 'manual', uso: 'livre', caminho: pts.map(([x, y]) => ({ x, y, dz: 0 })), fechado: false, ladoDeslocamento: 'esquerdo', ...extra },
  });
const caminhoDe = (g: GuardaCorpo): Array<[number, number]> => (g.hospedeiro.tipo === 'manual' ? g.hospedeiro.caminho.map((v) => [v.x, v.y]) : []);
const get = (ctx: Ctx, id: Id): GuardaCorpo => ctx.store.project.elements[id] as GuardaCorpo;

/** Projeto com um guarda-corpo manual `gm` em (0,0)-(4,0) e uma escada `st` com guarda-corpo hospedado `gh`. */
function cenario(): Ctx {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addGuardaCorpo', guardaCorpo: manual('gm', [[0, 0], [4, 0]]) });
  const typeId = Object.keys(ctx.store.project.stairTypes)[0]!;
  ctx.store.exec({ type: 'addStair', stair: makeStair({ id: 'st', typeId, levelId: 'lv_0', topLevelId: null, baseOffset: 0, topOffset: 0, height: 2.8 }) });
  expect('id' in criarGuardaCorpoDeEscada(ctx.env, 'st', mensagensDeGuardaCorpo('pt'))).toBe(true);
  return ctx;
}
const hospedadoDe = (ctx: Ctx, stairId: Id): GuardaCorpo => railings(ctx.store.project).find((g) => g.hospedeiro.tipo === 'escada' && g.hospedeiro.escadaId === stairId)!;

describe('Mover e Copiar', () => {
  it('manual: Mover leva o caminho; desfazer e refazer', () => {
    const ctx = cenario();
    ctx.env.setSelection(['gm']);
    const t = tool('move', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 0, 3);
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 3], [4, 3]]);
    ctx.store.undo();
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 0], [4, 0]]);
    ctx.store.redo();
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 3], [4, 3]]);
  });

  it('manual: Copiar cria outro guarda-corpo e mantém o original; um passo de desfazer', () => {
    const ctx = cenario();
    ctx.env.setSelection(['gm']);
    const t = tool('copy', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 0, 2);
    t.cancel();
    const manuais = railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'manual');
    expect(manuais).toHaveLength(2);
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 0], [4, 0]]);
    expect(manuais.some((g) => g.id !== 'gm' && caminhoDe(g)[0]![1] === 2)).toBe(true);
    ctx.store.undo();
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'manual')).toHaveLength(1);
  });

  it('hospedado: mover a escada leva o guarda-corpo junto (continua hospedado na mesma escada)', () => {
    const ctx = cenario();
    const antes = hospedadoDe(ctx, 'st');
    ctx.env.setSelection(['st']);
    const t = tool('move', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 1);
    expect(hospedadoDe(ctx, 'st').id).toBe(antes.id);
    expect(hospedadoDe(ctx, 'st').hospedeiro).toEqual(antes.hospedeiro);
  });

  it('hospedado: copiar a escada copia também o guarda-corpo dela, apontando para a escada nova', () => {
    const ctx = cenario();
    ctx.env.setSelection(['st']);
    const t = tool('copy', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 5, 0);
    t.cancel();
    const escadas = Object.values(ctx.store.project.elements).filter(isStair);
    expect(escadas).toHaveLength(2);
    const nova = escadas.find((s) => s.id !== 'st')!;
    const gNova = hospedadoDe(ctx, nova.id);
    expect(gNova.id).not.toBe(hospedadoDe(ctx, 'st').id);
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'escada')).toHaveLength(2);
    ctx.store.undo();
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'escada')).toHaveLength(1);
  });

  it('hospedado sozinho: bloqueado com mensagem e nada muda', () => {
    const ctx = cenario();
    const dicas: string[] = [];
    ctx.env.say = (m: string) => dicas.push(m);
    const gh = hospedadoDe(ctx, 'st');
    ctx.env.setSelection([gh.id]);
    expect(selectedMovables(ctx.store.project, [gh.id])).toEqual([]);
    for (const id of ['move', 'copy', 'rotate', 'mirror', 'array'] as const) {
      tool(id, ctx.env);
      expect(dicas[dicas.length - 1]).toMatch(/hospedado/i);
    }
    expect(railings(ctx.store.project)).toHaveLength(2);
  });
});

describe('Rotacionar e Espelhar', () => {
  it('manual: Rotacionar 90 graus em torno da origem', () => {
    const ctx = cenario();
    ctx.env.setSelection(['gm']);
    const t = tool('rotate', ctx.env);
    clickAt(t, 0, 0);
    expect(t.type('90')).toBe(true);
    const c = caminhoDe(get(ctx, 'gm'));
    expect(c[1]![0]).toBeCloseTo(0, 9);
    expect(c[1]![1]).toBeCloseTo(4, 9);
    ctx.store.undo();
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 0], [4, 0]]);
  });

  it('manual: Espelhar pelo eixo e o lado do deslocamento troca (a geometria se mantém)', () => {
    const ctx = cenario();
    ctx.env.setSelection(['gm']);
    ctx.options.mirrorCopy = false;
    const t = tool('mirror', ctx.env);
    clickAt(t, 0, 1);
    clickAt(t, 4, 1);
    const g = get(ctx, 'gm');
    expect(caminhoDe(g)).toEqual([[0, 2], [4, 2]]);
    expect(g.hospedeiro.tipo === 'manual' && g.hospedeiro.ladoDeslocamento).toBe('direito');
    ctx.store.undo();
    expect(get(ctx, 'gm').hospedeiro.tipo === 'manual' && (get(ctx, 'gm').hospedeiro as HospedeiroManual).ladoDeslocamento).toBe('esquerdo');
  });

  it('hospedado: girar e espelhar a escada leva o guarda-corpo; espelhar troca esquerdo e direito', () => {
    const ctx = cenario();
    const gh = hospedadoDe(ctx, 'st');
    ctx.store.exec({ type: 'updateGuardaCorpo', id: gh.id, patch: { hospedeiro: { ...(gh.hospedeiro as never as { tipo: 'escada' }), lados: { esquerdo: { lance: true, patamar: false }, direito: { lance: false, patamar: true } } } as never } });
    ctx.env.setSelection(['st']);
    const t = tool('rotate', ctx.env);
    clickAt(t, 0, 0);
    expect(t.type('90')).toBe(true);
    expect(hospedadoDe(ctx, 'st').hospedeiro).toMatchObject({ lados: { esquerdo: { lance: true, patamar: false } } });
    ctx.env.setSelection(['st']);
    ctx.options.mirrorCopy = false;
    const m = tool('mirror', ctx.env);
    clickAt(m, 0, 0);
    clickAt(m, 5, 0);
    expect(hospedadoDe(ctx, 'st').hospedeiro).toMatchObject({ lados: { esquerdo: { lance: false, patamar: true }, direito: { lance: true, patamar: false } } });
    ctx.store.undo();
    expect(hospedadoDe(ctx, 'st').hospedeiro).toMatchObject({ lados: { esquerdo: { lance: true, patamar: false } } });
  });
});

describe('Matriz', () => {
  it('manual: Matriz linear cria N-1 cópias em um passo; hospedado: a escada leva os guarda-corpos', () => {
    const ctx = cenario();
    ctx.env.setSelection(['gm']);
    const a = tool('array', ctx.env);
    clickAt(a, 0, 0);
    a.move(P(0, 1));
    expect(a.type('3')).toBe(true);
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'manual')).toHaveLength(3);
    ctx.store.undo();
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'manual')).toHaveLength(1);

    ctx.env.setSelection(['st']);
    const b = tool('array', ctx.env);
    clickAt(b, 0, 0);
    b.move(P(0, 6));
    expect(b.type('6')).toBe(true);
    // 3 itens (opção padrão): cada escada copiada leva o guarda-corpo dela.
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'escada')).toHaveLength(3);
  });
});

describe('Alinhar', () => {
  it('manual: alinha o caminho paralelo a uma parede de referência; hospedado só serve de referência', () => {
    const ctx = cenario();
    ctx.options.alignPrefer = 'eixos';
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w_ref', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: -1, y: 5 }, b: { x: 6, y: 5 }, locationLine: 'wallCenter' }) });
    const t = tool('align', ctx.env);
    clickAt(t, 3, 5); // referência: eixo da parede
    clickAt(t, 2, 0); // o guarda-corpo manual
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 5], [4, 5]]);
    ctx.store.undo();
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 0], [4, 0]]);
    ctx.store.redo();
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 5], [4, 5]]);
  });

  it('o guarda-corpo manual é feição alinhável e o hospedado recusa com mensagem', () => {
    const ctx = cenario();
    const f = alignFeaturesAt({ project: ctx.store.project, levelId: 'lv_0', at: { x: 2, y: 0 }, metersPerPixel: 0.01 }).find((x) => x.kind === 'caminhoGuardaCorpo');
    expect(f).toBeDefined();
    expect(f!.move).toEqual({ policy: 'transladar', target: 'guardaCorpo', id: 'gm' });
    const hospedado = { ...f!, ownerId: hospedadoDe(ctx, 'st').id, move: { policy: 'nenhum' } as const };
    const sol = solveAlign({ p: { x: 0, y: 3 }, d: { x: 1, y: 0 } }, hospedado, ctx.store.project);
    expect(sol.kind).toBe('erro');
  });
});

describe('Deslocar', () => {
  it('manual: desloca para o lado do cursor, copiando ou movendo', () => {
    const ctx = cenario();
    ctx.options.offsetDistance = 1;
    ctx.options.offsetCopy = true;
    const t = tool('offset', ctx.env);
    clickAt(t, 2, 0.001);
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'manual')).toHaveLength(2);
    const nova = railings(ctx.store.project).find((g) => g.id !== 'gm' && g.hospedeiro.tipo === 'manual')!;
    expect(Math.abs(caminhoDe(nova)[0]![1])).toBeCloseTo(1, 9);
    ctx.store.undo();
    ctx.options.offsetCopy = false;
    clickAt(t, 2, 0.001);
    expect(Math.abs(caminhoDe(get(ctx, 'gm'))[0]![1])).toBeCloseTo(1, 9);
    ctx.store.undo();
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 0], [4, 0]]);
  });

  it('cantos em esquadria e lado pelo sentido do caminho', () => {
    const r = deslocarCaminho([{ x: 0, y: 0, dz: 0 }, { x: 4, y: 0, dz: 0 }, { x: 4, y: 4, dz: 0 }], 1, false);
    expect(r.map((v) => [v.x, v.y])).toEqual([[0, 1], [3, 1], [3, 4]]);
  });
});

describe('Aparar/Estender e Dividir', () => {
  it('manual: estende a ponta mais distante do clique até a parede de referência (e desfaz)', () => {
    const ctx = cenario();
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w_ref', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 7, y: -2 }, b: { x: 7, y: 5 }, locationLine: 'wallCenter' }) });
    const t = tool('trim', ctx.env);
    clickAt(t, 1, 0); // guarda-corpo: a parte perto de x=1 fica; a ponta de x=4 se move
    clickAt(t, 7, 3); // referência
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 0], [7, 0]]);
    ctx.store.undo();
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 0], [4, 0]]);
  });

  it('manual: apara até a parede; paralelo e laço fechado recusam', () => {
    const h = (manual('x', [[0, 0], [4, 0]]).hospedeiro as HospedeiroManual);
    expect('caminho' in aparaCaminho(h, { x: 0, y: 0 }, { p: { x: 2, y: -1 }, d: { x: 0, y: 1 } })).toBe(true);
    expect(aparaCaminho(h, { x: 0, y: 0 }, { p: { x: 0, y: 3 }, d: { x: 1, y: 0 } })).toEqual({ erro: 'paralelo' });
    expect(aparaCaminho({ ...h, fechado: true }, { x: 0, y: 0 }, { p: { x: 2, y: -1 }, d: { x: 0, y: 1 } })).toEqual({ erro: 'fechado' });
  });

  it('manual: Dividir corta em dois guarda-corpos com as mesmas propriedades; desfazer volta ao um', () => {
    const ctx = cenario();
    const t = tool('split', ctx.env);
    clickAt(t, 1, 0);
    const manuais = railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'manual');
    expect(manuais).toHaveLength(2);
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 0], [1, 0]]);
    expect(caminhoDe(manuais.find((g) => g.id !== 'gm')!)).toEqual([[1, 0], [4, 0]]);
    expect(manuais.every((g) => g.typeId === 'gct_balaustres')).toBe(true);
    ctx.store.undo();
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'manual')).toHaveLength(1);
    expect(caminhoDe(get(ctx, 'gm'))).toEqual([[0, 0], [4, 0]]);
    ctx.store.redo();
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'manual')).toHaveLength(2);
  });

  it('dividir: laço fechado vira um caminho aberto; clique numa ponta não divide', () => {
    const h = manual('x', [[0, 0], [4, 0], [4, 4]], { fechado: true }).hospedeiro as HospedeiroManual;
    const r = dividirCaminho(h, { x: 2, y: 0 });
    expect(r?.segundo).toBeNull();
    expect(r?.primeiro).toHaveLength(5);
    expect(dividirCaminho(manual('y', [[0, 0], [4, 0]]).hospedeiro as HospedeiroManual, { x: 0, y: 0 })).toBeNull();
  });

  it('hospedado: Dividir, Deslocar e Aparar recusam com mensagem e nada muda', () => {
    const ctx = cenario();
    const dicas: string[] = [];
    ctx.env.say = (m: string) => dicas.push(m);
    // Sem kernel nos testes, o caminho do hospedado vem do gancho de polilinhas.
    setRailingPlanShapes((_p, g) => (g.hospedeiro.tipo === 'manual' ? [g.hospedeiro.caminho.map((v) => ({ x: v.x, y: v.y }))] : [[{ x: 10, y: 0 }, { x: 14, y: 0 }]]));
    try {
      const antes = JSON.stringify(ctx.store.project.elements);
      for (const id of ['split', 'offset', 'trim'] as const) {
        dicas.length = 0;
        const t = tool(id, ctx.env);
        clickAt(t, 12, 0);
        expect(dicas.join(' ')).toMatch(/hospedado/i);
      }
      expect(JSON.stringify(ctx.store.project.elements)).toBe(antes);
    } finally {
      setRailingPlanShapes(() => []);
    }
  });
});

describe('Apagar e Copiar/Colar entre pavimentos', () => {
  it('apagar o guarda-corpo manual e desfazer', () => {
    const ctx = cenario();
    ctx.store.exec({ type: 'deleteElements', ids: ['gm'] });
    expect(ctx.store.project.elements['gm']).toBeUndefined();
    ctx.store.undo();
    expect(ctx.store.project.elements['gm']).toBeDefined();
  });

  it('copiar e colar: manual vai sozinho; hospedado só com a escada, remapeado para a escada nova', () => {
    const ctx = cenario();
    const gh = hospedadoDe(ctx, 'st');
    expect(clipboardFrom(ctx.store.project, [gh.id])).toBeNull(); // hospedado sozinho não se copia
    expect(copyableIds(ctx.store.project, [gh.id])).toEqual([]);
    const clipManual = clipboardFrom(ctx.store.project, ['gm'])!;
    expect(clipManual.railings).toHaveLength(1);
    const colado = pasteAlignedCommand(ctx.store.project, clipManual, 'lv_0')!;
    expect(colado.railingIds).toHaveLength(1);
    ctx.store.exec(colado.command);
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'manual')).toHaveLength(2);
    ctx.store.undo();

    const clip = clipboardFrom(ctx.store.project, ['st'])!;
    expect(clip.stairs).toHaveLength(1);
    expect(clip.railings).toHaveLength(1);
    const r = pasteAlignedCommand(ctx.store.project, clip, 'lv_0')!;
    ctx.store.exec(r.command);
    const novaEscada = r.stairIds[0]!;
    const gNovo = hospedadoDe(ctx, novaEscada);
    expect(gNovo.id).toBe(r.railingIds[0]);
    ctx.store.undo();
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'escada')).toHaveLength(1);
    ctx.store.redo();
    expect(railings(ctx.store.project).filter((g) => g.hospedeiro.tipo === 'escada')).toHaveLength(2);
  });
});

describe('Alças de arraste e propriedades em lote', () => {
  it('propriedades em lote: updateGuardaCorpo em vários num único passo de desfazer', () => {
    const ctx = cenario();
    ctx.store.exec({ type: 'addGuardaCorpo', guardaCorpo: manual('gm2', [[0, 5], [4, 5]]) });
    ctx.store.transaction('lote', () => {
      for (const id of ['gm', 'gm2']) ctx.store.exec({ type: 'updateGuardaCorpo', id, patch: { altura: 1.2 } });
    });
    expect(get(ctx, 'gm').altura).toBe(1.2);
    expect(get(ctx, 'gm2').altura).toBe(1.2);
    ctx.store.undo();
    expect(get(ctx, 'gm').altura).toBeNull();
    expect(get(ctx, 'gm2').altura).toBeNull();
  });
});
