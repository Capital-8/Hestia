import { afterEach, describe, expect, it } from 'vitest';
import { adicionarFixtureTerreno } from '@hestia/engine';
import { ProjectStore, createEmptyProject, isTerrain, isTerrainRegion, type Project, type Terrain, type TerrainRegion } from '@hestia/model';
import { applyAlignMany } from './alignApply.ts';
import { alignFeaturesAt, type AlignFeature } from './alignFeatures.ts';
import { solveAlign } from './alignSolve.ts';
import { clipboardFrom, copyableIds, pasteAlignedCommand } from './clipboard.ts';
import { selectedMovables } from './edit.ts';
import { pasteAlignedToLevelsCommand } from './pasteLevels/command.ts';
import { setPasteClip } from './pasteTool.ts';
import { comandosMoverNoCorte, moveisDoCorte } from './sectionMoverElementos.ts';
import { comandosCopiaRegioes, regioesSozinhas } from './terrainRegionHandles.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

const TN = 'tn_t5';
const RG = 'rg_t5';

afterEach(() => setPasteClip(null));

/** Terreno T5 (quadrado 0..20, cota 10) com a plataforma (5,5)-(15,15), cota 8, no `lv_0`, com SÓ a região selecionada. */
function cena() {
  const ctx = makeEnv(new ProjectStore(createEmptyProject()));
  adicionarFixtureTerreno(ctx.store, 'T5');
  ctx.env.setSelection([RG]);
  return ctx;
}
const terrenos = (p: Project): Terrain[] => Object.values(p.elements).filter(isTerrain);
const regioes = (p: Project): TerrainRegion[] => Object.values(p.elements).filter(isTerrainRegion);
const tn = (p: Project): Terrain => p.elements[TN] as Terrain;
const rg = (p: Project, id = RG): TerrainRegion => p.elements[id] as TerrainRegion;
const foto = (p: Project): unknown => structuredClone({ t: terrenos(p), r: regioes(p) });
const area = (c: ReadonlyArray<{ x: number; y: number }>): number => c.reduce((s, q, i) => s + (q.x * c[(i + 1) % c.length]!.y - c[(i + 1) % c.length]!.x * q.y), 0) / 2;

describe('seleção da região SOZINHA', () => {
  it('regioesSozinhas: só as regiões cujo terreno não está na seleção', () => {
    const { store } = cena();
    expect(regioesSozinhas(store.project, [RG])).toEqual([RG]);
    expect(regioesSozinhas(store.project, [TN, RG])).toEqual([]);
    expect(regioesSozinhas(store.project, [TN])).toEqual([]);
    expect(regioesSozinhas(store.project, [RG, RG])).toEqual([RG]);
  });

  it('selectedMovables leva a região sozinha, e terreno com região sem repetir', () => {
    const { store } = cena();
    expect(selectedMovables(store.project, [RG])).toEqual([RG]);
    expect(selectedMovables(store.project, [TN, RG])).toEqual([TN, RG]);
  });
});

describe('Mover: a região anda sozinha; o terreno fica; desfazer devolve tudo', () => {
  it('translada só o contorno; cota, papel e terreno não mudam', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const m = tool('move', env);
    clickAt(m, 0, 0);
    clickAt(m, 3, 2);
    expect(rg(store.project).contorno[0]).toEqual({ x: 8, y: 7 });
    expect(rg(store.project).cota).toBe(8);
    expect(rg(store.project).terrenoId).toBe(TN);
    expect(tn(store.project).pontos).toEqual(tn(projetoInicial()).pontos);
    expect(regioes(store.project)).toHaveLength(1);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('terreno e região selecionados juntos andam uma vez só (sem deslocar a região em dobro)', () => {
    const { store, env } = cena();
    env.setSelection([TN, RG]);
    const m = tool('move', env);
    clickAt(m, 0, 0);
    clickAt(m, 3, 2);
    expect(tn(store.project).pontos.slice(0, 3)).toEqual([3, 2, 10]);
    expect(rg(store.project).contorno[0]).toEqual({ x: 8, y: 7 });
  });
});

/** Projeto T5 de partida, para comparar o que NÃO pode mudar. */
function projetoInicial(): Project {
  const s = new ProjectStore(createEmptyProject());
  adicionarFixtureTerreno(s, 'T5');
  return s.project;
}

describe('Copiar: a cópia fica no MESMO terreno (terrenoId do original)', () => {
  it('cria uma região nova com o terrenoId original; o original e o terreno ficam intactos; um desfazer', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const c = tool('copy', env);
    clickAt(c, 0, 0);
    clickAt(c, 30, 0);
    c.cancel();
    expect(terrenos(store.project)).toHaveLength(1);
    expect(regioes(store.project)).toHaveLength(2);
    const nova = regioes(store.project).find((r) => r.id !== RG)!;
    expect(nova.terrenoId).toBe(TN);
    expect(nova.contorno[0]).toEqual({ x: 35, y: 5 });
    expect(nova.papel).toBe('plataforma');
    expect(nova.cota).toBe(8);
    expect(rg(store.project).contorno[0]).toEqual({ x: 5, y: 5 });
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('comandosCopiaRegioes soma dz só à cota de quem tem plano (a subdivisão não tem cota)', () => {
    const { store } = cena();
    const { commands, idMap } = comandosCopiaRegioes(store.project, [RG], { kind: 'translate', d: { x: 0, y: 0 } }, 2, (p) => `${p}_novo`);
    expect(idMap).toEqual({ [RG]: 'rg_novo' });
    expect(commands[0]).toMatchObject({ type: 'addTerrainRegion', regiao: { id: 'rg_novo', terrenoId: TN, cota: 10 } });
    store.exec({ type: 'updateTerrainRegion', id: RG, patch: { papel: 'subdivisao', cota: 0 } });
    const sub = comandosCopiaRegioes(store.project, [RG], { kind: 'translate', d: { x: 0, y: 0 } }, 2);
    expect(sub.commands[0]).toMatchObject({ regiao: { cota: 0 } });
  });
});

describe('Girar e Espelhar: a região sozinha', () => {
  it('girar 90 graus em torno da origem: contorno e direção; o terreno não gira', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const r = tool('rotate', env);
    clickAt(r, 0, 0);
    expect(r.type('90')).toBe(true);
    expect(rg(store.project).direcao).toBeCloseTo(Math.PI / 2, 9);
    expect(rg(store.project).contorno.some((q) => Math.abs(q.x + 5) < 1e-9 && Math.abs(q.y - 5) < 1e-9)).toBe(true);
    expect(tn(store.project).pontos.slice(0, 3)).toEqual([0, 0, 10]);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('espelhar por x = -1: direção 2φ − direção, ordem invertida e continua anti-horária', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const m = tool('mirror', env);
    clickAt(m, -1, -1);
    clickAt(m, -1, 5);
    expect(rg(store.project).direcao).toBeCloseTo(Math.PI, 9);
    expect(area(rg(store.project).contorno)).toBeGreaterThan(0);
    expect(rg(store.project).contorno.every((q) => q.x < 0)).toBe(true);
    expect(tn(store.project).pontos.slice(0, 3)).toEqual([0, 0, 10]);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Matriz: cópias da região no mesmo terreno; um desfazer', () => {
  it('matriz linear de 3 itens: 3 regiões, todas no terreno original', () => {
    const { store, env, options } = cena();
    const antes = foto(store.project);
    options.arrayCount = 3;
    const a = tool('array', env);
    clickAt(a, 0, 0);
    clickAt(a, 30, 0);
    expect(terrenos(store.project)).toHaveLength(1);
    expect(regioes(store.project)).toHaveLength(3);
    expect(regioes(store.project).every((r) => r.terrenoId === TN)).toBe(true);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Alinhar: o contorno é a feição (política transladar); só a região anda', () => {
  function bordaEm(p: Project, x: number, y: number): AlignFeature {
    const f = alignFeaturesAt({ project: p, levelId: 'lv_0', at: { x, y }, metersPerPixel: 0.01 }).find((q) => q.kind === 'bordaRegiao');
    if (!f) throw new Error(`sem feição de borda da região em (${x}, ${y})`);
    return f;
  }
  const referencia = (x: number) => ({ p: { x, y: 0 }, d: { x: 0, y: 1 } });

  it('a aresta do contorno vira feição bordaRegiao com alvo regiao, no nível dela', () => {
    const { store } = cena();
    const f = bordaEm(store.project, 15, 10);
    expect(f.move).toEqual({ policy: 'transladar', target: 'regiao', id: RG });
    expect(alignFeaturesAt({ project: store.project, levelId: 'lv_1', at: { x: 15, y: 10 }, metersPerPixel: 0.01 }).some((q) => q.kind === 'bordaRegiao')).toBe(false);
  });

  it('alinhar a aresta x = 15 a uma referência em x = 18 translada a região 3 m; o terreno fica; desfazer devolve', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const sol = solveAlign(referencia(18), bordaEm(store.project, 15, 10), store.project);
    expect(sol).toMatchObject({ kind: 'transladar', target: 'regiao', id: RG });
    expect(applyAlignMany(env, [sol], 'Alinhar').applied).toBe(1);
    expect(rg(store.project).contorno.map((q) => q.x).sort((a, b) => a - b)).toEqual([8, 8, 18, 18]);
    expect(tn(store.project).pontos.slice(0, 3)).toEqual([0, 0, 10]);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('já alinhado não muda nada', () => {
    const { store, env } = cena();
    const antes = foto(store.project);
    const sol = solveAlign(referencia(15), bordaEm(store.project, 15, 10), store.project);
    expect(sol).toEqual({ kind: 'nada' });
    expect(applyAlignMany(env, [sol], 'Alinhar').applied).toBe(0);
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Apagar: só a região; o terreno fica; desfazer devolve', () => {
  it('deleteElements da região não apaga o terreno', () => {
    const { store } = cena();
    const antes = foto(store.project);
    store.exec({ type: 'deleteElements', ids: [RG] });
    expect(regioes(store.project)).toHaveLength(0);
    expect(terrenos(store.project)).toHaveLength(1);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});

describe('Copiar e colar da região sozinha', () => {
  it('o buffer leva só a região; copyableIds a inclui; o colar a deixa no terreno original, no nível dele; um desfazer', () => {
    const { store } = cena();
    const antes = foto(store.project);
    const clip = clipboardFrom(store.project, [RG])!;
    expect(clip.terrains).toHaveLength(0);
    expect(clip.terrainRegions).toHaveLength(1);
    expect(copyableIds(store.project, [RG])).toEqual([RG]);
    const r = pasteAlignedCommand(store.project, clip, 'lv_1')!;
    expect(r.terrainIds).toHaveLength(0);
    expect(r.terrainRegionIds).toHaveLength(1);
    store.exec(r.command);
    expect(terrenos(store.project)).toHaveLength(1);
    expect(regioes(store.project)).toHaveLength(2);
    const nova = rg(store.project, r.terrainRegionIds[0]);
    expect(nova.terrenoId).toBe(TN);
    expect(nova.levelId).toBe('lv_0');
    expect(nova.cota).toBe(8);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('terreno e região no buffer: a região vai para o terreno NOVO, sem duplicar a região', () => {
    const { store } = cena();
    const clip = clipboardFrom(store.project, [TN, RG])!;
    expect(clip.terrainRegions).toHaveLength(1);
    const r = pasteAlignedCommand(store.project, clip, 'lv_1')!;
    store.exec(r.command);
    expect(terrenos(store.project)).toHaveLength(2);
    expect(regioes(store.project)).toHaveLength(2);
    expect(rg(store.project, r.terrainRegionIds[0]).terrenoId).toBe(r.terrainIds[0]);
  });

  it('Colar com prévia: a região entra deslocada pelo cursor, no terreno original', () => {
    const { store, env } = cena();
    setPasteClip(clipboardFrom(store.project, [RG])!);
    const c = tool('paste', env);
    // Âncora = centro do conteúdo (10, 10); o cursor em (40, 10) desloca 30 m em x.
    clickAt(c, 40, 10);
    const nova = regioes(store.project).find((r) => r.id !== RG)!;
    expect(nova.terrenoId).toBe(TN);
    expect(nova.contorno[0]).toEqual({ x: 35, y: 5 });
    expect(rg(store.project).contorno[0]).toEqual({ x: 5, y: 5 });
    store.undo();
    expect(regioes(store.project)).toHaveLength(1);
  });

  it('colar entre pavimentos: a região fica de fora (cotas absolutas, o terreno é um só)', () => {
    const { store } = cena();
    const clip = clipboardFrom(store.project, [RG])!;
    expect(pasteAlignedToLevelsCommand(store.project, clip, ['lv_0', 'lv_1'])).toBeNull();
  });
});

describe('Mover no corte', () => {
  const u = { x: 1, y: 0 };
  const rodar = (store: ProjectStore, r: { commands: Parameters<ProjectStore['exec']>[0][] }): void => store.transaction('corte', () => r.commands.forEach((c) => store.exec(c)));

  it('moveisDoCorte leva a região sozinha', () => {
    const { store } = cena();
    expect(moveisDoCorte(store.project, [RG])).toEqual([RG]);
  });

  it('vertical: muda a cota da plataforma; o contorno e o terreno não mudam; desfazer volta', () => {
    const { store } = cena();
    const antes = foto(store.project);
    const r = comandosMoverNoCorte(store.project, [RG], u, 0, 2.5);
    expect(r.semVertical).toEqual([]);
    rodar(store, r);
    expect(rg(store.project).cota).toBe(10.5);
    expect(rg(store.project).contorno[0]).toEqual({ x: 5, y: 5 });
    expect(tn(store.project).pontos.filter((_, i) => i % 3 === 2)).toEqual([10, 10, 10, 10]);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });

  it('vertical da região nivelada também muda a cota', () => {
    const { store } = cena();
    store.exec({ type: 'updateTerrainRegion', id: RG, patch: { papel: 'nivelada', taludeCorte: 1 } });
    rodar(store, comandosMoverNoCorte(store.project, [RG], u, 0, -1));
    expect(rg(store.project).cota).toBe(7);
  });

  it('a SUBDIVISÃO não anda na vertical: a cota não muda e a razão volta em `semVertical` (mensagem na barra de status)', () => {
    const { store } = cena();
    store.exec({ type: 'updateTerrainRegion', id: RG, patch: { papel: 'subdivisao', cota: 0, permeavel: true } });
    const antes = foto(store.project);
    const r = comandosMoverNoCorte(store.project, [RG], u, 0, 2.5);
    expect(r.semVertical).toEqual([RG]);
    expect(r.commands).toEqual([]);
    rodar(store, r);
    expect(foto(store.project)).toEqual(antes);
  });

  it('a subdivisão anda na horizontal e a vertical é ignorada com a razão dita', () => {
    const { store } = cena();
    store.exec({ type: 'updateTerrainRegion', id: RG, patch: { papel: 'subdivisao', cota: 0, permeavel: true } });
    const r = comandosMoverNoCorte(store.project, [RG], u, 3, 2.5);
    expect(r.semVertical).toEqual([RG]);
    rodar(store, r);
    expect(rg(store.project).contorno[0]).toEqual({ x: 8, y: 5 });
    expect(rg(store.project).cota).toBe(0);
  });

  it('horizontal é um `transform` de translação só da região', () => {
    const { store } = cena();
    const r = comandosMoverNoCorte(store.project, [RG], u, 3, 0);
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]).toMatchObject({ type: 'transform', ids: [RG] });
    rodar(store, r);
    expect(rg(store.project).contorno[0]).toEqual({ x: 8, y: 5 });
    expect(tn(store.project).pontos.slice(0, 3)).toEqual([0, 0, 10]);
  });

  it('copiar no corte (horizontal e vertical): região nova no mesmo terreno com a cota somada; desfazer volta', () => {
    const { store } = cena();
    const antes = foto(store.project);
    const r = comandosMoverNoCorte(store.project, [RG], u, 40, 1, true);
    expect(r.copias).toHaveLength(1);
    rodar(store, r);
    const nova = rg(store.project, r.copias[0]!);
    expect(nova.terrenoId).toBe(TN);
    expect(nova.cota).toBe(9);
    expect(nova.contorno[0]).toEqual({ x: 45, y: 5 });
    expect(rg(store.project).cota).toBe(8);
    store.undo();
    expect(foto(store.project)).toEqual(antes);
  });
});
