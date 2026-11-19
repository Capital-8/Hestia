import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, isLot, makeLevel, makeLot, type LadoLote, type Lot, type Project } from '@hestia/model';
import { applyAlignMany } from './alignApply.ts';
import { alignFeaturesAt, type AlignFeature } from './alignFeatures.ts';
import { solveAlign } from './alignSolve.ts';
import { clipboardFrom, copyableIds, pasteAlignedCommand } from './clipboard.ts';
import { selectedMovables } from './edit.ts';
import { pasteAlignedToLevelsCommand } from './pasteLevels/command.ts';
import { setPasteClip } from './pasteTool.ts';
import { comandosMoverNoCorte, moveisDoCorte } from './sectionMoverElementos.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

const LT = 'lt_l1';
const v = (x: number, y: number) => ({ x, y });
const A: LadoLote = { papel: 'frente', recuo: 5 };
const B: LadoLote = { papel: 'lateral', recuo: 1.5 };
const C: LadoLote = { papel: 'fundo', recuo: 3 };
const D: LadoLote = { papel: 'lateral', recuo: 1.5 };

afterEach(() => setPasteClip(null));

/** L1 (retângulo (0,0)-(12,30), frente em y = 0, recuos 5 / 1,5 / 3 / 1,5) no `lv_0`, selecionado; o projeto também tem o `lv_1`. */
function cena() {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  ctx.store.exec({ type: 'addLot', lot: makeLot({ id: LT, levelId: 'lv_0', contorno: [v(0, 0), v(12, 0), v(12, 30), v(0, 30)], lados: [A, B, C, D], limites: { taxaOcupacaoMax: 0.5 } }) });
  ctx.env.setSelection([LT]);
  return ctx;
}
const lotes = (p: Project): Lot[] => Object.values(p.elements).filter(isLot);
const lt = (p: Project, id = LT): Lot => p.elements[id] as Lot;
const foto = (p: Project): unknown => structuredClone(lotes(p));
const area = (c: ReadonlyArray<{ x: number; y: number }>): number => c.reduce((s, q, i) => s + (q.x * c[(i + 1) % c.length]!.y - c[(i + 1) % c.length]!.x * q.y), 0) / 2;
/** Índice do lado de frente (recuo 5) e os dois pontos dele, em qualquer ordem. */
const frente = (l: Lot): [Lot['contorno'][number], Lot['contorno'][number]] => {
  const i = l.lados.findIndex((x) => x.recuo === 5);
  return [l.contorno[i]!, l.contorno[(i + 1) % l.contorno.length]!];
};

describe('seleção do lote nas ferramentas de modificação', () => {
  it('selectedMovables leva o lote', () => {
    const { store } = cena();
    expect(selectedMovables(store.project, [LT])).toEqual([LT]);
  });
});

describe('Mover: translada o lote inteiro; desfazer devolve', () => {
  it('o contorno anda, os lados e os limites ficam iguais', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const m = tool('move', env);
    clickAt(m, 0, 0);
    clickAt(m, 3, 2);
    expect(lt(store.project).contorno[0]).toEqual(v(3, 2));
    expect(lt(store.project).contorno[2]).toEqual(v(15, 32));
    expect(lt(store.project).lados).toEqual([A, B, C, D]);
    expect(lt(store.project).limites).toEqual({ taxaOcupacaoMax: 0.5 });
    expect(lotes(store.project)).toHaveLength(1);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Copiar: cria um lote novo com os mesmos lados; o original fica; um desfazer', () => {
  it('a cópia anda 30 m em x', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const c = tool('copy', env);
    clickAt(c, 0, 0);
    clickAt(c, 30, 0);
    c.cancel();
    expect(lotes(store.project)).toHaveLength(2);
    const nova = lotes(store.project).find((l) => l.id !== LT)!;
    expect(nova.contorno[0]).toEqual(v(30, 0));
    expect(nova.lados).toEqual([A, B, C, D]);
    expect(lt(store.project).contorno[0]).toEqual(v(0, 0));
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Girar: gira o contorno; os lados acompanham; desfazer devolve', () => {
  it('girar 90 graus em torno da origem', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const r = tool('rotate', env);
    clickAt(r, 0, 0);
    expect(r.type('90')).toBe(true);
    const l = lt(store.project);
    expect(l.contorno.some((q) => Math.abs(q.x + 30) < 1e-9 && Math.abs(q.y - 12) < 1e-9)).toBe(true);
    expect(l.lados).toEqual([A, B, C, D]);
    expect(area(l.contorno)).toBeCloseTo(360, 9);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Espelhar: ordem invertida, anti-horário e cada lado mantém papel e recuo; desfazer devolve', () => {
  it('espelhar por x = -1', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const m = tool('mirror', env);
    clickAt(m, -1, -1);
    clickAt(m, -1, 5);
    const l = lt(store.project);
    expect(l.contorno.every((q) => q.x < 0)).toBe(true);
    expect(area(l.contorno)).toBeGreaterThan(0);
    // O lado de frente (recuo 5) continua sendo o do eixo y = 0, agora de x = -2 a x = -14.
    expect(frente(l).map((q) => `${q.x},${q.y}`).sort()).toEqual(['-14,0', '-2,0']);
    expect(l.lados.map((x) => x.recuo).sort()).toEqual([1.5, 1.5, 3, 5]);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Matriz: cópias do lote; um desfazer', () => {
  it('matriz linear de 3 itens', () => {
    const { store, env, options } = cena();
    const antes = foto(store.project);
    options.arrayCount = 3;
    const a = tool('array', env);
    clickAt(a, 0, 0);
    clickAt(a, 30, 0);
    expect(lotes(store.project)).toHaveLength(3);
    expect(lotes(store.project).every((l) => l.lados.length === 4)).toBe(true);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Alinhar: o contorno é a feição (política transladar); só o lote anda', () => {
  function bordaEm(p: Project, x: number, y: number): AlignFeature {
    const f = alignFeaturesAt({ project: p, levelId: 'lv_0', at: { x, y }, metersPerPixel: 0.01 }).find((q) => q.kind === 'bordaLote');
    if (!f) throw new Error(`sem feição de borda do lote em (${x}, ${y})`);
    return f;
  }
  const referencia = (x: number) => ({ p: { x, y: 0 }, d: { x: 0, y: 1 } });

  it('a aresta do contorno vira feição bordaLote com alvo lote, no nível dele', () => {
    const { store } = cena();
    expect(bordaEm(store.project, 12, 15).move).toEqual({ policy: 'transladar', target: 'lote', id: LT });
    expect(alignFeaturesAt({ project: store.project, levelId: 'lv_1', at: { x: 12, y: 15 }, metersPerPixel: 0.01 }).some((q) => q.kind === 'bordaLote')).toBe(false);
  });

  it('alinhar a aresta x = 12 a uma referência em x = 20 translada o lote 8 m; desfazer devolve', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const sol = solveAlign(referencia(20), bordaEm(store.project, 12, 15), store.project);
    expect(sol).toMatchObject({ kind: 'transladar', target: 'lote', id: LT });
    expect(applyAlignMany(env, [sol], 'Alinhar').applied).toBe(1);
    expect(lt(store.project).contorno.map((q) => q.x).sort((a, b) => a - b)).toEqual([8, 8, 20, 20]);
    expect(lt(store.project).lados).toEqual([A, B, C, D]);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('já alinhado não muda nada', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const sol = solveAlign(referencia(12), bordaEm(store.project, 12, 15), store.project);
    expect(sol).toEqual({ kind: 'nada' });
    expect(applyAlignMany(env, [sol], 'Alinhar').applied).toBe(0);
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Apagar: o lote some; desfazer devolve', () => {
  it('deleteElements', () => {
    const { store } = cena();
    const antes = foto(store.project);
    store.exec({ type: 'deleteElements', ids: [LT] });
    expect(lotes(store.project)).toHaveLength(0);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Copiar e colar', () => {
  it('o buffer leva o lote; copyableIds o inclui; o colar no mesmo nível cria um lote novo com os mesmos lados; um desfazer', () => {
    const { store } = cena();
    const antes = foto(store.project);
    const clip = clipboardFrom(store.project, [LT])!;
    expect(clip.lots).toHaveLength(1);
    expect(copyableIds(store.project, [LT])).toEqual([LT]);
    const r = pasteAlignedCommand(store.project, clip, 'lv_0')!;
    expect(r.lotIds).toHaveLength(1);
    store.exec(r.command);
    expect(lotes(store.project)).toHaveLength(2);
    const novo = lt(store.project, r.lotIds[0]);
    expect(novo.contorno).toEqual(lt(store.project).contorno);
    expect(novo.lados).toEqual([A, B, C, D]);
    expect(novo.limites).toEqual({ taxaOcupacaoMax: 0.5 });
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('Colar com prévia: o lote entra deslocado pelo cursor', () => {
    const { store, env } = cena();
    setPasteClip(clipboardFrom(store.project, [LT])!);
    const c = tool('paste', env);
    // Âncora = centro do conteúdo (6, 15); o cursor em (36, 15) desloca 30 m em x.
    clickAt(c, 36, 15);
    const novo = lotes(store.project).find((l) => l.id !== LT)!;
    expect(novo.contorno[0]).toEqual(v(30, 0));
    expect(lt(store.project).contorno[0]).toEqual(v(0, 0));
    store.undo();
    expect(lotes(store.project)).toHaveLength(1);
  });

  it('colar entre pavimentos: o lote vai a cada nível de destino (o lote é 2D), no nível certo; um desfazer', () => {
    const { store } = cena();
    store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_x', name: 'Extra', elevation: 6 }) });
    const antes = foto(store.project);
    const clip = clipboardFrom(store.project, [LT])!;
    const r = pasteAlignedToLevelsCommand(store.project, clip, ['lv_1', 'lv_x'])!;
    expect(r).not.toBeNull();
    store.exec(r.command);
    const novos = lotes(store.project).filter((l) => l.id !== LT);
    expect(novos.map((l) => l.levelId).sort()).toEqual(['lv_1', 'lv_x']);
    expect(novos.every((l) => l.lados.length === 4 && l.contorno.length === 4)).toBe(true);
    expect(r.byLevel['lv_1']!.lots).toHaveLength(1);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Mover no corte: o lote não aparece no corte', () => {
  it('moveisDoCorte deixa o lote de fora e nenhum comando sai', () => {
    const { store } = cena();
    expect(moveisDoCorte(store.project, [LT])).toEqual([]);
    expect(comandosMoverNoCorte(store.project, [LT], v(1, 0), 3, 1).commands).toEqual([]);
  });
});
